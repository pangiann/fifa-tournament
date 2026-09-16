/**
 * Calls to the tournament API. Every function resolves to an ApiResult; it
 * never throws, so views can show `result.message` directly.
 */

import { API_BASE_PATH } from "../config.js";

/**
 * @typedef {Object} ApiResult
 * @property {boolean} ok
 * @property {number} status 0 when the request never reached the server.
 * @property {Object} data Parsed response body (empty object when none).
 * @property {string | undefined} error Machine-readable error code from the server.
 * @property {string | undefined} message Human-readable message from the server.
 */

/**
 * @param {{ name: string, gamertag: string, gamesPerPlayer: number }} details
 * @returns {Promise<ApiResult>} On success, data holds code, playerId, and token.
 */
export const createTournament = (details) => request("POST", API_BASE_PATH, details);

/**
 * @param {string} code
 * @returns {Promise<ApiResult>} On success, data.tournament is the public state.
 */
export const fetchTournament = (code) => request("GET", tournamentPath(code));

/**
 * @param {string} code
 * @param {{ name: string, gamertag: string }} details
 * @returns {Promise<ApiResult>} On success, data holds playerId and token.
 */
export const joinTournament = (code, details) =>
  request("POST", tournamentPath(code, "players"), details);

/** @returns {Promise<ApiResult>} */
export const leaveTournament = (code, token) =>
  request("POST", tournamentPath(code, "leave"), { token });

/** @returns {Promise<ApiResult>} */
export const removePlayer = (code, token, playerId) =>
  request("POST", tournamentPath(code, "remove-player"), { token, playerId });

/** @returns {Promise<ApiResult>} */
export const runDraw = (code, token, gamesPerPlayer) =>
  request("POST", tournamentPath(code, "draw"), { token, gamesPerPlayer });

/**
 * @param {{ matchIndex: number, homeScore?: number, awayScore?: number }} result
 * @returns {Promise<ApiResult>}
 */
export const recordLeagueResult = (code, token, result) =>
  request("POST", tournamentPath(code, "results"), { token, ...result });

/**
 * @param {{ key: string, homeScore?: number, awayScore?: number,
 *           penaltyHomeScore?: number, penaltyAwayScore?: number }} result
 * @returns {Promise<ApiResult>}
 */
export const recordKnockoutResult = (code, token, result) =>
  request("POST", tournamentPath(code, "knockout-results"), { token, ...result });

/** @returns {Promise<ApiResult>} */
export const setThirdPlaceMatch = (code, token, enabled) =>
  request("POST", tournamentPath(code, "third-place-match"), { token, enabled });

/**
 * @param {string} code
 * @returns {string} WebSocket URL for live updates.
 */
export const liveConnectionUrl = (code) => {
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  return `${protocol}://${window.location.host}${tournamentPath(code, "live")}`;
};

const tournamentPath = (code, action) =>
  `${API_BASE_PATH}/${encodeURIComponent(code)}${action ? `/${action}` : ""}`;

const request = async (method, path, body) => {
  try {
    const response = await fetch(path, {
      method,
      headers: body ? { "content-type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await response.json().catch(() => ({}));
    return {
      ok: response.ok,
      status: response.status,
      data,
      error: data.error,
      message: data.message,
    };
  } catch {
    return {
      ok: false,
      status: 0,
      data: {},
      error: "NETWORK",
      message: "Network error. Are you online?",
    };
  }
};
