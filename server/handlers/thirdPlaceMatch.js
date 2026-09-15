import { hasSemiFinals, THIRD_PLACE_KEY } from "../../shared/bracket.js";
import { fail, HttpStatus, succeed } from "../http.js";
import { requireHost, requirePhase } from "./guards.js";

/**
 * POST /api/tournaments/:code/third-place-match — the host adds or removes the
 * match between the semi-final losers. It can't be removed once it has a score.
 *
 * @param {import("./guards.js").HandlerContext} context
 * @returns {import("../http.js").HandlerOutcome}
 */
export const setThirdPlaceMatch = (context) => {
  const problem =
    requireHost(context, "Only the host can change the format.") ??
    requirePhase(context, "league", "Run the draw first.");
  if (problem) {
    return problem;
  }
  const { tournament, body } = context;
  if (!hasSemiFinals(tournament.knockoutSize)) {
    return fail(HttpStatus.CONFLICT, "NO_SEMI_FINALS", "A third-place match needs semi-finals.");
  }
  const enabled = body.enabled === true;
  if (!enabled && hasAnyScore(tournament.knockoutResults[THIRD_PLACE_KEY])) {
    return fail(
      HttpStatus.CONFLICT,
      "HAS_SCORE",
      "Clear the third-place match's score before removing it.",
    );
  }
  tournament.hasThirdPlaceMatch = enabled;
  if (!enabled) {
    delete tournament.knockoutResults[THIRD_PLACE_KEY];
  }
  return succeed({ ok: true }, { changed: true });
};

const hasAnyScore = (result) =>
  result !== undefined && Object.values(result).some((score) => score !== undefined);
