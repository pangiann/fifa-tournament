/**
 * Guards shared by the handlers. Each returns either a failure outcome
 * (ready to send back) or undefined when the request may proceed.
 */

import { fail, HttpStatus } from "../http.js";

export const ErrorCode = Object.freeze({
  NOT_PLAYER: "NOT_PLAYER",
  NOT_HOST: "NOT_HOST",
  WRONG_PHASE: "WRONG_PHASE",
});

/**
 * @typedef {Object} HandlerContext
 * @property {import("../tournamentRoom.js").StoredTournament} tournament
 * @property {Object} body Parsed request body.
 * @property {Request} request
 * @property {import("../tournamentRoom.js").TournamentRoom} room
 */

/**
 * @param {HandlerContext} context
 * @returns {import("../tournamentRoom.js").StoredPlayer | undefined}
 */
export const findCaller = ({ tournament, body }) => {
  if (typeof body.token !== "string" || body.token === "") {
    return undefined;
  }
  return tournament.players.find((player) => player.token === body.token);
};

/**
 * @param {HandlerContext} context
 * @param {string} [message]
 * @returns {import("../http.js").HandlerOutcome | undefined} Failure when the caller is not a player.
 */
export const requirePlayer = (context, message = "Only players can do this.") =>
  findCaller(context) ? undefined : fail(HttpStatus.FORBIDDEN, ErrorCode.NOT_PLAYER, message);

/**
 * @param {HandlerContext} context
 * @param {string} [message]
 * @returns {import("../http.js").HandlerOutcome | undefined} Failure when the caller is not the host.
 */
export const requireHost = (context, message = "Only the host can do this.") => {
  const caller = findCaller(context);
  return caller && caller.id === context.tournament.hostId
    ? undefined
    : fail(HttpStatus.FORBIDDEN, ErrorCode.NOT_HOST, message);
};

/**
 * @param {HandlerContext} context
 * @param {import("../../shared/types.js").TournamentPhase} phase
 * @param {string} message
 * @returns {import("../http.js").HandlerOutcome | undefined} Failure when the tournament is in another phase.
 */
export const requirePhase = ({ tournament }, phase, message) =>
  tournament.phase === phase
    ? undefined
    : fail(HttpStatus.CONFLICT, ErrorCode.WRONG_PHASE, message);
