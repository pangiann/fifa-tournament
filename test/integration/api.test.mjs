/**
 * End-to-end test against the real Worker and Durable Object, run locally by
 * `wrangler dev`. The server is started and stopped by this file, so
 * `npm run test:integration` needs nothing else running.
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const PORT = 8788;
const BASE_URL = `http://localhost:${PORT}`;
const STARTUP_TIMEOUT_MS = 90_000;
const POLL_INTERVAL_MS = 1_000;
const WRANGLER_BIN = new URL("../../node_modules/wrangler/bin/wrangler.js", import.meta.url);

let server;
let serverOutput = "";

const post = async (path, body) => {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
};

const getState = async (code) => {
  const response = await fetch(`${BASE_URL}/api/tournaments/${code}`);
  return { status: response.status, body: await response.json() };
};

const waitForServer = async () => {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline && server.exitCode === null) {
    try {
      const response = await fetch(`${BASE_URL}/api/tournaments/ZZZZZ9`);
      if (response.status === 404) {
        return;
      }
    } catch {
      /* not listening yet */
    }
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error(`wrangler dev did not start:\n${serverOutput}`);
};

before(async () => {
  /* Keep local state outside the project: wrangler watches the project tree for
     changes, and writing inside it while wrangler starts can trigger a reload loop. */
  const stateDirectory = await mkdtemp(join(tmpdir(), "champions-night-test-"));
  server = spawn(
    process.execPath,
    [fileURLToPath(WRANGLER_BIN), "dev", "--port", String(PORT), "--persist-to", stateDirectory],
    { stdio: ["ignore", "pipe", "pipe"], detached: true },
  );
  const capture = (chunk) => {
    serverOutput += chunk.toString();
  };
  server.stdout.on("data", capture);
  server.stderr.on("data", capture);
  await waitForServer();
});

after(() => {
  if (server) {
    process.kill(-server.pid, "SIGTERM");
  }
});

describe("tournament API", () => {
  it("serves the app shell and its modules", async () => {
    const home = await fetch(`${BASE_URL}/`);
    assert.equal(home.status, 200);
    assert.match(await home.text(), /Champions Night/);
    for (const path of ["/client/main.js", "/shared/bracket.js", "/client/styles/tokens.css"]) {
      assert.equal((await fetch(`${BASE_URL}${path}`)).status, 200, path);
    }
    assert.equal(
      (await fetch(`${BASE_URL}/server/worker.js`)).status,
      404,
      "server code is not served",
    );
  });

  it("rejects unknown codes and endpoints", async () => {
    assert.equal((await getState("ZZZZZ9")).status, 404);
    assert.equal((await fetch(`${BASE_URL}/api/nothing`)).status, 404);
  });

  it("runs a full tournament: create, join, draw, results, knockouts, live updates", async () => {
    const created = await post("/api/tournaments", {
      name: "Host",
      gamertag: "host-gt",
      gamesPerPlayer: 2,
    });
    assert.equal(created.status, 200);
    const { code, token: hostToken } = created.body;
    assert.match(code, /^[A-Z0-9]{6}$/);

    const names = ["Ben", "Cat", "Dan", "Eve"];
    const tokens = {};
    for (const name of names) {
      const joined = await post(`/api/tournaments/${code}/players`, { name });
      assert.equal(joined.status, 200, `join ${name}`);
      tokens[name] = joined.body.token;
    }
    assert.equal((await post(`/api/tournaments/${code}/players`, { name: "ben" })).status, 409);

    let state = (await getState(code)).body.tournament;
    assert.equal(state.players.length, 5);
    assert.equal(JSON.stringify(state).includes(hostToken), false, "tokens never leak");

    assert.equal((await post(`/api/tournaments/${code}/draw`, { token: tokens.Ben })).status, 403);
    const oddDraw = await post(`/api/tournaments/${code}/draw`, {
      token: hostToken,
      gamesPerPlayer: 1,
    });
    assert.deepEqual([oddDraw.status, oddDraw.body.error], [409, "ODD_TOTAL"]);
    assert.equal((await post(`/api/tournaments/${code}/draw`, { token: hostToken })).status, 200);

    const socketUpdates = await collectLiveUpdates(code, async () => {
      const result = await post(`/api/tournaments/${code}/results`, {
        token: tokens.Cat,
        matchIndex: 0,
        homeScore: 3,
        awayScore: 1,
      });
      assert.equal(result.status, 200);
    });
    assert.equal(socketUpdates[0].type, "state");
    assert.deepEqual(socketUpdates[1].tournament.results[0], { homeScore: 3, awayScore: 1 });

    state = (await getState(code)).body.tournament;
    assert.equal(state.phase, "league");
    assert.equal(state.fixtures.length, 5);
    assert.equal(state.knockoutSize, 4);
    for (let index = 1; index < state.fixtures.length; index += 1) {
      await post(`/api/tournaments/${code}/results`, {
        token: tokens.Dan,
        matchIndex: index,
        homeScore: 1,
        awayScore: 0,
      });
    }
    const thirdPlace = await post(`/api/tournaments/${code}/third-place-match`, {
      token: hostToken,
      enabled: true,
    });
    assert.equal(thirdPlace.status, 200);
    const knockout = await post(`/api/tournaments/${code}/knockout-results`, {
      token: tokens.Eve,
      key: "round0-match0",
      homeScore: 2,
      awayScore: 2,
      penaltyHomeScore: 5,
      penaltyAwayScore: 4,
    });
    assert.equal(knockout.status, 200);
    state = (await getState(code)).body.tournament;
    assert.equal(state.hasThirdPlaceMatch, true);
    assert.equal(state.knockoutResults["round0-match0"].penaltyHomeScore, 5);
  });

  it("supports leaving and removal in the lobby", async () => {
    const { code, token: hostToken } = (
      await post("/api/tournaments", { name: "Ann", gamesPerPlayer: 2 })
    ).body;
    const ben = (await post(`/api/tournaments/${code}/players`, { name: "Ben" })).body;
    await post(`/api/tournaments/${code}/players`, { name: "Cat" });
    assert.equal((await post(`/api/tournaments/${code}/leave`, { token: hostToken })).status, 403);
    assert.equal((await post(`/api/tournaments/${code}/leave`, { token: ben.token })).status, 200);
    assert.equal(
      (await post(`/api/tournaments/${code}/remove-player`, { token: hostToken, playerId: 2 }))
        .status,
      200,
    );
    const state = (await getState(code)).body.tournament;
    assert.deepEqual(
      state.players.map((player) => player.name),
      ["Ann"],
    );
  });

  it("handles a large tournament", async () => {
    const { code, token } = (await post("/api/tournaments", { name: "P0", gamesPerPlayer: 4 }))
      .body;
    await Promise.all(
      Array.from({ length: 60 }, (_, i) =>
        post(`/api/tournaments/${code}/players`, { name: `P${i + 1}` }),
      ),
    );
    assert.equal((await post(`/api/tournaments/${code}/draw`, { token })).status, 200);
    const state = (await getState(code)).body.tournament;
    assert.equal(state.players.length, 61);
    assert.equal(state.fixtures.length, 122);
    assert.equal(state.knockoutSize, 16);
  });
});

/**
 * Opens the live socket, runs `action` after the first state message, and
 * resolves with all messages received (at least the initial state and one update).
 */
const collectLiveUpdates = (code, action) =>
  new Promise((resolve, reject) => {
    const socket = new WebSocket(`${BASE_URL.replace("http", "ws")}/api/tournaments/${code}/live`);
    const messages = [];
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error("no live update received"));
    }, 5_000);
    socket.onmessage = async (event) => {
      messages.push(JSON.parse(event.data));
      if (messages.length === 1) {
        await action();
      } else {
        clearTimeout(timer);
        socket.close();
        resolve(messages);
      }
    };
    socket.onerror = () => {
      clearTimeout(timer);
      reject(new Error("socket error"));
    };
  });
