/* Cloudflare Worker + Durable Object backend for the tournament tracker.
 *
 * One Durable Object per tournament, addressed by a 6-character join code.
 * All writes happen over HTTP POST; every connected client receives the
 * full public state over WebSocket after each change. Game logic
 * (standings, brackets) lives client-side — the server stores, validates
 * bounds, and broadcasts.
 *
 * Note: this entry module must only export the default handler and the
 * Durable Object class; shared pure logic lives in logic.js.
 */
import { MAX_PLAYERS, makeCode, koSizeFor, validateDraw, genFixtures, shuffled } from "./logic.js";

/* ---------- small helpers ---------- */
function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { "content-type": "application/json" }
  });
}
async function readJson(req) {
  try { return await req.json(); } catch (e) { return null; }
}
function clean(s) {
  if (typeof s !== "string") return null;
  s = s.trim().slice(0, 20);
  return s || null;
}
function int(v) {
  if (Number.isInteger(v)) return v;
  if (typeof v === "string" && /^\d+$/.test(v)) return parseInt(v, 10);
  return null;
}
function score(v) {
  const n = int(v);
  if (n === null || n < 0) return null;
  return Math.min(n, 99);
}

/* ---------- the tournament room ---------- */
export class Tournament {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.t = undefined;
    /* answer client keepalive pings without waking the object */
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }
  async load() {
    if (this.t === undefined) this.t = (await this.ctx.storage.get("t")) || null;
    return this.t;
  }
  async persist() {
    await this.ctx.storage.put("t", this.t);
    /* stale tournaments self-delete a week after the last activity */
    await this.ctx.storage.setAlarm(Date.now() + 7 * 24 * 3600 * 1000);
  }
  async alarm() {
    await this.ctx.storage.deleteAll();
    this.t = null;
  }

  /* public view of the state — never includes player tokens */
  pub() {
    const t = this.t;
    return {
      code: t.code, phase: t.phase, k: t.k, hostId: t.hostId,
      maxPlayers: MAX_PLAYERS,
      players: t.players.map(p => ({ id: p.id, name: p.name, gamertag: p.gamertag })),
      fixtures: t.fixtures, results: t.results,
      exempt: t.exempt, koSize: t.koSize, ko: t.ko, third: t.third === true
    };
  }
  broadcast() {
    const msg = JSON.stringify({ type: "state", t: this.pub() });
    for (const ws of this.ctx.getWebSockets()) {
      try { ws.send(msg); } catch (e) { /* stale socket */ }
    }
  }
  playerByToken(token) {
    if (typeof token !== "string" || !token) return null;
    return this.t.players.find(p => p.token === token) || null;
  }
  /* ids never get reused, so removed players can't be confused with new ones */
  nextId() {
    const t = this.t;
    if (!Number.isInteger(t.nextId))
      t.nextId = t.players.reduce((m, p) => Math.max(m, p.id), -1) + 1;
    return t.nextId++;
  }
  validKoKey(key) {
    if (key === "third") return this.t.third === true && this.t.koSize >= 4;
    const m = /^r(\d+)m(\d+)$/.exec(key);
    if (!m) return false;
    const r = +m[1], mi = +m[2], S = this.t.koSize;
    const rounds = Math.log2(S);
    if (r < 0 || r >= rounds) return false;
    return mi >= 0 && mi < (S >> (r + 1));
  }

  async fetch(req) {
    try {
      return await this.route(req);
    } catch (e) {
      return json({ error: "internal", message: "Something went wrong." }, 500);
    }
  }

  async route(req) {
    const path = new URL(req.url).pathname;
    const t = await this.load();

    if (path === "/init" && req.method === "POST") {
      if (t) return json({ error: "exists" }, 409); // code collision, caller retries
      const b = await readJson(req);
      if (!b) return json({ error: "bad_json" }, 400);
      const name = clean(b.name);
      if (!name) return json({ error: "bad_name", message: "Enter your name." }, 400);
      const k = int(b.k);
      if (k === null || k < 1 || k > MAX_PLAYERS - 1)
        return json({ error: "bad_k", message: "Games per player must be between 1 and " + (MAX_PLAYERS - 1) + "." }, 400);
      const host = { id: 0, name, gamertag: clean(b.gamertag), token: crypto.randomUUID() };
      this.t = {
        code: b.code, phase: "lobby", k, hostId: 0, players: [host], nextId: 1,
        fixtures: [], results: [], exempt: null, koSize: null, ko: {}, third: false
      };
      await this.persist();
      return json({ code: b.code, playerId: 0, token: host.token });
    }

    if (!t) return json({ error: "not_found", message: "No tournament with this code." }, 404);

    if (path === "/state" && req.method === "GET") return json({ t: this.pub() });

    if (path === "/ws") {
      if (req.headers.get("Upgrade") !== "websocket") return json({ error: "upgrade_required" }, 426);
      const pair = new WebSocketPair();
      const client = pair[0], server = pair[1];
      this.ctx.acceptWebSocket(server);
      server.send(JSON.stringify({ type: "state", t: this.pub() }));
      return new Response(null, { status: 101, webSocket: client });
    }

    if (path === "/join" && req.method === "POST") {
      const b = await readJson(req);
      if (!b) return json({ error: "bad_json" }, 400);
      if (t.phase !== "lobby")
        return json({ error: "locked", message: "The draw is done — joining is closed, but you can still watch." }, 409);
      if (t.players.length >= MAX_PLAYERS)
        return json({ error: "full", message: "Tournament is full (" + MAX_PLAYERS + " players)." }, 409);
      const name = clean(b.name);
      if (!name) return json({ error: "bad_name", message: "Enter your name." }, 400);
      if (t.players.some(p => p.name.toLowerCase() === name.toLowerCase()))
        return json({ error: "dup_name", message: "That name is taken — pick another." }, 409);
      const id = this.nextId();
      const p = { id, name, gamertag: clean(b.gamertag), token: crypto.randomUUID() };
      t.players.push(p);
      await this.persist();
      this.broadcast();
      return json({ code: t.code, playerId: p.id, token: p.token });
    }

    if (path === "/leave" && req.method === "POST") {
      const b = await readJson(req);
      if (!b) return json({ error: "bad_json" }, 400);
      const me = this.playerByToken(b.token);
      if (!me) return json({ error: "not_player" }, 403);
      if (me.id === t.hostId)
        return json({ error: "host", message: "The host can't leave their own tournament." }, 403);
      if (t.phase !== "lobby")
        return json({ error: "drawn", message: "The draw is done — you can't leave now." }, 409);
      t.players = t.players.filter(p => p.id !== me.id);
      await this.persist();
      this.broadcast();
      return json({ ok: true });
    }

    if (path === "/kick" && req.method === "POST") {
      const b = await readJson(req);
      if (!b) return json({ error: "bad_json" }, 400);
      const me = this.playerByToken(b.token);
      if (!me || me.id !== t.hostId)
        return json({ error: "not_host", message: "Only the host can remove players." }, 403);
      if (t.phase !== "lobby")
        return json({ error: "drawn", message: "The draw is done — players can't be removed now." }, 409);
      const id = int(b.playerId);
      if (id === null || id === t.hostId || !t.players.some(p => p.id === id))
        return json({ error: "bad_player" }, 400);
      t.players = t.players.filter(p => p.id !== id);
      await this.persist();
      this.broadcast();
      return json({ ok: true });
    }

    if (path === "/draw" && req.method === "POST") {
      const b = await readJson(req);
      if (!b) return json({ error: "bad_json" }, 400);
      const me = this.playerByToken(b.token);
      if (!me || me.id !== t.hostId)
        return json({ error: "not_host", message: "Only the host can start the draw." }, 403);
      if (t.phase !== "lobby")
        return json({ error: "drawn", message: "The draw already happened." }, 409);
      const n = t.players.length;
      const k = int(b.k) !== null ? int(b.k) : t.k;
      const v = validateDraw(n, k);
      const useExempt = !!(v && v.error === "parity" && b.acceptExempt);
      if (v && !useExempt) return json(v, 409);
      const g = genFixtures(n, k, useExempt);
      const perm = shuffled(n);
      /* positions 0..n-1 are shuffled onto real player ids */
      const idAt = pos => t.players[perm[pos]].id;
      t.k = k;
      t.fixtures = g.fixtures.map(f => ({ h: idAt(f.h), a: idAt(f.a) }));
      t.results = g.fixtures.map(() => ({ h: null, a: null }));
      t.exempt = g.exemptPos === null ? null : idAt(g.exemptPos);
      t.koSize = koSizeFor(n);
      t.phase = "league";
      await this.persist();
      this.broadcast();
      return json({ ok: true });
    }

    if (path === "/result" && req.method === "POST") {
      const b = await readJson(req);
      if (!b) return json({ error: "bad_json" }, 400);
      if (!this.playerByToken(b.token))
        return json({ error: "not_player", message: "Spectators can't enter results." }, 403);
      if (t.phase !== "league") return json({ error: "no_league" }, 409);
      const i = int(b.i);
      if (i === null || i < 0 || i >= t.results.length) return json({ error: "bad_index" }, 400);
      t.results[i] = { h: score(b.h), a: score(b.a) };
      await this.persist();
      this.broadcast();
      return json({ ok: true });
    }

    if (path === "/third" && req.method === "POST") {
      const b = await readJson(req);
      if (!b) return json({ error: "bad_json" }, 400);
      const me = this.playerByToken(b.token);
      if (!me || me.id !== t.hostId)
        return json({ error: "not_host", message: "Only the host can change the format." }, 403);
      if (t.phase !== "league" || t.koSize < 4)
        return json({ error: "no_semis", message: "A small final needs semi-finals." }, 409);
      const enabled = b.enabled === true;
      const sc = t.ko.third;
      const hasScores = !!sc && (sc.h !== null || sc.a !== null || sc.ph !== null || sc.pa !== null);
      if (!enabled && hasScores)
        return json({ error: "has_scores", message: "Clear the small final's score before removing it." }, 409);
      t.third = enabled;
      if (!enabled) delete t.ko.third;
      await this.persist();
      this.broadcast();
      return json({ ok: true });
    }

    if (path === "/ko" && req.method === "POST") {
      const b = await readJson(req);
      if (!b) return json({ error: "bad_json" }, 400);
      if (!this.playerByToken(b.token))
        return json({ error: "not_player", message: "Spectators can't enter results." }, 403);
      const complete = t.phase === "league" && t.results.length > 0 &&
        t.results.every(r => r.h !== null && r.a !== null);
      if (!complete)
        return json({ error: "league_open", message: "Finish all league games first." }, 409);
      const key = String(b.key || "");
      if (!this.validKoKey(key)) return json({ error: "bad_key" }, 400);
      t.ko[key] = { h: score(b.h), a: score(b.a), ph: score(b.ph), pa: score(b.pa) };
      await this.persist();
      this.broadcast();
      return json({ ok: true });
    }

    return json({ error: "not_found" }, 404);
  }

  /* clients never send over the socket; it is a receive-only channel */
  webSocketMessage() {}
  webSocketClose() {}
  webSocketError() {}
}

/* ---------- worker: routing ---------- */
export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    if (url.pathname === "/api/create" && req.method === "POST") {
      const body = await readJson(req);
      if (!body) return json({ error: "bad_json" }, 400);
      for (let attempt = 0; attempt < 3; attempt++) {
        const code = makeCode();
        const stub = env.TOURNAMENT.get(env.TOURNAMENT.idFromName(code));
        const res = await stub.fetch("https://do/init", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...body, code })
        });
        if (res.status !== 409) return res; // 409 = code collision, retry
      }
      return json({ error: "retry", message: "Could not allocate a code, try again." }, 500);
    }

    const m = /^\/api\/t\/([A-Za-z0-9]{6})\/(state|ws|join|leave|kick|draw|result|ko|third)$/.exec(url.pathname);
    if (m) {
      const code = m[1].toUpperCase();
      const stub = env.TOURNAMENT.get(env.TOURNAMENT.idFromName(code));
      return stub.fetch(new Request("https://do/" + m[2], req));
    }

    if (url.pathname.startsWith("/api/")) return json({ error: "not_found" }, 404);
    return env.ASSETS.fetch(req);
  }
};
