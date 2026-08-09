import { describe, expect, it } from 'vitest'

import { DEFAULT_OPTIONS } from '../shared/engine'
import type { HalliClientState } from '../shared/protocol'
import { Room, type RoomSnapshot } from '../server/rooms'

/** A started two-player Halli Galli room. */
function room(): Room {
  const r = new Room('HGGG')
  r.options = { ...DEFAULT_OPTIONS, kind: 'halligalli' }
  r.addSeat('token-a', 'Ada')
  r.addSeat('token-b', 'Bo')
  r.start()
  return r
}

const view = (r: Room, token: string) => r['stateFor'](token) as HalliClientState

describe('a Halli Galli room', () => {
  it('deals a Halli Galli engine, not a Samurai one, from the option', () => {
    const r = room()
    expect(r.hg).not.toBeNull()
    expect(r.game).toBeNull()
    expect(r.started).toBe(true)
  })

  it('sends stacks as counts only and never their cards', () => {
    const r = room()
    const state = view(r, 'token-a')
    expect(state.kind).toBe('halligalli')
    expect(state.phase).toBe('play')
    // No property on the wire state carries a face-down card's identity.
    for (const p of state.players) {
      expect(typeof p.stackCount).toBe('number')
      expect(p).not.toHaveProperty('stack')
      expect(Array.isArray(p.faceUp)).toBe(true)
    }
    const dealt = state.players.reduce((a, p) => a + p.stackCount, 0)
    expect(dealt).toBe(56)
  })

  it('reports whose turn it is and reflects a flip', () => {
    const r = room()
    expect(view(r, 'token-a').current).toBe(0)
    expect(r.hg!.flip(0).ok).toBe(true)
    const state = view(r, 'token-a')
    expect(state.current).toBe(1)
    expect(state.players[0].faceUp).toHaveLength(1)
  })

  it('survives a snapshot round-trip', () => {
    const r = room()
    r.hg!.flip(0)
    const back = Room.fromSnapshot(JSON.parse(JSON.stringify(r.toSnapshot())) as RoomSnapshot)
    expect(back.hg).not.toBeNull()
    expect(back.game).toBeNull()
    expect(back.hg!.state).toEqual(r.hg!.state)
  })

  it('deals a fresh game on rematch once it is over', () => {
    const r = room()
    r.hg!.state.phase = 'over'
    r.hg!.state.result = { winner: 0, reason: 'test' }
    for (const seat of r.seats) seat.connected = true
    expect(r.rematch()).toBeNull()
    expect(r.hg!.state.phase).toBe('play')
  })
})
