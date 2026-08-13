import { describe, expect, it } from 'vitest'

import type { CarnivalGame } from '../shared/carnivals'
import { DEFAULT_OPTIONS } from '../shared/engine'
import type { CarnivalClientState } from '../shared/protocol'
import { Room, type RoomSnapshot } from '../server/rooms'

/**
 * A started three-player Carnivals room, with seat 0 put on turn.
 *
 * The opening seat is drawn at random, so any test that drives a turn would
 * otherwise be a coin toss; fixing it keeps those tests about what they check.
 */
function room(): Room {
  const r = new Room('CARN')
  r.options = { ...DEFAULT_OPTIONS, kind: 'carnivals' }
  r.addSeat('token-a', 'Ada')
  r.addSeat('token-b', 'Bo')
  r.addSeat('token-c', 'Cy')
  r.start()
  const s = r.carn!.state
  s.current = 0
  s.dealer = 0
  return r
}

function timedRoom(turnSeconds: number): Room {
  const r = new Room('CART')
  r.options = { ...DEFAULT_OPTIONS, kind: 'carnivals', turnSeconds }
  r.addSeat('token-a', 'Ada')
  r.addSeat('token-b', 'Bo')
  r.addSeat('token-c', 'Cy')
  r.start()
  r.carn!.state.current = 0
  r.carn!.state.dealer = 0
  return r
}

/** Take the picking step out of the way, so a test can reach the betting. */
function pickAll(carn: CarnivalGame): void {
  for (const p of carn.state.players) if (!p.out && !p.selected) carn.select(p.id, 0, 0)
}

const view = (r: Room, token: string) => r['stateFor'](token) as CarnivalClientState

describe('a Carnivals room', () => {
  it('deals a Carnivals engine, not one of the other three', () => {
    const r = room()
    expect(r.carn).not.toBeNull()
    expect(r.game).toBeNull()
    expect(r.hg).toBeNull()
    expect(r.coup).toBeNull()
    expect(r.started).toBe(true)
  })

  it('starts a hand in the picking step, waiting on every seat', () => {
    const r = room()
    const state = view(r, 'token-a')
    expect(state.step).toBe('selecting')
    expect(state.can.select).toBe(true)
    expect(state.players.every((p) => !p.selected)).toBe(true)
  })

  it('shows a player their own red but never their own blue', () => {
    const r = room()
    pickAll(r.carn!)
    const mine = view(r, 'token-a')
    const me = mine.players.find((p) => p.id === 0)!
    expect(me.red).toBe(r.carn!.state.players[0].red)
    expect(me.blue).toBeNull()
  })

  it('shows a player every rival’s blue but never their red', () => {
    const r = room()
    pickAll(r.carn!)
    const mine = view(r, 'token-a')
    for (const id of [1, 2]) {
      const them = mine.players.find((p) => p.id === id)!
      expect(them.blue).toBe(r.carn!.state.players[id].blue)
      expect(them.red).toBeNull()
    }
  })

  it('reveals a hand only once its owner turns it over', () => {
    const r = room()
    const c = r.carn!
    pickAll(c)
    c.check(0)
    c.check(1)
    c.check(2)
    expect(c.state.step).toBe('showdown')

    // Before seat 1 reveals, its red is still hidden from seat 0.
    expect(view(r, 'token-a').players.find((p) => p.id === 1)!.red).toBeNull()
    c.reveal(0)
    c.reveal(1)
    c.reveal(2)

    const mine = view(r, 'token-a')
    // Now the viewer can see their own blue, and a rival's red.
    expect(mine.players.find((p) => p.id === 0)!.blue).not.toBeNull()
    expect(mine.players.find((p) => p.id === 1)!.red).not.toBeNull()
    expect(mine.roundResult).not.toBeNull()
  })

  it('gives a spectator the public blues, no private reds, and no actions', () => {
    const r = room()
    pickAll(r.carn!)
    const state = view(r, 'nobody')
    expect(state.you).toBeNull()
    for (const p of state.players) {
      // A spectator owns no seat, so every blue is public to them, but no red is.
      expect(p.blue).not.toBeNull()
      expect(p.red).toBeNull()
    }
    expect(state.can.fold).toBe(false)
    expect(state.can.select).toBe(false)
  })

  it('offers the turn seat betting actions and everyone else none', () => {
    const r = room()
    pickAll(r.carn!)
    expect(view(r, 'token-a').can.check).toBe(true)
    expect(view(r, 'token-a').can.fold).toBe(true)
    expect(view(r, 'token-b').can.fold).toBe(false)
  })

  it('sends the pot and the current bet in the clear, starting empty', () => {
    const r = room()
    pickAll(r.carn!)
    r.carn!.raise(0, 40)
    const state = view(r, 'token-b')
    expect(state.pot).toBe(40)
    expect(state.currentBet).toBe(40)
  })

  it('survives a snapshot round-trip mid-hand', () => {
    const r = room()
    pickAll(r.carn!)
    r.carn!.raise(0, 30)
    const back = Room.fromSnapshot(JSON.parse(JSON.stringify(r.toSnapshot())) as RoomSnapshot)
    expect(back.carn).not.toBeNull()
    expect(back.game).toBeNull()
    expect(back.carn!.state).toEqual(r.carn!.state)
    // The rebuilt engine is still an engine: it goes on taking bets.
    expect(back.carn!.call(1).ok).toBe(true)
  })

  it('does not hand the opening deal to the host', () => {
    const counts = [0, 0, 0]
    for (let i = 0; i < 200; i++) {
      const r = new Room(`R${i}`)
      r.options = { ...DEFAULT_OPTIONS, kind: 'carnivals' }
      r.addSeat('token-a', 'Ada')
      r.addSeat('token-b', 'Bo')
      r.addSeat('token-c', 'Cy')
      r.start()
      counts[r.carn!.state.dealer]++
    }
    for (const seats of counts) expect(seats).toBeGreaterThan(20)
    expect(counts[0] + counts[1] + counts[2]).toBe(200)
  })

  it('draws the seat quietly when the roll is switched off', () => {
    const r = new Room('CARQ')
    r.options = { ...DEFAULT_OPTIONS, kind: 'carnivals', diceStart: false }
    r.addSeat('token-a', 'Ada')
    r.addSeat('token-b', 'Bo')
    r.start()
    expect(r.carn!.state.opening).toBeNull()
    expect(view(r, 'token-a').opening).toBeNull()
    expect([0, 1]).toContain(r.carn!.state.dealer)
  })

  it('runs no clock on an untimed table', () => {
    const r = room()
    r.syncTurnTimer()
    expect(view(r, 'token-a').turnMsLeft).toBeNull()
    expect(r.turnDeadline).toBeNull()
  })

  it('arms a clock when the table is timed, and sends what is left of it', () => {
    const r = timedRoom(30)
    r.syncTurnTimer()
    const left = view(r, 'token-a').turnMsLeft
    expect(left).not.toBeNull()
    expect(left!).toBeGreaterThan(28_000)
    expect(left!).toBeLessThanOrEqual(30_000)
  })

  it('hands the next bettor a fresh period, not the last one’s remainder', () => {
    const r = timedRoom(30)
    pickAll(r.carn!)
    const start = Date.now()
    r.syncTurnTimer(start)
    const armed = r.turnDeadline
    r.carn!.check(0)
    r.syncTurnTimer(start + 15_000)
    expect(r.turnDeadline).toBeGreaterThan(armed!)
    expect(r.turnMsLeft(start + 15_000)).toBe(30_000)
  })

  it('freezes the clock while the table is paused', () => {
    const r = timedRoom(30)
    const start = Date.now()
    r.syncTurnTimer(start)
    r.carn!.pause(0)
    r.syncTurnTimer(start + 5_000)
    expect(r.paused).toBe(true)
    expect(r.turnMsLeft(start + 5_000)).toBe(25_000)
    expect(r.turnMsLeft(start + 60_000)).toBe(25_000)
  })

  it('deals a fresh game on rematch once it is over', () => {
    const r = room()
    r.carn!.state.phase = 'over'
    r.carn!.state.result = { winner: 0, reason: 'test' }
    for (const seat of r.seats) seat.connected = true
    expect(r.rematch()).toBeNull()
    expect(r.carn!.state.phase).toBe('play')
  })
})
