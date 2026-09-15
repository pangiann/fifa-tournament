/* Integration test against a running server (default http://localhost:8788).
 * Start the server first: npx wrangler dev --port 8788
 * Run: node test/integration.mjs
 */
const BASE = process.env.BASE_URL || "http://localhost:8788";

let fail = 0;
function assert(cond, msg) {
  if (!cond) { console.log("FAIL:", msg); fail++; }
  else console.log("ok:", msg);
}
async function post(path, body) {
  const res = await fetch(BASE + path, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}
async function state(code) {
  const res = await fetch(BASE + "/api/t/" + code + "/state");
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

/* --- static asset --- */
const home = await fetch(BASE + "/");
assert(home.status === 200 && (await home.text()).includes("Champions Night"), "GET / serves the app");

/* --- create + join --- */
let r = await post("/api/create", { name: "Host", gamertag: "host-gt", k: 1 });
assert(r.status === 200 && /^[A-Z0-9]{6}$/.test(r.data.code || ""), "create returns a 6-char code");
const CODE = r.data.code, HOST = r.data.token;
assert(r.data.playerId === 0, "host is player 0");

const bob = await post("/api/t/" + CODE + "/join", { name: "Bob" });
const carol = await post("/api/t/" + CODE + "/join", { name: "Carol", gamertag: "cz" });
assert(bob.status === 200 && carol.status === 200, "two players join");
assert((await post("/api/t/" + CODE + "/join", { name: "bob" })).status === 409, "duplicate name rejected (case-insensitive)");
assert((await post("/api/t/" + CODE + "/join", { name: "" })).status === 400, "empty name rejected");

let st = await state(CODE);
assert(st.data.t.phase === "lobby" && st.data.t.players.length === 3, "lobby has 3 players");
assert(!JSON.stringify(st.data.t).includes(HOST), "public state never leaks tokens");

/* --- draw guards --- */
assert((await post("/api/t/" + CODE + "/draw", { token: bob.data.token, k: 2 })).status === 403, "non-host cannot draw");
r = await post("/api/t/" + CODE + "/draw", { token: HOST, k: 1 });
assert(r.status === 409 && r.data.error === "parity", "3 players x 1 game -> parity rejection");
r = await post("/api/t/" + CODE + "/draw", { token: HOST, k: 5 });
assert(r.status === 409 && r.data.error === "k_too_big", "3 players x 5 games -> too many opponents");

/* --- draw with one player short --- */
r = await post("/api/t/" + CODE + "/draw", { token: HOST, k: 1, acceptExempt: true });
assert(r.status === 200, "parity draw accepted with one player short");
st = await state(CODE);
assert(st.data.t.phase === "league" && st.data.t.fixtures.length === 1, "3x1 exempt draw -> 1 game");
assert(st.data.t.exempt !== null, "exempt player recorded");
assert(st.data.t.koSize === 2, "3 players -> final only");
assert((await post("/api/t/" + CODE + "/draw", { token: HOST, k: 1 })).status === 409, "cannot draw twice");
assert((await post("/api/t/" + CODE + "/join", { name: "Late" })).status === 409, "joining after the draw is locked");

/* --- results + knockout gating --- */
assert((await post("/api/t/" + CODE + "/result", { i: 0, h: 2, a: 1 })).status === 403, "result without token rejected");
assert((await post("/api/t/" + CODE + "/result", { token: bob.data.token, i: 5, h: 2, a: 1 })).status === 400, "out-of-range game rejected");
assert((await post("/api/t/" + CODE + "/ko", { token: bob.data.token, key: "r0m0", h: 1, a: 0 })).status === 409, "knockout locked while league open");
assert((await post("/api/t/" + CODE + "/result", { token: bob.data.token, i: 0, h: 2, a: 1 })).status === 200, "any player can enter a result");
st = await state(CODE);
assert(st.data.t.results[0].h === 2 && st.data.t.results[0].a === 1, "result stored");

assert((await post("/api/t/" + CODE + "/ko", { token: carol.data.token, key: "r9m9", h: 1, a: 0 })).status === 400, "bad knockout key rejected");
assert((await post("/api/t/" + CODE + "/ko", { token: carol.data.token, key: "r0m0", h: 1, a: 0 })).status === 200, "final playable once league done");
st = await state(CODE);
assert(st.data.t.ko["r0m0"].h === 1, "knockout result stored");

/* --- a bigger, clean tournament: 21 players x 4 games --- */
r = await post("/api/create", { name: "P1", k: 4 });
const C2 = r.data.code, T2 = r.data.token;
for (let i = 2; i <= 21; i++) await post("/api/t/" + C2 + "/join", { name: "P" + i });
r = await post("/api/t/" + C2 + "/draw", { token: T2, k: 4 });
assert(r.status === 200, "21x4 draw succeeds");
st = await state(C2);
assert(st.data.t.fixtures.length === 42, "21x4 -> 42 games");
assert(st.data.t.koSize === 8, "21 players -> top 8");
assert(st.data.t.exempt === null, "no exempt player in an even draw");
const deg = Array(21).fill(0);
st.data.t.fixtures.forEach(f => { deg[f.h]++; deg[f.a]++; });
assert(deg.every(d => d === 4), "everyone has exactly 4 games after the shuffle");

/* --- unknown code --- */
assert((await state("ZZZZZ2")).status === 404, "unknown code -> 404");

/* --- websocket live sync (skipped if this node lacks WebSocket) --- */
if (typeof WebSocket !== "undefined") {
  const wsUrl = BASE.replace(/^http/, "ws") + "/api/t/" + C2 + "/ws";
  const got = await new Promise((resolve) => {
    const messages = [];
    const sock = new WebSocket(wsUrl);
    const timer = setTimeout(() => { sock.close(); resolve(messages); }, 5000);
    sock.onmessage = (ev) => {
      messages.push(JSON.parse(ev.data));
      if (messages.length === 1) {
        post("/api/t/" + C2 + "/result", { token: T2, i: 0, h: 3, a: 3 });
      } else { clearTimeout(timer); sock.close(); resolve(messages); }
    };
    sock.onerror = () => { clearTimeout(timer); resolve(messages); };
  });
  assert(got.length >= 1 && got[0].type === "state", "websocket sends state on connect");
  assert(got.length >= 2 && got[1].t.results[0].h === 3, "websocket broadcasts result updates");
} else {
  console.log("skip: WebSocket not available in this node, verify live sync in a browser");
}

console.log(fail === 0 ? "ALL INTEGRATION TESTS PASSED" : "FAILURES: " + fail);
process.exit(fail ? 1 : 0);
