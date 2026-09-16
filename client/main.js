/**
 * Application entry point. Reads the route, keeps the store in sync with the
 * server, and re-renders the page whenever the store changes.
 */

import { openLiveConnection } from "./api/liveConnection.js";
import { fetchTournament } from "./api/tournamentApi.js";
import { knockoutSizeFor } from "../shared/bracket.js";
import { APP_TAGLINE } from "./config.js";
import { currentCode, navigateHome } from "./navigation.js";
import { clearSession, loadSession, markRemovedByHost } from "./state/session.js";
import { getState, reset, subscribe, update } from "./state/store.js";
import { button, card } from "./ui/components.js";
import { clearChildren, createElement, renderPreservingFocus } from "./ui/dom.js";
import { renderLandingView } from "./views/landingView.js";
import { renderLobbyView } from "./views/lobbyView.js";
import { renderTournamentView } from "./views/tournamentView.js";

const root = document.getElementById("app");
const tagline = document.getElementById("tagline");

let liveConnection;

const render = () => {
  const { code, tournament } = getState();
  clearChildren(root);
  if (code === undefined || tournament === undefined) {
    tagline.textContent = APP_TAGLINE;
    root.append(renderLandingView());
    return;
  }
  tagline.textContent = describeTournament(tournament);
  root.append(tournament.phase === "lobby" ? renderLobbyView() : renderTournamentView());
};

const describeTournament = (tournament) => {
  const advancing = tournament.knockoutSize ?? knockoutSizeFor(tournament.players.length);
  return `${tournament.players.length} players · ${tournament.gamesPerPlayer} games each · top ${advancing} advance`;
};

/** Applies a fresh public state, detecting that this device's player is gone. */
const receiveTournament = (tournament) => {
  const { code, session } = getState();
  const stillPresent =
    session === undefined || tournament.players.some((p) => p.id === session.playerId);
  if (stillPresent) {
    update({ tournament });
    return;
  }
  clearSession(code);
  markRemovedByHost(code);
  update({ tournament, session: undefined, removedByHost: true });
};

const openTournament = async (code) => {
  const result = await fetchTournament(code);
  if (!result.ok) {
    renderNotFound(code);
    return;
  }
  update({ code, session: loadSession(code) });
  receiveTournament(result.data.tournament);
  liveConnection = openLiveConnection(code, {
    onTournament: receiveTournament,
    onStatus: (connectionStatus) => update({ connectionStatus }),
  });
};

const renderNotFound = (code) => {
  clearChildren(root);
  root.append(
    card(
      "Not found",
      createElement(
        "p",
        { className: "hint" },
        `No tournament with code ${code}. Check the code with your host.`,
      ),
      createElement("div", { className: "actions" }, button("Back", { onClick: navigateHome })),
    ),
  );
};

const handleRoute = () => {
  liveConnection?.close();
  liveConnection = undefined;
  reset();
  const code = currentCode();
  if (code === undefined) {
    return;
  }
  openTournament(code);
};

subscribe(() => renderPreservingFocus(render));
window.addEventListener("hashchange", handleRoute);
handleRoute();
