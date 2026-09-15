/* Pure tournament logic shared by the worker and the tests.
 * Kept separate from the worker entry module: the Workers runtime only
 * allows function/class exports on the entry point. */

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O/1/I/L
export const MAX_PLAYERS = 360;

export function makeCode() {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  let s = "";
  for (const b of bytes) s += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return s;
}

/* Knockout size scales with entrants. */
export function koSizeFor(n) {
  if (n > 60) return 16;
  if (n >= 20) return 8;
  if (n >= 4) return 4;
  return 2;
}

/* Returns null when a draw is possible, or an error object explaining why not. */
export function validateDraw(n, k) {
  if (!Number.isInteger(n) || n < 2)
    return { error: "need_players", message: "You need at least 2 players to draw." };
  if (!Number.isInteger(k) || k < 1)
    return { error: "bad_k", message: "Games per player must be at least 1." };
  if (k > n - 1)
    return { error: "k_too_big", maxK: n - 1,
      message: "With " + n + " players, each one can face at most " + (n - 1) + " different opponents. Lower the games count." };
  if ((n * k) % 2 === 1)
    return { error: "parity", n, k,
      message: n + " players × " + k + " games each is an odd total — every match counts for 2 players, so someone would always be one game short." };
  return null;
}

/* Builds a pairing on positions 0..n-1 where everyone plays exactly k
 * distinct opponents (circulant construction: neighbours at distances
 * 1..k/2 around a circle, plus the opposite player when k is odd).
 *
 * With exempt=true (used when n*k is odd): everyone plays k games except
 * position n-1, which plays k-1. Built as a (k-1)-regular circulant plus
 * a perfect matching at distance (n-1)/2 among the first n-1 positions —
 * that distance always exceeds the circulant steps, so no pair repeats.
 * The caller shuffles players onto positions, so the exempt player is random. */
export function genFixtures(n, k, exempt) {
  const edges = [];
  if (exempt) {
    const m = (k - 1) / 2;
    for (let s = 1; s <= m; s++) for (let i = 0; i < n; i++) edges.push([i, (i + s) % n]);
    const half = (n - 1) / 2;
    for (let i = 0; i < half; i++) edges.push([i, i + half]);
    return { fixtures: edges.map(e => ({ h: e[0], a: e[1] })), exemptPos: n - 1 };
  }
  const m = Math.floor(k / 2);
  for (let s = 1; s <= m; s++) for (let i = 0; i < n; i++) edges.push([i, (i + s) % n]);
  if (k % 2 === 1) {
    const half = n / 2;
    for (let i = 0; i < half; i++) edges.push([i, i + half]);
  }
  return { fixtures: edges.map(e => ({ h: e[0], a: e[1] })), exemptPos: null };
}

export function shuffled(n) {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const r = new Uint32Array(1);
    crypto.getRandomValues(r);
    const j = r[0] % (i + 1);
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}
