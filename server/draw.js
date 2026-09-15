/**
 * The draw: join codes, a fair shuffle, and a schedule where every player
 * meets exactly `gamesPerPlayer` distinct opponents.
 */

import { checkDrawFormat } from "../shared/format.js";

/** Letters and digits that are hard to confuse when read aloud (no 0/O, 1/I/L). */
const JOIN_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const JOIN_CODE_LENGTH = 6;

/** @returns {string} A random join code such as "K7PQ2X". */
export const createJoinCode = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(JOIN_CODE_LENGTH));
  return Array.from(bytes, (byte) => JOIN_CODE_ALPHABET[byte % JOIN_CODE_ALPHABET.length]).join("");
};

/**
 * @param {string} value
 * @returns {boolean} True when the value has the shape of a join code (case-insensitive).
 */
export const isJoinCodeShaped = (value) =>
  typeof value === "string" && new RegExp(`^[A-Za-z0-9]{${JOIN_CODE_LENGTH}}$`).test(value);

/**
 * Fisher–Yates shuffle using the platform's secure random source.
 * @template T
 * @param {T[]} items
 * @returns {T[]} A new shuffled array.
 */
export const shuffle = (items) => {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = randomBelow(index + 1);
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
};

/**
 * Builds the league schedule. Players are placed on a circle in random order;
 * each plays the neighbours at distances 1 to gamesPerPlayer/2 on both sides,
 * plus the player directly opposite when gamesPerPlayer is odd (which the
 * format check guarantees only happens with an even player count). No pair
 * meets twice and every player gets exactly gamesPerPlayer matches.
 *
 * @param {number[]} playerIds
 * @param {number} gamesPerPlayer
 * @returns {import("../shared/types.js").Fixture[]} In random circle order.
 * @throws {Error} When the format is not schedulable.
 */
export const generateFixtures = (playerIds, gamesPerPlayer) => {
  const check = checkDrawFormat(playerIds.length, gamesPerPlayer);
  if (!check.isValid) {
    throw new Error(`Cannot generate fixtures: ${check.problem}`);
  }
  const circle = shuffle(playerIds);
  const playerCount = circle.length;
  const fixtures = [];
  const neighbourDistances = Math.floor(gamesPerPlayer / 2);
  for (let distance = 1; distance <= neighbourDistances; distance += 1) {
    for (let position = 0; position < playerCount; position += 1) {
      fixtures.push(pairAt(circle, position, (position + distance) % playerCount));
    }
  }
  if (gamesPerPlayer % 2 === 1) {
    const half = playerCount / 2;
    for (let position = 0; position < half; position += 1) {
      fixtures.push(pairAt(circle, position, position + half));
    }
  }
  return fixtures;
};

const pairAt = (circle, homePosition, awayPosition) => ({
  homePlayerId: circle[homePosition],
  awayPlayerId: circle[awayPosition],
});

const randomBelow = (bound) => {
  const [value] = crypto.getRandomValues(new Uint32Array(1));
  return value % bound;
};
