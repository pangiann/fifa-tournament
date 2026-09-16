/**
 * The first screen: create a tournament, or enter a code to join or watch.
 */

import { createTournament, joinTournament } from "../api/tournamentApi.js";
import { DEFAULT_GAMES_PER_PLAYER, JOIN_CODE_LENGTH } from "../config.js";
import { loadSession, saveSession, wasRemovedByHost } from "../state/session.js";
import { button, card, errorText, field, numberInput, textInput } from "../ui/components.js";
import { createElement } from "../ui/dom.js";
import { navigateToTournament } from "../navigation.js";

/** @returns {HTMLElement} */
export const renderLandingView = () =>
  createElement("div", { className: "landing" }, renderCreateCard(), renderJoinCard());

const renderCreateCard = () => {
  const nameInput = textInput({ placeholder: "Your name" });
  const gamertagInput = textInput({ placeholder: "PSN / Xbox gamertag (optional)" });
  const gamesInput = numberInput({ value: DEFAULT_GAMES_PER_PLAYER, min: 1 });
  const error = errorText();

  const submit = async () => {
    const result = await createTournament({
      name: nameInput.value,
      gamertag: gamertagInput.value,
      gamesPerPlayer: Number.parseInt(gamesInput.value, 10),
    });
    if (!result.ok) {
      error.textContent = result.message ?? "Could not create the tournament.";
      return;
    }
    const { code, playerId, token } = result.data;
    saveSession(code, { token, playerId, name: nameInput.value.trim() });
    navigateToTournament(code);
  };

  return card(
    "Create a tournament",
    field("Your name", nameInput),
    field("Gamertag", gamertagInput),
    field("Games per player (changeable until the draw)", gamesInput),
    createElement(
      "div",
      { className: "actions" },
      button("Create & get a code", { onClick: submit }),
    ),
    error,
  );
};

const renderJoinCard = () => {
  const codeInput = textInput({
    placeholder: "ABC234",
    maxLength: JOIN_CODE_LENGTH,
  });
  codeInput.classList.add("text-input--code");
  const nameInput = textInput({ placeholder: "Your name" });
  const gamertagInput = textInput({ placeholder: "Gamertag (optional)" });
  const error = errorText();

  const readCode = () => {
    const code = codeInput.value.trim().toUpperCase();
    if (!new RegExp(`^[A-Z0-9]{${JOIN_CODE_LENGTH}}$`).test(code)) {
      error.textContent = `Codes are ${JOIN_CODE_LENGTH} letters or digits.`;
      return undefined;
    }
    return code;
  };

  const join = async () => {
    const code = readCode();
    if (code !== undefined) {
      await joinByCode(code, nameInput.value, gamertagInput.value, error);
    }
  };

  const watch = () => {
    const code = readCode();
    if (code !== undefined) {
      navigateToTournament(code);
    }
  };

  return card(
    "Join with a code",
    field("Tournament code", codeInput),
    field("Your name", nameInput),
    field("Gamertag", gamertagInput),
    createElement(
      "div",
      { className: "actions" },
      button("Join as player", { onClick: join }),
      button("Watch only", { onClick: watch, variant: "ghost" }),
    ),
    error,
  );
};

/**
 * Joins as a new player, unless this browser already holds a player for that
 * code (then it just goes back in) or was removed by the host.
 */
const joinByCode = async (code, name, gamertag, error) => {
  if (loadSession(code)) {
    navigateToTournament(code);
    return;
  }
  if (wasRemovedByHost(code)) {
    error.textContent = "You were removed from this tournament by the host.";
    return;
  }
  const result = await joinTournament(code, { name, gamertag });
  if (!result.ok) {
    error.textContent = result.message ?? "Could not join.";
    return;
  }
  saveSession(code, {
    token: result.data.token,
    playerId: result.data.playerId,
    name: name.trim(),
  });
  navigateToTournament(code);
};
