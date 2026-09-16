/**
 * The tournament screen after the draw: league games and standings side by
 * side, the knockout stage underneath.
 */

import { createElement } from "../ui/dom.js";
import { renderGamesCard } from "./gamesView.js";
import { renderKnockoutCard } from "./knockoutView.js";
import { renderStandingsCard } from "./standingsView.js";
import { renderTopBar } from "./topBar.js";

/** @returns {HTMLElement} */
export const renderTournamentView = () =>
  createElement(
    "div",
    {},
    renderTopBar(),
    createElement(
      "div",
      { className: "tournament-grid" },
      renderGamesCard(),
      renderStandingsCard(),
    ),
    renderKnockoutCard(),
  );
