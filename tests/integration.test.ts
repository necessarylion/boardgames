import { DEFAULT_OPTIONS } from '../shared/engine'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { spawn, type ChildProcess } from 'node:child_process'
import { WebSocket } from 'ws'

import type { ClientMessage, ClientState, ServerMessage } from '../shared/protocol'
import { legalPlacements } from '../shared/rules'
import { buildBoard } from '../shared/board'
import { tileFromId } from '../shared/tiles'

const PORT = 8899
const URL = `ws://localhost:${PORT}/ws`

let server: ChildProcess

/** A scripted client that mirrors what the browser app does over the wire. */
class TestClient {
  socket!: WebSocket
  token: string | null = null
  state: ClientState | null = null
  errors: string[] = []
  private waiters: (() => void)[] = []

  async connect(token: string | null = null) {
    this.socket = new WebSocket(URL)
    await new Promise<void>((resolve, reject) => {
      this.socket.once('open', () => resolve())
      this.socket.once('error', reject)
    })
    this.socket.on('message', (raw) => {
      const message = JSON.parse(String(raw)) as ServerMessage
      if (message.t === 'hello') this.token = message.token
      // This harness only ever drives Samurai games, so the state is one.
      if (message.t === 'state') this.state = message.state as ClientState
      if (message.t === 'error') this.errors.push(message.message)
      if (message.t === 'left') this.state = null
      this.waiters.splice(0).forEach((resolve) => resolve())
    })
    this.send({ t: 'hello', token })
    await this.settle()
  }

  send(message: ClientMessage) {
    this.socket.send(JSON.stringify(message))
  }

  /** Wait for the next server message, then let the event loop drain. */
  async settle(): Promise<void> {
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 400)
      this.waiters.push(() => {
        clearTimeout(timer)
        resolve()
      })
    })
    await new Promise((resolve) => setTimeout(resolve, 30))
  }

  close() {
    this.socket.close()
  }
}

beforeAll(async () => {
  server = spawn('bun', ['server/index.ts'], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: 'ignore',
  })
  // Wait for the port to accept connections.
  for (let i = 0; i < 60; i++) {
    try {
      const probe = new WebSocket(URL)
      await new Promise<void>((resolve, reject) => {
        probe.once('open', () => {
          probe.close()
          resolve()
        })
        probe.once('error', reject)
      })
      return
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
  }
  throw new Error('the test server never came up')
}, 30_000)

afterAll(() => server?.kill())

describe('two browsers playing over the wire', () => {
  it('creates a room, joins, plays a full game and scores it', async () => {
    const host = new TestClient()
    const guest = new TestClient()
    await host.connect()
    await guest.connect()
    expect(host.token).toBeTruthy()
    expect(guest.token).not.toBe(host.token)

    host.send({ t: 'create', name: 'Takeda', options: { ...DEFAULT_OPTIONS, randomHands: true, openInformation: false } })
    await host.settle()
    const code = host.state!.code
    expect(host.state!.phase).toBe('lobby')
    expect(host.state!.you).toBe(0)

    guest.send({ t: 'join', code, name: 'Uesugi' })
    await guest.settle()
    await host.settle()
    expect(guest.state!.you).toBe(1)
    expect(host.state!.players).toHaveLength(2)

    // Only the host may start.
    guest.send({ t: 'start' })
    await guest.settle()
    expect(guest.errors.at(-1)).toMatch(/host/i)

    host.send({ t: 'start' })
    await host.settle()
    await guest.settle()
    expect(host.state!.phase).toBe('play')
    expect(host.state!.hand).toHaveLength(5)

    // Neither player can see the other's hand or captured pieces.
    expect(host.state!.players[1].captured).toBeNull()
    expect(JSON.stringify(host.state!)).not.toContain('"p1-t')

    // Who opens is drawn by the server, so the two roles are worked out from the
    // state rather than assumed to be host and guest. Assuming it made this a
    // coin toss: half the time the "out of turn" player was the one on turn, and
    // their play got past the turn check to fail on something else entirely.
    const mover = host.state!.current === host.state!.you ? host : guest
    const waiter = mover === host ? guest : host

    // A player cannot act out of turn.
    const waiterTile = waiter.state!.hand[0]
    waiter.send({ t: 'play', tileId: waiterTile, spaceId: buildBoard(2).order[0] })
    await waiter.settle()
    expect(waiter.errors.at(-1)).toMatch(/not your turn/i)

    // Take-backs, over the wire: place, undo, and confirm the server really
    // rewound rather than the client merely hiding the tile.
    {
      const handBefore = [...mover.state!.hand]
      const moverView = {
        board: buildBoard(mover.state!.playerCount),
        pieces: mover.state!.pieces,
        placed: mover.state!.placed,
        tiles: Object.fromEntries(mover.state!.hand.map((id) => [id, tileFromId(id)])),
        playerCount: mover.state!.playerCount,
      }
      const tile = mover.state!.hand.map(tileFromId).find(
        (t) => t.kind !== 'switch' && t.kind !== 'move' && legalPlacements(moverView, t).length > 0,
      )!
      const space = legalPlacements(moverView, tile)[0]

      expect(mover.state!.canUndo).toBe(false)
      mover.send({ t: 'play', tileId: tile.id, spaceId: space })
      await mover.settle()
      await waiter.settle()
      expect(mover.state!.placed[space]).toBeDefined()
      expect(mover.state!.canUndo).toBe(true)
      // Only the player whose turn it is may take anything back.
      expect(waiter.state!.canUndo).toBe(false)

      waiter.send({ t: 'undo' })
      await waiter.settle()
      expect(waiter.errors.at(-1)).toMatch(/not your turn/i)
      expect(mover.state!.placed[space]).toBeDefined()

      mover.send({ t: 'undo' })
      await mover.settle()
      await waiter.settle()
      expect(mover.state!.placed[space]).toBeUndefined()
      expect(mover.state!.hand.slice().sort()).toEqual(handBefore.slice().sort())
      expect(mover.state!.canUndo).toBe(false)
      // The other player's board really rewound too, not just the mover's.
      expect(waiter.state!.placed[space]).toBeUndefined()

      mover.send({ t: 'undo' })
      await mover.settle()
      expect(mover.errors.at(-1)).toMatch(/nothing to take back/i)
    }

    // Play the game out with legal moves until the server declares it over.
    const clients = [host, guest]
    let guard = 0
    while (host.state!.phase === 'play' && guard++ < 400) {
      const seat = host.state!.current
      const client = clients[seat]
      const state = client.state!
      const view = {
        board: buildBoard(state.playerCount),
        pieces: state.pieces,
        placed: state.placed,
        tiles: Object.fromEntries(
          Object.values(state.placed).map((p) => [p.tileId, tileFromId(p.tileId)]),
        ),
        playerCount: state.playerCount,
      }

      const playable = state.hand
        .map(tileFromId)
        .filter((t) => t.kind !== 'switch' && t.kind !== 'move')
        .filter((t) => t.fast || !state.playedNonFast)
        .map((t) => ({ tile: t, targets: legalPlacements(view, t) }))
        .filter((o) => o.targets.length > 0)

      if (playable.length) {
        const choice = playable[guard % playable.length]
        client.send({
          t: 'play',
          tileId: choice.tile.id,
          spaceId: choice.targets[guard % choice.targets.length],
        })
        await client.settle()
        await clients[1 - seat].settle()
      }

      client.send({ t: 'endTurn' })
      await client.settle()
      await clients[1 - seat].settle()
    }

    expect(host.state!.phase).toBe('over')
    expect(host.state!.result).not.toBeNull()
    expect(host.state!.result!.winners.length).toBeGreaterThan(0)
    // Both clients agree on the outcome, and captures are revealed at the end.
    expect(guest.state!.result!.winners).toEqual(host.state!.result!.winners)
    expect(host.state!.players[1].captured).not.toBeNull()

    host.close()
    guest.close()
  }, 60_000)

  it('lets the host end a game in progress and deal a new one', async () => {
    const host = new TestClient()
    const guest = new TestClient()
    await host.connect()
    await guest.connect()

    host.send({ t: 'create', name: 'Host', options: { ...DEFAULT_OPTIONS, randomHands: true, openInformation: false } })
    await host.settle()
    const code = host.state!.code
    guest.send({ t: 'join', code, name: 'Guest' })
    await guest.settle()
    host.send({ t: 'start' })
    await host.settle()
    await guest.settle()
    expect(host.state!.phase).toBe('play')

    // Only the host may end it.
    guest.send({ t: 'abandon' })
    await guest.settle()
    expect(guest.errors.at(-1)).toMatch(/host/i)
    expect(guest.state!.phase).toBe('play')

    host.send({ t: 'abandon' })
    await host.settle()
    await guest.settle()

    // Both clients are back in the lobby with their seats intact.
    expect(host.state!.phase).toBe('lobby')
    expect(guest.state!.phase).toBe('lobby')
    expect(guest.state!.you).toBe(1)
    expect(host.state!.players.map((p) => p.name)).toEqual(['Host', 'Guest'])

    // Settings can be changed, then a whole new game dealt.
    host.send({ t: 'options', options: { ...DEFAULT_OPTIONS, randomHands: true, openInformation: true } })
    await host.settle()
    host.send({ t: 'start' })
    await host.settle()
    await guest.settle()
    expect(host.state!.phase).toBe('play')
    expect(host.state!.options.openInformation).toBe(true)
    expect(host.state!.hand).toHaveLength(5)
    expect(Object.keys(host.state!.placed)).toHaveLength(0)

    host.close()
    guest.close()
  }, 30_000)

  it('returns a player to the start screen when they leave mid-game', async () => {
    const host = new TestClient()
    const guest = new TestClient()
    await host.connect()
    await guest.connect()

    host.send({ t: 'create', name: 'Host', options: { ...DEFAULT_OPTIONS, randomHands: true, openInformation: false } })
    await host.settle()
    guest.send({ t: 'join', code: host.state!.code, name: 'Guest' })
    await guest.settle()
    host.send({ t: 'start' })
    await host.settle()
    await guest.settle()
    expect(guest.state!.phase).toBe('play')

    guest.send({ t: 'leave' })
    await guest.settle()
    // Nothing the server sends afterwards may pull them back to the table.
    await guest.settle()
    expect(guest.state).toBeNull()

    // The player still at the table sees the seat marked as away.
    await host.settle()
    expect(host.state!.players[1].connected).toBe(false)
    expect(host.state!.phase).toBe('play')

    // A reload does not put them back either: the seat is no longer theirs.
    const returning = new TestClient()
    await returning.connect(guest.token)
    await returning.settle()
    expect(returning.state).toBeNull()

    host.close()
    guest.close()
    returning.close()
  }, 30_000)

  it('returns a player to the start screen when they leave the lobby', async () => {
    const host = new TestClient()
    const guest = new TestClient()
    await host.connect()
    await guest.connect()

    host.send({ t: 'create', name: 'Host', options: { ...DEFAULT_OPTIONS, randomHands: true, openInformation: false } })
    await host.settle()
    guest.send({ t: 'join', code: host.state!.code, name: 'Guest' })
    await guest.settle()
    expect(guest.state!.you).toBe(1)

    guest.send({ t: 'leave' })
    await guest.settle()
    await guest.settle()
    expect(guest.state).toBeNull()

    // Their seat is freed, so the table is back to one player.
    await host.settle()
    expect(host.state!.players.map((p) => p.name)).toEqual(['Host'])

    host.close()
    guest.close()
  }, 30_000)

  it('hands the host role over when the host leaves mid-game', async () => {
    const host = new TestClient()
    const guest = new TestClient()
    await host.connect()
    await guest.connect()

    host.send({ t: 'create', name: 'Host', options: { ...DEFAULT_OPTIONS, randomHands: true, openInformation: false } })
    await host.settle()
    guest.send({ t: 'join', code: host.state!.code, name: 'Guest' })
    await guest.settle()
    host.send({ t: 'start' })
    await host.settle()
    await guest.settle()

    host.send({ t: 'leave' })
    await host.settle()
    await guest.settle()

    // The remaining player becomes host and can end the stalled game.
    expect(guest.state!.hostId).toBe(1)
    guest.send({ t: 'abandon' })
    await guest.settle()
    expect(guest.state!.phase).toBe('lobby')

    host.close()
    guest.close()
  }, 30_000)

  it('restores a seat when a player reconnects mid-game', async () => {
    const host = new TestClient()
    const guest = new TestClient()
    await host.connect()
    await guest.connect()

    host.send({ t: 'create', name: 'Host', options: { ...DEFAULT_OPTIONS, randomHands: true, openInformation: false } })
    await host.settle()
    guest.send({ t: 'join', code: host.state!.code, name: 'Guest' })
    await guest.settle()
    host.send({ t: 'start' })
    await host.settle()
    await guest.settle()

    const handBefore = [...guest.state!.hand]
    const token = guest.token
    guest.close()
    await new Promise((resolve) => setTimeout(resolve, 200))

    // Reconnecting with the same token drops the player back into their seat.
    const returning = new TestClient()
    await returning.connect(token)
    await returning.settle()
    expect(returning.state!.you).toBe(1)
    expect(returning.state!.hand).toEqual(handBefore)
    expect(returning.state!.phase).toBe('play')

    host.close()
    returning.close()
  }, 30_000)
})
