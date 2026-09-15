/**
 * HTTP plumbing shared by the worker and the handlers: JSON responses,
 * request-body parsing, and input validators.
 */

export const HttpStatus = Object.freeze({
  OK: 200,
  SWITCHING_PROTOCOLS: 101,
  BAD_REQUEST: 400,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UPGRADE_REQUIRED: 426,
  INTERNAL_ERROR: 500,
});

export const MAX_NAME_LENGTH = 20;
export const MAX_SCORE = 99;

/**
 * What a handler returns. The room persists and broadcasts when `changed`
 * is true, then serialises `body` with `status`.
 *
 * @typedef {Object} HandlerOutcome
 * @property {number} status
 * @property {Object} body
 * @property {boolean} changed
 */

/**
 * @param {Object} [body]
 * @param {{ changed?: boolean }} [options]
 * @returns {HandlerOutcome}
 */
export const succeed = (body = { ok: true }, { changed = false } = {}) => ({
  status: HttpStatus.OK,
  body,
  changed,
});

/**
 * @param {number} status
 * @param {string} code Machine-readable error code, such as "NOT_HOST".
 * @param {string} message Human-readable explanation shown to the user.
 * @returns {HandlerOutcome}
 */
export const fail = (status, code, message) => ({
  status,
  body: { error: code, message },
  changed: false,
});

/**
 * @param {Object} data
 * @param {number} [status]
 */
export const jsonResponse = (data, status = HttpStatus.OK) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });

/**
 * @param {Request} request
 * @returns {Promise<Object>} The parsed body, or an empty object when absent or malformed.
 */
export const readJsonBody = async (request) => {
  try {
    const body = await request.json();
    return body !== null && typeof body === "object" ? body : {};
  } catch {
    return {};
  }
};

/**
 * @param {unknown} value
 * @returns {string | undefined} Trimmed, length-capped name, or undefined when empty.
 */
export const parseName = (value) => {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim().slice(0, MAX_NAME_LENGTH);
  return trimmed === "" ? undefined : trimmed;
};

/**
 * @param {unknown} value
 * @returns {number | undefined} A non-negative integer, or undefined.
 */
export const parseNonNegativeInteger = (value) => {
  if (Number.isInteger(value) && value >= 0) {
    return value;
  }
  if (typeof value === "string" && /^\d+$/.test(value)) {
    return Number(value);
  }
  return undefined;
};

/**
 * @param {unknown} value
 * @returns {number | undefined} A goal count clamped to MAX_SCORE, or undefined when not a score.
 */
export const parseScore = (value) => {
  const score = parseNonNegativeInteger(value);
  return score === undefined ? undefined : Math.min(score, MAX_SCORE);
};
