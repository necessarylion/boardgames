# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

An unofficial web implementation of the board game *Samurai*, designed by Reiner Knizia. Vue 3 + TypeScript + Vite client, a Bun WebSocket server holding the authoritative state, and a `shared/` rules layer imported unchanged by both.

The repo ships no rulebook and no publisher artwork, and it must stay that way — rules and mechanics are not copyrightable, but that material is. `shared/board.ts` is an original map, `src/game/icons.ts` carries original SVG silhouettes for every icon, and the raster art in `assets/` must be original too. Never commit a reference PDF, a scan of a rulebook, or a photograph of a published game's components: drop the file from `ICON_IMAGES` and the SVG fallback takes over.

## Commands

**Bun is the runtime and the package manager**, for both sides — `bun install`, `bun run`, and `bun` itself serving the built server. There is no `package-lock.json`; `bun.lock` is the lockfile. Vitest still runs the tests under Node, because the suite leans on vitest's jsdom environments and Vue Test Utils.

| Command | What it does |
| --- | --- |
| `bun run dev` | Server on `:8787` (`bun --watch`) and Vite on `:5173`, concurrently |
| `bun run build` | `vue-tsc --noEmit`, then bundles client to `dist/` and server to `dist-server/index.js` |
| `bun start` | Runs the built server, which also serves `dist/` |
| `bun run test` | Full vitest suite, including the end-to-end game over real WebSockets |
| `bun run typecheck` | `vue-tsc --noEmit` over client, server, shared and tests |

Run one test file: `bunx vitest run tests/rules.test.ts`. One case: `bunx vitest run -t "resolving a contest"`. Watch: `bun run test:watch`.

`tests/integration.test.ts` spawns a real server via `bun server/index.ts` on port 8899 and drives two scripted WebSocket clients through a whole game — it is slow and needs that port free. `render.test.ts` and `panzoom.test.ts` opt into jsdom with a per-file `// @vitest-environment jsdom` comment; there is no vitest config block, so everything else runs in node. Vitest reads `vite.config.ts`, so the `@` and `@shared` aliases work in tests too.

There is a dev-only visual harness at `http://localhost:5173/dev-preview.html?players=4&turns=30` (`&zoom=4&at=0.45,0.55` to inspect the zoomed view). It simulates a game locally via `src/preview.ts`, so the table can be checked without a server or four browsers.

## Architecture

```
shared/    rules, board, tiles, scoring, wire protocol — used by both sides
server/    WebSocket server: rooms, seats, reconnection, redaction, persistence
src/       Vue client: board rendering, hand, lobby, draft
```

**The server is authoritative.** `shared/engine.ts` (`Game`) owns the only real state and validates every action, returning `{ok: false, error}` for anything it rejects. The client imports the same `shared/rules.ts` functions purely to decide what to highlight and which hand tiles to enable — never to mutate state. When adding a rule, put it in `shared/rules.ts` and have both `Game` and `src/stores/game.ts` call it, rather than duplicating the logic client-side.

**Tile ids encode their definitions.** A tile id is `p{owner}-t{index}` where `index` indexes into `TILE_SET` in `shared/tiles.ts`, so `tileFromId()` reconstructs any tile anywhere. The protocol therefore only ever sends ids, which keeps messages small and makes it impossible to leak a hand by accident. Consequence: **reordering `TILE_SET` silently changes what every existing id means.** Append rather than reorder, and expect the client to rebuild tile data from ids (`src/stores/game.ts`, `tiles` computed).

**The board is never sent over the wire.** `buildBoard(playerCount)` is deterministic, so the client rebuilds it locally from `state.playerCount` and caches it by count.

**Redaction lives in one place:** `Room.stateFor(token)` in `server/rooms.ts` builds a per-viewer `ClientState`. A player's own stack never leaves the server, opponents' hands travel as counts only, and `captured` is `null` unless the room runs with open information or the game is over. Anything added to `ClientState` has to be redacted here deliberately.

**Seat ids index into the running game**, so seats can only be renumbered between games. That single fact explains several behaviours: a player who disconnects mid-game keeps their seat (marked `connected: false`) and can reconnect into it; a player who disconnects before the game starts is simply removed; and `dropAbsentPlayers()` runs only on rematch/abandon. `ensureHost()` is called wherever someone might leave, so a room is never left without a host.

**Identity is a token in `localStorage`** (`samurai.token`), sent with the first `hello`. One socket per token — a reconnect closes the previous one. `RoomManager` maps token → room; `sockets` maps token → live socket. `hello` also carries the room code the client thinks it is at, so a server that has never heard of it replies `left` instead of leaving a dead board on screen.

**Rooms are written through to Postgres** when `DATABASE_URL` is set (`server/store.ts`); without it the server is memory-only and says so on startup. `Room.toSnapshot()` / `Room.fromSnapshot()` flatten a room to JSON, with `Game.fromState()` rebuilding the engine — the board and tile definitions are pure functions of the player count, so only `GameState` is stored. Every mutation site in `server/index.ts` calls `commit(room)` rather than `broadcast(room)`; that marks the room dirty and `RoomManager` coalesces the writes, one batch at a time, so the row can never end up holding an older snapshot than the one before it. Restored seats always come back `connected: false`, since no socket survives a restart. Note `jsonb` reorders object keys, so a snapshot is not byte-identical — nothing reads a room by key order, and `tests/persistence.test.ts` covers the round trip.

**A heartbeat runs both ways.** The server sends `{t:'ping'}` every `HEARTBEAT_MS` (`shared/protocol.ts`) and the client answers `{t:'pong'}`; either side treats silence for three intervals as a dead connection. This is what catches sockets that die without a close frame. The client reconnects with jittered exponential backoff, and immediately on `online` / `visibilitychange`.

**Client state flow:** `src/stores/game.ts` is a single Pinia store holding the connection, the last `ClientState`, and an `Interaction` discriminated union describing what the local player is currently being asked to click (`place` / `switch-first` / `switch-second` / `move-pick` / `move-destination`). Components read derived computeds (`highlightedSpaces`, `selectablePieces`, `playableTileIds`) and call store actions; they never talk to the socket. `App.vue` switches between Home / Lobby / Draft / Game screens off `game.phase`.

**Pan and zoom** (`src/composables/usePanZoom.ts`) works by driving the SVG `viewBox`, always giving it the container's aspect ratio so it never letterboxes — that is what makes zoom anchor exactly on the cursor or pinch midpoint. A drag that ends over a hex is swallowed in the capture phase so panning never places a tile.

## Board and tile data

The board in `shared/board.ts` is authored as text rows (`MAP_ROWS`) in odd-r offset coordinates: `~` sea, `.` land, `v`/`c`/`E` village/city/Edo. Rows carry a section A/B/C, nested so A is the two-player board, A+B three, A+B+C four. The section totals are load-bearing: settlement capacity must match the supply exactly (21 / 30 / 39 pieces) and cities and villages must each be a multiple of three, or `distributePieces()` throws. Editing the map means re-running `tests/board.test.ts`, which checks the arithmetic still works out.

Two rules details the rulebook constrains without spelling out, already recorded in the source: the wild-tile breakdown in `TILE_SET`, and the board layout being an original map built to the printed board's structural rules rather than a copy. Capture order is resolved in board order because captures never remove tiles, so every order yields identical influence totals.

## Conventions

- Path aliases: `@/` → `src/`, `@shared/` → `shared/`. Server code uses relative `../shared/...` imports (it is bundled by `bun build`, not Vite).
- TypeScript is strict, with `noUnusedLocals`, `noUnusedParameters` and `verbatimModuleSyntax` — type-only imports must use `import type`.
- British spelling throughout the codebase (`colour`, `neighbours`, `centre`, `sanitise`).
- Comments explain *why*, not *what*, and are used sparingly on the non-obvious invariants above. Match that density.
- Player colours and the seat colour order live in `shared/colours.ts`; the paper/ink design tokens are CSS custom properties in `src/assets/main.css`.
- Game iconography is in `src/game/icons.ts`: inline 24×24 SVG silhouettes inheriting `currentColor`, plus raster art in `assets/` that `GameIcon` prefers when present. `assets/` is lowercase and imported by relative path — the case matters, because the Docker image builds on Linux even though macOS would not notice.

## CI and deployment

`.github/workflows/docker-publish.yml` runs `bun install --frozen-lockfile`, `bun run typecheck` and `bun run test` on every push and PR to `main`, and publishes a multi-arch image to GHCR only after the suite passes (never on PRs). The runtime image copies just `dist/` and the self-contained `dist-server/index.js`, with no `node_modules`. `PORT`, `HOST` and `STATIC_DIR` are the server's env vars; `/healthz` returns `{ok, rooms}`.
