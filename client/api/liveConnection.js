/**
 * A WebSocket to one tournament that delivers the full public state after
 * every change. It pings to stay alive and reconnects after a drop.
 */

import { KEEPALIVE_INTERVAL_MS, RECONNECT_DELAY_MS } from "../config.js";
import { liveConnectionUrl } from "./tournamentApi.js";

const KEEPALIVE_PING = "ping";
const KEEPALIVE_PONG = "pong";

export const ConnectionStatus = Object.freeze({
  CONNECTING: "connecting",
  CONNECTED: "connected",
  RECONNECTING: "reconnecting",
});

/**
 * @param {string} code
 * @param {{ onTournament: (tournament: Object) => void,
 *           onStatus: (status: string) => void }} callbacks
 * @returns {{ close: () => void }}
 */
export const openLiveConnection = (code, { onTournament, onStatus }) => {
  let socket;
  let pingTimer;
  let reconnectTimer;
  let isClosed = false;

  const connect = () => {
    socket = new WebSocket(liveConnectionUrl(code));
    socket.onopen = () => {
      onStatus(ConnectionStatus.CONNECTED);
      pingTimer = setInterval(() => socket.send(KEEPALIVE_PING), KEEPALIVE_INTERVAL_MS);
    };
    socket.onmessage = (event) => {
      if (event.data === KEEPALIVE_PONG) {
        return;
      }
      const message = parseMessage(event.data);
      if (message?.type === "state") {
        onTournament(message.tournament);
      }
    };
    socket.onclose = () => {
      clearInterval(pingTimer);
      if (!isClosed) {
        onStatus(ConnectionStatus.RECONNECTING);
        reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS);
      }
    };
  };

  onStatus(ConnectionStatus.CONNECTING);
  connect();

  return {
    close: () => {
      isClosed = true;
      clearInterval(pingTimer);
      clearTimeout(reconnectTimer);
      socket.onclose = undefined;
      socket.close();
    },
  };
};

const parseMessage = (raw) => {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
};
