import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { createJoinCode, generateFixtures, isJoinCodeShaped, shuffle } from "../../server/draw.js";

describe("createJoinCode", () => {
  it("produces six characters from the unambiguous alphabet", () => {
    for (let i = 0; i < 50; i += 1) {
      assert.match(createJoinCode(), /^[A-HJ-NP-Z2-9]{6}$/);
    }
  });

  it("is recognised by isJoinCodeShaped, case-insensitively", () => {
    assert.equal(isJoinCodeShaped(createJoinCode()), true);
    assert.equal(isJoinCodeShaped("abc123"), true);
    assert.equal(isJoinCodeShaped("ABC12"), false);
    assert.equal(isJoinCodeShaped("ABC-123"), false);
    assert.equal(isJoinCodeShaped(123456), false);
  });
});

describe("shuffle", () => {
  it("returns a permutation without mutating the input", () => {
    const items = Array.from({ length: 50 }, (_, i) => i);
    const shuffled = shuffle(items);
    assert.deepEqual(
      [...shuffled].sort((a, b) => a - b),
      items,
    );
    assert.deepEqual(
      items,
      Array.from({ length: 50 }, (_, i) => i),
    );
  });
});

describe("generateFixtures", () => {
  const verifySchedule = (playerIds, gamesPerPlayer) => {
    const fixtures = generateFixtures(playerIds, gamesPerPlayer);
    const gamesByPlayer = new Map(playerIds.map((id) => [id, 0]));
    const pairs = new Set();
    for (const { homePlayerId, awayPlayerId } of fixtures) {
      gamesByPlayer.set(homePlayerId, gamesByPlayer.get(homePlayerId) + 1);
      gamesByPlayer.set(awayPlayerId, gamesByPlayer.get(awayPlayerId) + 1);
      const pair = [homePlayerId, awayPlayerId].sort((a, b) => a - b).join("-");
      assert.equal(pairs.has(pair), false, `pair ${pair} scheduled twice`);
      pairs.add(pair);
      assert.notEqual(homePlayerId, awayPlayerId, "a player cannot play themselves");
    }
    assert.equal(fixtures.length, (playerIds.length * gamesPerPlayer) / 2);
    for (const [id, games] of gamesByPlayer) {
      assert.equal(games, gamesPerPlayer, `player ${id} has ${games} games`);
    }
  };

  it("gives every player exactly gamesPerPlayer distinct opponents", () => {
    const ids = (count) => Array.from({ length: count }, (_, i) => i);
    for (const [players, games] of [
      [9, 4],
      [10, 5],
      [2, 1],
      [4, 3],
      [24, 5],
      [16, 15],
      [359, 6],
      [360, 5],
    ]) {
      verifySchedule(ids(players), games);
    }
  });

  it("works with arbitrary, non-contiguous player ids", () => {
    verifySchedule([3, 11, 42, 7, 100, 8], 3);
  });

  it("refuses an unschedulable format", () => {
    assert.throws(() => generateFixtures([0, 1, 2], 1), /ODD_TOTAL/);
    assert.throws(() => generateFixtures([0, 1, 2], 5), /TOO_MANY_GAMES/);
  });
});
