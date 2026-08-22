import { describe, expect, it } from 'vitest'

import { DEFAULT_OPTIONS } from '../shared/engine'
import type { LaddersClientState } from '../shared/protocol'
import { Room, type RoomSnapshot } from '../server/rooms'

/** A started two-player Snakes & Ladders room. */
function room(turnSeconds = 0): Room {
  const r = new Room('LADR')
  r.options = { ...DEFAULT_OPTIONS, kind: 'ladders', diceStart: false, turnSeconds }
  r.addSeat('token-a', 'Ada')
  r.addSeat('token-b', 'Bo')
  r.start()
  return r
}

const view = (r: Room, token: string) => r['stateFor'](token) as LaddersClientState

describe('a Snakes & Ladders room', () => {
  it('deals a ladders engine, not a Samurai one, from the option', () => {
    const r = room()
    expect(r.ladders).not.toBeNull()
    expect(r.game).toBeNull()
    expect(r.started).toBe(true)
  })

  it('sends the whole board — nothing here is secret', () => {
    const r = room()
    const state = view(r, 'token-a')
    expect(state.kind).toBe('ladders')
    expect(state.phase).toBe('play')
    expect(state.you).toBe(0)
    expect(state.players.map((p) => p.pos)).toEqual([0, 0])
    expect(view(r, 'nobody').players).toEqual(state.players)
  })

  it('reflects a roll and survives a snapshot round-trip', () => {
    const r = room()
    r.ladders!.roll(r.ladders!.state.current)
    expect(view(r, 'token-a').lastRoll).not.toBeNull()
    const back = Room.fromSnapshot(JSON.parse(JSON.stringify(r.toSnapshot())) as RoomSnapshot)
    expect(back.ladders!.state).toEqual(r.ladders!.state)
    expect(back.game).toBeNull()
  })

  it('runs the shot clock on the roller and re-arms it per roll', () => {
    const r = room(30)
    r.syncTurnTimer(1000)
    expect(r.turnDeadline).toBe(31_000)
    expect(view(r, 'token-a').turnMsLeft).not.toBeNull()
    r.ladders!.timeOut()
    r.syncTurnTimer(5000)
    expect(r.turnDeadline).toBe(35_000)
  })

  it('deals a fresh game on rematch once it is over', () => {
    const r = room()
    r.ladders!.state.phase = 'over'
    r.ladders!.state.result = { winner: 0, standings: [0, 1], reason: 'test' }
    for (const seat of r.seats) seat.connected = true
    expect(r.rematch()).toBeNull()
    expect(r.ladders!.state.phase).toBe('play')
    expect(r.ladders!.state.players.every((p) => p.pos === 0)).toBe(true)
  })
})
