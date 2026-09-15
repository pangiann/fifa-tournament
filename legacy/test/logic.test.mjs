/* Unit tests for server-side pure logic (src/worker.js). Run: node test/logic.test.mjs */
import { makeCode, koSizeFor, validateDraw, genFixtures, shuffled, MAX_PLAYERS } from "../src/logic.js";

let fail = 0;
function assert(cond, msg) {
  if (!cond) { console.log("FAIL:", msg); fail++; }
  else console.log("ok:", msg);
}

/* code format */
for (let i = 0; i < 20; i++) {
  const c = makeCode();
  if (!/^[A-HJ-NP-Z2-9]{6}$/.test(c)) { assert(false, "code format: " + c); break; }
  if (i === 19) assert(true, "codes are 6 chars from the unambiguous alphabet");
}

/* ko sizing */
assert(koSizeFor(2) === 2 && koSizeFor(3) === 2, "2-3 players -> final only");
assert(koSizeFor(4) === 4 && koSizeFor(19) === 4, "4-19 players -> top 4");
assert(koSizeFor(20) === 8 && koSizeFor(60) === 8, "20-60 players -> top 8");
assert(koSizeFor(61) === 16 && koSizeFor(360) === 16, "61+ players -> top 16");

/* draw validation */
assert(validateDraw(9, 5)?.error === "parity", "9x5 -> parity error");
assert(validateDraw(3, 1)?.error === "parity", "3x1 -> parity error");
assert(validateDraw(9, 10)?.error === "k_too_big", "9x10 -> too many games");
assert(validateDraw(1, 1)?.error === "need_players", "1 player rejected");
assert(validateDraw(9, 0)?.error === "bad_k", "0 games rejected");
assert(validateDraw(9, 4) === null, "9x4 valid");
assert(validateDraw(10, 5) === null, "10x5 valid");
assert(validateDraw(360, 5) === null, "360x5 valid");
assert(validateDraw(2, 1) === null, "2x1 valid");

/* regular fixtures */
function checkRegular(n, k) {
  const { fixtures, exemptPos } = genFixtures(n, k, false);
  const deg = Array(n).fill(0), pairs = new Set();
  let dup = false;
  fixtures.forEach(f => {
    deg[f.h]++; deg[f.a]++;
    const key = Math.min(f.h, f.a) + "-" + Math.max(f.h, f.a);
    if (pairs.has(key)) dup = true;
    pairs.add(key);
  });
  assert(fixtures.length === n * k / 2, n + "x" + k + ": " + (n * k / 2) + " games");
  assert(deg.every(d => d === k), n + "x" + k + ": everyone plays exactly " + k);
  assert(!dup, n + "x" + k + ": no pair meets twice");
  assert(exemptPos === null, n + "x" + k + ": no exempt player");
}
[[9, 4], [10, 5], [2, 1], [4, 3], [24, 5], [360, 5], [16, 15], [359, 6]].forEach(([n, k]) => checkRegular(n, k));

/* one-player-short fixtures (odd total accepted) */
function checkExempt(n, k) {
  const { fixtures, exemptPos } = genFixtures(n, k, true);
  const deg = Array(n).fill(0), pairs = new Set();
  let dup = false;
  fixtures.forEach(f => {
    deg[f.h]++; deg[f.a]++;
    const key = Math.min(f.h, f.a) + "-" + Math.max(f.h, f.a);
    if (pairs.has(key)) dup = true;
    pairs.add(key);
  });
  assert(fixtures.length === (n * k - 1) / 2, n + "x" + k + " exempt: " + ((n * k - 1) / 2) + " games");
  assert(exemptPos === n - 1 && deg[n - 1] === k - 1, n + "x" + k + " exempt: last position plays " + (k - 1));
  assert(deg.slice(0, n - 1).every(d => d === k), n + "x" + k + " exempt: everyone else plays " + k);
  assert(!dup, n + "x" + k + " exempt: no pair meets twice");
}
[[9, 5], [3, 1], [15, 3], [359, 5], [7, 5], [5, 3]].forEach(([n, k]) => checkExempt(n, k));

/* shuffle is a permutation */
const p = shuffled(50);
assert(new Set(p).size === 50 && Math.min(...p) === 0 && Math.max(...p) === 49, "shuffled(50) is a permutation");

assert(MAX_PLAYERS === 360, "cap is 360 players");

console.log(fail === 0 ? "ALL LOGIC TESTS PASSED" : "FAILURES: " + fail);
process.exit(fail ? 1 : 0);
