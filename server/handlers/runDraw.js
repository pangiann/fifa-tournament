import { knockoutSizeFor } from "../../shared/bracket.js";
import { checkDrawFormat } from "../../shared/format.js";
import { generateFixtures } from "../draw.js";
import { fail, HttpStatus, parseNonNegativeInteger, succeed } from "../http.js";
import { requireHost, requirePhase } from "./guards.js";

/**
 * POST /api/tournaments/:code/draw — locks the lobby, generates the schedule,
 * and sizes the knockout stage. Only valid formats are accepted; the problem
 * code tells the client which fixes to offer.
 *
 * @param {import("./guards.js").HandlerContext} context
 * @returns {import("../http.js").HandlerOutcome}
 */
export const runDraw = (context) => {
  const problem =
    requireHost(context, "Only the host can start the draw.") ??
    requirePhase(context, "lobby", "The draw already happened.");
  if (problem) {
    return problem;
  }
  const { tournament, body } = context;
  const gamesPerPlayer = parseNonNegativeInteger(body.gamesPerPlayer) ?? tournament.gamesPerPlayer;
  const playerIds = tournament.players.map((player) => player.id);
  const check = checkDrawFormat(playerIds.length, gamesPerPlayer);
  if (!check.isValid) {
    return {
      ...fail(HttpStatus.CONFLICT, check.problem, check.message),
      body: {
        error: check.problem,
        message: check.message,
        playerCount: playerIds.length,
        gamesPerPlayer,
      },
    };
  }
  const fixtures = generateFixtures(playerIds, gamesPerPlayer);
  Object.assign(tournament, {
    phase: "league",
    gamesPerPlayer,
    fixtures,
    results: fixtures.map(() => ({ homeScore: undefined, awayScore: undefined })),
    knockoutSize: knockoutSizeFor(playerIds.length),
  });
  return succeed({ ok: true }, { changed: true });
};
