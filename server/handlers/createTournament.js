import { MAX_PLAYERS, MIN_GAMES_PER_PLAYER } from "../../shared/format.js";
import { fail, HttpStatus, parseName, parseNonNegativeInteger, succeed } from "../http.js";

const HOST_PLAYER_ID = 0;
const MAX_GAMES_PER_PLAYER = MAX_PLAYERS - 1;
/** Starting value shown in the lobby; the host adjusts it before the draw. */
export const DEFAULT_GAMES_PER_PLAYER = 4;

/**
 * POST /api/tournaments — creates the room with the caller as host.
 * The worker has already allocated the join code and checked it is free.
 * gamesPerPlayer is optional here; the host sets the final value at the draw.
 *
 * @param {import("./guards.js").HandlerContext} context
 * @returns {import("../http.js").HandlerOutcome}
 */
export const createTournament = ({ tournament, body, room }) => {
  if (tournament !== undefined) {
    return fail(HttpStatus.CONFLICT, "CODE_TAKEN", "This code is already in use.");
  }
  const name = parseName(body.name);
  if (name === undefined) {
    return fail(HttpStatus.BAD_REQUEST, "NAME_REQUIRED", "Enter your name.");
  }
  const gamesPerPlayer =
    body.gamesPerPlayer === undefined
      ? DEFAULT_GAMES_PER_PLAYER
      : parseNonNegativeInteger(body.gamesPerPlayer);
  if (
    gamesPerPlayer === undefined ||
    gamesPerPlayer < MIN_GAMES_PER_PLAYER ||
    gamesPerPlayer > MAX_GAMES_PER_PLAYER
  ) {
    return fail(
      HttpStatus.BAD_REQUEST,
      "INVALID_GAMES",
      `Games per player must be between ${MIN_GAMES_PER_PLAYER} and ${MAX_GAMES_PER_PLAYER}.`,
    );
  }
  const host = {
    id: HOST_PLAYER_ID,
    name,
    gamertag: parseName(body.gamertag),
    token: crypto.randomUUID(),
  };
  room.replaceTournament({
    code: body.code,
    phase: "lobby",
    gamesPerPlayer,
    hostId: HOST_PLAYER_ID,
    players: [host],
    nextPlayerId: HOST_PLAYER_ID + 1,
    fixtures: [],
    results: [],
    knockoutSize: undefined,
    knockoutResults: {},
    hasThirdPlaceMatch: false,
  });
  return succeed({ code: body.code, playerId: host.id, token: host.token }, { changed: true });
};
