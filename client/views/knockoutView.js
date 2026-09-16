/**
 * The knockout stage: locked until the league is complete, then the bracket
 * with score entry, the optional third-place match, and the podium.
 */

import { recordKnockoutResult, setThirdPlaceMatch } from "../api/tournamentApi.js";
import {
  buildBracket,
  buildThirdPlaceMatch,
  decideWinner,
  findPodium,
  hasSemiFinals,
  Side,
  winnerOf,
} from "../../shared/bracket.js";
import { isLeagueComplete } from "../../shared/format.js";
import { computeStandings } from "../../shared/standings.js";
import { getPlayer, getState, isHost, isPlayer, update } from "../state/store.js";
import { button, card, errorText, playerLabel, scoreInput } from "../ui/components.js";
import { createElement } from "../ui/dom.js";

/** @returns {HTMLElement} */
export const renderKnockoutCard = () => {
  const { tournament } = getState();
  const knockoutCard = card("Knockout stage");
  if (!isLeagueComplete(tournament)) {
    knockoutCard.append(
      createElement(
        "div",
        { className: "empty-state" },
        "🔒 Finish all league games to unlock the knockout stage.",
      ),
    );
    return knockoutCard;
  }
  const rounds = buildBracket(tournament);
  const thirdPlace = tournament.hasThirdPlaceMatch
    ? buildThirdPlaceMatch(tournament, rounds)
    : undefined;
  knockoutCard.append(renderBracket(rounds, thirdPlace));
  if (isHost() && hasSemiFinals(tournament.knockoutSize)) {
    knockoutCard.append(renderThirdPlaceToggle(tournament.hasThirdPlaceMatch));
  }
  knockoutCard.append(...renderPodium(rounds, thirdPlace));
  if (!isPlayer()) {
    knockoutCard.append(
      createElement(
        "p",
        { className: "hint" },
        "Spectator mode — results are entered by the players.",
      ),
    );
  }
  return knockoutCard;
};

const renderBracket = (rounds, thirdPlace) => {
  const seedByPlayerId = new Map(
    computeStandings(getState().tournament).map((row, index) => [row.playerId, index + 1]),
  );
  const columns = rounds.map((round, roundIndex) =>
    createElement(
      "div",
      { className: "bracket__round" },
      createElement("h3", {}, round.name),
      ...round.matches.map((match) =>
        renderMatch(match, roundIndex === 0 ? seedByPlayerId : undefined),
      ),
    ),
  );
  if (thirdPlace) {
    columns.push(
      createElement(
        "div",
        { className: "bracket__round" },
        createElement("h3", {}, "Small final"),
        renderMatch(thirdPlace),
      ),
    );
  }
  return createElement("div", { className: "bracket" }, ...columns);
};

/**
 * @param {import("../../shared/types.js").KnockoutMatch} match
 * @param {Map<number, number> | undefined} seedByPlayerId Shown only in the first round.
 */
const renderMatch = (match, seedByPlayerId) => {
  const isReady = match.homePlayerId !== undefined && match.awayPlayerId !== undefined;
  const winner = isReady ? decideWinner(match.result) : undefined;
  const canEdit = isReady && isPlayer();
  const isLevel =
    isReady &&
    match.result.homeScore !== undefined &&
    match.result.homeScore === match.result.awayScore;

  const submit = (changes) => {
    const { tournament, code, session } = getState();
    const next = { ...match.result, ...changes };
    tournament.knockoutResults[match.key] = next;
    recordKnockoutResult(code, session.token, { key: match.key, ...next });
    update({ tournament });
  };

  const homeName = renderSide(
    match.homePlayerId,
    match.homePlaceholder,
    winner === Side.HOME,
    false,
  );
  const awayName = renderSide(
    match.awayPlayerId,
    match.awayPlaceholder,
    winner === Side.AWAY,
    true,
  );
  if (seedByPlayerId && isReady) {
    homeName.prepend(seedBadge(seedByPlayerId.get(match.homePlayerId)));
    awayName.append(seedBadge(seedByPlayerId.get(match.awayPlayerId)));
  }

  const matchCard = createElement(
    "div",
    { className: "bracket-match" },
    createElement("div", { className: "bracket-match__label" }, match.label),
    createElement(
      "div",
      { className: "match-row" },
      homeName,
      scoreInput({
        value: match.result.homeScore,
        focusKey: `${match.key}-home`,
        disabled: !canEdit,
        onInput: (homeScore) => submit({ homeScore }),
      }),
      createElement("span", { className: "match-row__separator" }, "–"),
      scoreInput({
        value: match.result.awayScore,
        focusKey: `${match.key}-away`,
        disabled: !canEdit,
        onInput: (awayScore) => submit({ awayScore }),
      }),
      awayName,
    ),
  );
  if (isLevel) {
    matchCard.append(renderPenalties(match, canEdit, submit));
  }
  return matchCard;
};

const renderSide = (playerId, placeholder, isWinner, alignRight) => {
  const { session } = getState();
  const player = playerId === undefined ? undefined : getPlayer(playerId);
  return playerLabel({
    name: player ? player.name : placeholder,
    alignRight,
    isWinner,
    isMe: player !== undefined && session?.playerId === playerId,
    title: player?.gamertag ? `🎮 ${player.gamertag}` : undefined,
  });
};

const renderPenalties = (match, canEdit, submit) =>
  createElement(
    "div",
    { className: "bracket-match__penalties" },
    "Penalties:",
    scoreInput({
      value: match.result.penaltyHomeScore,
      focusKey: `${match.key}-penalty-home`,
      disabled: !canEdit,
      onInput: (penaltyHomeScore) => submit({ penaltyHomeScore }),
    }),
    createElement("span", { className: "match-row__separator" }, "–"),
    scoreInput({
      value: match.result.penaltyAwayScore,
      focusKey: `${match.key}-penalty-away`,
      disabled: !canEdit,
      onInput: (penaltyAwayScore) => submit({ penaltyAwayScore }),
    }),
  );

const seedBadge = (seed) => createElement("span", { className: "seed-badge" }, String(seed));

const renderThirdPlaceToggle = (isEnabled) => {
  const error = errorText();
  const toggle = async () => {
    const { code, session } = getState();
    const result = await setThirdPlaceMatch(code, session.token, !isEnabled);
    if (!result.ok) {
      error.textContent = result.message ?? "Could not change the format.";
    }
  };
  return createElement(
    "div",
    { className: "actions" },
    button(isEnabled ? "Remove small final" : "🥉 Add small final", {
      onClick: toggle,
      variant: "ghost",
      small: true,
    }),
    error,
  );
};

const renderPodium = (rounds, thirdPlace) => {
  const { champion, runnerUp } = findPodium(rounds);
  const thirdPlaceWinner = thirdPlace ? winnerOf(thirdPlace) : undefined;
  const lines = [];
  if (champion !== undefined) {
    lines.push(
      createElement(
        "div",
        { className: "champion-banner" },
        `🏆 ${getPlayer(champion).name} is the champion! 🏆`,
      ),
    );
  }
  if (runnerUp !== undefined) {
    lines.push(
      createElement(
        "p",
        { className: "podium-line" },
        `🥈 ${getPlayer(runnerUp).name} finishes second`,
      ),
    );
  }
  if (thirdPlaceWinner !== undefined) {
    lines.push(
      createElement(
        "p",
        { className: "podium-line" },
        `🥉 ${getPlayer(thirdPlaceWinner).name} takes third place`,
      ),
    );
  }
  return lines;
};
