import { MAX_PLAYERS } from "../../shared/format.js";
import { fail, HttpStatus, parseName, succeed } from "../http.js";
import { requirePhase } from "./guards.js";

/**
 * POST /api/tournaments/:code/players — adds the caller to the lobby.
 *
 * @param {import("./guards.js").HandlerContext} context
 * @returns {import("../http.js").HandlerOutcome}
 */
export const joinTournament = (context) => {
  const { tournament, body, room } = context;
  const phaseProblem = requirePhase(
    context,
    "lobby",
    "The draw is done, so joining is closed. You can still watch.",
  );
  if (phaseProblem) {
    return phaseProblem;
  }
  if (tournament.players.length >= MAX_PLAYERS) {
    return fail(HttpStatus.CONFLICT, "FULL", `The tournament is full (${MAX_PLAYERS} players).`);
  }
  const name = parseName(body.name);
  if (name === undefined) {
    return fail(HttpStatus.BAD_REQUEST, "NAME_REQUIRED", "Enter your name.");
  }
  if (isNameTaken(tournament, name)) {
    return fail(HttpStatus.CONFLICT, "NAME_TAKEN", "That name is taken. Pick another.");
  }
  const player = {
    id: room.allocatePlayerId(),
    name,
    gamertag: parseName(body.gamertag),
    token: crypto.randomUUID(),
  };
  tournament.players.push(player);
  return succeed(
    { code: tournament.code, playerId: player.id, token: player.token },
    { changed: true },
  );
};

const isNameTaken = (tournament, name) =>
  tournament.players.some((player) => player.name.toLowerCase() === name.toLowerCase());
