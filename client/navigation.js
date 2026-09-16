/**
 * Navigation via the URL hash: "#/t/ABC234" opens a tournament, anything
 * else is the landing page. Hash routing needs no server configuration.
 */

import { JOIN_CODE_LENGTH } from "./config.js";

const TOURNAMENT_ROUTE = new RegExp(`^#/t/([A-Za-z0-9]{${JOIN_CODE_LENGTH}})$`);

/** @param {string} code */
export const navigateToTournament = (code) => {
  window.location.hash = `#/t/${code}`;
};

export const navigateHome = () => {
  window.location.hash = "";
};

/** @returns {string | undefined} The join code in the current URL, upper-cased. */
export const currentCode = () => {
  const match = TOURNAMENT_ROUTE.exec(window.location.hash);
  return match ? match[1].toUpperCase() : undefined;
};

/** @param {string} code */
export const inviteLink = (code) => `${window.location.origin}/#/t/${code}`;
