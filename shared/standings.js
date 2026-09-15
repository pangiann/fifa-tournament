/**
 * The league table: points, tie-breakers, and who is already guaranteed a
 * knockout place.
 *
 * Ranking order: points per assigned game, goal difference, goals scored,
 * then head-to-head record among the players still tied. Points per game
 * equals plain points when everyone has the same number of games; it only
 * matters when one player was assigned one game fewer (see
 * Tournament.shortenedPlayerId).
 */

import { isLeagueComplete, isMatchPlayed } from "./format.js";

export const POINTS_FOR_WIN = 3;
export const POINTS_FOR_DRAW = 1;

/**
 * @param {import("./types.js").Tournament} tournament
 * @returns {import("./types.js").StandingsRow[]} Rows sorted from first to last.
 */
export const computeStandings = (tournament) => {
  const rowsByPlayerId = new Map(
    tournament.players.map((player) => [player.id, createRow(player, tournament)]),
  );
  forEachPlayedMatch(tournament, (fixture, result) => {
    recordMatch(rowsByPlayerId.get(fixture.homePlayerId), result.homeScore, result.awayScore);
    recordMatch(rowsByPlayerId.get(fixture.awayPlayerId), result.awayScore, result.homeScore);
  });
  const rows = [...rowsByPlayerId.values()].sort(compareRows);
  return breakTiesByHeadToHead(rows, tournament);
};

/**
 * Players whose knockout place is mathematically certain: fewer than
 * `knockoutSize` rivals could still reach their points even if they lost every
 * remaining game and the rivals won all of theirs. A tie counts as a threat,
 * so this never marks a player who could still drop out.
 *
 * @param {import("./types.js").Tournament} tournament
 * @param {import("./types.js").StandingsRow[]} standings Output of computeStandings.
 * @returns {Set<number>} Player ids.
 */
export const findGuaranteedQualifiers = (tournament, standings) => {
  const { knockoutSize } = tournament;
  if (knockoutSize === undefined) {
    return new Set();
  }
  if (isLeagueComplete(tournament)) {
    return new Set(standings.slice(0, knockoutSize).map((row) => row.playerId));
  }
  const qualifiers = standings
    .filter((row) => countThreats(row, standings) < knockoutSize)
    .map((row) => row.playerId);
  return new Set(qualifiers);
};

const createRow = (player, tournament) => {
  const isShortened = tournament.shortenedPlayerId === player.id;
  return {
    playerId: player.id,
    name: player.name,
    gamesAssigned: tournament.gamesPerPlayer - (isShortened ? 1 : 0),
    played: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDifference: 0,
    points: 0,
    pointsPerGame: 0,
  };
};

const forEachPlayedMatch = (tournament, callback) => {
  tournament.fixtures.forEach((fixture, index) => {
    const result = tournament.results[index];
    if (isMatchPlayed(result)) {
      callback(fixture, result);
    }
  });
};

/** Mutates a row in place with one match seen from that player's side. */
const recordMatch = (row, goalsFor, goalsAgainst) => {
  row.played += 1;
  row.goalsFor += goalsFor;
  row.goalsAgainst += goalsAgainst;
  row.goalDifference = row.goalsFor - row.goalsAgainst;
  if (goalsFor > goalsAgainst) {
    row.wins += 1;
    row.points += POINTS_FOR_WIN;
  } else if (goalsFor < goalsAgainst) {
    row.losses += 1;
  } else {
    row.draws += 1;
    row.points += POINTS_FOR_DRAW;
  }
  row.pointsPerGame = row.gamesAssigned > 0 ? row.points / row.gamesAssigned : 0;
};

const compareRows = (a, b) =>
  b.pointsPerGame - a.pointsPerGame ||
  b.goalDifference - a.goalDifference ||
  b.goalsFor - a.goalsFor ||
  a.playerId - b.playerId;

const areTied = (a, b) =>
  a.pointsPerGame === b.pointsPerGame &&
  a.goalDifference === b.goalDifference &&
  a.goalsFor === b.goalsFor;

/** Re-sorts each group of tied rows by the matches played among them. */
const breakTiesByHeadToHead = (sortedRows, tournament) => {
  const result = [];
  let groupStart = 0;
  while (groupStart < sortedRows.length) {
    let groupEnd = groupStart + 1;
    while (groupEnd < sortedRows.length && areTied(sortedRows[groupStart], sortedRows[groupEnd])) {
      groupEnd += 1;
    }
    const group = sortedRows.slice(groupStart, groupEnd);
    result.push(...(group.length > 1 ? sortByHeadToHead(group, tournament) : group));
    groupStart = groupEnd;
  }
  return result;
};

const sortByHeadToHead = (group, tournament) => {
  const miniTable = new Map(
    group.map((row) => [row.playerId, { points: 0, goalDifference: 0, goalsFor: 0 }]),
  );
  forEachPlayedMatch(tournament, (fixture, result) => {
    const home = miniTable.get(fixture.homePlayerId);
    const away = miniTable.get(fixture.awayPlayerId);
    if (home && away) {
      recordMiniMatch(home, result.homeScore, result.awayScore);
      recordMiniMatch(away, result.awayScore, result.homeScore);
    }
  });
  return [...group].sort((a, b) => {
    const recordA = miniTable.get(a.playerId);
    const recordB = miniTable.get(b.playerId);
    return (
      recordB.points - recordA.points ||
      recordB.goalDifference - recordA.goalDifference ||
      recordB.goalsFor - recordA.goalsFor ||
      a.playerId - b.playerId
    );
  });
};

const recordMiniMatch = (record, goalsFor, goalsAgainst) => {
  record.goalsFor += goalsFor;
  record.goalDifference += goalsFor - goalsAgainst;
  if (goalsFor > goalsAgainst) {
    record.points += POINTS_FOR_WIN;
  } else if (goalsFor === goalsAgainst) {
    record.points += POINTS_FOR_DRAW;
  }
};

/**
 * Counts rivals who could still finish level with or above `row`, comparing
 * the rival's best case against the row's worst case as points per assigned
 * game. Cross-multiplied to stay in exact integer arithmetic.
 */
const countThreats = (row, standings) =>
  standings.filter(
    (rival) =>
      rival.playerId !== row.playerId &&
      rival.gamesAssigned > 0 &&
      maxPoints(rival) * row.gamesAssigned >= row.points * rival.gamesAssigned,
  ).length;

const maxPoints = (row) =>
  row.points + POINTS_FOR_WIN * Math.max(0, row.gamesAssigned - row.played);
