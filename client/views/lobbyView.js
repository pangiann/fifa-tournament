/**
 * The lobby: who has joined, a join form for visitors, and the host's draw
 * controls with live feedback on whether the format is playable.
 */

import { joinTournament, removePlayer, runDraw } from "../api/tournamentApi.js";
import { knockoutSizeFor } from "../../shared/bracket.js";
import { checkDrawFormat, countLeagueMatches, DrawProblem } from "../../shared/format.js";
import { saveSession, wasRemovedByHost } from "../state/session.js";
import { getState, isHost, isPlayer, update } from "../state/store.js";
import {
  button,
  card,
  errorText,
  field,
  notice,
  numberInput,
  textInput,
} from "../ui/components.js";
import { createElement } from "../ui/dom.js";
import { renderTopBar } from "./topBar.js";

/** @returns {HTMLElement} */
export const renderLobbyView = () => {
  const { tournament } = getState();
  const container = createElement("div", {}, renderTopBar(), renderPlayersCard(tournament));
  if (isHost()) {
    container.append(renderHostControls(tournament));
  }
  return container;
};

const renderPlayersCard = (tournament) => {
  const { code } = getState();
  const playersCard = card(
    "Lobby — waiting for players",
    createElement("div", { className: "join-code" }, code),
    createElement(
      "p",
      { className: "hint" },
      `Share the code or the invite link. Players join from their own phone or laptop. ${tournament.players.length} / ${tournament.maxPlayers} joined.`,
    ),
    createElement("div", { className: "player-list" }, ...tournament.players.map(renderPlayerPill)),
  );
  if (!isPlayer()) {
    playersCard.append(renderVisitorSection());
  } else if (!isHost()) {
    playersCard.append(
      createElement("p", { className: "hint" }, "Waiting for the host to run the draw…"),
    );
  }
  return playersCard;
};

const renderPlayerPill = (player) => {
  const { tournament, code, session } = getState();
  const isTournamentHost = player.id === tournament.hostId;
  const pill = createElement(
    "div",
    { className: "player-pill" },
    createElement(
      "span",
      { className: "player-pill__name" },
      `${player.name}${isTournamentHost ? " 👑" : ""}`,
    ),
    player.gamertag
      ? createElement("span", { className: "player-pill__gamertag" }, `🎮 ${player.gamertag}`)
      : undefined,
  );
  if (isHost() && !isTournamentHost) {
    pill.append(
      createElement(
        "button",
        {
          className: "player-pill__remove",
          attributes: { type: "button", title: `Remove ${player.name}` },
          on: {
            click: () => {
              if (window.confirm(`Remove ${player.name} from the tournament?`)) {
                removePlayer(code, session.token, player.id);
              }
            },
          },
        },
        "✕",
      ),
    );
  }
  return pill;
};

const renderVisitorSection = () => {
  const { code, removedByHost } = getState();
  if (removedByHost || wasRemovedByHost(code)) {
    return notice("You were removed from this tournament by the host. You can still watch.", {
      variant: "error",
    });
  }
  const nameInput = textInput({ placeholder: "Your name", focusKey: "join-name" });
  const gamertagInput = textInput({
    placeholder: "Gamertag (optional)",
    focusKey: "join-gamertag",
  });
  const error = errorText();
  const join = async () => {
    const result = await joinTournament(code, {
      name: nameInput.value,
      gamertag: gamertagInput.value,
    });
    if (!result.ok) {
      error.textContent = result.message ?? "Could not join.";
      return;
    }
    const session = {
      token: result.data.token,
      playerId: result.data.playerId,
      name: nameInput.value.trim(),
    };
    saveSession(code, session);
    update({ session });
  };
  return createElement(
    "div",
    { className: "notice notice--info" },
    "You're watching. Join before the draw to play:",
    field("Your name", nameInput),
    field("Gamertag", gamertagInput),
    createElement("div", { className: "actions" }, button("Join as player", { onClick: join })),
    error,
  );
};

const renderHostControls = (tournament) => {
  const { code, session, drawProblem } = getState();
  const playerCount = tournament.players.length;
  const hint = createElement("p", { className: "hint" });
  const describeFormat = (gamesPerPlayer) => {
    const check = checkDrawFormat(playerCount, gamesPerPlayer);
    hint.textContent = check.isValid
      ? `✓ ${playerCount} players × ${gamesPerPlayer} games → ${countLeagueMatches(playerCount, gamesPerPlayer)} league games, top ${knockoutSizeFor(playerCount)} advance.`
      : `✗ ${check.message}`;
  };
  const gamesInput = numberInput({
    value: tournament.gamesPerPlayer,
    min: 1,
    focusKey: "games-per-player",
    onInput: describeFormat,
  });
  describeFormat(tournament.gamesPerPlayer);

  const draw = async (gamesPerPlayer) => {
    const result = await runDraw(code, session.token, gamesPerPlayer);
    update({ drawProblem: result.ok ? undefined : result });
  };

  const controls = card(
    "Host controls",
    field("Games per player", gamesInput),
    hint,
    createElement(
      "div",
      { className: "actions" },
      button("🎲 Draw & start", { onClick: () => draw(Number.parseInt(gamesInput.value, 10)) }),
    ),
  );
  if (drawProblem) {
    controls.append(renderDrawProblem(drawProblem, playerCount, draw));
  }
  return controls;
};

/** Explains a refused draw and offers the valid fixes. */
const renderDrawProblem = (problem, playerCount, draw) => {
  const actions = createElement("div", { className: "actions" });
  if (problem.error === DrawProblem.ODD_TOTAL) {
    const { gamesPerPlayer } = problem.data;
    if (gamesPerPlayer - 1 >= 1) {
      actions.append(
        button(`Play ${gamesPerPlayer - 1} games`, {
          onClick: () => draw(gamesPerPlayer - 1),
          small: true,
        }),
      );
    }
    if (gamesPerPlayer + 1 <= playerCount - 1) {
      actions.append(
        button(`Play ${gamesPerPlayer + 1} games`, {
          onClick: () => draw(gamesPerPlayer + 1),
          small: true,
        }),
      );
    }
  }
  actions.append(
    button("Wait for more players", {
      onClick: () => update({ drawProblem: undefined }),
      variant: "ghost",
      small: true,
    }),
  );
  return createElement(
    "div",
    { className: "notice notice--error" },
    problem.message ?? "The draw is not possible.",
    actions,
  );
};
