import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize, resolve } from 'node:path'

import { WebSocketServer, type WebSocket } from 'ws'

import { DEFAULT_BOARD_SHAPE } from '../shared/board'
import { TURN_SECONDS_CHOICES } from '../shared/engine'
import type { ClientMessage, ServerMessage } from '../shared/protocol'
import { CLOSE_REPLACED, HEARTBEAT_MS, PROTOCOL_VERSION } from '../shared/protocol'
import { SNAKE_TICK_MS } from '../shared/snake'
import { BOARD_SHAPES, GAME_KINDS, maxPlayersFor } from '../shared/types'
import { RoomManager, type Room } from './rooms'
import { PostgresRoomStore, type RoomStore } from './store'

const PORT = Number(process.env.PORT ?? 8787)
const HOST = process.env.HOST ?? '0.0.0.0'
/** Where the built client lives. Overridable so the container layout is free. */
const DIST = resolve(process.env.STATIC_DIR ?? resolve(process.cwd(), 'dist'))
/** Set to keep rooms across restarts; without it the server is memory-only. */
const DATABASE_URL = process.env.DATABASE_URL ?? ''

const rooms = new RoomManager()
let store: RoomStore | null = null
/** Live sockets by client token. One socket per token; a reconnect replaces it. */
const sockets = new Map<string, WebSocket>()
/** When each socket was last heard from, for dropping ones that went silent. */
const lastSeen = new WeakMap<WebSocket, number>()

// ---------------------------------------------------------------------------
// Static hosting (production build); in dev, Vite serves the client instead.
// ---------------------------------------------------------------------------

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
}

const http = createServer(async (req, res) => {
  if (req.url === '/healthz') {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ ok: true, rooms: rooms.size }))
    return
  }
  try {
    const requested = normalize(decodeURIComponent((req.url ?? '/').split('?')[0]))
    let file = join(DIST, requested)
    if (!file.startsWith(DIST)) throw new Error('outside root')
    const found = await stat(file).catch(() => null)
    if (!found || found.isDirectory()) file = join(DIST, 'index.html')
    const body = await readFile(file)
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' })
    res.end(body)
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' })
    res.end('Not found. Run `npm run build` to produce the client bundle.')
  }
})

// ---------------------------------------------------------------------------
// WebSocket game protocol
// ---------------------------------------------------------------------------

const wss = new WebSocketServer({ server: http, path: '/ws' })

function send(socket: WebSocket, message: ServerMessage) {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message))
}

function fail(socket: WebSocket, message: string) {
  send(socket, { t: 'error', message })
}

/**
 * Push fresh, individually redacted state to everyone in the room.
 *
 * `exceptToken` skips one client. A player leaving mid-game keeps their seat —
 * seat ids index into the running game and cannot be renumbered — so without
 * this they would be sent a state right after being told they left, and their
 * browser would drop straight back into the table.
 */
function broadcast(room: Room, exceptToken?: string) {
  for (const seat of room.seats) {
    if (seat.token === exceptToken) continue
    const socket = sockets.get(seat.token)
    if (socket) send(socket, { t: 'state', state: room.stateFor(seat.token) })
  }
}

/** Broadcast a change and queue the room to be written back to the database. */
function commit(room: Room, exceptToken?: string) {
  rooms.markDirty(room)
  // Before the state is built, not after: ending a turn hands the clock to the
  // next player, and a broadcast that went out first would tell everyone what
  // was left of the *previous* player's period and then never correct itself,
  // since the tick below only speaks up when a deadline actually passes.
  room.syncTurnTimer()
  broadcast(room, exceptToken)
}

wss.on('connection', (socket) => {
  let token: string | null = null
  lastSeen.set(socket, Date.now())

  const roomOfThisClient = (): Room | undefined => (token ? rooms.roomOf(token) : undefined)

  socket.on('message', (raw) => {
    lastSeen.set(socket, Date.now())

    let msg: ClientMessage
    try {
      msg = JSON.parse(String(raw)) as ClientMessage
    } catch {
      return fail(socket, 'Malformed message.')
    }

    if (msg.t === 'pong') return

    // The first message must establish (or restore) this client's identity.
    if (msg.t === 'hello') {
      const next = msg.token && /^[0-9a-f-]{36}$/i.test(msg.token) ? msg.token : rooms.newToken()
      // Saying hello again under another name — a tab reclaiming a seat it
      // already holds at the table it is joining — would otherwise leave the
      // old name pointing at this socket long after it stopped meaning anything.
      if (token && token !== next && sockets.get(token) === socket) sockets.delete(token)
      token = next
      const previous = sockets.get(token)
      if (previous && previous !== socket) {
        previous.close(CLOSE_REPLACED, 'Replaced by a newer connection.')
      }
      sockets.set(token, socket)
      send(socket, { t: 'hello', token, version: PROTOCOL_VERSION })

      const room = rooms.roomOf(token)
      if (room) {
        const seat = room.seatByToken(token)
        if (seat) seat.connected = true
        room.touch()
        commit(room)
        send(socket, { t: 'state', state: room.stateFor(token) })
      } else if (msg.code) {
        // The client thinks it is at a table this server knows nothing about —
        // an expired room, or one from before a restart that lost its data.
        // Tell it so, rather than leaving a dead board on screen.
        send(socket, { t: 'left' })
      }
      return
    }

    if (!token) return fail(socket, 'Say hello first.')
    const activeToken = token

    if (msg.t === 'create') {
      const existing = rooms.roomOf(activeToken)
      if (existing) existing.removeSeat(activeToken)
      const room = rooms.create()
      room.options = sanitiseOptions(msg.options)
      room.addSeat(activeToken, msg.name)
      rooms.bind(activeToken, room)
      commit(room)
      return
    }

    if (msg.t === 'join') {
      const room = rooms.get(msg.code ?? '')
      if (!room) return fail(socket, 'No room with that code.')
      const existing = room.seatByToken(activeToken)
      if (!existing) {
        if (room.started) return fail(socket, 'That game has already started.')
        if (room.seats.length >= maxPlayersFor(room.options.kind))
          return fail(socket, 'That room is full.')
        const previous = rooms.roomOf(activeToken)
        if (previous && previous !== room) previous.removeSeat(activeToken)
        room.addSeat(activeToken, msg.name)
      } else {
        existing.connected = true
      }
      rooms.bind(activeToken, room)
      commit(room)
      return
    }

    const room = roomOfThisClient()
    if (!room) return fail(socket, 'You are not in a room.')
    const seat = room.seatByToken(activeToken)

    switch (msg.t) {
      case 'leave': {
        room.removeSeat(activeToken)
        rooms.unbind(activeToken)
        // Someone still at the table has to be able to end or restart the game.
        room.ensureHost()
        send(socket, { t: 'left' })
        commit(room, activeToken)
        return
      }

      case 'rename': {
        if (!seat) return fail(socket, 'You have no seat in this room.')
        seat.name = String(msg.name ?? '').trim().slice(0, 18) || seat.name
        room.touch()
        commit(room)
        return
      }

      case 'colour': {
        const error = room.setColour(activeToken, msg.colour)
        if (error) return fail(socket, error)
        commit(room)
        return
      }

      case 'renameTeam': {
        const error = room.renameTeam(activeToken, msg.team, msg.name)
        if (error) return fail(socket, error)
        commit(room)
        return
      }

      case 'options': {
        if (!room.isHost(activeToken)) return fail(socket, 'Only the host can change settings.')
        if (room.started) return fail(socket, 'The game has already started.')
        room.options = sanitiseOptions(msg.options)
        room.touch()
        commit(room)
        return
      }

      case 'start': {
        if (!room.isHost(activeToken)) return fail(socket, 'Only the host can start the game.')
        const error = room.start()
        if (error) return fail(socket, error)
        commit(room)
        return
      }

      case 'rematch': {
        if (!room.isHost(activeToken)) return fail(socket, 'Only the host can start a rematch.')
        const error = room.rematch()
        if (error) return fail(socket, error)
        commit(room)
        return
      }

      case 'abandon': {
        if (!room.isHost(activeToken)) return fail(socket, 'Only the host can end the game.')
        const error = room.abandon()
        if (error) return fail(socket, error)
        commit(room)
        return
      }

      default:
        break
    }

    // Halli Galli is a separate engine sharing this room; its actions route here
    // rather than through the Samurai game below.
    if (room.hg) {
      if (!seat) return fail(socket, 'You are watching this game, not playing it.')
      const hg = room.hg
      const outcome = (() => {
        switch (msg.t) {
          case 'flip':
            return hg.flip(seat.id)
          case 'slap':
            return hg.slap(seat.id)
          case 'pause':
            return hg.pause(seat.id)
          case 'resume':
            return hg.resume(seat.id)
          default:
            return { ok: false as const, error: 'Unknown action.' }
        }
      })()
      if (!outcome.ok) return fail(socket, outcome.error)
      room.touch()
      commit(room)
      return
    }

    // Coup likewise: its own engine, routed before the Samurai game below.
    if (room.coup) {
      if (!seat) return fail(socket, 'You are watching this game, not playing it.')
      const coup = room.coup
      const outcome = (() => {
        switch (msg.t) {
          case 'coupAct':
            return coup.declare(seat.id, msg.action, msg.target ?? null)
          case 'coupChallenge':
            return coup.challenge(seat.id)
          case 'coupBlock':
            return coup.block(seat.id, msg.character)
          case 'coupPass':
            return coup.pass(seat.id)
          case 'coupLose':
            return coup.loseInfluence(seat.id, msg.character)
          case 'coupExchange':
            return coup.exchange(seat.id, msg.keep ?? [])
          case 'pause':
            return coup.pause(seat.id)
          case 'resume':
            return coup.resume(seat.id)
          default:
            return { ok: false as const, error: 'Unknown action.' }
        }
      })()
      if (!outcome.ok) return fail(socket, outcome.error)
      room.touch()
      commit(room)
      return
    }

    // Carnivals likewise: its own engine, routed before the Samurai game below.
    if (room.carn) {
      if (!seat) return fail(socket, 'You are watching this game, not playing it.')
      const carn = room.carn
      const outcome = (() => {
        switch (msg.t) {
          case 'carnivalAct':
            switch (msg.move) {
              case 'select':
                return carn.select(seat.id, msg.red ?? 0, msg.blue ?? 0)
              case 'check':
                return carn.check(seat.id)
              case 'call':
                return carn.call(seat.id)
              case 'raise':
                return carn.raise(seat.id, msg.to ?? 0)
              case 'allIn':
                return carn.allIn(seat.id)
              case 'fold':
                return carn.fold(seat.id)
              case 'reveal':
                return carn.reveal(seat.id)
              case 'next':
                return carn.nextHand(seat.id)
              default:
                return { ok: false as const, error: 'Unknown move.' }
            }
          case 'pause':
            return carn.pause(seat.id)
          case 'resume':
            return carn.resume(seat.id)
          default:
            return { ok: false as const, error: 'Unknown action.' }
        }
      })()
      if (!outcome.ok) return fail(socket, outcome.error)
      room.touch()
      commit(room)
      return
    }

    // COP likewise: its own engine, routed before the Samurai game below.
    if (room.cop) {
      if (!seat) return fail(socket, 'You are watching this game, not playing it.')
      const cop = room.cop
      const outcome = (() => {
        switch (msg.t) {
          case 'copSelect':
            return cop.select(seat.id, msg.room)
          case 'copSearch':
            return cop.search(seat.id, msg.doorA, msg.doorB)
          case 'copConfiscate':
            return cop.confiscate(seat.id, msg.takings ?? {})
          case 'copNext':
            return cop.next(seat.id)
          case 'pause':
            return cop.pause(seat.id)
          case 'resume':
            return cop.resume(seat.id)
          default:
            return { ok: false as const, error: 'Unknown action.' }
        }
      })()
      if (!outcome.ok) return fail(socket, outcome.error)
      room.touch()
      commit(room)
      return
    }

    // Snake likewise: its own engine, routed before the Samurai game below.
    if (room.snake) {
      if (!seat) return fail(socket, 'You are watching this game, not playing it.')
      const sn = room.snake
      const outcome = (() => {
        switch (msg.t) {
          case 'snakeDir':
            return sn.setDirection(seat.id, msg.dir)
          case 'pause':
            return sn.pause(seat.id)
          case 'resume':
            return sn.resume(seat.id)
          default:
            return { ok: false as const, error: 'Unknown action.' }
        }
      })()
      if (!outcome.ok) return fail(socket, outcome.error)
      room.touch()
      // A steer shows nothing until the next frame, which the frame clock below
      // broadcasts anyway — a state per keypress would only double the traffic.
      if (msg.t !== 'snakeDir') commit(room)
      return
    }

    // Everything below is a game action and needs a seat and a running game.
    if (!seat) return fail(socket, 'You are watching this game, not playing it.')
    const game = room.game
    if (!game) return fail(socket, 'The game has not started yet.')

    const outcome = (() => {
      switch (msg.t) {
        case 'draft':
          return game.submitDraft(seat.id, msg.picks ?? [])
        case 'play':
          return game.playTile(seat.id, msg.tileId, msg.spaceId)
        case 'switch':
          return game.useSwitch(seat.id, msg.tileId, msg.a, msg.b)
        case 'move':
          return game.useMove(seat.id, msg.tileId, msg.from, msg.to)
        case 'undo':
          return game.undoLast(seat.id)
        case 'endTurn':
          return game.endTurn(seat.id)
        case 'redraw':
          return game.redrawHand(seat.id)
        case 'pause':
          return game.pause(seat.id)
        case 'resume':
          return game.resume(seat.id)
        default:
          return { ok: false as const, error: 'Unknown action.' }
      }
    })()

    if (!outcome.ok) return fail(socket, outcome.error)
    room.touch()
    commit(room)
  })

  socket.on('close', () => {
    if (!token) return
    if (sockets.get(token) === socket) sockets.delete(token)
    const room = rooms.roomOf(token)
    if (!room) return
    const seat = room.seatByToken(token)
    if (seat) seat.connected = false
    // A player who has not started yet just leaves; mid-game, the seat is kept
    // so they can reconnect and pick up where they left off.
    if (!room.started) room.removeSeat(token)
    // Someone still present has to be able to end or restart the game.
    room.ensureHost()
    commit(room)
  })
})

function sanitiseOptions(options: unknown) {
  const o = (options ?? {}) as Record<string, unknown>
  // An unknown shape falls back to the default rather than being rejected, so a
  // stale or hand-rolled client can never leave a room unable to deal a board.
  const shape = BOARD_SHAPES.find((s) => s === o.boardShape) ?? DEFAULT_BOARD_SHAPE
  const seconds = TURN_SECONDS_CHOICES.find((s) => s === Number(o.turnSeconds)) ?? 0
  // The number of sides, or 0 for a free-for-all; anything under two is neither.
  // The start check is what holds it to a split that fits the player count.
  const teamsRaw = typeof o.teams === 'boolean' ? (o.teams ? 2 : 0) : Math.floor(Number(o.teams))
  const teams = Number.isFinite(teamsRaw) && teamsRaw >= 2 ? teamsRaw : 0
  const kind = GAME_KINDS.find((k) => k === o.kind) ?? 'samurai'
  return {
    kind,
    randomHands: Boolean(o.randomHands),
    openInformation: Boolean(o.openInformation),
    boardShape: shape,
    turnSeconds: seconds,
    teams,
    // Absent on a client that predates the option, which should still get the
    // roll rather than silently losing it, so this defaults on rather than off.
    diceStart: o.diceStart === undefined ? true : Boolean(o.diceStart),
    shuffleMidgame: Boolean(o.shuffleMidgame),
  }
}

/**
 * The shot clock. One sweep for every room beats a timer per room: it needs
 * nothing reinstated when a room is restored from the database, and it cannot
 * leak a handle when a room is swept away.
 *
 * A timeout that the engine somehow refuses still re-arms, so a room that
 * cannot be advanced retries once a period instead of once a tick.
 */
setInterval(() => {
  for (const room of rooms.dueTurns()) {
    const game = room.game
    if (game) {
      const outcome = game.timeOut(game.state.current)
      if (outcome.ok) room.touch()
    } else if (room.coup) {
      // Coup settles whatever the pending stack is asking, which is often a
      // response owed by someone other than the player whose turn it is.
      if (room.coup.timeOut().ok) room.touch()
    } else if (room.carn) {
      // Carnivals folds (or checks) for an absent bettor, and deals the next
      // hand when the table is idle on a showdown nobody has moved past.
      if (room.carn.timeOut().ok) room.touch()
    } else if (room.cop) {
      // COP settles whatever the round is waiting on: hides an absent thief, opens
      // the Cop's doors, waves an unmade arrest through, or deals the next round.
      if (room.cop.timeOut().ok) room.touch()
    }
    room.rearmTurnTimer()
    commit(room)
  }
}, 1000).unref()

/**
 * The Snake frame clock: one sweep advances every running game a frame. Frames
 * are broadcast but not written to the database — five rows a second per table
 * buys nothing a restart could use, since a restored table waits paused-in-
 * effect until someone reconnects anyway. The row is written when something
 * durable happens: the game ending here, or pause/resume/start on their paths.
 */
setInterval(() => {
  for (const room of rooms.tickableSnakes()) {
    room.snake!.tick()
    room.touch()
    if (room.snake!.state.phase === 'over') commit(room)
    else broadcast(room)
  }
}, SNAKE_TICK_MS).unref()

/**
 * A heartbeat both ways. The ping gives the browser something to hear, so a
 * connection that died without a close frame — a laptop lid, a proxy timing the
 * socket out — is noticed and reconnected instead of sitting there looking open.
 * The reply tells us the same about clients, so their seats free up.
 */
setInterval(() => {
  const cutoff = Date.now() - HEARTBEAT_MS * 3
  for (const socket of wss.clients) {
    if ((lastSeen.get(socket) ?? 0) < cutoff) socket.terminate()
    else send(socket, { t: 'ping' })
  }
}, HEARTBEAT_MS).unref()

setInterval(() => rooms.sweep(), 1000 * 60 * 5).unref()

/**
 * The in-memory sweep deletes a room's row as it drops the room, but only for
 * rooms this process is holding. A row written by an instance that was killed
 * before it swept is never claimed by anyone, so the table is also pruned by
 * age directly. Nothing playable is at risk: a room is dropped from memory
 * after three idle hours, far short of this.
 */
const ROOM_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 2
const PRUNE_EVERY_MS = 1000 * 60 * 60

async function pruneOldRooms() {
  if (!store) return
  try {
    const gone = await store.pruneCreatedBefore(new Date(Date.now() - ROOM_MAX_AGE_MS))
    if (gone) console.log(`[db] pruned ${gone} room(s) older than two days.`)
  } catch (error) {
    console.error('[db] could not prune old rooms:', (error as Error).message)
  }
}

async function main() {
  if (DATABASE_URL) {
    store = await PostgresRoomStore.connect(DATABASE_URL)
    // Prune before restoring, so stale rows are not read back into memory only
    // to be swept out again a few minutes later.
    await pruneOldRooms()
    setInterval(pruneOldRooms, PRUNE_EVERY_MS).unref()
    const restored = await rooms.restore(store)
    console.log(`Restored ${restored} room(s) from the database.`)
  } else {
    console.warn('DATABASE_URL is not set — rooms are kept in memory and lost on restart.')
  }

  http.listen(PORT, HOST, () => {
    console.log(`Samurai server listening on http://${HOST}:${PORT} (serving ${DIST})`)
  })
}

main().catch((error) => {
  console.error('Failed to start:', error)
  process.exit(1)
})

// Containers stop with SIGTERM; exit promptly instead of waiting to be killed.
let stopping = false
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    if (stopping) process.exit(0)
    stopping = true
    wss.close()
    http.close()
    // Let the last move reach the database before the process goes away.
    rooms
      .drain()
      .then(() => store?.close())
      .catch(() => {})
      .finally(() => process.exit(0))
    setTimeout(() => process.exit(0), 5000).unref()
  })
}
