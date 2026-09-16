/**
 * The strip above every tournament screen: code, who you are, connection
 * state, invite link, and the way out.
 */

import { ConnectionStatus } from "../api/liveConnection.js";
import { leaveTournament } from "../api/tournamentApi.js";
import { inviteLink, navigateHome } from "../navigation.js";
import { clearSession } from "../state/session.js";
import { getState, isHost, isPlayer } from "../state/store.js";
import { button, chip } from "../ui/components.js";
import { createElement } from "../ui/dom.js";

/** @returns {HTMLElement} */
export const renderTopBar = () => {
  const { code, session, connectionStatus, tournament } = getState();
  const canLeave = isPlayer() && !isHost() && tournament.phase === "lobby";
  return createElement(
    "div",
    { className: "top-bar" },
    chip(`Code: ${code}`),
    isPlayer() ? chip(`Playing as ${session.name}`) : chip("👀 Spectating"),
    connectionStatus === ConnectionStatus.CONNECTED
      ? undefined
      : chip("reconnecting…", { variant: "warning" }),
    button("Copy invite link", {
      onClick: () => copyInviteLink(code),
      variant: "ghost",
      small: true,
    }),
    canLeave
      ? button("Leave tournament", {
          onClick: () => leave(code, session.token),
          variant: "ghost",
          small: true,
        })
      : button("Home", { onClick: navigateHome, variant: "ghost", small: true }),
  );
};

const copyInviteLink = (code) => {
  navigator.clipboard?.writeText(inviteLink(code));
};

const leave = async (code, token) => {
  const confirmed = window.confirm(
    "Leave the tournament? Your spot is removed. You can join again with a new name.",
  );
  if (!confirmed) {
    return;
  }
  await leaveTournament(code, token);
  clearSession(code);
  navigateHome();
};
