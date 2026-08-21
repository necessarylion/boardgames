import { describe, expect, it } from 'vitest'

import { DEFAULT_OPTIONS } from '../shared/engine'
import type { SnakeClientState } from '../shared/protocol'
import { Room, type RoomSnapshot } from '../server/rooms'

/** A started two-player Snake room. */
function room(): Room {
  const r = new Room('SNKE')
  r.options = { ...DEFAULT_OPTIONS, kind: 'snake', diceStart: false, turnSeconds: 0 }
  r.addSeat('token-a', 'Ada')
  r.addSeat('token-b', 'Bo')
  r.start()
  return r
}

const view = (r: Room, token: string) => r['stateFor'](token) as SnakeClientState

describe('a Snake room', () => {
  it('deals a Snake engine, not a Samurai one, from the option', () => {
    const r = room()
    expect(r.snake).not.toBeNull()
    expect(r.game).toBeNull()
    expect(r.started).toBe(true)
  })

  it('sends the whole board — nothing in Snake is secret', () => {
    const r = room()
    const state = view(r, 'token-a')
    expect(state.kind).toBe('snake')
    expect(state.phase).toBe('play')
    expect(state.gridSize).toBe(r.snake!.state.gridSize)
    expect(state.food.length).toBeGreaterThan(0)
    for (const p of state.players) {
      expect(p.alive).toBe(true)
      expect(p.body).toHaveLength(3)
    }
    // Spectators see the same board as a seat.
    expect(view(r, 'nobody').players).toEqual(state.players)
  })

  it('reflects a frame ticked by the server clock', () => {
    const r = room()
    r.snake!.state.countdown = 0
    const before = view(r, 'token-a').players[0].body[0]
    r.snake!.tick()
    expect(view(r, 'token-a').players[0].body[0]).not.toEqual(before)
    expect(view(r, 'token-a').turnNumber).toBe(1)
  })

  it('survives a snapshot round-trip', () => {
    const r = room()
    r.snake!.tick()
    const back = Room.fromSnapshot(JSON.parse(JSON.stringify(r.toSnapshot())) as RoomSnapshot)
    expect(back.snake).not.toBeNull()
    expect(back.game).toBeNull()
    expect(back.snake!.state).toEqual(r.snake!.state)
  })

  it('deals a fresh game on rematch once it is over', () => {
    const r = room()
    r.snake!.state.phase = 'over'
    r.snake!.state.result = { winner: 0, reason: 'test' }
    for (const seat of r.seats) seat.connected = true
    expect(r.rematch()).toBeNull()
    expect(r.snake!.state.phase).toBe('play')
    expect(r.snake!.state.countdown).toBeGreaterThan(0)
  })
})
