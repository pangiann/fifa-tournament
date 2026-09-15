import { isValidKnockoutKey } from "../../shared/bracket.js";
import { isLeagueComplete } from "../../shared/format.js";
import { fail, HttpStatus, parseNonNegativeInteger, parseScore, succeed } from "../http.js";
import { requirePhase, requirePlayer } from "./guards.js";

const SPECTATOR_MESSAGE = "Spectators can't enter results.";

/**
 * POST /api/tournaments/:code/results — any player records or corrects a
 * league score. Partial scores are stored so the other clients see typing
 * progress; a match counts as played only when both scores exist.
 *
 * @param {import("./guards.js").HandlerContext} context
 * @returns {import("../http.js").HandlerOutcome}
 */
export const recordLeagueResult = (context) => {
  const problem =
    requirePlayer(context, SPECTATOR_MESSAGE) ??
    requirePhase(context, "league", "The league hasn't started yet.");
  if (problem) {
    return problem;
  }
  const { tournament, body } = context;
  const matchIndex = parseNonNegativeInteger(body.matchIndex);
  if (matchIndex === undefined || matchIndex >= tournament.results.length) {
    return fail(HttpStatus.BAD_REQUEST, "UNKNOWN_MATCH", "That match doesn't exist.");
  }
  tournament.results[matchIndex] = {
    homeScore: parseScore(body.homeScore),
    awayScore: parseScore(body.awayScore),
  };
  return succeed({ ok: true }, { changed: true });
};

/**
 * POST /api/tournaments/:code/knockout-results — any player records a
 * knockout score, once the league is complete.
 *
 * @param {import("./guards.js").HandlerContext} context
 * @returns {import("../http.js").HandlerOutcome}
 */
export const recordKnockoutResult = (context) => {
  const problem = requirePlayer(context, SPECTATOR_MESSAGE);
  if (problem) {
    return problem;
  }
  const { tournament, body } = context;
  if (tournament.phase !== "league" || !isLeagueComplete(tournament)) {
    return fail(HttpStatus.CONFLICT, "LEAGUE_OPEN", "Finish all league games first.");
  }
  const key = typeof body.key === "string" ? body.key : "";
  if (!isValidKnockoutKey(key, tournament)) {
    return fail(HttpStatus.BAD_REQUEST, "UNKNOWN_MATCH", "That knockout match doesn't exist.");
  }
  tournament.knockoutResults[key] = {
    homeScore: parseScore(body.homeScore),
    awayScore: parseScore(body.awayScore),
    penaltyHomeScore: parseScore(body.penaltyHomeScore),
    penaltyAwayScore: parseScore(body.penaltyAwayScore),
  };
  return succeed({ ok: true }, { changed: true });
};
