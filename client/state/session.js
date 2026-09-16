/**
 * This device's identity in a tournament, kept in localStorage so a refresh
 * or a reconnect brings the player back as themselves.
 *
 * @typedef {Object} Session
 * @property {string} token Secret proving who this device is.
 * @property {number} playerId
 * @property {string} name
 */

import { StorageKey } from "../config.js";

/**
 * @param {string} code
 * @returns {Session | undefined}
 */
export const loadSession = (code) => {
  const raw = readStorage(StorageKey.SESSION + code);
  if (raw === undefined) {
    return undefined;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
};

/**
 * @param {string} code
 * @param {Session} session
 */
export const saveSession = (code, session) => {
  writeStorage(StorageKey.SESSION + code, JSON.stringify(session));
};

/** @param {string} code */
export const clearSession = (code) => {
  writeStorage(StorageKey.SESSION + code, undefined);
};

/**
 * Remembers that the host removed this device's player, so the browser
 * can't simply rejoin under a new name.
 * @param {string} code
 */
export const markRemovedByHost = (code) => {
  writeStorage(StorageKey.REMOVED + code, "1");
};

/** @param {string} code */
export const wasRemovedByHost = (code) => readStorage(StorageKey.REMOVED + code) === "1";

/* localStorage can be unavailable (private mode, disabled); treat it as empty. */
const readStorage = (key) => {
  try {
    return window.localStorage.getItem(key) ?? undefined;
  } catch {
    return undefined;
  }
};

const writeStorage = (key, value) => {
  try {
    if (value === undefined) {
      window.localStorage.removeItem(key);
    } else {
      window.localStorage.setItem(key, value);
    }
  } catch {
    /* storage unavailable: the session simply won't survive a reload */
  }
};
