// @vitest-environment jsdom
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { Room } from '../server/rooms'
import { CLOSE_REPLACED, PROTOCOL_VERSION, type ClientMessage } from '../shared/protocol'
import { useGameStore } from '../src/stores/game'

/**
 * A stand-in for the browser's WebSocket, so a store can be driven through a
 * whole handshake without a server. Every instance is kept, which is what lets
 * a test tell "reconnected" from "stayed put".
 */
class FakeSocket {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static instances: FakeSocket[] = []

  readyState = FakeSocket.OPEN
  sent: ClientMessage[] = []
  onopen: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  onclose: ((event: { code: number }) => void) | null = null
  onerror: (() => void) | null = null

  constructor(readonly url: string) {
    FakeSocket.instances.push(this)
    queueMicrotask(() => this.onopen?.())
  }

  send(data: string) {
    this.sent.push(JSON.parse(data) as ClientMessage)
  }

  close(code = 1000) {
    this.readyState = 3
    this.onclose?.({ code })
  }

  receive(message: unknown) {
    this.onmessage?.({ data: JSON.stringify(message) })
  }
}

/** The store reaches for the global, so the fake is installed over it. */
const globals = globalThis as unknown as { WebSocket: unknown }
const realWebSocket = globals.WebSocket
const TOKEN_A = '11111111-1111-4111-8111-111111111111'
const TOKEN_B = '22222222-2222-4222-8222-222222222222'

/** Open a table's page, as a tab arriving on that link would. */
function openTab(search: string) {
  history.replaceState({}, '', search)
  setActivePinia(createPinia())
  const game = useGameStore()
  game.connect()
  // The handshake goes out on open, which the fake socket defers a microtask.
  return Promise.resolve().then(() => ({
    game,
    socket: FakeSocket.instances[FakeSocket.instances.length - 1],
  }))
}

beforeEach(() => {
  globals.WebSocket = FakeSocket
  FakeSocket.instances = []
  localStorage.clear()
})

afterEach(() => {
  globals.WebSocket = realWebSocket
  history.replaceState({}, '', '/')
})

describe('one identity per table', () => {
  it('greets the server as the seat stored for the table in the URL', async () => {
    localStorage.setItem('samurai.token.ABCD', TOKEN_A)
    const { socket } = await openTab('/?room=ABCD')

    expect(socket.sent[0]).toEqual({ t: 'hello', token: TOKEN_A, code: 'ABCD' })
  })

  it('ignores a seat held for another table, so two tabs never collide', async () => {
    localStorage.setItem('samurai.token.ABCD', TOKEN_A)
    localStorage.setItem('samurai.token.WXYZ', TOKEN_B)

    const first = await openTab('/?room=ABCD')
    const second = await openTab('/?room=WXYZ')

    expect(first.socket.sent[0]).toMatchObject({ token: TOKEN_A, code: 'ABCD' })
    expect(second.socket.sent[0]).toMatchObject({ token: TOKEN_B, code: 'WXYZ' })
    // Two live sockets, neither replacing the other.
    expect(FakeSocket.instances).toHaveLength(2)
  })

  it('starts as nobody when no table is named in the URL', async () => {
    localStorage.setItem('samurai.token.ABCD', TOKEN_A)
    const { socket } = await openTab('/')

    // A stored seat is never assumed: the tab is at no table until it says so.
    expect(socket.sent[0]).toEqual({ t: 'hello', token: null, code: null })
  })

  it('drops the token the browser kept for every table at once', async () => {
    localStorage.setItem('samurai.token', TOKEN_A)
    await openTab('/?room=ABCD')

    expect(localStorage.getItem('samurai.token')).toBeNull()
  })

  it('writes the table into the URL and keeps its seat once it has one', async () => {
    const { game, socket } = await openTab('/')
    socket.receive({ t: 'hello', token: TOKEN_A, version: PROTOCOL_VERSION })
    socket.receive({ t: 'state', state: new Room('ABCD').stateFor('nobody') })

    expect(game.state?.code).toBe('ABCD')
    // The kind rides along, so a reload — or the join form after an expiry —
    // can dress itself for the right game.
    expect(location.search).toBe('?room=ABCD&g=samurai')
    expect(localStorage.getItem('samurai.token.ABCD')).toBe(TOKEN_A)
  })

  it('reclaims the seat it already holds when joining that table again', async () => {
    localStorage.setItem('samurai.token.ABCD', TOKEN_A)
    const { game, socket } = await openTab('/')
    socket.receive({ t: 'hello', token: TOKEN_B, version: PROTOCOL_VERSION })

    game.joinRoom('abcd', 'Takeda')

    // Says hello as the seat's owner first, then joins — in that order, or the
    // server would seat the tab a second time under its throwaway identity.
    expect(socket.sent.slice(1)).toEqual([
      { t: 'hello', token: TOKEN_A, code: 'ABCD' },
      { t: 'join', code: 'ABCD', name: 'Takeda' },
    ])
  })

  it('forgets the seat and the link when the table lets it go', async () => {
    localStorage.setItem('samurai.token.ABCD', TOKEN_A)
    const { game, socket } = await openTab('/?room=ABCD')
    socket.receive({ t: 'hello', token: TOKEN_A, version: PROTOCOL_VERSION })
    socket.receive({ t: 'state', state: new Room('ABCD').stateFor('nobody') })

    socket.receive({ t: 'left' })
    expect(game.state).toBeNull()
    expect(localStorage.getItem('samurai.token.ABCD')).toBeNull()
    expect(location.search).toBe('')
  })

  it('keeps an invite in the URL when the table turns out to be gone', async () => {
    const { socket } = await openTab('/?room=ABCD')
    // Never seated, so there is nothing to forget — and the code is still the
    // one thing the join form has to offer.
    socket.receive({ t: 'left' })

    expect(location.search).toBe('?room=ABCD')
  })
})

describe('a tab older than the server', () => {
  it('stops rather than half-working when the protocol versions differ', async () => {
    const { game, socket } = await openTab('/?room=ABCD')
    socket.receive({ t: 'hello', token: TOKEN_A, version: PROTOCOL_VERSION + 1 })
    await Promise.resolve()

    expect(game.stale).toBe(true)
    // A state it cannot be sure it understands is not acted on.
    socket.receive({ t: 'state', state: new Room('ABCD').stateFor('nobody') })
    expect(game.state).toBeNull()
  })

  it('does not dial again, since only a reload can close a version gap', async () => {
    const { game, socket } = await openTab('/?room=ABCD')
    socket.receive({ t: 'hello', token: TOKEN_A, version: PROTOCOL_VERSION + 1 })
    socket.close(1006)
    await new Promise((resolve) => setTimeout(resolve, 1200))

    expect(game.stale).toBe(true)
    expect(FakeSocket.instances).toHaveLength(1)
  })

  it('carries on as normal when the versions match', async () => {
    const { game, socket } = await openTab('/?room=ABCD')
    socket.receive({ t: 'hello', token: TOKEN_A, version: PROTOCOL_VERSION })
    socket.receive({ t: 'state', state: new Room('ABCD').stateFor('nobody') })

    expect(game.stale).toBe(false)
    expect(game.state?.code).toBe('ABCD')
  })
})

describe('a seat taken over by another tab', () => {
  it('holds still instead of taking it back', async () => {
    localStorage.setItem('samurai.token.ABCD', TOKEN_A)
    const { game, socket } = await openTab('/?room=ABCD')

    socket.close(CLOSE_REPLACED)
    await Promise.resolve()

    expect(game.replaced).toBe(true)
    expect(game.connection).toBe('closed')
    // No second socket: reconnecting is what made the two tabs fight.
    expect(FakeSocket.instances).toHaveLength(1)
  })

  it('reconnects when the player asks for the seat back', async () => {
    const { game, socket } = await openTab('/?room=ABCD')
    socket.close(CLOSE_REPLACED)

    game.takeOverSeat()
    await Promise.resolve()

    expect(game.replaced).toBe(false)
    expect(FakeSocket.instances).toHaveLength(2)
  })

  it('still reconnects after an ordinary drop', async () => {
    const { game, socket } = await openTab('/?room=ABCD')

    socket.close(1006)
    expect(game.replaced).toBe(false)
    await new Promise((resolve) => setTimeout(resolve, 1200))

    expect(FakeSocket.instances.length).toBeGreaterThan(1)
  })
})
