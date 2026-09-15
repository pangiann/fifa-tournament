import { fail, HttpStatus, succeed } from "../http.js";

/**
 * GET /api/tournaments/:code — the public state (no tokens).
 *
 * @param {import("./guards.js").HandlerContext} context
 * @returns {import("../http.js").HandlerOutcome}
 */
export const getState = ({ room }) => succeed({ tournament: room.publicState() });

/**
 * GET /api/tournaments/:code/live — upgrades to a WebSocket that receives the
 * public state now and after every change. Clients never send messages except
 * keepalive pings, which the platform answers without waking the room.
 *
 * @param {import("./guards.js").HandlerContext} context
 * @returns {Response | import("../http.js").HandlerOutcome}
 */
export const openLiveConnection = ({ request, room }) => {
  if (request.headers.get("Upgrade") !== "websocket") {
    return fail(HttpStatus.UPGRADE_REQUIRED, "UPGRADE_REQUIRED", "Connect with a WebSocket.");
  }
  const { 0: clientSocket, 1: serverSocket } = new WebSocketPair();
  room.acceptSocket(serverSocket);
  return new Response(null, { status: HttpStatus.SWITCHING_PROTOCOLS, webSocket: clientSocket });
};
