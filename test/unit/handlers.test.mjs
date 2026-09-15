import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";

import { createTournament } from "../../server/handlers/createTournament.js";
import { joinTournament } from "../../server/handlers/joinTournament.js";
import { leaveTournament, removePlayer } from "../../server/handlers/lobbyMembership.js";
import { recordKnockoutResult, recordLeagueResult } from "../../server/handlers/recordResults.js";
import { runDraw } from "../../server/handlers/runDraw.js";
import { setThirdPlaceMatch } from "../../server/handlers/thirdPlaceMatch.js";
import { HttpStatus } from "../../server/http.js";
import { DrawProblem } from "../../shared/format.js";
import { THIRD_PLACE_KEY } from "../../shared/bracket.js";

/** Minimal stand-in for TournamentRoom: just the methods handlers call. */
class FakeRoom {
  constructor() {
    this.tournament = undefined;
  }
  replaceTournament(tournament) {
    this.tournament = tournament;
  }
  allocatePlayerId() {
    const id = this.tournament.nextPlayerId;
    this.tournament.nextPlayerId += 1;
    return id;
  }
  /** Runs a handler the way the room would, returning its outcome. */
  call(handler, body = {}) {
    return handler({ tournament: this.tournament, body, request: undefined, room: this });
  }
}

const createLobby = (room, playerNames, gamesPerPlayer = 2) => {
  const [hostName, ...others] = playerNames;
  const created = room.call(createTournament, { code: "ABC234", name: hostName, gamesPerPlayer });
  const tokens = { [hostName]: created.body.token };
  for (const name of others) {
    tokens[name] = room.call(joinTournament, { name }).body.token;
  }
  return tokens;
};

const playerNames = (room) => room.tournament.players.map((player) => player.name);

describe("createTournament", () => {
  let room;
  beforeEach(() => {
    room = new FakeRoom();
  });

  it("creates a lobby with the caller as host and returns their credentials", () => {
    const outcome = room.call(createTournament, {
      code: "ABC234",
      name: "Host",
      gamertag: "host-gt",
      gamesPerPlayer: 4,
    });
    assert.equal(outcome.status, HttpStatus.OK);
    assert.equal(outcome.changed, true);
    assert.deepEqual([outcome.body.code, outcome.body.playerId], ["ABC234", 0]);
    assert.match(outcome.body.token, /^[0-9a-f-]{36}$/);
    assert.equal(room.tournament.phase, "lobby");
    assert.equal(room.tournament.players[0].gamertag, "host-gt");
  });

  it("rejects a missing name or an out-of-range games count", () => {
    assert.equal(
      room.call(createTournament, { code: "A", name: "", gamesPerPlayer: 4 }).body.error,
      "NAME_REQUIRED",
    );
    assert.equal(
      room.call(createTournament, { code: "A", name: "H", gamesPerPlayer: 0 }).body.error,
      "INVALID_GAMES",
    );
    assert.equal(
      room.call(createTournament, { code: "A", name: "H", gamesPerPlayer: 999 }).body.error,
      "INVALID_GAMES",
    );
  });

  it("refuses to overwrite an existing tournament (code collision)", () => {
    createLobby(room, ["Host"]);
    const outcome = room.call(createTournament, {
      code: "ABC234",
      name: "Other",
      gamesPerPlayer: 2,
    });
    assert.equal(outcome.status, HttpStatus.CONFLICT);
  });
});

describe("joinTournament", () => {
  let room;
  beforeEach(() => {
    room = new FakeRoom();
    createLobby(room, ["Host"]);
  });

  it("adds players with sequential ids", () => {
    const first = room.call(joinTournament, { name: "Bob" });
    const second = room.call(joinTournament, { name: "Carol", gamertag: "cz" });
    assert.deepEqual([first.body.playerId, second.body.playerId], [1, 2]);
    assert.deepEqual(playerNames(room), ["Host", "Bob", "Carol"]);
  });

  it("rejects duplicate names case-insensitively and empty names", () => {
    room.call(joinTournament, { name: "Bob" });
    assert.equal(room.call(joinTournament, { name: "bob" }).body.error, "NAME_TAKEN");
    assert.equal(room.call(joinTournament, { name: "  " }).body.error, "NAME_REQUIRED");
  });

  it("is closed after the draw", () => {
    room.call(joinTournament, { name: "Bob" });
    room.call(runDraw, { token: room.tournament.players[0].token, gamesPerPlayer: 1 });
    assert.equal(room.call(joinTournament, { name: "Late" }).body.error, "WRONG_PHASE");
  });
});

describe("lobby membership", () => {
  let room;
  let tokens;
  beforeEach(() => {
    room = new FakeRoom();
    tokens = createLobby(room, ["Host", "Ben", "Cat", "Dan"]);
  });

  it("lets a player leave, and their token stops working", () => {
    assert.equal(room.call(leaveTournament, { token: tokens.Ben }).status, HttpStatus.OK);
    assert.deepEqual(playerNames(room), ["Host", "Cat", "Dan"]);
    assert.equal(room.call(leaveTournament, { token: tokens.Ben }).body.error, "NOT_PLAYER");
  });

  it("does not let the host leave", () => {
    assert.equal(
      room.call(leaveTournament, { token: tokens.Host }).body.error,
      "HOST_CANNOT_LEAVE",
    );
  });

  it("lets only the host remove other players", () => {
    assert.equal(
      room.call(removePlayer, { token: tokens.Cat, playerId: 3 }).body.error,
      "NOT_HOST",
    );
    assert.equal(
      room.call(removePlayer, { token: tokens.Host, playerId: 0 }).body.error,
      "UNKNOWN_PLAYER",
    );
    assert.equal(
      room.call(removePlayer, { token: tokens.Host, playerId: 99 }).body.error,
      "UNKNOWN_PLAYER",
    );
    assert.equal(
      room.call(removePlayer, { token: tokens.Host, playerId: 3 }).status,
      HttpStatus.OK,
    );
    assert.deepEqual(playerNames(room), ["Host", "Ben", "Cat"]);
  });

  it("never reuses ids after removals", () => {
    room.call(removePlayer, { token: tokens.Host, playerId: 1 });
    const rejoined = room.call(joinTournament, { name: "Ben" });
    assert.equal(rejoined.body.playerId, 4);
    assert.deepEqual(
      room.tournament.players.map((player) => player.id),
      [0, 2, 3, 4],
    );
  });

  it("locks membership after the draw", () => {
    room.call(runDraw, { token: tokens.Host, gamesPerPlayer: 2 });
    assert.equal(room.call(leaveTournament, { token: tokens.Ben }).body.error, "WRONG_PHASE");
    assert.equal(
      room.call(removePlayer, { token: tokens.Host, playerId: 1 }).body.error,
      "WRONG_PHASE",
    );
  });
});

describe("runDraw", () => {
  let room;
  let tokens;
  beforeEach(() => {
    room = new FakeRoom();
    tokens = createLobby(room, ["Host", "Ben", "Cat"]);
  });

  it("requires the host", () => {
    assert.equal(room.call(runDraw, { token: tokens.Ben }).body.error, "NOT_HOST");
    assert.equal(room.call(runDraw, {}).body.error, "NOT_HOST");
  });

  it("explains an impossible format and leaves the lobby open", () => {
    const outcome = room.call(runDraw, { token: tokens.Host, gamesPerPlayer: 1 });
    assert.equal(outcome.status, HttpStatus.CONFLICT);
    assert.equal(outcome.body.error, DrawProblem.ODD_TOTAL);
    assert.deepEqual([outcome.body.playerCount, outcome.body.gamesPerPlayer], [3, 1]);
    assert.equal(room.tournament.phase, "lobby");
    assert.equal(
      room.call(runDraw, { token: tokens.Host, gamesPerPlayer: 5 }).body.error,
      DrawProblem.TOO_MANY_GAMES,
    );
  });

  it("schedules, sizes the knockout, and locks the lobby", () => {
    const outcome = room.call(runDraw, { token: tokens.Host, gamesPerPlayer: 2 });
    assert.equal(outcome.changed, true);
    const { tournament } = room;
    assert.equal(tournament.phase, "league");
    assert.equal(tournament.fixtures.length, 3);
    assert.equal(tournament.results.length, 3);
    assert.equal(tournament.knockoutSize, 2);
    assert.equal(room.call(runDraw, { token: tokens.Host }).body.error, "WRONG_PHASE");
  });

  it("falls back to the games count set at creation", () => {
    room.call(runDraw, { token: tokens.Host });
    assert.equal(room.tournament.gamesPerPlayer, 2);
  });
});

describe("results", () => {
  let room;
  let tokens;
  beforeEach(() => {
    room = new FakeRoom();
    tokens = createLobby(room, ["Host", "Ben", "Cat", "Dan", "Eve"], 2);
    room.call(runDraw, { token: tokens.Host });
  });

  it("lets any player record a league result, but not spectators", () => {
    assert.equal(
      room.call(recordLeagueResult, { matchIndex: 0, homeScore: 2, awayScore: 1 }).body.error,
      "NOT_PLAYER",
    );
    const outcome = room.call(recordLeagueResult, {
      token: tokens.Ben,
      matchIndex: 0,
      homeScore: 2,
      awayScore: 1,
    });
    assert.equal(outcome.changed, true);
    assert.deepEqual(room.tournament.results[0], { homeScore: 2, awayScore: 1 });
  });

  it("rejects an unknown match index", () => {
    const outcome = room.call(recordLeagueResult, {
      token: tokens.Ben,
      matchIndex: 99,
      homeScore: 1,
      awayScore: 0,
    });
    assert.equal(outcome.body.error, "UNKNOWN_MATCH");
  });

  it("keeps the knockout stage locked until the league is complete", () => {
    const outcome = room.call(recordKnockoutResult, {
      token: tokens.Ben,
      key: "round0-match0",
      homeScore: 1,
      awayScore: 0,
    });
    assert.equal(outcome.body.error, "LEAGUE_OPEN");
  });

  it("accepts knockout results for real bracket keys once the league is done", () => {
    room.tournament.results.forEach((_, index) => {
      room.call(recordLeagueResult, {
        token: tokens.Ben,
        matchIndex: index,
        homeScore: 1,
        awayScore: 0,
      });
    });
    assert.equal(
      room.call(recordKnockoutResult, {
        token: tokens.Ben,
        key: "round9-match9",
        homeScore: 1,
        awayScore: 0,
      }).body.error,
      "UNKNOWN_MATCH",
    );
    const outcome = room.call(recordKnockoutResult, {
      token: tokens.Ben,
      key: "round0-match0",
      homeScore: 1,
      awayScore: 1,
      penaltyHomeScore: 4,
      penaltyAwayScore: 3,
    });
    assert.equal(outcome.changed, true);
    assert.equal(room.tournament.knockoutResults["round0-match0"].penaltyHomeScore, 4);
  });
});

describe("setThirdPlaceMatch", () => {
  let room;
  let tokens;
  beforeEach(() => {
    room = new FakeRoom();
    tokens = createLobby(room, ["Host", "Ben", "Cat", "Dan", "Eve"], 2);
  });

  it("requires the host and a drawn tournament with semi-finals", () => {
    assert.equal(
      room.call(setThirdPlaceMatch, { token: tokens.Ben, enabled: true }).body.error,
      "NOT_HOST",
    );
    assert.equal(
      room.call(setThirdPlaceMatch, { token: tokens.Host, enabled: true }).body.error,
      "WRONG_PHASE",
    );
    room.call(runDraw, { token: tokens.Host });
    assert.equal(
      room.call(setThirdPlaceMatch, { token: tokens.Host, enabled: true }).status,
      HttpStatus.OK,
    );
    assert.equal(room.tournament.hasThirdPlaceMatch, true);
  });

  it("refuses when there are no semi-finals", () => {
    const small = new FakeRoom();
    const smallTokens = createLobby(small, ["Host", "Ben", "Cat"], 2);
    small.call(runDraw, { token: smallTokens.Host });
    assert.equal(
      small.call(setThirdPlaceMatch, { token: smallTokens.Host, enabled: true }).body.error,
      "NO_SEMI_FINALS",
    );
  });

  it("cannot be removed while it has a score", () => {
    room.call(runDraw, { token: tokens.Host });
    room.call(setThirdPlaceMatch, { token: tokens.Host, enabled: true });
    room.tournament.results.forEach((_, index) => {
      room.call(recordLeagueResult, {
        token: tokens.Ben,
        matchIndex: index,
        homeScore: 1,
        awayScore: 0,
      });
    });
    room.call(recordKnockoutResult, {
      token: tokens.Ben,
      key: THIRD_PLACE_KEY,
      homeScore: 2,
      awayScore: 0,
    });
    assert.equal(
      room.call(setThirdPlaceMatch, { token: tokens.Host, enabled: false }).body.error,
      "HAS_SCORE",
    );
    room.call(recordKnockoutResult, { token: tokens.Ben, key: THIRD_PLACE_KEY });
    assert.equal(
      room.call(setThirdPlaceMatch, { token: tokens.Host, enabled: false }).status,
      HttpStatus.OK,
    );
    assert.equal(THIRD_PLACE_KEY in room.tournament.knockoutResults, false);
  });
});
