import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { computeStandings, findGuaranteedQualifiers } from "../../shared/standings.js";
import {
  createFivePlayerTournament,
  fillRemainingWithDraws,
  namesOf,
  recordLeagueResult,
} from "./helpers/tournamentBuilders.mjs";

const [A, B, C, D, E] = [0, 1, 2, 3, 4];

describe("computeStandings", () => {
  it("starts every player on zero, ordered by id", () => {
    const rows = computeStandings(createFivePlayerTournament());
    assert.equal(namesOf(rows), "ABCDE");
    assert.deepEqual(
      rows.map((row) => [row.played, row.points]),
      Array(5).fill([0, 0]),
    );
  });

  it("awards 3 points for a win, 1 for a draw, 0 for a loss", () => {
    const tournament = createFivePlayerTournament();
    recordLeagueResult(tournament, A, B, [2, 0]);
    recordLeagueResult(tournament, C, D, [1, 1]);
    const rows = computeStandings(tournament);
    const byName = Object.fromEntries(rows.map((row) => [row.name, row]));
    assert.deepEqual(
      [byName.A.points, byName.B.points, byName.C.points, byName.D.points],
      [3, 0, 1, 1],
    );
    assert.deepEqual([byName.A.wins, byName.B.losses, byName.C.draws], [1, 1, 1]);
    assert.deepEqual([byName.A.goalDifference, byName.B.goalDifference], [2, -2]);
  });

  it("ranks by points, then goal difference, then goals scored", () => {
    const tournament = createFivePlayerTournament();
    recordLeagueResult(tournament, A, B, [1, 0]); // A +1, 1 scored
    recordLeagueResult(tournament, C, D, [2, 0]); // C +2
    recordLeagueResult(tournament, E, A, [3, 2]); // E +1, 3 scored; A now 0 gd
    const rows = computeStandings(tournament);
    assert.equal(namesOf(rows).slice(0, 2), "CE", "C on goal difference, then E");
  });

  it("uses head-to-head among players tied on every other criterion", () => {
    const tournament = createFivePlayerTournament();
    recordLeagueResult(tournament, A, B, [1, 0]); // A beats B
    recordLeagueResult(tournament, E, A, [1, 0]); // E beats A: A and B tied 3pts, 0gd, 1gf
    recordLeagueResult(tournament, B, C, [1, 0]); // B beats C
    const rows = computeStandings(tournament);
    assert.equal(rows[0].name, "E");
    assert.equal(namesOf(rows).slice(1, 3), "AB", "A above B on their direct match");
  });

  it("works with non-contiguous player ids", () => {
    const players = [0, 2, 4, 7].map((id) => ({ id, name: `P${id}`, gamertag: undefined }));
    const fixtures = [
      { homePlayerId: 0, awayPlayerId: 2 },
      { homePlayerId: 4, awayPlayerId: 7 },
    ];
    const tournament = createFivePlayerTournament({
      players,
      fixtures,
      gamesPerPlayer: 1,
      results: [
        { homeScore: 3, awayScore: 0 },
        { homeScore: 1, awayScore: 1 },
      ],
    });
    const rows = computeStandings(tournament);
    assert.deepEqual(
      rows.map((row) => [row.playerId, row.points]),
      [
        [0, 3],
        [4, 1],
        [7, 1],
        [2, 0],
      ],
    );
  });
});

describe("findGuaranteedQualifiers", () => {
  it("marks nobody before any match", () => {
    const tournament = createFivePlayerTournament();
    assert.equal(findGuaranteedQualifiers(tournament, computeStandings(tournament)).size, 0);
  });

  it("marks players fewer than knockoutSize rivals can still catch", () => {
    const tournament = createFivePlayerTournament();
    recordLeagueResult(tournament, A, B, [1, 0]);
    recordLeagueResult(tournament, D, E, [1, 0]);
    recordLeagueResult(tournament, A, E, [1, 0]);
    // A: 6 pts, finished. D: 3 pts, max 6. B: 0, max 3. C: 0, max 6. E: 0, finished.
    const qualifiers = findGuaranteedQualifiers(tournament, computeStandings(tournament));
    assert.deepEqual([...qualifiers].sort(), [A, D]);
  });

  it("never marks a player who could still be overtaken", () => {
    const tournament = createFivePlayerTournament();
    recordLeagueResult(tournament, A, B, [1, 0]); // four rivals can still reach 3 points
    const qualifiers = findGuaranteedQualifiers(tournament, computeStandings(tournament));
    assert.equal(qualifiers.size, 0);
  });

  it("marks exactly the top knockoutSize once the league is complete", () => {
    const tournament = createFivePlayerTournament();
    recordLeagueResult(tournament, A, B, [1, 0]);
    recordLeagueResult(tournament, D, E, [1, 0]);
    recordLeagueResult(tournament, A, E, [1, 0]);
    recordLeagueResult(tournament, B, C, [1, 0]);
    recordLeagueResult(tournament, C, D, [1, 0]);
    const qualifiers = findGuaranteedQualifiers(tournament, computeStandings(tournament));
    assert.equal(qualifiers.size, 4);
    assert.equal(qualifiers.has(E), false, "E finished last with 0 points");
  });

  it("returns an empty set before the draw", () => {
    const tournament = createFivePlayerTournament({ knockoutSize: undefined });
    fillRemainingWithDraws(tournament);
    assert.equal(findGuaranteedQualifiers(tournament, computeStandings(tournament)).size, 0);
  });
});
