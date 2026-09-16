/**
 * Client-side constants. Anything tunable lives here rather than inline.
 */

export const API_BASE_PATH = "/api/tournaments";

/** localStorage key prefixes; the join code is appended. */
export const StorageKey = Object.freeze({
  SESSION: "champions-night:session:",
  REMOVED: "champions-night:removed:",
});

export const KEEPALIVE_INTERVAL_MS = 20_000;
export const RECONNECT_DELAY_MS = 2_000;

export const JOIN_CODE_LENGTH = 6;
export const MAX_NAME_LENGTH = 20;

export const APP_TAGLINE = "Join with a code · league phase · knockouts · glory";
