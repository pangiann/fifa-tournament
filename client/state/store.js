/**
 * A tiny observable store. Views render from `getState()` and re-render
 * whenever `update` changes something. There is no framework: the whole
 * page is re-rendered on each change, which is fast enough at this size.
 */

import { ConnectionStatus } from "../api/liveConnection.js";

/**
 * @typedef {Object} ClientState
 * @property {string | undefined} code Join code of the open tournament.
 * @property {import("../../shared/types.js").Tournament | undefined} tournament
 * @property {Map<number, import("../../shared/types.js").Player>} playersById
 * @property {import("./session.js").Session | undefined} session
 * @property {string} connectionStatus One of ConnectionStatus.
 * @property {Object | undefined} drawProblem Last rejected draw, shown to the host.
 * @property {boolean} removedByHost This device's player was removed during this visit.
 * @property {string} nameFilter Text filter on the league game list.
 * @property {boolean} showOnlyMine
 * @property {boolean} showOnlyUnplayed
 */

/** @returns {ClientState} */
const createInitialState = () => ({
  code: undefined,
  tournament: undefined,
  playersById: new Map(),
  session: undefined,
  connectionStatus: ConnectionStatus.CONNECTING,
  drawProblem: undefined,
  removedByHost: false,
  nameFilter: "",
  showOnlyMine: false,
  showOnlyUnplayed: false,
});

let state = createInitialState();
const listeners = new Set();

/** @returns {ClientState} */
export const getState = () => state;

/**
 * Merges a partial state and notifies listeners.
 * @param {Partial<ClientState>} changes
 */
export const update = (changes) => {
  state = { ...state, ...changes };
  if ("tournament" in changes) {
    state.playersById = indexPlayers(changes.tournament);
  }
  listeners.forEach((listener) => listener(state));
};

/** Forgets the open tournament (used when navigating home). */
export const reset = () => {
  state = createInitialState();
  listeners.forEach((listener) => listener(state));
};

/**
 * @param {(state: ClientState) => void} listener
 * @returns {() => void} Unsubscribe.
 */
export const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/**
 * @param {number} playerId
 * @returns {import("../../shared/types.js").Player | undefined}
 */
export const getPlayer = (playerId) => state.playersById.get(playerId);

/** @returns {boolean} True when this device is a player in the open tournament. */
export const isPlayer = () => state.session !== undefined;

/** @returns {boolean} True when this device is the host. */
export const isHost = () =>
  state.session !== undefined &&
  state.tournament !== undefined &&
  state.session.playerId === state.tournament.hostId;

const indexPlayers = (tournament) =>
  new Map((tournament?.players ?? []).map((player) => [player.id, player]));
