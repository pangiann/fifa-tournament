/**
 * The league table.
 */

import { computeStandings, findGuaranteedQualifiers } from "../../shared/standings.js";
import { getState } from "../state/store.js";
import { card } from "../ui/components.js";
import { createElement } from "../ui/dom.js";

const COLUMNS = Object.freeze([
  { label: "P", key: "played" },
  { label: "W", key: "wins", className: "standings-table__record" },
  { label: "D", key: "draws", className: "standings-table__record" },
  { label: "L", key: "losses", className: "standings-table__record" },
  { label: "GF", key: "goalsFor", className: "standings-table__goals" },
  { label: "GA", key: "goalsAgainst", className: "standings-table__goals" },
  { label: "GD", key: "goalDifference" },
  { label: "Pts", key: "points", className: "standings-table__points" },
]);

/** @returns {HTMLElement} */
export const renderStandingsCard = () => {
  const { tournament } = getState();
  const standings = computeStandings(tournament);
  const qualifiers = findGuaranteedQualifiers(tournament, standings);
  return card(
    "Standings",
    createElement(
      "div",
      { className: "scroll-box" },
      createElement(
        "table",
        { className: "standings-table" },
        renderHeader(),
        createElement(
          "tbody",
          {},
          ...standings.map((row, index) =>
            renderRow(row, index, tournament.knockoutSize, qualifiers),
          ),
        ),
      ),
    ),
    createElement(
      "p",
      { className: "hint" },
      `Top ${tournament.knockoutSize} advance — `,
      qualifiedBadge(),
      " marks players already guaranteed a spot. Tie-breakers: points → goal difference → goals scored → head-to-head.",
    ),
  );
};

const renderHeader = () =>
  createElement(
    "thead",
    {},
    createElement(
      "tr",
      {},
      createElement("th", {}, "#"),
      createElement("th", { className: "standings-table__player" }, "Player"),
      ...COLUMNS.map((column) =>
        createElement("th", { className: column.className ?? "" }, column.label),
      ),
    ),
  );

const renderRow = (row, index, knockoutSize, qualifiers) => {
  const nameCell = createElement("td", { className: "standings-table__player" }, row.name);
  if (qualifiers.has(row.playerId)) {
    nameCell.append(qualifiedBadge());
  }
  return createElement(
    "tr",
    { className: index < knockoutSize ? "standings-table__row--qualifying" : "" },
    createElement("td", {}, String(index + 1)),
    nameCell,
    ...COLUMNS.map((column) =>
      createElement("td", { className: column.className ?? "" }, String(row[column.key])),
    ),
  );
};

const qualifiedBadge = () =>
  createElement(
    "span",
    { className: "qualified-badge", attributes: { title: "Qualified for the knockout stage" } },
    "Q",
  );
