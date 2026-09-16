/**
 * Reusable pieces of interface. Each returns a DOM node and knows nothing
 * about application state.
 */

import { MAX_NAME_LENGTH } from "../config.js";
import { createElement } from "./dom.js";

const MAX_SCORE = 99;

/**
 * @param {string} label
 * @param {{ onClick: () => void, variant?: "primary" | "ghost" | "danger", small?: boolean }} options
 */
export const button = (label, { onClick, variant = "primary", small = false }) =>
  createElement(
    "button",
    {
      className: ["button", `button--${variant}`, small ? "button--small" : ""].join(" ").trim(),
      attributes: { type: "button" },
      on: { click: onClick },
    },
    label,
  );

/**
 * @param {string} text
 * @param {{ variant?: "info" | "warning" | "active", onClick?: () => void }} [options]
 */
export const chip = (text, { variant = "info", onClick } = {}) =>
  createElement(
    "span",
    {
      className: `chip chip--${variant}${onClick ? " chip--clickable" : ""}`,
      on: onClick ? { click: onClick } : {},
      attributes: onClick ? { role: "button", tabindex: "0" } : {},
    },
    text,
  );

/**
 * @param {{ placeholder: string, value?: string, focusKey?: string,
 *           maxLength?: number, onInput?: (value: string) => void }} options
 */
export const textInput = ({
  placeholder,
  value = "",
  focusKey,
  maxLength = MAX_NAME_LENGTH,
  onInput,
}) => {
  const input = createElement("input", {
    className: "text-input",
    focusKey,
    attributes: { type: "text", placeholder, maxlength: String(maxLength) },
    on: onInput ? { input: () => onInput(input.value) } : {},
  });
  input.value = value;
  return input;
};

/**
 * @param {{ value: number, min: number, focusKey?: string, onInput?: (value: number) => void }} options
 */
export const numberInput = ({ value, min, focusKey, onInput }) => {
  const input = createElement("input", {
    className: "number-input",
    focusKey,
    attributes: { type: "number", min: String(min), step: "1", inputmode: "numeric" },
    on: onInput ? { input: () => onInput(Number.parseInt(input.value, 10)) } : {},
  });
  input.value = String(value);
  return input;
};

/**
 * A goal-count box. Reports undefined when cleared.
 * @param {{ value: number | undefined, focusKey: string, disabled?: boolean,
 *           onInput: (value: number | undefined) => void }} options
 */
export const scoreInput = ({ value, focusKey, disabled = false, onInput }) => {
  const input = createElement("input", {
    className: "score-input",
    focusKey,
    attributes: { type: "number", min: "0", max: String(MAX_SCORE), inputmode: "numeric" },
    on: { input: () => onInput(parseScore(input.value)) },
  });
  input.value = value === undefined ? "" : String(value);
  input.disabled = disabled;
  return input;
};

/**
 * A labelled field wrapper.
 * @param {string} label
 * @param {HTMLElement} control
 */
export const field = (label, control) =>
  createElement("div", { className: "field" }, createElement("label", {}, label), control);

/**
 * @param {string} text
 * @param {{ variant?: "info" | "error" }} [options]
 */
export const notice = (text, { variant = "info" } = {}) =>
  createElement("div", { className: `notice notice--${variant}` }, text);

/** Inline error text that reserves its space even when empty. */
export const errorText = () => createElement("div", { className: "error-text" });

/**
 * @param {string} title
 * @param {...(Node | string | undefined)} children
 */
export const card = (title, ...children) =>
  createElement("section", { className: "card" }, createElement("h2", {}, title), ...children);

/**
 * A player's name inside a match row.
 * @param {{ name: string, alignRight?: boolean, isWinner?: boolean, isMe?: boolean,
 *           title?: string }} options
 */
export const playerLabel = ({
  name,
  alignRight = false,
  isWinner = false,
  isMe = false,
  title,
}) => {
  const classNames = ["match-row__name"];
  if (alignRight) {
    classNames.push("match-row__name--away");
  }
  if (isWinner) {
    classNames.push("match-row__name--winner");
  }
  if (isMe) {
    classNames.push("match-row__name--me");
  }
  return createElement(
    "span",
    { className: classNames.join(" "), attributes: title ? { title } : {} },
    name,
  );
};

const parseScore = (raw) => {
  const trimmed = raw.trim();
  if (trimmed === "") {
    return undefined;
  }
  const score = Number.parseInt(trimmed, 10);
  if (Number.isNaN(score) || score < 0) {
    return undefined;
  }
  return Math.min(score, MAX_SCORE);
};
