# Champions Night

A Champions-League-style tournament tracker for a group of friends: everyone joins from their own phone with a six-character code, the host runs a draw, the league table and knockout bracket update live on every device.

## How a tournament works

1. The host creates a tournament and shares the code (or invite link).
2. Players join with a name and optional gamertag. Anyone else with the code can watch.
3. The host sets games per player and runs the draw. Every player gets that many distinct opponents; combinations that cannot be scheduled (an odd total of player-games, or more games than opponents) are refused with an explanation.
4. Players enter league scores. The table ranks by points, goal difference, goals scored, then head-to-head, and marks players whose knockout place is already certain.
5. When every league game is played, the top 2, 4, 8, or 16 (scaling with the field) enter a seeded bracket, with an optional third-place match.

## Layout

```
index.html        Markup only; loads client/main.js as a native ES module.
client/           Browser code. No bundler: the folder is what ships.
  main.js         Routing, live connection, rendering loop.
  api/            HTTP calls and the live WebSocket.
  state/          Observable store and the per-device session.
  ui/             Safe DOM helpers and reusable components.
  views/          One file per screen or section.
  styles/         Tokens, layout, components, and all media queries.
shared/           Pure tournament logic used by client and server.
  types.js        Every data shape, as JSDoc. This is the wire format.
  format.js       Draw feasibility and completion checks.
  standings.js    League table, tie-breakers, guaranteed qualifiers.
  bracket.js      Knockout sizing, seeding, resolution, podium.
server/           Cloudflare Worker and Durable Object.
  worker.js       Routing only.
  tournamentRoom.js  One Durable Object per tournament: storage, sockets, dispatch.
  handlers/       One plain function per API action.
  draw.js         Join codes, shuffle, fixture generation.
  http.js         Responses, body parsing, validators.
test/unit/        node --test; handlers run against a fake room.
test/integration/ Boots wrangler dev and runs a full tournament over HTTP and WebSocket.
```

## Commands

Node 22 is pinned in `mise.toml`; `mise` activates it inside this folder.

```
npm install              # once
npm run dev              # local server at http://localhost:8787
npm run check            # lint, formatting, unit tests — the gate for every commit
npm run test:integration # end-to-end against a local wrangler dev it starts itself
npm run format           # apply Prettier
```

To test from a phone on the same Wi-Fi: `npx wrangler dev --ip 0.0.0.0`, then open `http://<laptop-ip>:8787`.

## API

| Method | Path                                       | Who    | Purpose                        |
| ------ | ------------------------------------------ | ------ | ------------------------------ |
| POST   | `/api/tournaments`                         | anyone | Create; caller becomes host    |
| GET    | `/api/tournaments/:code`                   | anyone | Public state                   |
| GET    | `/api/tournaments/:code/live`              | anyone | WebSocket with state updates   |
| POST   | `/api/tournaments/:code/players`           | anyone | Join the lobby                 |
| POST   | `/api/tournaments/:code/leave`             | player | Leave the lobby                |
| POST   | `/api/tournaments/:code/remove-player`     | host   | Remove a player from the lobby |
| POST   | `/api/tournaments/:code/draw`              | host   | Run the draw                   |
| POST   | `/api/tournaments/:code/results`           | player | Record a league score          |
| POST   | `/api/tournaments/:code/knockout-results`  | player | Record a knockout score        |
| POST   | `/api/tournaments/:code/third-place-match` | host   | Add or remove the small final  |

Players authenticate with the token returned when they joined; it lives only in their browser. Tournaments are deleted a week after their last change.

## Deploy

Cloudflare Workers, connected to this repository: every push to `main` runs `npx wrangler deploy`. `wrangler.jsonc` serves the repository root as static assets (minus `.assetsignore`) and binds the `TournamentRoom` Durable Object.
