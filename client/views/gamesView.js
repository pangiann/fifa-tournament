/**
 * The list of league games with filters and inline score entry. Scores are
 * sent to the server as they are typed; the server broadcasts them back.
 */

import { recordLeagueResult } from "../api/tournamentApi.js";
import { countPlayedMatches, isMatchPlayed } from "../../shared/format.js";
import { getPlayer, getState, isPlayer, update } from "../state/store.js";
import { card, chip, playerLabel, scoreInput, textInput } from "../ui/components.js";
import { createElement, focusedKey } from "../ui/dom.js";

/** @returns {HTMLElement} */
export const renderGamesCard = () => {
  const { tournament } = getState();
  const title = `League games`;
  const gamesCard = card(
    title,
    renderFilterBar(),
    createElement("div", { className: "scroll-box" }, ...renderVisibleRows()),
  );
  gamesCard
    .querySelector("h2")
    .append(" ", chip(`${countPlayedMatches(tournament)} / ${tournament.fixtures.length} played`));
  return gamesCard;
};

const renderFilterBar = () => {
  const { nameFilter, showOnlyMine, showOnlyUnplayed } = getState();
  const bar = createElement(
    "div",
    { className: "filter-bar" },
    textInput({
      placeholder: "Filter by player…",
      value: nameFilter,
      focusKey: "name-filter",
      onInput: (value) => update({ nameFilter: value }),
    }),
  );
  if (isPlayer()) {
    bar.append(
      chip("My games", {
        variant: showOnlyMine ? "active" : "info",
        onClick: () => update({ showOnlyMine: !showOnlyMine }),
      }),
    );
  }
  bar.append(
    chip("Unplayed", {
      variant: showOnlyUnplayed ? "active" : "info",
      onClick: () => update({ showOnlyUnplayed: !showOnlyUnplayed }),
    }),
  );
  return bar;
};

const renderVisibleRows = () => {
  const { tournament, showOnlyUnplayed, nameFilter, showOnlyMine } = getState();
  const rows = tournament.fixtures
    .map((fixture, matchIndex) => ({ fixture, matchIndex }))
    .filter(({ fixture, matchIndex }) => isVisible(fixture, matchIndex))
    .map(({ fixture, matchIndex }) => renderGameRow(fixture, matchIndex));
  if (rows.length > 0) {
    return rows;
  }
  const everythingPlayed = showOnlyUnplayed && !nameFilter && !showOnlyMine;
  return [
    createElement(
      "div",
      { className: "empty-state" },
      everythingPlayed ? "🎉 All games played!" : "No games match this filter.",
    ),
  ];
};

/** Applies the three filters; the row being typed into always stays visible. */
const isVisible = (fixture, matchIndex) => {
  const { tournament, session, nameFilter, showOnlyMine, showOnlyUnplayed } = getState();
  if (showOnlyMine && session && !involves(fixture, session.playerId)) {
    return false;
  }
  if (
    showOnlyUnplayed &&
    isMatchPlayed(tournament.results[matchIndex]) &&
    !isBeingEdited(matchIndex)
  ) {
    return false;
  }
  const needle = nameFilter.trim().toLowerCase();
  if (needle === "") {
    return true;
  }
  return [fixture.homePlayerId, fixture.awayPlayerId].some((playerId) =>
    getPlayer(playerId).name.toLowerCase().includes(needle),
  );
};

const involves = (fixture, playerId) =>
  fixture.homePlayerId === playerId || fixture.awayPlayerId === playerId;

const isBeingEdited = (matchIndex) => {
  const key = focusedKey();
  return key === scoreKey(matchIndex, "home") || key === scoreKey(matchIndex, "away");
};

const scoreKey = (matchIndex, side) => `league-${matchIndex}-${side}`;

const renderGameRow = (fixture, matchIndex) => {
  const { tournament, session, code } = getState();
  const result = tournament.results[matchIndex];
  const played = isMatchPlayed(result);
  const canEdit = isPlayer();

  const submit = (changes) => {
    const next = { ...result, ...changes };
    tournament.results[matchIndex] = next;
    recordLeagueResult(code, session.token, { matchIndex, ...next });
    update({ tournament });
  };

  return createElement(
    "div",
    { className: "match-row" },
    createElement("span", { className: "match-row__number" }, `#${matchIndex + 1}`),
    renderName(fixture.homePlayerId, { isWinner: played && result.homeScore > result.awayScore }),
    scoreInput({
      value: result.homeScore,
      focusKey: scoreKey(matchIndex, "home"),
      disabled: !canEdit,
      onInput: (homeScore) => submit({ homeScore }),
    }),
    createElement("span", { className: "match-row__separator" }, "–"),
    scoreInput({
      value: result.awayScore,
      focusKey: scoreKey(matchIndex, "away"),
      disabled: !canEdit,
      onInput: (awayScore) => submit({ awayScore }),
    }),
    renderName(fixture.awayPlayerId, {
      isWinner: played && result.awayScore > result.homeScore,
      alignRight: true,
    }),
  );
};

/**
 * @param {number} playerId
 * @param {{ isWinner: boolean, alignRight?: boolean }} options
 */
export const renderName = (playerId, { isWinner, alignRight = false }) => {
  const { session } = getState();
  const player = getPlayer(playerId);
  return playerLabel({
    name: player.name,
    alignRight,
    isWinner,
    isMe: session?.playerId === playerId,
    title: player.gamertag ? `🎮 ${player.gamertag}` : undefined,
  });
};
