/* Unit tests for client-side pure logic extracted from index.html. Run: node test/client.test.mjs */
import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const html = readFileSync(join(root, "index.html"), "utf8");
const src = html.match(/<script>([\s\S]*)<\/script>/)[1];
const ctx = createContext({ console });
runInContext(src, ctx);
const { standingsOf, bracketOrder, koRoundsOf, championOf, leagueCompleteT, koWinnerSide, clientValidateDraw } = ctx;

let fail = 0;
function assert(cond, msg) {
  if (!cond) { console.log("FAIL:", msg); fail++; }
  else console.log("ok:", msg);
}

/* bracket seeding order */
assert(JSON.stringify(bracketOrder(2)) === "[1,2]", "bracket S=2");
assert(JSON.stringify(bracketOrder(4)) === "[1,4,2,3]", "bracket S=4: 1v4, 2v3");
assert(JSON.stringify(bracketOrder(8)) === "[1,8,4,5,2,7,3,6]", "bracket S=8: 1v8, 4v5, 2v7, 3v6");
assert(bracketOrder(16).length === 16 && new Set(bracketOrder(16)).size === 16, "bracket S=16 is a permutation");

/* draw validation mirror */
assert(clientValidateDraw(9, 5) !== null, "client rejects 9x5");
assert(clientValidateDraw(9, 4) === null, "client accepts 9x4");

/* build a 5-player, 2-games state: circle 0-1-2-3-4-0 */
function mkState() {
  return {
    players: ["A", "B", "C", "D", "E"].map((n, i) => ({ id: i, name: n, gamertag: null })),
    k: 2, exempt: null, koSize: 4, hostId: 0, phase: "league",
    fixtures: [{ h: 0, a: 1 }, { h: 1, a: 2 }, { h: 2, a: 3 }, { h: 3, a: 4 }, { h: 4, a: 0 }],
    results: [null, null, null, null, null].map(() => ({ h: null, a: null })),
    ko: {}
  };
}

/* standings: points, GD, head-to-head */
let t = mkState();
t.results[0] = { h: 1, a: 0 }; // A beats B 1:0
t.results[4] = { h: 1, a: 0 }; // E beats A 1:0
t.results[1] = { h: 1, a: 0 }; // B beats C 1:0
let s = standingsOf(t);
assert(s[0].name === "E" && s[0].gd === 1, "E first on GD");
assert(s[1].name === "A" && s[2].name === "B", "head-to-head: A above B when tied on pts/gd/gf");
assert(!leagueCompleteT(t), "league not complete at 3/5");

/* complete the league: C beats D 2:0, D beats E 3:1 */
t.results[2] = { h: 2, a: 0 };
t.results[3] = { h: 3, a: 1 };
assert(leagueCompleteT(t), "league complete at 5/5");
/* final table: everyone 1W 1L, all 3 pts.
   GD: C +1 (won 2:0, lost 0:1), A 0, B 0, D 0 (0:2 + 3:1), E -1.
   Among A/B/D on gd 0: D gf 3 > A/B gf 1; A above B on h2h.
   Order: C, D, A, B, E. */
s = standingsOf(t);
assert(s.map(r => r.name).join("") === "CDABE", "final order C,D,A,B,E (gd, gf, h2h)");

/* knockout resolution: top 4 = C,D,A,B -> SF1: C v B, SF2: D v A */
let rounds = koRoundsOf(t);
assert(rounds.length === 2 && rounds[0].name === "Semi-finals", "koSize 4 -> semis + final");
const sf1 = rounds[0].matches[0], sf2 = rounds[0].matches[1];
assert(t.players[sf1.home].name === "C" && t.players[sf1.away].name === "B", "SF1: 1st vs 4th (C v B)");
assert(t.players[sf2.home].name === "D" && t.players[sf2.away].name === "A", "SF2: 2nd vs 3rd (D v A)");
assert(rounds[1].matches[0].home === null && rounds[1].matches[0].ph1 === "Winner SF1", "final TBD with placeholder");
assert(championOf(t) === null, "no champion yet");

/* play the knockouts: B beats D on pens, A beats C, A wins the final */
t.ko["r0m0"] = { h: 1, a: 1, ph: 3, pa: 4 }; // D 1-1 B, B wins pens
t.ko["r0m1"] = { h: 0, a: 2, ph: null, pa: null }; // C 0-2 A
rounds = koRoundsOf(t);
assert(t.players[rounds[1].matches[0].home].name === "B", "pens winner B reaches the final");
assert(t.players[rounds[1].matches[0].away].name === "A", "A reaches the final");
t.ko["r1m0"] = { h: 0, a: 1, ph: null, pa: null }; // B 0-1 A
assert(t.players[championOf(t)].name === "A", "champion is A");

/* exempt player: points-per-game ranking */
t = mkState();
t.exempt = 4; // E assigned 1 game instead of 2
t.results[0] = { h: 2, a: 0 }; // A beats B
t.results[3] = { h: 0, a: 2 }; // E beats D
s = standingsOf(t);
const A = s.find(r => r.name === "A"), E = s.find(r => r.name === "E");
assert(A.assigned === 2 && E.assigned === 1, "assigned games respect exempt");
assert(E.avg === 3 && A.avg === 1.5, "avg: E 3.00, A 1.50");
assert(s[0].name === "E", "E tops the table on points per game");

/* ko winner basics */
assert(koWinnerSide({ h: 2, a: 1, ph: null, pa: null }) === "h", "higher score wins");
assert(koWinnerSide({ h: 1, a: 1, ph: null, pa: null }) === null, "level, no pens -> undecided");

console.log(fail === 0 ? "ALL CLIENT TESTS PASSED" : "FAILURES: " + fail);
process.exit(fail ? 1 : 0);
