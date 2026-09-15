import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  checkDrawFormat,
  countLeagueMatches,
  countPlayedMatches,
  DrawProblem,
  isLeagueComplete,
  isMatchPlayed,
  MAX_PLAYERS,
} from "../../shared/format.js";
import {
  createFivePlayerTournament,
  fillRemainingWithDraws,
} from "./helpers/tournamentBuilders.mjs";

describe("checkDrawFormat", () => {
  it("accepts formats where the total of player-games is even", () => {
    for (const [players, games] of [
      [9, 4],
      [10, 5],
      [2, 1],
      [6, 5],
      [MAX_PLAYERS, 5],
    ]) {
      assert.equal(checkDrawFormat(players, games).isValid, true, `${players}x${games}`);
    }
  });

  it("rejects an odd total of player-games", () => {
    const check = checkDrawFormat(9, 5);
    assert.equal(check.isValid, false);
    assert.equal(check.problem, DrawProblem.ODD_TOTAL);
    assert.match(check.message, /odd total/);
  });

  it("rejects more games than there are opponents", () => {
    assert.equal(checkDrawFormat(9, 10).problem, DrawProblem.TOO_MANY_GAMES);
    assert.equal(checkDrawFormat(9, 9).problem, DrawProblem.TOO_MANY_GAMES);
  });

  it("rejects fewer than two players", () => {
    assert.equal(checkDrawFormat(1, 1).problem, DrawProblem.NOT_ENOUGH_PLAYERS);
    assert.equal(checkDrawFormat(0, 1).problem, DrawProblem.NOT_ENOUGH_PLAYERS);
  });

  it("rejects non-positive or non-integer games", () => {
    assert.equal(checkDrawFormat(9, 0).problem, DrawProblem.INVALID_GAMES);
    assert.equal(checkDrawFormat(9, 2.5).problem, DrawProblem.INVALID_GAMES);
    assert.equal(checkDrawFormat(9, Number.NaN).problem, DrawProblem.INVALID_GAMES);
  });
});

describe("countLeagueMatches", () => {
  it("halves the player-games total", () => {
    assert.equal(countLeagueMatches(9, 4), 18);
    assert.equal(countLeagueMatches(10, 5), 25);
  });
});

describe("match completion", () => {
  it("treats a result as played only when both scores exist", () => {
    assert.equal(isMatchPlayed({ homeScore: 1, awayScore: 0 }), true);
    assert.equal(isMatchPlayed({ homeScore: 1, awayScore: undefined }), false);
    assert.equal(isMatchPlayed(undefined), false);
  });

  it("reports league completion and played count", () => {
    const tournament = createFivePlayerTournament();
    assert.equal(isLeagueComplete(tournament), false);
    assert.equal(countPlayedMatches(tournament), 0);
    tournament.results[0] = { homeScore: 2, awayScore: 1 };
    assert.equal(countPlayedMatches(tournament), 1);
    fillRemainingWithDraws(tournament);
    assert.equal(isLeagueComplete(tournament), true);
    assert.equal(countPlayedMatches(tournament), 5);
  });

  it("is not complete before the draw", () => {
    const tournament = createFivePlayerTournament({ fixtures: [], results: [] });
    assert.equal(isLeagueComplete(tournament), false);
  });
});
