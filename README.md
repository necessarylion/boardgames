# Board Games

Eight board and card games in the browser, played with friends over a
four-character room code. One Vue 3 + TypeScript client, one small Bun
WebSocket server holding the authoritative state, and a `shared/` rules layer
imported unchanged by both sides.

| Game | Players | What it is |
| --- | --- | --- |
| **Samurai** | 2–6 | Place influence across feudal Japan and lead the most castes |
| **Halli Galli** | 2–8 | Flip cards and race to slap the bell the instant five fruit show |
| **Coup** | 2–8 | Claim whatever character suits you and hope nobody calls the bluff |
| **Carnivals** | 2–8 | Bet on a hand you can only half see — your own red, everyone else's blue |
| **COP** | 2–8 | Hide behind a door with your loot; the Cop opens two |
| **Snake** | 2–8 | The arcade classic, head to head, last one slithering wins |
| **Snakes & Ladders** | 2–8 | Roll, climb the ladders, dodge the snakes, reach 100 |
| **Monopoly** | 2–8 | Buy up the tech giants, build them out, and charge rent until everyone is broke |

The games share the room, seat, reconnection, redaction and persistence
machinery and nothing else — no common engine, no rules in common. Each has its
own engine in `shared/`, its own store slice and its own components.

> **Not affiliated with, endorsed by, or licensed by any game's designer or
> publisher.** This is a fan project. It implements rules, which are not
> copyrightable, using original code and artwork. It ships no rulebook, no
> scanned components and no publisher artwork. If you enjoy any of these games,
> buy a physical copy.

![The Samurai table mid-game: the hex board, the player panel and the play log](assets/preview2.png)

*Samurai's table. The board pans and zooms, the sidebar tracks the caste counts
and every player's hand size, and your own tiles sit along the bottom.*

![The draft screen: what each tile does, beside the twenty tiles to choose from](assets/preview1.jpeg)

*Samurai's opening draft. Everyone picks five of their twenty tiles at the same
time, with a reference for what each tile does alongside.*

Every table is laid out for a phone as well as a desktop: the side panels
become sheets, the prompts move under the board, and touch targets are sized
for a thumb.

## Running it

```bash
bun install
bun run dev
```

That starts both processes: the game server on `:8787` and Vite on `:5173`. Open
<http://localhost:5173>, pick a game, create a room, and share the four-character
code (or the invite link) with the other players.

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
| `bun run test` | Full suite — every game's engine and room, rendering, and a live end-to-end game over WebSockets |
| `bun run typecheck` | `vue-tsc` over client, server and shared code |
| `cd e2e && bun run test` | Playwright, one spec per game, two real browsers per table |

`e2e/` is a standalone package with its own `package.json` and
`node_modules` — see [e2e/README.md](e2e/README.md).

There is also a visual harness at
<http://localhost:5173/dev-preview.html?players=4&turns=30>, which renders the
Samurai table against a locally simulated game so the board can be inspected
without opening four browsers. `&shape=circle` picks a map, and
`&zoom=4&at=0.45,0.55` additionally scrolls the board in, for checking the
zoomed view. It is dev-only and is not part of the production bundle.

## How it is put together

```
shared/    one engine per game, plus board, tiles, scoring, wire protocol — used by both sides
server/    WebSocket server: rooms, seats, reconnection, redaction, persistence
src/       Vue client: one component folder and store slice per game, plus the shared shell
tests/     unit, render and end-to-end tests
e2e/       Playwright browser suite, standalone
```

Rules live in `shared/` and are imported unchanged by both the server and the
browser. The server owns the only real game state and validates every action, so
a tampered client cannot cheat. The client uses the same rule functions purely to
decide what to highlight and enable.

Adding a game is a fixed list of files rather than an interface to implement —
`CLAUDE.md` has the checklist.

### Hidden information

Each client receives its own redacted view, built in one place
(`Room.stateFor`). What that means per game: a Samurai player's draw stack never
leaves the server, opponents' hands travel as counts and captured pieces stay
hidden until the game ends; Coup keeps the court deck off the wire entirely and
sends held influence as a count; Carnivals shows you your own red card and
everyone else's blue, never the other halves; Monopoly hides almost nothing —
cash and ownership are public — beyond a trade's terms and each seat's own list
of legal moves.

Where the client cannot derive its options from a redacted view — a Coup
challenge window, a Monopoly build or trade — the server computes that seat's
affordances and sends them ready-made.

### Opening seat

No game gives the first turn to seat 0. `shared/opening.ts` draws the opening
seat for every game that has one, either silently or through a roll-off the
whole table watches, depending on the room's settings.

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

## Samurai

The oldest game here and the most involved, so a few notes.

**Moving around the board.** The board pans and zooms, which matters most on a
phone where the six-player map would otherwise be a grid of tiny hexes. Scroll or
pinch to zoom, drag to pan, and use the buttons in the corner (`+`, `−`, `Fit`)
to reach the same thing. It works by driving the SVG's `viewBox`, always given
the container's aspect ratio so it never letterboxes — which is what makes
zooming anchor exactly on the cursor or the pinch midpoint rather than drifting.
A drag that ends over a hex is swallowed in the capture phase, so panning never
places a tile by accident.

**Tile ids encode their definitions** (`p2-t7` is player 2's eighth tile), so the
protocol only ever sends ids. That keeps messages small and means sending a hand
can never accidentally leak one.

Two rules details are worth recording, because the rulebook constrains them
without spelling them out:

- **Tile distribution.** The rulebook fixes the totals — 20 tiles per player,
  exactly five bearing the fast icon, one switch tile and one move tile — but
  never itemises the wild tiles. The set in `shared/tiles.ts` satisfies every
  stated constraint (12 caste tiles at values 1–4, two samurai, two ronin, two
  ships, switch, move). Change that one array if your printing differs.

- **The board.** The map in `shared/board.ts` is an original layout, not a copy
  of the printed board. It is built to the same structural rules: an island chain
  of sea, land and settlement hexes whose capacity matches the supply exactly at
  every player count (21 / 30 / 39 / 48 / 57 pieces), with the smaller boards
  nested inside the larger ones the way the physical board's map pieces nest. The
  board is authored as text, so editing those rows is all it takes to swap in a
  different map — `tests/board.test.ts` will verify it still adds up.

Capture order is the other place the rulebook leaves a choice: it lets the active
player pick the order in which surrounded settlements resolve. Because captures
never remove tiles, every order produces identical influence totals, so the
engine resolves in board order and the choice is not surfaced.

Five and six players are an extension, not a port — the published game stops at
four, and the outlying islands, the supply formula and the raised set-aside
ending are all choices made here. None of them changes how two, three or four
players play.

## Licence

The code and artwork in this repository are MIT licensed — see [LICENSE](LICENSE).

That covers this implementation only. The games' names, rulebooks, published
boards and component art belong to their respective rights holders, and none of
those are included here: the artwork in `assets/` is our own,
`src/game/icons.ts` carries an SVG silhouette for every icon, and the maps and
boards in `shared/` are original layouts. Game rules and mechanics are not
subject to copyright, which is what makes an independent implementation possible.

The one exception is `src/game/companies.ts`: Monopoly's properties are
technology companies, and the logos drawn there are hand-made approximations of
real marks, which remain trademarks of their owners.

If you hold rights to any of these games and want something here changed, open an
issue and I will act on it.
