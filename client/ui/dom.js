/**
 * Small DOM helpers. All text goes through textContent, never innerHTML, so
 * player-provided names can't inject markup.
 */

/**
 * @typedef {Object} ElementOptions
 * @property {string} [className]
 * @property {Record<string, string>} [attributes]
 * @property {Record<string, EventListener>} [on] Event listeners by event name.
 * @property {string} [focusKey] Identifies an input so focus survives a re-render.
 */

/**
 * @param {string} tagName
 * @param {ElementOptions} [options]
 * @param {...(Node | string | undefined | null)} children Strings become text nodes.
 * @returns {HTMLElement}
 */
export const createElement = (tagName, options = {}, ...children) => {
  const element = document.createElement(tagName);
  if (options.className) {
    element.className = options.className;
  }
  for (const [name, value] of Object.entries(options.attributes ?? {})) {
    element.setAttribute(name, value);
  }
  for (const [eventName, listener] of Object.entries(options.on ?? {})) {
    element.addEventListener(eventName, listener);
  }
  if (options.focusKey) {
    element.dataset.focusKey = options.focusKey;
  }
  appendChildren(element, children);
  return element;
};

/**
 * @param {HTMLElement} parent
 * @param {Array<Node | string | undefined | null>} children
 */
export const appendChildren = (parent, children) => {
  for (const child of children.flat()) {
    if (child !== undefined && child !== null) {
      parent.append(child);
    }
  }
};

/** @param {HTMLElement} element */
export const clearChildren = (element) => {
  element.replaceChildren();
};

/**
 * Runs a full re-render while keeping the caret in the input the user is
 * typing into. Inputs opt in with a focusKey.
 * @param {() => void} render
 */
export const renderPreservingFocus = (render) => {
  const active = document.activeElement;
  const focusKey = active?.dataset?.focusKey;
  const value = focusKey ? active.value : undefined;
  render();
  if (focusKey) {
    const replacement = document.querySelector(`[data-focus-key="${focusKey}"]`);
    if (replacement) {
      replacement.value = value;
      replacement.focus();
    }
  }
};

/** @returns {string | undefined} The focusKey of the input being edited, if any. */
export const focusedKey = () => document.activeElement?.dataset?.focusKey;
