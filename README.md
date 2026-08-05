# Samurai

An unofficial web implementation of the board game **Samurai**, designed by
Reiner Knizia. Two to four players, each in their own browser, kept in sync over
WebSockets.

> **Not affiliated with, endorsed by, or licensed by Reiner Knizia or the game's
> publishers.** This is a fan project. It implements the game's rules, which are
> not copyrightable, using entirely original code, artwork and board layout. It
> ships no rulebook, no scanned components and no publisher artwork. If you enjoy
> the game, buy a physical copy — it is worth owning.

Vue 3 + TypeScript + Vite on the client, a small Bun WebSocket server holding
the authoritative game state.

![The table mid-game: the hex board, the player panel and the play log](assets/preview2.png)

*The table. The board pans and zooms, the sidebar tracks the caste counts and
every player's hand size, and your own tiles sit along the bottom.*

![The draft screen: what each tile does, beside the twenty tiles to choose from](assets/preview1.jpeg)

*The opening draft. Everyone picks five of their twenty tiles at the same time,
with a reference for what each tile does alongside.*

## Running it

```bash
bun install
bun run dev
```

That starts both processes: the game server on `:8787` and Vite on `:5173`. Open
<http://localhost:5173>, create a room, and share the four-character code (or the
invite link) with the other players.

Vite binds to every interface, so players on the same network can join at
`http://<your-lan-ip>:5173`.

For a single-process deployment:

```bash
bun run build   # typechecks, then bundles the client into dist/
bun start       # serves dist/ and the WebSocket endpoint from :8787
```

### Keeping rooms across restarts

Set `DATABASE_URL` and the server writes every room to PostgreSQL, so a
redeploy, a crash or a `docker restart` does not end the games people are
sitting at — the tables come back and the browsers reconnect into them. The
table is created on first start; there is nothing to migrate.

```bash
docker run -d --name samurai-pg -p 5432:5432 \
  -e POSTGRES_USER=samurai -e POSTGRES_PASSWORD=samurai -e POSTGRES_DB=samurai \
  postgres:17-alpine

DATABASE_URL=postgres://samurai:samurai@localhost:5432/samurai bun run dev
```

Without `DATABASE_URL` the server still runs exactly as before, holding rooms in
memory and losing them on restart. It says so on startup.

| Variable | What it does |
| --- | --- |
| `PORT` / `HOST` | Where the server listens (`8787` / `0.0.0.0`) |
| `DATABASE_URL` | PostgreSQL connection string; unset means memory-only |
| `DATABASE_SSL` | Set to `true` for providers that terminate TLS with their own certificate |
| `DATABASE_POOL_MAX` | Connection pool size (default `5`) |
| `STATIC_DIR` | Where the built client lives (default `./dist`) |

To try the production image locally, `docker compose -f docker-compose.local.yaml
up --build` brings up the server and a Postgres alongside it on
<http://localhost:8787>.

For Coolify, `Dockerfile.coolify` deploys the image published to GHCR rather
than rebuilding on the server: add the repository as an application with the
Dockerfile build pack, point it at that file, add a PostgreSQL resource in the
same project, and copy its internal connection string into `DATABASE_URL`. Run
exactly one replica — a live game is served from the server's memory and only
written through to Postgres, so a second instance would not see the first one's
tables.

## Commands

| Command | What it does |
| --- | --- |
| `bun run dev` | Server + client with hot reload |
| `bun run build` | Typecheck and bundle the client |
| `bun start` | Serve the built client and the game server together |
| `bun run test` | Full suite — rules, engine, board, rendering, and a live end-to-end game over WebSockets |
| `bun run typecheck` | `vue-tsc` over client, server and shared code |

There is also a visual harness at
<http://localhost:5173/dev-preview.html?players=4&turns=30>, which renders the
table against a locally simulated game so the board can be inspected without
opening four browsers. `&shape=circle` picks a map, and `&zoom=4&at=0.45,0.55`
additionally scrolls the board in, for checking the zoomed view. It is dev-only and is not part of the production
bundle.

## How it is put together

```
shared/    game rules, board, tiles, scoring, wire protocol — used by both sides
server/    WebSocket server: rooms, seats, reconnection, redaction, persistence
src/       Vue client: board rendering, hand, lobby, draft
tests/     unit, render and end-to-end tests
```

The rules live in `shared/` and are imported unchanged by both the server and the
browser. The server owns the only real game state (`shared/engine.ts`) and
validates every action, so a tampered client cannot cheat. The client uses the
same rule functions purely to decide what to highlight.

### Hidden information

Each client receives its own redacted view of the game. A player's draw stack
never leaves the server, opponents' hands are sent only as counts, and captured
pieces stay hidden until the game ends — unless the table is created with *open
information*.

Tile definitions are recoverable from their ids (`p2-t7` is player 2's eighth
tile), so the protocol only ever sends ids. That keeps messages small and means
sending a hand can never accidentally leak one.

### Moving around the board

The board pans and zooms, which matters most on a phone where the four-player
map would otherwise be a grid of tiny hexes. Scroll or pinch to zoom, drag to
pan, and use the buttons in the corner (`+`, `−`, `Fit`) to reach the same thing.

It works by driving the SVG's `viewBox`, and the view box is always given the
container's aspect ratio so it never letterboxes — which is what makes zooming
anchor exactly on the cursor or the pinch midpoint rather than drifting. A drag
that ends over a hex is swallowed in the capture phase, so panning across the
board never places a tile by accident.

### Ending and restarting

The **Table** menu in the top bar is available at any point during a game. The
host can *End game*, which throws away the board and puts everyone back in the
lobby with their seats intact, ready to change the settings and deal again. Any
player can *Leave table* and go back to the start screen. Both ask for a
confirming second click, since neither can be undone.

At the end of a game the host also gets *Play again*, which deals a fresh game to
the same players straight away.

Players who are away when a new game is dealt lose their seat, because seat
numbers index into the game and can only be renumbered between games. If they
come back while the room is still in the lobby, their browser quietly claims a
free seat again. The host role also moves to someone still present whenever the
host drops, so a room can never be left with nobody able to restart it.

### Reconnection

Every browser gets a token stored in `localStorage`. Reconnecting with it drops
the player straight back into their seat with their hand intact, so closing a tab
mid-game is recoverable. Before a game starts, disconnecting simply frees the
seat.

The client reconnects on its own, retrying with a jittered exponential backoff
so a server restart is picked up within a second or two while a long outage
neither hammers the network nor lines every player up to retry on the same tick.
It also retries immediately when the device comes back online or the tab is
brought to the front, which is when a reconnect is most likely to work.

Sockets do not always die politely — a sleeping laptop or a proxy dropping an
idle connection leaves both ends thinking they are still talking. So the server
pings every client on a fixed interval and the client answers. Silence for three
intervals means the connection is gone: the client tears it down and reconnects,
and the server drops the socket so the seat frees up.

If a client reconnects to a server that has never heard of its table — an
expired room, or a memory-only server that restarted — it is told so and
returned to the start screen, rather than left looking at a board that no longer
exists.

## Notes on the rules

Two details are worth recording, because the rulebook constrains them without
spelling them out:

- **Tile distribution.** The rulebook fixes the totals — 20 tiles per player,
  exactly five bearing the fast icon, one switch tile and one move tile — but
  never itemises the wild tiles. The set in `shared/tiles.ts` satisfies every
  stated constraint (12 caste tiles at values 1–4, two samurai, two ronin, two
  ships, switch, move). Change that one array if your printing differs.

- **The board.** The map in `shared/board.ts` is an original layout, not a copy
  of the printed board. It is built to the same structural rules: an
  island chain of sea, land and settlement hexes whose capacity matches the
  supply exactly at every player count (21 / 30 / 39 pieces), with the smaller
  boards nested inside the larger ones the way the physical board's map pieces
  nest. The board is authored as text, so editing those rows is all it takes to
  swap in a different map — `tests/board.test.ts` will verify it still adds up.

Capture order is the other place the rulebook leaves a choice: it lets the active
player pick the order in which surrounded settlements resolve. Because captures
never remove tiles, every order produces identical influence totals, so the
engine resolves in board order and the choice is not surfaced.

## Licence

The code and artwork in this repository are MIT licensed — see [LICENSE](LICENSE).

That covers this implementation only. *Samurai* was designed by Reiner Knizia,
and the game's name, rulebook, published board and component art belong to their
respective rights holders. None of those are included here: the artwork in
`assets/` is our own, `src/game/icons.ts` also carries an SVG silhouette for
every icon, and the board in `shared/board.ts` is an original map. Game rules and
mechanics are not subject to copyright, which is what makes an independent
implementation possible.

If you hold rights to *Samurai* and want something here changed, open an issue
and I will act on it.
