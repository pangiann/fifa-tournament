/**
 * Builders for tournament states used across the unit tests.
 */

/**
 * Five players (A–E) drawn in a circle, two games each:
 * A–B, B–C, C–D, D–E, E–A. Top 4 advance.
 * @param {Partial<import("../../shared/types.js").Tournament>} overrides
 */
export const createFivePlayerTournament = (overrides = {}) => {
  const names = ["A", "B", "C", "D", "E"];
  const players = names.map((name, id) => ({ id, name, gamertag: undefined }));
  const fixtures = players.map((player, index) => ({
    homePlayerId: player.id,
    awayPlayerId: players[(index + 1) % players.length].id,
  }));
  return {
    code: "TEST01",
    phase: "league",
    gamesPerPlayer: 2,
    hostId: 0,
    maxPlayers: 360,
    players,
    fixtures,
    results: fixtures.map(() => ({ homeScore: undefined, awayScore: undefined })),
    shortenedPlayerId: undefined,
    knockoutSize: 4,
    knockoutResults: {},
    hasThirdPlaceMatch: false,
    ...overrides,
  };
};

/**
 * Records a league result between two players, whichever side is home.
 * @param {import("../../shared/types.js").Tournament} tournament
 * @param {number} playerId
 * @param {number} opponentId
 * @param {[number, number]} score Goals for playerId, then goals for opponentId.
 */
export const recordLeagueResult = (tournament, playerId, opponentId, score) => {
  const [playerGoals, opponentGoals] = score;
  const index = tournament.fixtures.findIndex(
    (fixture) =>
      (fixture.homePlayerId === playerId && fixture.awayPlayerId === opponentId) ||
      (fixture.homePlayerId === opponentId && fixture.awayPlayerId === playerId),
  );
  if (index === -1) {
    throw new Error(`No fixture between ${playerId} and ${opponentId}`);
  }
  const isPlayerHome = tournament.fixtures[index].homePlayerId === playerId;
  tournament.results[index] = isPlayerHome
    ? { homeScore: playerGoals, awayScore: opponentGoals }
    : { homeScore: opponentGoals, awayScore: playerGoals };
};

/** Fills every unplayed league match with the given draw score. */
export const fillRemainingWithDraws = (tournament, goals = 2) => {
  tournament.results.forEach((result, index) => {
    if (result.homeScore === undefined) {
      tournament.results[index] = { homeScore: goals, awayScore: goals };
    }
  });
};

/** Names in table order, joined, for compact assertions. */
export const namesOf = (rows) => rows.map((row) => row.name).join("");
