# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

An unofficial web implementation of the board game *Samurai*, designed by Reiner Knizia. Vue 3 + TypeScript + Vite client, a Bun WebSocket server holding the authoritative state, and a `shared/` rules layer imported unchanged by both.

The repo ships no rulebook and no publisher artwork, and it must stay that way — rules and mechanics are not copyrightable, but that material is. `shared/board.ts` is an original map, `src/game/icons.ts` carries original SVG silhouettes for every icon, and the raster art in `assets/` must be original too. Never commit a reference PDF, a scan of a rulebook, or a photograph of a published game's components: drop the file from `ICON_IMAGES` and the SVG fallback takes over.

## Several games, one app

The app now hosts several unrelated games: *Samurai*, *Halli Galli*, *Coup*, *Carnivals*, *COP*, *Snake*, *Snakes & Ladders* (`ladders`, a dice race whose die is drawn from the `Rng` by position, like Coup's deck) and *Monopoly*. They share the room, seat, reconnection, redaction and persistence machinery and nothing else — no common engine interface, no rules in common. `GameKind` in `shared/types.ts` is the union, and the kind rides on `GameOptions.kind` so it flows through create, the lobby, the snapshot and restore with no extra plumbing.

Adding a game means touching a fixed list: a new `shared/<game>.ts` engine; the id in `GameKind`/`GAME_KINDS`; a `<Game>ClientState` plus any new `ClientMessage` members in `shared/protocol.ts`, widening `AnyClientState`; a slot on `Room` with branches in `deal()`, `stateFor()`, `abandon()` and the snapshot; an action-routing block in `server/index.ts` ahead of the Samurai fall-through; `src/stores/<game>/use<Game>.ts` wired into `src/stores/game.ts`; `src/components/<game>/`; a branch in `App.vue` and an entry in `GAME_CARDS` (`src/game/catalogue.ts`), which is what puts it on the lobby's shelf and the front door's strip; `src/i18n/{en,my}/<game>.ts` merged in `src/i18n/index.ts`; and `tests/<game>.test.ts` + `tests/<game>.room.test.ts`. The engine and room tests are the established minimum. `integration.test.ts` and `render.test.ts` only ever drive Samurai, but a game is free to bring its own jsdom suite where the screen carries rules of its own: `tests/coup.render.test.ts` does, because Coup's table decides what a card shows, and getting that wrong would leak a hidden hand rather than merely look untidy, and `tests/monopoly.render.test.ts` for the same reason — its table decides which of the auction, trade and building controls each seat is offered.

Two things the list does not say and both have bitten. `GAME_ART` in `src/game/artwork.ts` and `GLYPHS` in `LobbySplit.vue` are total `Record<GameKind, …>`, so a new kind needs artwork before the client will compile — Monopoly's is a hand-authored SVG rather than a painting, which Vite imports by URL exactly like the `.webp` files. And the per-game store slices are spread *flat* into one Pinia store, so two slices returning the same name silently clobber each other in spread order; Monopoly prefixes everything `mp*` after `canRoll` and `canEndTurn` collided with Snakes & Ladders and Samurai.

A game engine is not required to implement an interface, but `Room` and the client shell read `phase`, `paused`, `current`, `turnNumber`, `opening`, `log` and `result` off every state generically, and each engine is expected to expose a plain-JSON state, `static fromState()` rebuilt with `Object.create`, and actions returning `{ok:true} | {ok:false, error}`.

**Who opens is the table's choice, and it is the one place turn positions and
the opening roll-off meet.** `GameOptions.diceStart` on (the default) rolls for
it and keeps the throws so the table can watch; off means the chosen positions
decide and **position 1 opens** — seat 0, because `start()` has already seated
the table in position order. `chooseFirst()` used to draw at random in *both*
cases, which made the option a choice about ceremony rather than about anything,
and left a table that had carefully arranged its positions opening wherever the
generator liked. The default stays on for a reason worth keeping: whoever opens
the room holds position 1 unless somebody takes it from them, so with the
roll-off off by default the host would go first in every game — which is exactly
the unfairness the roll-off was added to prevent.

**No game gives the first turn to seat 0 by accident.** `shared/opening.ts` draws the opening seat for every game that has one — silently, or through a roll-off the table watches, per `GameOptions.diceStart`. It lives outside every engine because none of them owns it: the roll yields a seat number and knows nothing about tiles, fruit or influence. `App.vue` replays it over whichever table is on screen, so it also covers Samurai's draft, the one screen where knowing the turn order changes what you pick. Two traps, both hit once already: draw the seat *after* everything else has taken from the `Rng`, because the generator is a plain LCG whose first output tracks its seed and because inserting draws mid-stream silently deals a different board for the same seed; and Samurai counts a round when play returns to `GameState.first`, not to seat 0, or the first round of any table that opens elsewhere ends early.

**Coup hides more than the other two.** `shared/coup.ts` holds a `pending` stack rather than a single slot, because a challenge forces a card loss *in front of* the action that provoked it; `advance()` drains every step that needs nobody's input and stops on the first that does. A reaction window closes as soon as anyone challenges or blocks, and otherwise when every eligible opponent has passed. Two consequences worth knowing: a hand is the whole of a player's position, so `coupStateFor()` sends held influence as a count, keeps the court deck off the wire entirely, and gives an exchange's drawn pair only to the player who drew it; and because the client cannot derive a challenge window from a redacted hand, the server computes each viewer's `CoupAffordances` and sends them ready-made, the way Halli Galli sends its fruit totals. Coup also reshuffles mid-game, which Samurai and Halli Galli never do — that is why `Rng` exposes `position` and `CoupGameState` carries the generator's place rather than its original seed.

**Monopoly is Coup's shape, not Snakes & Ladders'.** It looks like the dice race — a token going round a track — but its decisions are not all the current player's: an auction waits on every solvent opponent at once, a trade on one named opponent, and a debt on a debtor who must sell before anything else can happen. So `shared/monopoly.ts` carries the same `pending` stack and `advance()` drain, and the server computes each viewer's `MonopolyAffordances` from the engine's own exported helpers (`buildable`, `sellable`, `mortgageable`, `tradePartners`, `inAuction`) rather than letting the client re-derive rules like even building. `inAuction` is the single definition of who an auction is still waiting on — not bankrupt, not dropped out, and *not the standing high bidder*, who has already answered — and everything reads the window through it: the affordances, the shot clock's auto-pass, and the test in `advance()` for when the hammer falls. Dropping out is final, so `passed` only ever grows and an auction always closes; that is also why a bid may not be raised or withdrawn by the seat already holding it. Almost nothing is secret — cash, ownership and buildings are all public — so the two deliberate redactions in `monopolyStateFor()` are the affordance block and a trade's terms, which reach only the two seats it is between. Three rules the stack settles without asking anyone, worth knowing before reading `advance()`: a purchase the lander cannot afford goes straight to auction, a debt larger than everything the debtor could raise is bankruptcy rather than a decision, and **a seat that goes bankrupt on its own turn has the turn taken off it there**. That last one deadlocked a whole table once: `guard()` rejects every action from a bankrupt player and every action worth taking is gated on `playerId === current`, so a bankrupt `current` is a seat nobody can play and nobody can pass. `checkEnd()` running at the top of the same loop is what stops the hand-off searching forever when nobody solvent is left. Like Coup and Snakes & Ladders it carries `rngPosition`, because dice and cards are drawn all game long.

The board in `shared/monopoly.ts` is original in the same way `shared/board.ts` is: forty spaces, eight colour groups of two or three, four stations and two utilities, with names, prices and both card decks written here rather than taken from a published edition. Rules and mechanics are not copyrightable; a printed board's street names and artwork are. The properties are technology companies and each colour band is a sector, so `src/game/companies.ts` carries a logo for every one, drawn in that brand's own colours. **These are the one place the repo departs from its own "all artwork is original" rule** — they are hand-drawn approximations of real marks, added at the user's explicit direction, and they are trademarks of their owners. Worth knowing before this board is shown anywhere public. `CompanyLogo.vue` renders them as real elements on the space rather than as a background wash, because a logo at half opacity behind text stops reading as the logo; the brand colour survives as a 10% plate so the sector still reads at a glance. Every property needs an entry or its space renders bare beside its neighbours, which `tests/monopoly.render.test.ts` checks both ways — along with each logo actually containing the colour its plate claims.

**A Monopoly turn ends itself.** There is no end-turn button: `advance()` calls
`nextTurn()` as soon as the pending stack drains and the throw is spent. That
only works because nothing is left that *only* the seat on turn could do —
building, selling and mortgaging were never gated on whose turn it is, and
trading no longer is either, so a player manages their holdings whenever they
like. A double leaves `rolled` false and falls through to be thrown again.
Two consequences: `nextTurn()` must not clear `lastCard` (it used to, and with
the turn ending in the same instant that wiped a drawn card before the table
could show it — it is cleared at the top of the next `roll()` instead); and
`endTurn()` survives only as the shot clock's fallback, since the state it
answers can no longer persist.

**A watcher keyed on a number that can repeat is the bug family to watch for
here**, and it has bitten three times. The shot clock's remainder is the same
30000 at the start of every turn. The chat is capped at `CHAT_KEEP`, so past a
hundred messages its *length* never changes again. The Monopoly play log is
capped at `LOG_KEEP` for the same reason — the whole state goes out on every
action and is written to the database whole — so its length stops moving too.
In each case the cure is to watch something monotonic: the state object itself
for the clock, the newest chat entry's `id`, and `MonopolyGameState.logCount`,
which is `rollCount`'s and `cardCount`'s third sibling and counts lines ever
written rather than lines kept. It is seeded to 1, because the opening line is
put straight into the list rather than written through `log()`.

`ChatEntry.seat` needs the same care from the other direction: seat ids are
indices and are renumbered whenever the seating changes — someone leaving, or
the deal sorting by turn position — so `renumberSeats()` carries the chat's
attribution along with them, and a speaker who has left becomes -1. Without
that, a line recorded before a renumbering points at whoever inherited the
number, and each client decides whose words are its own by comparing it.

The client half of the clock has one trap that cost a whole game's countdown.
`useCountdown` takes the **state object**, not `turnMsLeft`, because a fresh
period reports the *same* remainder as the one before it — 30000 left, then
30000 left again for the next player. Watching the number meant Vue never fired
when a turn passed, the local anchor stayed on the previous player's turn, and
the clock read 0:00 for the rest of the game. Watching the object re-anchors on
every broadcast, which is correct anyway: the remainder is only true at the
moment the server built it. `tests/countdown.test.ts` fails in two places if
that watcher is pointed back at the number.

A trade may be offered by **any** seat at any time the table is not already
waiting on something. The offer then *is* what the table is waiting on — the
pending stack holds one question at a time — so an offer can hold up a throw
until it is answered or the clock declines it.

Monopoly runs a shot clock like the other timed games, but its period is keyed
on the *pending step* rather than on the turn (`monopolyTurnKey()`), because an
auction waits on every solvent opponent and a trade on one named seat — a
decision handed across the table gets its own period rather than inheriting the
roller's. An auction also gets a period of its own *length*,
`GameOptions.bidSeconds`, since the whole table is waiting on one seat for a
single word; 0 there means "same as a turn" rather than "untimed", because a
host who timed the table meant to time the bidding too. Its key carries the
standing bid and the number who have dropped out, so the window restarts from
every bid — and when it expires, **every seat still being waited on drops out
together** rather than one per period, or a table that has walked away could
hold an auction open for as many periods as there are idle players. `timeOut()` settles whatever is in front of the table the way the
absent player would most likely want it: **the space they stopped on is bought**
(a price out of reach never becomes a decision — `land()` opens the auction
itself — so by then the money is there), a bid is dropped, an offer refused, and
a gaol sentence thrown for rather than paid out of. A debt is met by
`raiseFunds()`, which **mortgages bare land before it sells a single building**:
a mortgage keeps the buildings and the rent they earn standing and can be lifted
later, where a sold house has to be bought back at full price. `mortgageable()`
already refuses a street whose group has anything built on it, so that first
branch is exactly the land with nothing on it; selling a building then frees its
group to be mortgaged on the next pass. Bankruptcy is only declared when
everything the player holds still falls short.

`MonopolyGameState.cardCount` is `rollCount`'s twin and exists for the same reason: the table deals a drawn card onto the board with a flip animation, keyed on the count so Vue rebuilds the element and restarts the keyframes. Two identical draws in a row are otherwise indistinguishable, and it cannot be derived from the throw count either — a card sending you back three spaces can land you on the other deck, so one throw can turn over two cards.

The board is sized `width: min(100%, 80vh)` with `container-type: inline-size` on `.board` itself. Both halves matter: it previously used `100cqh`, and because nothing declared a `container-type` that unit had no query container and fell back to the whole viewport — sizing the board to the screen rather than to the space left under the topbar, so the board overflowed and had to be scrolled. The same silent fallback pinned the per-space `clamp(…, cqw, …)` font to its maximum.

`MonopolyGameState.rollCount` exists for two things that both break silently without it: the table keys its dice replay on it, and `monopolyTurnKey()` re-arms the shot clock on it. A double earns a second throw inside the same turn, so the turn number and the seat are both unchanged between a player's two throws — key on those alone and the second throw neither animates nor gets a fresh period. The table borrows Snakes & Ladders' `Die3D`, two of them, loaded async so three.js and cannon-es ship with the table rather than the app.

## Commands

**Bun is the runtime and the package manager**, for both sides — `bun install`, `bun run`, and `bun` itself serving the built server. There is no `package-lock.json`; `bun.lock` is the lockfile. Vitest still runs the tests under Node, because the suite leans on vitest's jsdom environments and Vue Test Utils.

| Command | What it does |
| --- | --- |
| `bun run dev` | Server on `:8787` (`bun --watch`) and Vite on `:5173`, concurrently |
| `bun run build` | `vue-tsc --noEmit`, then bundles client to `dist/` and server to `dist-server/index.js` |
| `bun start` | Runs the built server, which also serves `dist/` |
| `bun run test` | Full vitest suite, including the end-to-end game over real WebSockets |
| `bun run typecheck` | `vue-tsc --noEmit` over client, server, shared and tests |
| `cd e2e && bun run test` | Playwright, in its own standalone package — see below |

Run one test file: `bunx vitest run tests/rules.test.ts`. One case: `bunx vitest run -t "resolving a contest"`. Watch: `bun run test:watch`.

`tests/integration.test.ts` spawns a real server via `bun server/index.ts` on port 8899 and drives two scripted WebSocket clients through a whole game — it is slow and needs that port free. `render.test.ts` and `panzoom.test.ts` opt into jsdom with a per-file `// @vitest-environment jsdom` comment; there is no vitest config block, so everything else runs in node. Vitest reads `vite.config.ts`, so the `@` and `@shared` aliases work in tests too.

There is a dev-only visual harness at `http://localhost:5173/dev-preview.html?players=4&turns=30` (`&shape=circle` to pick a map, `&zoom=4&at=0.45,0.55` to inspect the zoomed view, `&capture=2` — or the `c` key — to pose a turn end so the capture flights to the seats that took the pieces play). It simulates a game locally via `src/preview.ts`, so the table can be checked without a server or four browsers.

## Architecture

```
shared/    rules, board, tiles, scoring, wire protocol — used by both sides
server/    WebSocket server: rooms, seats, reconnection, redaction, persistence
src/       Vue client: board rendering, hand, lobby, draft
```

**The server is authoritative.** `shared/engine.ts` (`Game`) owns the only real state and validates every action, returning `{ok: false, error}` for anything it rejects. The client imports the same `shared/rules.ts` functions purely to decide what to highlight and which hand tiles to enable — never to mutate state. When adding a rule, put it in `shared/rules.ts` and have both `Game` and `src/stores/game.ts` call it, rather than duplicating the logic client-side.

**Tile ids encode their definitions.** A tile id is `p{owner}-t{index}` where `index` indexes into `TILE_SET` in `shared/tiles.ts`, so `tileFromId()` reconstructs any tile anywhere. The protocol therefore only ever sends ids, which keeps messages small and makes it impossible to leak a hand by accident. Consequence: **reordering `TILE_SET` silently changes what every existing id means.** Append rather than reorder, and expect the client to rebuild tile data from ids (`src/stores/game.ts`, `tiles` computed).

**The board is never sent over the wire.** `buildBoard(playerCount)` is deterministic, so the client rebuilds it locally from `state.playerCount` and caches it by count.

**Redaction lives in one place:** `Room.stateFor(token)` in `server/rooms.ts` builds a per-viewer `ClientState`. A player's own stack never leaves the server, opponents' hands travel as counts only, and `captured` is `null` unless the room runs with open information or the game is over. Anything added to `ClientState` has to be redacted here deliberately. `othersLastPlaced` is the one field answered from *who is asking* rather than from what they are allowed to see: the engine keeps each seat's own most recent placement (`GameState.lastPlacedBy`), overwritten on that seat's `endTurn`, and `stateFor` sends the deduped union of every bucket but the viewer's own. It is deliberately not counted by round — a mark tied to the lap of the table vanished every time play came back to the viewer.

**Seat ids index into the running game**, so seats can only be renumbered between games. That single fact explains several behaviours: a player who disconnects mid-game keeps their seat (marked `connected: false`) and can reconnect into it; a player who disconnects before the game starts is simply removed; and `dropAbsentPlayers()` runs only on rematch/abandon. `ensureHost()` is called wherever someone might leave, so a room is never left without a host.

**Identity is a token in `localStorage`** (`samurai.token`), sent with the first `hello`. One socket per token — a reconnect closes the previous one. `RoomManager` maps token → room; `sockets` maps token → live socket. `hello` also carries the room code the client thinks it is at, so a server that has never heard of it replies `left` instead of leaving a dead board on screen.

**Rooms are written through to Postgres** when `DATABASE_URL` is set (`server/store.ts`); without it the server is memory-only and says so on startup. `Room.toSnapshot()` / `Room.fromSnapshot()` flatten a room to JSON, with `Game.fromState()` rebuilding the engine — the board and tile definitions are pure functions of the player count, so only `GameState` is stored. Every mutation site in `server/index.ts` calls `commit(room)` rather than `broadcast(room)`; that marks the room dirty and `RoomManager` coalesces the writes, one batch at a time, so the row can never end up holding an older snapshot than the one before it. Restored seats always come back `connected: false`, since no socket survives a restart. Note `jsonb` reorders object keys, so a snapshot is not byte-identical — nothing reads a room by key order, and `tests/persistence.test.ts` covers the round trip.

**A heartbeat runs both ways.** The server sends `{t:'ping'}` every `HEARTBEAT_MS` (`shared/protocol.ts`) and the client answers `{t:'pong'}`; either side treats silence for three intervals as a dead connection. This is what catches sockets that die without a close frame. The client reconnects with jittered exponential backoff, and immediately on `online` / `visibilitychange`.

**Client state flow:** `src/stores/game.ts` is a single Pinia store holding the connection, the last `ClientState`, and an `Interaction` discriminated union describing what the local player is currently being asked to click (`place` / `switch-first` / `switch-second` / `move-pick` / `move-destination`). Components read derived computeds (`highlightedSpaces`, `selectablePieces`, `playableTileIds`) and call store actions; they never talk to the socket. `App.vue` switches between Start / Lobby / Draft / Game screens off `game.phase`.

**Pan and zoom** (`src/composables/usePanZoom.ts`) works by driving the SVG `viewBox`, always giving it the container's aspect ratio so it never letterboxes — that is what makes zoom anchor exactly on the cursor or pinch midpoint. A drag that ends over a hex is swallowed in the capture phase so panning never places a tile.

## Board and tile data

The board in `shared/board.ts` is authored as text rows (`MAP_ROWS`) in odd-r offset coordinates: `~` sea, `.` land, `v`/`c`/`E` village/city/Edo. Rows carry a section A–E, nested so A is the two-player board, A+B three, and so on out to A+…+E at six. The section totals are load-bearing: settlement capacity must match the supply exactly (21 / 30 / 39 / 48 / 57 pieces) and cities and villages must each be a multiple of three, or `distributePieces()` throws. Sections are a function of how far a column sits from the map's centre — `outwardFrom(centre, edges)` — so widening a map means moving the centre too. Two maps measure differently. `circle` uses `ringsFrom(col, row, radii)`, a true distance from a point in the geometry the board is drawn in, so its sections are rings and every player count gets a round board. `serpent` uses `alongSpine(curve, edges)`, which puts every space in the section of the nearest point on a curve, measured by arc length from its middle — the only way to section a map that doubles back, since one column holds three separate stretches of that island. Both measure in drawn coordinates, which depend on row parity, so neither map can be shifted up or down a row without becoming a different lattice — mirror its columns if you ever need to. Editing the map means re-running `tests/board.test.ts`, which checks the arithmetic still works out at every player count.

**Five and six players are an extension, not a port.** The published game stops at four. Sections D and E are original outlying islands, the supply follows `3 × players + 1` per caste, and `setAsideLimit()` raises the four-set-aside ending to match the table — all three are choices, not rules, and none of them changes how two, three or four players play. The published maps are ringed by sea, so D reaches the mainland by taking the old outermost column, which is water on all three maps; that costs the four-player board ten spaces of open sea at its rim and leaves every land space, settlement and supply count untouched.

`GameOptions.shuffleMidgame` is a house rule, not a rule of the game: with it on, `Game.maybeShuffle()` fires once, the first time half the table's tiles have left hands and stacks, and permutes the placed tiles among the occupied spaces. Sea and land permute separately because that is the whole of what `legalPlacements()` checks, and it runs just before `resolveCaptures()` so a surround the shuffle completes is settled by the call already there. Off by default, chosen by whoever makes the room.

Two rules details the rulebook constrains without spelling out, already recorded in the source: the wild-tile breakdown in `TILE_SET`, and the board layout being an original map built to the printed board's structural rules rather than a copy. Capture order is resolved in board order because captures never remove tiles, so every order yields identical influence totals.

## Conventions

- Path aliases: `@/` → `src/`, `@shared/` → `shared/`. Server code uses relative `../shared/...` imports (it is bundled by `bun build`, not Vite).
- TypeScript is strict, with `noUnusedLocals`, `noUnusedParameters` and `verbatimModuleSyntax` — type-only imports must use `import type`.
- British spelling throughout the codebase (`colour`, `neighbours`, `centre`, `sanitise`).
- Comments explain *why*, not *what*, and are used sparingly on the non-obvious invariants above. Match that density.
- Shared form primitives — `.btn`, `.field`, `.linkish`, `.panel`, `.muted` — live in `src/assets/main.css`, **not** in a component's scoped block. `.field` and `.linkish` once lived in `HomeScreen.vue`; deleting that screen took the styling of every input in the app with it and left them as browser defaults, which is invisible to typechecks and to tests that only ask whether an input exists.
- Player colours live in `shared/colours.ts`, but the order they are dealt in does not: each room shuffles its own palette into `Room.colours` and stores it in the snapshot, so seat 0 is not always gold and a restart does not recolour the table. The paper/ink design tokens are CSS custom properties in `src/assets/main.css`.
- Game iconography is in `src/game/icons.ts`: inline 24×24 SVG silhouettes inheriting `currentColor`, plus raster art in `assets/` that `GameIcon` prefers when present. `assets/` is lowercase and imported by relative path — the case matters, because the Docker image builds on Linux even though macOS would not notice.

## The room, and the game it plays

**A room is a room first and a game second.** `StartScreen.vue` asks for a name
and then for one of two things — create a room, or join one by code. It shows no
games at all, not even as a list: which game gets played is the host's decision
and it is made in the lobby, with the table already seated. That ordering is the whole point — the old flow put the one
decision only the host makes in front of every guest, and a host who changed
their mind had to tear the room down and build another.

Nothing on the server was added for this. The game rides on `GameOptions.kind`,
`options` is already a host-only, lobby-only message, and `Room.start()` already
carried the comment about a table filling to eight for a card game and then
switching to Samurai. `setGameKind()` in the store is that same `options`
message with one field swapped, and the switch works because `handle()` calls
`clearStates()` before applying an incoming state: every game's slot is emptied,
so `room` cannot fall through to the game the table just left. A room created
before a game is picked is created with `DEFAULT_OPTIONS`, so it is a Samurai
room until someone says otherwise.

Two consequences worth knowing. **Seat capacity belongs to the game, not the
room**: a lobby can fill to eight for Coup and then be pointed at Samurai, which
seats six — `seatsFit()` greys that game out on the shelf, every lobby's
`canStart` checks `seats.length <= maxSeats`, `LobbySplit` says why in the action
bar, and `start()` refuses it on the server regardless. And **the settings a
game needs must live in its lobby**, because there is no longer a screen before
the room to collect them; Cop, Snakes & Ladders and Monopoly grew the controls
they used to get from the home screen.

**The host's half of the lobby is the shelf itself, not a button that opens
one.** `GamePicker` is rendered outright for the host with the table's game
marked `chosen`; everyone else gets a single card naming it and a line saying
whose choice it is. Two shapes rather than one greyed-out shelf, because a guest
reading eight disabled cards has to work out which one is the answer. Starting
is a separate button, and the game is never dealt by picking it.

**Turn order is chosen, not derived from who arrived first.** Each seat holds a
`position` from 1 to 8 — always eight, whatever the game seats — and a player
may take any position nobody else holds. Nothing is swapped or pushed along: the
position lives on the seat and on nothing else, so the one a player leaves is
vacant the instant they leave it, and a player who goes takes only their own
number with them.

The trick that keeps this out of the engines is `seatInPositionOrder()`, called
once on the way into a deal: it sorts the seats by position and renumbers their
ids. Every engine already plays its seats in id order, so **the chosen positions
become the turn order without a single engine learning what a position is**, and
vacant positions are skipped because they were never seats. It can only run
between games — seat ids index into a running game — which is also why positions
are locked once play starts. `duplicateSeating()` is a last look before the deal,
for the one case the setters cannot prevent: a room restored from a snapshot
written before positions existed, which is seated in stored order on the way in.

Note that `GameOptions.diceStart` still decides *where in that order* play
begins, if the table asked for a roll-off. The positions are the seating; the
roll picks the first to act.

**Every player picks their own colour, and only their own.** `LobbySplit`
renders the palette on the viewer's row alone, so there is no control on anyone
else's line to mis-tap. Colours another seat wears are disabled *and* struck
through — dimming alone reads as "not yet", and this is "that one is theirs".
The race is settled on the server: `Room.setColour()` refuses a colour another
seat holds, and requests are handled one at a time, so of two players reaching
for the same swatch the first to arrive keeps it and the second is told. The
client's disabling only saves the round trip.

**The lobby's action bar is a footer, never a sticky overlay.** It was sticky
first, and a stuck bar is lifted out of the flow: it covers whatever is beneath
it, and the browser scrolls a control to the bottom edge — which is under the
bar — when asked to bring it into view. `scroll-padding-bottom` does not help,
because the scroll-into-view path does not honour it. So the two columns are
wrapped in `.panes`, which is `display: contents` on a desktop (leaving that
grid exactly as it was) and the scrolling box on a phone, with the bar a sibling
that does not scroll. The Halli Galli suite found this by failing to tick the
last checkbox in its own lobby.

## Table talk

Monopoly has a chat, and it is the only thing in the app a player *types* rather
than clicks — which is the whole of why it is built the way it is.

It lives on `Room`, not in an engine: `Room.chat` is a list of `ChatEntry`, and
`say()` records what a player typed while `note()` records what the room did —
a seat filling, a player dropping out, a player coming back. Both go in the same
list so they read in the order they happened. It is on the room rather than in
`MonopolyGameState` because none of it is a game event: it survives a rematch,
and it is recorded whatever the table happens to be playing. Only
`monopolyStateFor()` sends it, which is why the other seven games have one
without knowing it.

**The redaction is one line and it is the important one.** `chat: seat ? this.chat
: []` sits on the `base` object both the lobby branch and the playing branch
spread, so the two cannot answer differently: a spectator watches the board and
is sent no talk at all, and `say()` refuses anyone without a seat. A room's talk
cannot reach another room because it never leaves the room object —
`tests/chat.test.ts` proves that with the same token seated at two tables at
once, which is the case most likely to leak.

**`sanitiseChat()` is not HTML escaping and deliberately does not strip `<` or
`>`.** "5 < 6" is a thing a person types. What makes a message carrying markup
harmless is that every client renders it through `{{ }}`, which escapes — no
part of this app puts chat through `v-html`, and the browser suite asserts that
a message containing `<img onerror=…>` creates no element and runs no script.
What the sanitiser removes is what plain text can still do on its own: control
characters, newlines included, so one message cannot become ten lines; and the
zero-width and bidirectional-override characters that let a string render in an
order other than the one it is stored in. The timestamp is stamped by the
server, never by the sender, or the order on screen could disagree with the
order in the list.

Two client details worth knowing. The feed follows the newest line only while
the reader is already at the bottom — scroll up to re-read something and it
stops dragging you back down, offering a count of what has arrived instead. And
the chat is kept *mounted* while hidden rather than swapped out, so a half-typed
line survives a look at the log; because a hidden element has no scroll height,
the `open` prop is what tells it to catch up when it comes back into view.

## Small screens

Every table is laid out for a phone as well as a desktop, and the two Samurai
and Monopoly screens carry most of the machinery. The shared parts: the
safe-area insets are taken **once**, on `.app` in `App.vue`, so no screen laid
out in the ordinary flow needs `env(safe-area-inset-*)` of its own — but a
dialog is `position: fixed` and sits outside that box, so each one carries its
own; `#app` is `100dvh` under an `@supports` guard, because a mobile toolbar
makes `100%` a moving target; and `@media (pointer: coarse)` in `main.css`
raises every `.btn` to 44px and `.btn.small` to 2.3rem, which is why individual
screens do not set touch sizes themselves.

**A breakpoint that exists in two places has to be kept in step.** Samurai
crosses over at 900px and Monopoly at 960px, and each is written twice: once as
a `matchMedia`-free `window.innerWidth` check in the component (which decides
what is *rendered* — a sheet, a tab bar, a teleport target) and once as a media
query (which decides how it is *laid out*). A resize listener re-answers the
question on rotation. Changing one without the other is silent.

**Neither game stacks its side columns under the board on a phone.** Both did
originally, and both left the board a strip a few hexes tall once the topbar,
the hand and a panel had taken their share. The panels are now sheets that lift
off the layout: bottom-anchored in portrait, drawers from the right in
landscape, closed by default, with a scrim. Samurai keeps its existing sidebar
handle as the way in; Monopoly grew a three-tab bar, where Players and the log
share one sheet and take turns in it.

**Monopoly's prompt is teleported, not duplicated.** The buy/auction/trade/debt/
jail/throw chain lives in the middle of the board on a desktop and moves to a
bar under the board below 960px — the same elements, carried by a `<Teleport>`
whose target is rendered *before* the board in source and after it by `order`,
so it exists on the first render. The wrapper is `display: contents` when it is
not teleported, which is what keeps the desktop centre panel byte-identical. Two
copies of that chain would be two chances for the table to disagree with the
server.

**The board's own tiles are sized by a container query, not a media query.**
`.board` declares `container-type: inline-size`, so `@container (max-width:
28rem)` asks the question that actually matters — how wide is the *board* — and
a landscape phone and a narrow desktop window get the same tile by different
routes. Under that width the price leaves the tile and the tap sheet gives it
back in full; on a desktop the query never fires.

**Snakes & Ladders is laid out by orientation, not only by width.** Its board
is one square SVG, so the axis that is scarce decides everything: upright, the
board takes the width and the die and the seats drop under it; on a phone held
sideways the columns stay and the board is sized by the height instead. The
stacking rule used to be width-only, which gave a landscape phone a board as
wide as the screen and therefore taller than it — the whole game became a
scroll. Between those two, `@media (max-width: 52rem)` alone makes both side
columns proportional, because a 768px window in landscape kept its desktop
column widths and left the board barely 300px; the browser tests caught that
one. The tokens need none of this: they are placed in the SVG's own units, so
they stay on their squares at every size without being told.

The one thing there that CSS cannot size is the die — it is a WebGL canvas with
a pixel size — so `dieSize` is computed in the component from `window`, and the
two widths it reads (832px, 544px) are the media queries written twice again,
kept in step by hand.

**A phone has no hover.** Monopoly's space card was `@mouseenter` only; a tap
now opens the same `SpaceDetail` as a sheet, and the hover handler returns early
below the breakpoint. Samurai's board has no hover to lose, but its log was
behind a shut sheet, so `MoveTicker` carries the latest line above the hand and
a button on it takes the board to the newest tile someone else played
(`usePanZoom.focusOn`, which never zooms *out*). Both games' log wording goes
through `src/game/log.ts` so the ticker and the panel read a seat the same way.

## Browser tests

`e2e/` holds a Playwright suite, one spec per game, driving two real browser
contexts through a whole table. It is **standalone**: its own `package.json`,
`node_modules` and `tsconfig.json`, and nothing in the app refers to it. Run it
with `cd e2e && bun install && bunx playwright install chromium && bun run test`.

Two traps live in there. The specs are named `*.e2e.ts` rather than `*.spec.ts`
because Vitest runs from the repository root and its default include takes every
`*.spec.ts` under it — a Playwright spec named that way is swept into the unit
suite and run under jsdom, where `@playwright/test` cannot even be imported. And
the suite hosts every room with the opening roll-off turned off: it decides
nothing, but it is a two-second overlay over the table and waiting it out is how
a suite starts flaking.

It has already earned its keep twice: draft tiles on a phone were overflowing
their box and sitting on top of Samurai's Confirm button, and every game's
primary buttons were 38px on a touch screen rather than 44.

## CI and deployment

Two workflows, split by what they are for. `.github/workflows/test.yml` runs on pull requests to `main`: `bun run typecheck`, then vitest and Playwright, each split four ways with `--shard` across a matrix of runners — which is also what keeps `tests/integration.test.ts` off a contended port 8899. The browser shards run in `mcr.microsoft.com/playwright`, whose tag must match the pinned `@playwright/test`. `.github/workflows/docker-publish.yml` runs on a push to `main` or a `v*` tag and does no testing: it publishes a multi-arch image to GHCR and pokes Coolify's webhook. The pull request is the gate, so a commit pushed straight to `main` ships untested. The runtime image copies just `dist/` and the self-contained `dist-server/index.js`, with no `node_modules`. `PORT`, `HOST` and `STATIC_DIR` are the server's env vars; `/healthz` returns `{ok, rooms}`.
