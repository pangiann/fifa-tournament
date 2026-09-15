import { fail, HttpStatus, parseNonNegativeInteger, succeed } from "../http.js";
import { findCaller, requireHost, requirePhase, requirePlayer } from "./guards.js";

const LOCKED_MESSAGE = "The draw is done, so the players are fixed now.";

/**
 * POST /api/tournaments/:code/leave — the caller removes themselves from the lobby.
 *
 * @param {import("./guards.js").HandlerContext} context
 * @returns {import("../http.js").HandlerOutcome}
 */
export const leaveTournament = (context) => {
  const problem = requirePlayer(context) ?? requirePhase(context, "lobby", LOCKED_MESSAGE);
  if (problem) {
    return problem;
  }
  const caller = findCaller(context);
  if (caller.id === context.tournament.hostId) {
    return fail(
      HttpStatus.FORBIDDEN,
      "HOST_CANNOT_LEAVE",
      "The host can't leave their own tournament.",
    );
  }
  removePlayerById(context.tournament, caller.id);
  return succeed({ ok: true }, { changed: true });
};

/**
 * POST /api/tournaments/:code/remove-player — the host removes another player.
 *
 * @param {import("./guards.js").HandlerContext} context
 * @returns {import("../http.js").HandlerOutcome}
 */
export const removePlayer = (context) => {
  const problem =
    requireHost(context, "Only the host can remove players.") ??
    requirePhase(context, "lobby", LOCKED_MESSAGE);
  if (problem) {
    return problem;
  }
  const { tournament, body } = context;
  const playerId = parseNonNegativeInteger(body.playerId);
  const isRemovable =
    playerId !== undefined &&
    playerId !== tournament.hostId &&
    tournament.players.some((player) => player.id === playerId);
  if (!isRemovable) {
    return fail(HttpStatus.BAD_REQUEST, "UNKNOWN_PLAYER", "That player isn't in the lobby.");
  }
  removePlayerById(tournament, playerId);
  return succeed({ ok: true }, { changed: true });
};

const removePlayerById = (tournament, playerId) => {
  tournament.players = tournament.players.filter((player) => player.id !== playerId);
};
