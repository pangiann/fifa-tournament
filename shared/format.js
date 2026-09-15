/**
 * Rules about the league format: how many players, how many games each,
 * and whether that combination can be scheduled.
 */

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 360;
export const MIN_GAMES_PER_PLAYER = 1;

/** Reasons a draw can be refused. */
export const DrawProblem = Object.freeze({
  NOT_ENOUGH_PLAYERS: "NOT_ENOUGH_PLAYERS",
  INVALID_GAMES: "INVALID_GAMES",
  TOO_MANY_GAMES: "TOO_MANY_GAMES",
  ODD_TOTAL: "ODD_TOTAL",
});

/**
 * @typedef {Object} DrawFormatCheck
 * @property {boolean} isValid
 * @property {string | undefined} problem One of DrawProblem when invalid.
 * @property {string | undefined} message Human-readable explanation when invalid.
 */

/**
 * Checks whether every player can be given exactly `gamesPerPlayer` distinct
 * opponents. Two constraints apply: nobody can face more opponents than exist,
 * and the total of player-games must be even because every match counts for
 * two players.
 *
 * @param {number} playerCount
 * @param {number} gamesPerPlayer
 * @returns {DrawFormatCheck}
 */
export const checkDrawFormat = (playerCount, gamesPerPlayer) => {
  if (!Number.isInteger(playerCount) || playerCount < MIN_PLAYERS) {
    return invalid(
      DrawProblem.NOT_ENOUGH_PLAYERS,
      `You need at least ${MIN_PLAYERS} players to draw.`,
    );
  }
  if (!Number.isInteger(gamesPerPlayer) || gamesPerPlayer < MIN_GAMES_PER_PLAYER) {
    return invalid(
      DrawProblem.INVALID_GAMES,
      `Games per player must be at least ${MIN_GAMES_PER_PLAYER}.`,
    );
  }
  const maxOpponents = playerCount - 1;
  if (gamesPerPlayer > maxOpponents) {
    return invalid(
      DrawProblem.TOO_MANY_GAMES,
      `With ${playerCount} players, each one can face at most ${maxOpponents} different opponents. Lower the games count.`,
    );
  }
  if ((playerCount * gamesPerPlayer) % 2 === 1) {
    return invalid(
      DrawProblem.ODD_TOTAL,
      `${playerCount} players × ${gamesPerPlayer} games each is an odd total. Every match counts for 2 players, so someone would always be one game short.`,
    );
  }
  return { isValid: true, problem: undefined, message: undefined };
};

const invalid = (problem, message) => ({ isValid: false, problem, message });

/**
 * Number of league matches for a valid format.
 * @param {number} playerCount
 * @param {number} gamesPerPlayer
 */
export const countLeagueMatches = (playerCount, gamesPerPlayer) =>
  (playerCount * gamesPerPlayer) / 2;

/**
 * @param {import("./types.js").MatchResult} result
 * @returns {boolean} True when both scores are entered.
 */
export const isMatchPlayed = (result) =>
  result !== undefined && result.homeScore !== undefined && result.awayScore !== undefined;

/**
 * @param {import("./types.js").Tournament} tournament
 * @returns {boolean} True when the draw happened and every league match is played.
 */
export const isLeagueComplete = (tournament) =>
  tournament.results.length > 0 && tournament.results.every(isMatchPlayed);

/**
 * @param {import("./types.js").Tournament} tournament
 * @returns {number} How many league matches have both scores entered.
 */
export const countPlayedMatches = (tournament) => tournament.results.filter(isMatchPlayed).length;
