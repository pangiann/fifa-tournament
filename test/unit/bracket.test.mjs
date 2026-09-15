import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  buildBracket,
  buildThirdPlaceMatch,
  decideWinner,
  findPodium,
  isValidKnockoutKey,
  knockoutMatchKey,
  knockoutSizeFor,
  seedingOrder,
  Side,
  THIRD_PLACE_KEY,
} from "../../shared/bracket.js";
import {
  createFivePlayerTournament,
  fillRemainingWithDraws,
  recordLeagueResult,
} from "./helpers/tournamentBuilders.mjs";

const [A, B, C, D, E] = [0, 1, 2, 3, 4];

/** League finished with table C, D, A, B, E (see standings tests). */
const createFinishedLeague = () => {
  const tournament = createFivePlayerTournament();
  recordLeagueResult(tournament, A, B, [1, 0]);
  recordLeagueResult(tournament, E, A, [1, 0]);
  recordLeagueResult(tournament, B, C, [1, 0]);
  recordLeagueResult(tournament, C, D, [2, 0]);
  recordLeagueResult(tournament, D, E, [3, 1]);
  return tournament;
};

describe("knockoutSizeFor", () => {
  it("scales with the number of entrants", () => {
    assert.deepEqual([2, 3].map(knockoutSizeFor), [2, 2]);
    assert.deepEqual([4, 19].map(knockoutSizeFor), [4, 4]);
    assert.deepEqual([20, 60].map(knockoutSizeFor), [8, 8]);
    assert.deepEqual([61, 360].map(knockoutSizeFor), [16, 16]);
  });
});

describe("seedingOrder", () => {
  it("keeps the top two seeds apart until the final", () => {
    assert.deepEqual(seedingOrder(2), [1, 2]);
    assert.deepEqual(seedingOrder(4), [1, 4, 2, 3]);
    assert.deepEqual(seedingOrder(8), [1, 8, 4, 5, 2, 7, 3, 6]);
    assert.equal(new Set(seedingOrder(16)).size, 16);
  });
});

describe("decideWinner", () => {
  it("picks the higher score", () => {
    assert.equal(decideWinner({ homeScore: 2, awayScore: 1 }), Side.HOME);
    assert.equal(decideWinner({ homeScore: 0, awayScore: 3 }), Side.AWAY);
  });

  it("is undecided while a score or a needed penalty result is missing", () => {
    assert.equal(decideWinner({ homeScore: 2, awayScore: undefined }), undefined);
    assert.equal(decideWinner({ homeScore: 1, awayScore: 1 }), undefined);
    assert.equal(
      decideWinner({ homeScore: 1, awayScore: 1, penaltyHomeScore: 4, penaltyAwayScore: 4 }),
      undefined,
    );
  });

  it("uses penalties when level", () => {
    assert.equal(
      decideWinner({ homeScore: 1, awayScore: 1, penaltyHomeScore: 3, penaltyAwayScore: 4 }),
      Side.AWAY,
    );
  });
});

describe("knockout keys", () => {
  it("formats keys by round and match", () => {
    assert.equal(knockoutMatchKey(0, 1), "round0-match1");
  });

  it("accepts only keys inside the bracket", () => {
    const tournament = createFivePlayerTournament({ knockoutSize: 4 });
    assert.equal(isValidKnockoutKey("round0-match0", tournament), true);
    assert.equal(isValidKnockoutKey("round0-match1", tournament), true);
    assert.equal(isValidKnockoutKey("round1-match0", tournament), true);
    assert.equal(isValidKnockoutKey("round0-match2", tournament), false);
    assert.equal(isValidKnockoutKey("round2-match0", tournament), false);
    assert.equal(isValidKnockoutKey("garbage", tournament), false);
  });

  it("accepts the third-place key only when enabled and semi-finals exist", () => {
    assert.equal(isValidKnockoutKey(THIRD_PLACE_KEY, createFivePlayerTournament()), false);
    assert.equal(
      isValidKnockoutKey(THIRD_PLACE_KEY, createFivePlayerTournament({ hasThirdPlaceMatch: true })),
      true,
    );
    assert.equal(
      isValidKnockoutKey(
        THIRD_PLACE_KEY,
        createFivePlayerTournament({ hasThirdPlaceMatch: true, knockoutSize: 2 }),
      ),
      false,
    );
  });

  it("rejects everything before the draw", () => {
    const tournament = createFivePlayerTournament({ knockoutSize: undefined });
    assert.equal(isValidKnockoutKey("round0-match0", tournament), false);
  });
});

describe("buildBracket", () => {
  it("seeds the semi-finals 1v4 and 2v3 from the standings", () => {
    const rounds = buildBracket(createFinishedLeague()); // table: C, D, A, B, E
    assert.deepEqual(
      rounds.map((round) => round.name),
      ["Semi-finals", "Final"],
    );
    const [semiFinal1, semiFinal2] = rounds[0].matches;
    assert.deepEqual([semiFinal1.homePlayerId, semiFinal1.awayPlayerId], [C, B]);
    assert.deepEqual([semiFinal2.homePlayerId, semiFinal2.awayPlayerId], [D, A]);
    assert.deepEqual([semiFinal1.label, semiFinal2.label], ["SF1", "SF2"]);
  });

  it("leaves the final undecided with placeholders until the semi-finals resolve", () => {
    const [, finalRound] = buildBracket(createFinishedLeague());
    const finalMatch = finalRound.matches[0];
    assert.equal(finalMatch.homePlayerId, undefined);
    assert.deepEqual(
      [finalMatch.homePlaceholder, finalMatch.awayPlaceholder],
      ["Winner SF1", "Winner SF2"],
    );
    assert.deepEqual(findPodium(buildBracket(createFinishedLeague())), {
      champion: undefined,
      runnerUp: undefined,
    });
  });

  it("feeds winners forward, including penalty winners, and finds the podium", () => {
    const tournament = createFinishedLeague();
    tournament.knockoutResults["round0-match0"] = {
      homeScore: 1,
      awayScore: 1,
      penaltyHomeScore: 3,
      penaltyAwayScore: 4,
    }; // C 1-1 B, B wins on penalties
    tournament.knockoutResults["round0-match1"] = { homeScore: 0, awayScore: 2 }; // D 0-2 A
    let rounds = buildBracket(tournament);
    assert.deepEqual(
      [rounds[1].matches[0].homePlayerId, rounds[1].matches[0].awayPlayerId],
      [B, A],
    );
    tournament.knockoutResults["round1-match0"] = { homeScore: 0, awayScore: 1 }; // B 0-1 A
    rounds = buildBracket(tournament);
    assert.deepEqual(findPodium(rounds), { champion: A, runnerUp: B });
  });

  it("builds a final-only bracket for two qualifiers", () => {
    const tournament = createFinishedLeague();
    tournament.knockoutSize = 2;
    const rounds = buildBracket(tournament);
    assert.equal(rounds.length, 1);
    assert.deepEqual(
      [rounds[0].matches[0].homePlayerId, rounds[0].matches[0].awayPlayerId],
      [C, D],
    );
    assert.equal(rounds[0].matches[0].label, "F");
  });
});

describe("buildThirdPlaceMatch", () => {
  it("pairs the semi-final losers", () => {
    const tournament = createFinishedLeague();
    tournament.knockoutResults["round0-match0"] = { homeScore: 0, awayScore: 1 }; // B beats C
    tournament.knockoutResults["round0-match1"] = { homeScore: 0, awayScore: 2 }; // A beats D
    tournament.knockoutResults[THIRD_PLACE_KEY] = { homeScore: 2, awayScore: 3 };
    const rounds = buildBracket(tournament);
    const thirdPlace = buildThirdPlaceMatch(tournament, rounds);
    assert.deepEqual([thirdPlace.homePlayerId, thirdPlace.awayPlayerId], [C, D]);
    assert.deepEqual(
      [thirdPlace.homePlaceholder, thirdPlace.awayPlaceholder],
      ["Loser SF1", "Loser SF2"],
    );
    assert.equal(thirdPlace.result.awayScore, 3);
  });

  it("is undefined when there are no semi-finals", () => {
    const tournament = createFinishedLeague();
    tournament.knockoutSize = 2;
    assert.equal(buildThirdPlaceMatch(tournament, buildBracket(tournament)), undefined);
  });

  it("does not care whether the league is unfinished for shape purposes", () => {
    const tournament = createFivePlayerTournament();
    fillRemainingWithDraws(tournament);
    const thirdPlace = buildThirdPlaceMatch(tournament, buildBracket(tournament));
    assert.equal(thirdPlace.homePlayerId, undefined);
  });
});
