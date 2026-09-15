/**
 * Worker entry point. Requests under /api/tournaments are forwarded to the
 * Durable Object for that join code; everything else is a static asset.
 *
 * Only the default handler and the Durable Object class may be exported from
 * this module: the Workers runtime rejects other export types.
 */

import { createJoinCode, isJoinCodeShaped } from "./draw.js";
import { fail, HttpStatus, jsonResponse, readJsonBody } from "./http.js";
import { TournamentRoom } from "./tournamentRoom.js";

export { TournamentRoom };

const API_PREFIX = "/api/tournaments";
const CODE_ALLOCATION_ATTEMPTS = 3;
const ROOM_ORIGIN = "https://tournament-room";

export default {
  /**
   * @param {Request} request
   * @param {{ TOURNAMENT: DurableObjectNamespace, ASSETS: Fetcher }} env
   */
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname === API_PREFIX && request.method === "POST") {
      return createTournamentWithFreshCode(request, env);
    }
    const tournamentRoute = parseTournamentRoute(pathname);
    if (tournamentRoute) {
      return forwardToRoom(request, env, tournamentRoute);
    }
    if (pathname.startsWith("/api/")) {
      return jsonResponse(
        fail(HttpStatus.NOT_FOUND, "NOT_FOUND", "Unknown endpoint.").body,
        HttpStatus.NOT_FOUND,
      );
    }
    return env.ASSETS.fetch(request);
  },
};

/**
 * @param {string} pathname
 * @returns {{ code: string, action: string } | undefined}
 */
const parseTournamentRoute = (pathname) => {
  const match = new RegExp(`^${API_PREFIX}/([^/]+)(/[a-z-]+)?$`).exec(pathname);
  if (!match || !isJoinCodeShaped(match[1])) {
    return undefined;
  }
  return { code: match[1].toUpperCase(), action: match[2] ?? "/state" };
};

const roomFor = (env, code) => env.TOURNAMENT.get(env.TOURNAMENT.idFromName(code));

const forwardToRoom = (request, env, { code, action }) =>
  roomFor(env, code).fetch(new Request(`${ROOM_ORIGIN}${action}`, request));

/**
 * Picks a random code and asks that room to create the tournament. The room
 * answers 409 if the code is already taken, in which case we try another.
 */
const createTournamentWithFreshCode = async (request, env) => {
  const body = await readJsonBody(request);
  for (let attempt = 0; attempt < CODE_ALLOCATION_ATTEMPTS; attempt += 1) {
    const code = createJoinCode();
    const response = await roomFor(env, code).fetch(`${ROOM_ORIGIN}/create`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...body, code }),
    });
    if (response.status !== HttpStatus.CONFLICT) {
      return response;
    }
  }
  return jsonResponse(
    fail(HttpStatus.INTERNAL_ERROR, "NO_FREE_CODE", "Could not allocate a code. Try again.").body,
    HttpStatus.INTERNAL_ERROR,
  );
};
