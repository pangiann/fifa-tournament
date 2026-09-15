/**
 * Data shapes shared by the client, the server, and the tests.
 *
 * This file contains only JSDoc type definitions; it has no runtime code.
 * The server stores and broadcasts exactly these shapes, so a change here is
 * a change to the wire format.
 */

/**
 * @typedef {Object} Player
 * @property {number} id Stable identifier; never reused within a tournament.
 * @property {string} name Display name, unique per tournament (case-insensitive).
 * @property {string | undefined} gamertag Optional console handle.
 */

/**
 * A scheduled league match. Fixture index i pairs with results[i].
 * @typedef {Object} Fixture
 * @property {number} homePlayerId
 * @property {number} awayPlayerId
 */

/**
 * A match score. Both values are undefined until the match is played.
 * @typedef {Object} MatchResult
 * @property {number | undefined} homeScore
 * @property {number | undefined} awayScore
 */

/**
 * A knockout score; penalties are only used when the match is level.
 * @typedef {Object} KnockoutResult
 * @property {number | undefined} homeScore
 * @property {number | undefined} awayScore
 * @property {number | undefined} penaltyHomeScore
 * @property {number | undefined} penaltyAwayScore
 */

/**
 * @typedef {"lobby" | "league"} TournamentPhase
 * "lobby": players are joining; no fixtures yet.
 * "league": the draw happened; results are being entered.
 */

/**
 * The public state of a tournament, as sent to every connected client.
 * @typedef {Object} Tournament
 * @property {string} code Six-character join code.
 * @property {TournamentPhase} phase
 * @property {number} gamesPerPlayer League games each player is assigned.
 * @property {number} hostId Player id of the host.
 * @property {number} maxPlayers
 * @property {Player[]} players
 * @property {Fixture[]} fixtures Empty until the draw.
 * @property {MatchResult[]} results Same length and order as fixtures.
 * @property {number | undefined} knockoutSize 2, 4, 8, or 16; set at the draw.
 * @property {Record<string, KnockoutResult>} knockoutResults Keyed by knockout match key.
 * @property {boolean} hasThirdPlaceMatch
 */

/**
 * One row of the league table.
 * @typedef {Object} StandingsRow
 * @property {number} playerId
 * @property {string} name
 * @property {number} played
 * @property {number} wins
 * @property {number} draws
 * @property {number} losses
 * @property {number} goalsFor
 * @property {number} goalsAgainst
 * @property {number} goalDifference
 * @property {number} points
 */

/**
 * A resolved knockout match, ready to render.
 * @typedef {Object} KnockoutMatch
 * @property {string} key Storage key in tournament.knockoutResults.
 * @property {string} label Short label such as "SF1" or "F".
 * @property {number | undefined} homePlayerId Undefined until the feeding match is decided.
 * @property {number | undefined} awayPlayerId
 * @property {string} homePlaceholder Text shown while homePlayerId is undefined.
 * @property {string} awayPlaceholder
 * @property {KnockoutResult} result
 */

/**
 * @typedef {Object} KnockoutRound
 * @property {string} name Such as "Semi-finals".
 * @property {KnockoutMatch[]} matches
 */

export {};
