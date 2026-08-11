import { describe, expect, it } from 'vitest'

import { DEFAULT_OPTIONS } from '../shared/engine'
import type { ClientState } from '../shared/protocol'
import { Room, RoomManager } from '../server/rooms'

/** These rooms all play Samurai, so read their state as a Samurai ClientState. */
const sfor = (r: Room, token: string): ClientState => r['stateFor'](token) as ClientState

/** A started two-player room, timed unless told otherwise. */
function room(turnSeconds = 30): Room {
  const r = new Room('CLOK')
  r.addSeat('token-a', 'Ada')
  r.addSeat('token-b', 'Bo')
  r.options = { ...DEFAULT_OPTIONS, randomHands: true, turnSeconds }
  r.start()
  // The opening seat is drawn; these tests are about the clock, not the draw.
  r.game!.state.first = 0
  r.game!.state.current = 0
  return r
}

describe('the turn clock', () => {
  it('stays off for an untimed table', () => {
    const r = room(0)
    r.syncTurnTimer()
    expect(r.turnDeadline).toBeNull()
    expect(sfor(r, 'token-a').turnMsLeft).toBeNull()
  })

  it('arms a full period when the turn passes to someone new', () => {
    const r = room(45)
    const now = 1_000_000
    r.syncTurnTimer(now)
    expect(r.turnDeadline).toBe(now + 45_000)

    // Placing without ending the turn must not buy more time.
    r.syncTurnTimer(now + 10_000)
    expect(r.turnDeadline).toBe(now + 45_000)

    r.game!.timeOut(r.game!.state.current)
    r.syncTurnTimer(now + 10_000)
    expect(r.turnDeadline).toBe(now + 55_000)
  })

  it('reports the remainder to clients and never a negative one', () => {
    const r = room(30)
    r.syncTurnTimer()
    const left = sfor(r, 'token-a').turnMsLeft!
    expect(left).toBeGreaterThan(29_000)
    expect(left).toBeLessThanOrEqual(30_000)

    r.turnDeadline = Date.now() - 5_000
    expect(sfor(r, 'token-a').turnMsLeft).toBe(0)
  })

  it('starts a fresh period for a room read back from the database', () => {
    const r = room(60)
    r.syncTurnTimer(1_000)
    const back = Room.fromSnapshot(JSON.parse(JSON.stringify(r.toSnapshot())))

    // Nobody should lose their turn to a server restart, so the clock is not
    // carried across — the first tick after a restore simply starts one.
    expect(back.turnDeadline).toBeNull()
    back.syncTurnTimer(500_000)
    expect(back.turnDeadline).toBe(560_000)
  })

  it('reports only the rooms whose player has actually run out', () => {
    const manager = new RoomManager()
    const timed = manager.create()
    timed.addSeat('token-a', 'Ada')
    timed.addSeat('token-b', 'Bo')
    timed.options = { ...DEFAULT_OPTIONS, randomHands: true, turnSeconds: 30 }
    timed.start()

    const untimed = manager.create()
    untimed.addSeat('token-c', 'Cy')
    untimed.addSeat('token-d', 'Di')
    untimed.options = { ...DEFAULT_OPTIONS, randomHands: true, turnSeconds: 0 }
    untimed.start()

    // A room nobody has ticked yet has no clock; the first sweep starts one
    // rather than reporting it as overdue.
    expect(manager.dueTurns()).toEqual([])
    expect(timed.turnDeadline).not.toBeNull()
    expect(untimed.turnDeadline).toBeNull()

    timed.turnDeadline = Date.now() - 1
    expect(manager.dueTurns()).toEqual([timed])
  })

  it('freezes the clock while paused and hands back the remaining time', () => {
    const r = room(60)
    const now = 1_000_000
    r.syncTurnTimer(now)
    expect(r.turnDeadline).toBe(now + 60_000)

    // Pause twenty seconds in, with forty left.
    r.game!.pause(0)
    r.syncTurnTimer(now + 20_000)
    expect(sfor(r, 'token-a').turnMsLeft).toBe(40_000)

    // No amount of wall-clock time while paused runs the clock down.
    r.syncTurnTimer(now + 5_000_000)
    expect(sfor(r, 'token-a').turnMsLeft).toBe(40_000)

    // Resume an hour later: the player still has exactly their forty seconds.
    r.game!.resume(0)
    r.syncTurnTimer(now + 3_600_000)
    expect(r.turnDeadline).toBe(now + 3_600_000 + 40_000)
  })

  it('never reports a paused room as overdue', () => {
    const manager = new RoomManager()
    const r = manager.create()
    r.addSeat('token-a', 'Ada')
    r.addSeat('token-b', 'Bo')
    r.options = { ...DEFAULT_OPTIONS, randomHands: true, turnSeconds: 30 }
    r.start()
    manager.dueTurns()

    r.game!.pause(0)
    r.turnDeadline = Date.now() - 1
    expect(manager.dueTurns()).toEqual([])
  })

  it('stops once the game is over', () => {
    const r = room(30)
    let guard = 0
    while (r.game!.state.phase === 'play' && guard++ < 2000) {
      r.game!.timeOut(r.game!.state.current)
    }
    expect(r.game!.state.phase).toBe('over')
    r.syncTurnTimer()
    expect(r.turnDeadline).toBeNull()
    expect(sfor(r, 'token-a').turnMsLeft).toBeNull()
  })
})
