import { describe, expect, it } from 'vitest'

import { thieves } from '../shared/cop'
import { DEFAULT_OPTIONS } from '../shared/engine'
import type { CopClientState } from '../shared/protocol'
import { Room, type RoomSnapshot } from '../server/rooms'

/**
 * A started three-player COP room with the badge pinned to seat 0, so the tests
 * that drive a round are not a coin toss on the random opening Cop.
 */
function room(): Room {
  const r = new Room('COPS')
  r.options = { ...DEFAULT_OPTIONS, kind: 'cop' }
  r.addSeat('token-a', 'Ada')
  r.addSeat('token-b', 'Bo')
  r.addSeat('token-c', 'Cy')
  r.start()
  r.cop!.state.cop = 0
  r.cop!.state.firstCop = 0
  return r
}

function timedRoom(turnSeconds: number): Room {
  const r = new Room('COPT')
  r.options = { ...DEFAULT_OPTIONS, kind: 'cop', turnSeconds }
  r.addSeat('token-a', 'Ada')
  r.addSeat('token-b', 'Bo')
  r.addSeat('token-c', 'Cy')
  r.start()
  r.cop!.state.cop = 0
  r.cop!.state.firstCop = 0
  return r
}

const view = (r: Room, token: string) => r['stateFor'](token) as CopClientState

describe('a COP room', () => {
  it('deals a COP engine, not one of the other four', () => {
    const r = room()
    expect(r.cop).not.toBeNull()
    expect(r.game).toBeNull()
    expect(r.hg).toBeNull()
    expect(r.coup).toBeNull()
    expect(r.carn).toBeNull()
    expect(r.started).toBe(true)
  })

  it('starts on the choosing step with the badge and the rooms in the clear', () => {
    const state = view(room(), 'token-a')
    expect(state.step).toBe('select')
    expect(state.cop).toBe(0)
    expect(state.rooms).toHaveLength(8)
    expect(state.totalRounds).toBe(6)
  })

  it('shows a player their own loot but hides everyone else’s', () => {
    const state = view(room(), 'token-b')
    const me = state.players.find((p) => p.id === 1)!
    const other = state.players.find((p) => p.id === 2)!
    expect(me.loot).not.toBeNull()
    expect(me.total).toBe(9)
    expect(other.loot).toBeNull()
    expect(other.total).toBeNull()
  })

  it('keeps a thief’s door secret until the round resolves', () => {
    const r = room()
    r.cop!.select(1, 3)
    // Seat 2 (another thief) is told only their own choice, not seat 1's.
    const spy = view(r, 'token-c')
    expect(spy.yourRoom).toBeNull()
    expect(spy.roundResult).toBeNull()
    // Seat 1 sees their own.
    expect(view(r, 'token-b').yourRoom).toBe(3)
  })

  it('lets thieves in the same room see each other, but not other rooms', () => {
    const r = room()
    // Seats 1 and 2 both slip into room 3.
    r.cop!.select(1, 3)
    r.cop!.select(2, 3)
    // Each sees the other as a roommate; the Cop (seat 0) sees nobody's room.
    expect(view(r, 'token-b').roommates).toEqual([2])
    expect(view(r, 'token-c').roommates).toEqual([1])
    expect(view(r, 'token-a').roommates).toEqual([])
  })

  it('does not reveal a thief hiding in a different room', () => {
    const r = room()
    r.cop!.select(1, 2)
    r.cop!.select(2, 6)
    expect(view(r, 'token-b').roommates).toEqual([])
    expect(view(r, 'token-c').roommates).toEqual([])
  })

  it('reveals every door and the catch once the Cop has searched', () => {
    const r = room()
    const t = thieves(r.cop!.state)
    r.cop!.select(t[0], 0)
    r.cop!.select(t[1], 4)
    r.cop!.search(0, 0, 7) // catches whoever is in room 0
    const state = view(r, 'token-a')
    expect(state.roundResult).not.toBeNull()
    expect(state.step).toBe('arrest')
    const room0 = state.roundResult!.rooms.find((x) => x.room === 0)!
    expect(room0.occupants).toContain(t[0])
    expect(state.roundResult!.caught).toContain(t[0])
  })

  it('reveals who hid in each room at the reveal, but keeps their loot private', () => {
    const r = room()
    const t = thieves(r.cop!.state) // [1, 2]
    // The two thieves hide in different shut rooms; the Cop opens two empty ones.
    r.cop!.select(t[0], 2)
    r.cop!.select(t[1], 4)
    r.cop!.search(0, 6, 7)
    const mine = view(r, 'token-b') // seat 1 = t[0], hid in room 2
    const myRoom = mine.roundResult!.rooms.find((x) => x.room === 2)!
    const theirRoom = mine.roundResult!.rooms.find((x) => x.room === 4)!
    // Seat 1 sees where everyone hid — including seat 2 over in room 4.
    expect(myRoom.occupants).toEqual([t[0]])
    expect(theirRoom.occupants).toEqual([t[1]])
    // But only their own room's loot split; seat 2's take stays private.
    expect(Object.keys(myRoom.loot).length).toBeGreaterThan(0)
    expect(theirRoom.loot).toEqual({})
  })

  it('opens every shut room to the whole table once the game is over', () => {
    const r = room()
    const t = thieves(r.cop!.state)
    r.cop!.select(t[0], 2)
    r.cop!.select(t[1], 4)
    r.cop!.search(0, 6, 7)
    // Pin the game to over, so the redaction opens up for everyone.
    r.cop!.state.phase = 'over'
    const spy = view(r, 'nobody')
    const shut = spy.roundResult!.rooms.find((x) => x.room === 2)!
    expect(shut.occupants).toEqual([t[0]])
  })

  it('shows a caught thief’s loot to the Cop for the arrest, but to no one else', () => {
    const r = room()
    const t = thieves(r.cop!.state)
    r.cop!.select(t[0], 0)
    r.cop!.select(t[1], 4)
    r.cop!.search(0, 0, 7) // catches thief t[0]; step becomes 'arrest'
    expect(r.cop!.state.step).toBe('arrest')
    // The Cop may inspect the caught thief to decide the confiscation.
    expect(view(r, 'token-a').players.find((p) => p.id === t[0])!.loot).not.toBeNull()
    // No other thief can.
    const otherToken = t[1] === 1 ? 'token-b' : 'token-c'
    expect(view(r, otherToken).players.find((p) => p.id === t[0])!.loot).toBeNull()
    // And the moment the arrest is over, the Cop can no longer see it either.
    r.cop!.confiscate(0, {})
    expect(r.cop!.state.step).toBe('resolved')
    expect(view(r, 'token-a').players.find((p) => p.id === t[0])!.loot).toBeNull()
  })

  it('gives a spectator no loot and no actions', () => {
    const state = view(room(), 'nobody')
    expect(state.you).toBeNull()
    for (const p of state.players) expect(p.loot).toBeNull()
    expect(state.can.select).toBe(false)
    expect(state.can.search).toBe(false)
  })

  it('opens every seat’s loot once the game is over', () => {
    const r = room()
    const s = r.cop!.state
    s.round = s.totalRounds
    s.step = 'resolved'
    r.cop!.next(0)
    expect(s.phase).toBe('over')
    const state = view(r, 'nobody')
    for (const p of state.players) expect(p.loot).not.toBeNull()
    expect(state.result).not.toBeNull()
  })

  it('survives a snapshot round-trip mid-round', () => {
    const r = room()
    r.cop!.select(1, 2)
    const back = Room.fromSnapshot(JSON.parse(JSON.stringify(r.toSnapshot())) as RoomSnapshot)
    expect(back.cop).not.toBeNull()
    expect(back.game).toBeNull()
    expect(back.cop!.state).toEqual(r.cop!.state)
    // The rebuilt engine still takes actions.
    expect(back.cop!.select(2, 5).ok).toBe(true)
  })

  it('does not hand the opening badge to the host', () => {
    const counts = [0, 0, 0]
    for (let i = 0; i < 200; i++) {
      const r = new Room(`C${i}`)
      r.options = { ...DEFAULT_OPTIONS, kind: 'cop' }
      r.addSeat('token-a', 'Ada')
      r.addSeat('token-b', 'Bo')
      r.addSeat('token-c', 'Cy')
      r.start()
      counts[r.cop!.state.cop]++
    }
    for (const seats of counts) expect(seats).toBeGreaterThan(20)
    expect(counts[0] + counts[1] + counts[2]).toBe(200)
  })

  it('runs no clock on an untimed table', () => {
    const r = room()
    r.syncTurnTimer()
    expect(view(r, 'token-a').turnMsLeft).toBeNull()
    expect(r.turnDeadline).toBeNull()
  })

  it('arms a clock when the table is timed', () => {
    const r = timedRoom(30)
    r.syncTurnTimer()
    const left = view(r, 'token-a').turnMsLeft
    expect(left).not.toBeNull()
    expect(left!).toBeGreaterThan(28_000)
    expect(left!).toBeLessThanOrEqual(30_000)
  })

  it('freezes the clock while the table is paused', () => {
    const r = timedRoom(30)
    const start = Date.now()
    r.syncTurnTimer(start)
    r.cop!.pause(0)
    r.syncTurnTimer(start + 5_000)
    expect(r.paused).toBe(true)
    expect(r.turnMsLeft(start + 5_000)).toBe(25_000)
    expect(r.turnMsLeft(start + 60_000)).toBe(25_000)
  })

  it('deals a fresh game on rematch once it is over', () => {
    const r = room()
    r.cop!.state.phase = 'over'
    r.cop!.state.result = { winners: [0], standings: [], leaders: { key: null, stamp: null, card: null }, reason: 'test' }
    for (const seat of r.seats) seat.connected = true
    expect(r.rematch()).toBeNull()
    expect(r.cop!.state.phase).toBe('play')
  })
})
