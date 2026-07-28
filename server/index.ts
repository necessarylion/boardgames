import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize, resolve } from 'node:path'

import { WebSocketServer, type WebSocket } from 'ws'

import type { ClientMessage, ServerMessage } from '../shared/protocol'
import { HEARTBEAT_MS, PROTOCOL_VERSION } from '../shared/protocol'
import { MAX_PLAYERS, RoomManager, type Room } from './rooms'
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
      token = msg.token && /^[0-9a-f-]{36}$/i.test(msg.token) ? msg.token : rooms.newToken()
      const previous = sockets.get(token)
      if (previous && previous !== socket) previous.close(4000, 'Replaced by a newer connection.')
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
        if (room.seats.length >= MAX_PLAYERS) return fail(socket, 'That room is full.')
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
        case 'endTurn':
          return game.endTurn(seat.id)
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
  return {
    randomHands: Boolean(o.randomHands),
    openInformation: Boolean(o.openInformation),
  }
}

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

async function main() {
  if (DATABASE_URL) {
    store = await PostgresRoomStore.connect(DATABASE_URL)
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
