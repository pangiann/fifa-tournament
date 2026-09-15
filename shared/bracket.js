/**
 * The knockout stage: how many qualify, how they are seeded, and how each
 * round resolves from the stored results.
 */

import { computeStandings } from "./standings.js";

export const THIRD_PLACE_KEY = "third-place";

const KNOCKOUT_SIZE_THRESHOLDS = Object.freeze([
  { minPlayers: 61, size: 16 },
  { minPlayers: 20, size: 8 },
  { minPlayers: 4, size: 4 },
  { minPlayers: 0, size: 2 },
]);

const ROUND_NAMES = Object.freeze({
  16: ["Round of 16", "Quarter-finals", "Semi-finals", "Final"],
  8: ["Quarter-finals", "Semi-finals", "Final"],
  4: ["Semi-finals", "Final"],
  2: ["Final"],
});

const ROUND_LABELS = Object.freeze({
  16: ["R16", "QF", "SF", "F"],
  8: ["QF", "SF", "F"],
  4: ["SF", "F"],
  2: ["F"],
});

/** Side of a match, used for winner/loser resolution. */
export const Side = Object.freeze({ HOME: "home", AWAY: "away" });

/**
 * @param {number} playerCount
 * @returns {number} Players advancing to the knockout stage.
 */
export const knockoutSizeFor = (playerCount) =>
  KNOCKOUT_SIZE_THRESHOLDS.find((tier) => playerCount >= tier.minPlayers).size;

/**
 * Standard bracket order so that seeds 1 and 2 can only meet in the final.
 * For 4: [1, 4, 2, 3]; for 8: [1, 8, 4, 5, 2, 7, 3, 6].
 * @param {number} size Power of two.
 * @returns {number[]} Seeds, read in pairs as first-round matches.
 */
export const seedingOrder = (size) => {
  let order = [1, 2];
  while (order.length < size) {
    const mirror = order.length * 2 + 1;
    order = order.flatMap((seed) => [seed, mirror - seed]);
  }
  return order;
};

/**
 * @param {number} roundIndex Zero-based, first round first.
 * @param {number} matchIndex Zero-based within the round.
 */
export const knockoutMatchKey = (roundIndex, matchIndex) => `round${roundIndex}-match${matchIndex}`;

/**
 * @param {string} key
 * @param {import("./types.js").Tournament} tournament
 * @returns {boolean} True when the key addresses a real match of this bracket.
 */
export const isValidKnockoutKey = (key, tournament) => {
  const { knockoutSize, hasThirdPlaceMatch } = tournament;
  if (knockoutSize === undefined) {
    return false;
  }
  if (key === THIRD_PLACE_KEY) {
    return hasThirdPlaceMatch && hasSemiFinals(knockoutSize);
  }
  const match = /^round(\d+)-match(\d+)$/.exec(key);
  if (!match) {
    return false;
  }
  const roundIndex = Number(match[1]);
  const matchIndex = Number(match[2]);
  return (
    roundIndex < countRounds(knockoutSize) && matchIndex < matchesInRound(knockoutSize, roundIndex)
  );
};

/** @param {number} knockoutSize */
export const hasSemiFinals = (knockoutSize) => knockoutSize >= 4;

/**
 * @param {import("./types.js").KnockoutResult} result
 * @returns {string | undefined} Side.HOME, Side.AWAY, or undefined while undecided.
 */
export const decideWinner = (result) => {
  if (result.homeScore === undefined || result.awayScore === undefined) {
    return undefined;
  }
  if (result.homeScore !== result.awayScore) {
    return result.homeScore > result.awayScore ? Side.HOME : Side.AWAY;
  }
  if (result.penaltyHomeScore === undefined || result.penaltyAwayScore === undefined) {
    return undefined;
  }
  if (result.penaltyHomeScore === result.penaltyAwayScore) {
    return undefined;
  }
  return result.penaltyHomeScore > result.penaltyAwayScore ? Side.HOME : Side.AWAY;
};

/** @param {import("./types.js").KnockoutMatch} match */
export const winnerOf = (match) => pickSide(match, decideWinner(match.result));

/** @param {import("./types.js").KnockoutMatch} match */
export const loserOf = (match) => {
  const winner = decideWinner(match.result);
  if (winner === undefined) {
    return undefined;
  }
  return pickSide(match, winner === Side.HOME ? Side.AWAY : Side.HOME);
};

/**
 * Resolves the whole bracket from the current standings and stored results.
 * Later rounds fill in as earlier matches are decided.
 *
 * @param {import("./types.js").Tournament} tournament
 * @returns {import("./types.js").KnockoutRound[]}
 */
export const buildBracket = (tournament) => {
  const { knockoutSize } = tournament;
  const seededPlayerIds = computeStandings(tournament)
    .slice(0, knockoutSize)
    .map((row) => row.playerId);
  const rounds = [];
  let previousMatches = [];
  ROUND_NAMES[knockoutSize].forEach((name, roundIndex) => {
    const matches = Array.from({ length: matchesInRound(knockoutSize, roundIndex) }, (_, i) =>
      roundIndex === 0
        ? firstRoundMatch(tournament, seededPlayerIds, i)
        : laterRoundMatch(tournament, previousMatches, roundIndex, i),
    );
    rounds.push({ name, matches });
    previousMatches = matches;
  });
  return rounds;
};

/**
 * The optional match between the two semi-final losers.
 * @param {import("./types.js").Tournament} tournament
 * @param {import("./types.js").KnockoutRound[]} rounds Output of buildBracket.
 * @returns {import("./types.js").KnockoutMatch | undefined} Undefined when there are no semi-finals.
 */
export const buildThirdPlaceMatch = (tournament, rounds) => {
  if (rounds.length < 2) {
    return undefined;
  }
  const [semiFinal1, semiFinal2] = rounds[rounds.length - 2].matches;
  return {
    key: THIRD_PLACE_KEY,
    label: "3rd place",
    homePlayerId: loserOf(semiFinal1),
    awayPlayerId: loserOf(semiFinal2),
    homePlaceholder: `Loser ${semiFinal1.label}`,
    awayPlaceholder: `Loser ${semiFinal2.label}`,
    result: resultFor(tournament, THIRD_PLACE_KEY),
  };
};

/**
 * @param {import("./types.js").KnockoutRound[]} rounds
 * @returns {{ champion: number | undefined, runnerUp: number | undefined }} Player ids.
 */
export const findPodium = (rounds) => {
  const finalMatch = rounds[rounds.length - 1].matches[0];
  return { champion: winnerOf(finalMatch), runnerUp: loserOf(finalMatch) };
};

const countRounds = (knockoutSize) => Math.log2(knockoutSize);

const matchesInRound = (knockoutSize, roundIndex) => knockoutSize >> (roundIndex + 1);

const matchLabel = (knockoutSize, roundIndex, matchIndex) => {
  const label = ROUND_LABELS[knockoutSize][roundIndex];
  return matchesInRound(knockoutSize, roundIndex) > 1 ? `${label}${matchIndex + 1}` : label;
};

const EMPTY_RESULT = Object.freeze({
  homeScore: undefined,
  awayScore: undefined,
  penaltyHomeScore: undefined,
  penaltyAwayScore: undefined,
});

const resultFor = (tournament, key) => tournament.knockoutResults[key] ?? EMPTY_RESULT;

const pickSide = (match, side) => {
  if (side === undefined) {
    return undefined;
  }
  return side === Side.HOME ? match.homePlayerId : match.awayPlayerId;
};

const firstRoundMatch = (tournament, seededPlayerIds, matchIndex) => {
  const order = seedingOrder(tournament.knockoutSize);
  const key = knockoutMatchKey(0, matchIndex);
  return {
    key,
    label: matchLabel(tournament.knockoutSize, 0, matchIndex),
    homePlayerId: seededPlayerIds[order[2 * matchIndex] - 1],
    awayPlayerId: seededPlayerIds[order[2 * matchIndex + 1] - 1],
    homePlaceholder: "TBD",
    awayPlaceholder: "TBD",
    result: resultFor(tournament, key),
  };
};

const laterRoundMatch = (tournament, previousMatches, roundIndex, matchIndex) => {
  const feederHome = previousMatches[2 * matchIndex];
  const feederAway = previousMatches[2 * matchIndex + 1];
  const key = knockoutMatchKey(roundIndex, matchIndex);
  return {
    key,
    label: matchLabel(tournament.knockoutSize, roundIndex, matchIndex),
    homePlayerId: winnerOf(feederHome),
    awayPlayerId: winnerOf(feederAway),
    homePlaceholder: `Winner ${feederHome.label}`,
    awayPlaceholder: `Winner ${feederAway.label}`,
    result: resultFor(tournament, key),
  };
};
