/**
 * One Durable Object instance per tournament, addressed by its join code.
 * The room owns persistence and live connections; the handlers own the rules.
 */

import { MAX_PLAYERS } from "../shared/format.js";
import { createTournament } from "./handlers/createTournament.js";
import { joinTournament } from "./handlers/joinTournament.js";
import { getState, openLiveConnection } from "./handlers/liveState.js";
import { leaveTournament, removePlayer } from "./handlers/lobbyMembership.js";
import { recordKnockoutResult, recordLeagueResult } from "./handlers/recordResults.js";
import { runDraw } from "./handlers/runDraw.js";
import { setThirdPlaceMatch } from "./handlers/thirdPlaceMatch.js";
import { fail, HttpStatus, jsonResponse, readJsonBody } from "./http.js";

const STORAGE_KEY = "tournament";
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
/** Idle tournaments are deleted after this long without a change. */
const RETENTION_MS = 7 * ONE_DAY_MS;

/**
 * Stored shape: the public Tournament plus secrets and bookkeeping.
 * @typedef {import("../shared/types.js").Player & { token: string }} StoredPlayer
 * @typedef {Omit<import("../shared/types.js").Tournament, "players" | "maxPlayers"> & {
 *   players: StoredPlayer[],
 *   nextPlayerId: number,
 * }} StoredTournament
 */

/**
 * Routes handled once a tournament exists. Keys are "METHOD /action" as
 * forwarded by the worker.
 */
const ROUTES = Object.freeze({
  "GET /state": getState,
  "GET /live": openLiveConnection,
  "POST /players": joinTournament,
  "POST /leave": leaveTournament,
  "POST /remove-player": removePlayer,
  "POST /draw": runDraw,
  "POST /results": recordLeagueResult,
  "POST /knockout-results": recordKnockoutResult,
  "POST /third-place-match": setThirdPlaceMatch,
});

export class TournamentRoom {
  /**
   * @param {DurableObjectState} state
   */
  constructor(state) {
    this.state = state;
    /** @type {StoredTournament | undefined | null} null = not loaded yet */
    this.tournament = null;
    /* Keepalive pings are answered by the platform without waking the object. */
    this.state.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  /**
   * @param {Request} request
   * @returns {Promise<Response>}
   */
  async fetch(request) {
    try {
      return await this.dispatch(request);
    } catch (error) {
      console.error("Unhandled error in TournamentRoom", error);
      return jsonResponse(
        fail(HttpStatus.INTERNAL_ERROR, "INTERNAL", "Something went wrong.").body,
        HttpStatus.INTERNAL_ERROR,
      );
    }
  }

  /** Deletes everything when the retention alarm fires. */
  async alarm() {
    await this.state.storage.deleteAll();
    this.tournament = undefined;
  }

  /** The tournament as clients may see it: an explicit allowlist, so secrets can't leak. */
  publicState() {
    const tournament = this.tournament;
    return {
      code: tournament.code,
      phase: tournament.phase,
      gamesPerPlayer: tournament.gamesPerPlayer,
      hostId: tournament.hostId,
      maxPlayers: MAX_PLAYERS,
      players: tournament.players.map(({ id, name, gamertag }) => ({ id, name, gamertag })),
      fixtures: tournament.fixtures,
      results: tournament.results,
      knockoutSize: tournament.knockoutSize,
      knockoutResults: tournament.knockoutResults,
      hasThirdPlaceMatch: tournament.hasThirdPlaceMatch,
    };
  }

  /** Ids are never reused, so a removed player can't be confused with a new one. */
  allocatePlayerId() {
    const id = this.tournament.nextPlayerId;
    this.tournament.nextPlayerId += 1;
    return id;
  }

  /** @param {StoredTournament} tournament */
  replaceTournament(tournament) {
    this.tournament = tournament;
  }

  /** @param {WebSocket} serverSocket */
  acceptSocket(serverSocket) {
    this.state.acceptWebSocket(serverSocket);
    serverSocket.send(this.stateMessage());
  }

  async dispatch(request) {
    const { pathname } = new URL(request.url);
    const body = request.method === "POST" ? await readJsonBody(request) : {};
    await this.load();
    const context = { tournament: this.tournament, body, request, room: this };

    if (pathname === "/create") {
      return this.complete(createTournament(context));
    }
    if (this.tournament === undefined) {
      return jsonResponse(
        fail(HttpStatus.NOT_FOUND, "NOT_FOUND", "No tournament with this code.").body,
        HttpStatus.NOT_FOUND,
      );
    }
    const handler = ROUTES[`${request.method} ${pathname}`];
    if (handler === undefined) {
      return jsonResponse(
        fail(HttpStatus.NOT_FOUND, "NOT_FOUND", "Unknown action.").body,
        HttpStatus.NOT_FOUND,
      );
    }
    return this.complete(handler(context));
  }

  /** Persists and broadcasts when the handler changed something, then responds. */
  async complete(outcome) {
    if (outcome instanceof Response) {
      return outcome;
    }
    if (outcome.changed) {
      await this.save();
      this.broadcast();
    }
    return jsonResponse(outcome.body, outcome.status);
  }

  async load() {
    if (this.tournament === null) {
      this.tournament = await this.state.storage.get(STORAGE_KEY);
    }
  }

  async save() {
    await this.state.storage.put(STORAGE_KEY, this.tournament);
    await this.state.storage.setAlarm(Date.now() + RETENTION_MS);
  }

  broadcast() {
    const message = this.stateMessage();
    for (const socket of this.state.getWebSockets()) {
      try {
        socket.send(message);
      } catch {
        /* the socket is closing; the platform drops it */
      }
    }
  }

  stateMessage() {
    return JSON.stringify({ type: "state", tournament: this.publicState() });
  }

  /* Clients only send keepalive pings, answered automatically; nothing to do here. */
  webSocketMessage() {}
  webSocketClose() {}
  webSocketError() {}
}
