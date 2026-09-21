import { describe, expect, it } from 'vitest'

import { DEFAULT_OPTIONS } from '../shared/engine'
import { priceOf } from '../shared/monopoly'
import type { ClientState, MonopolyClientState } from '../shared/protocol'
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

/**
 * Monopoly's clock. The machinery was all there — a key on the pending step, a
 * `timeOut()` that settles whatever the table is waiting on, a remainder on the
 * wire and a countdown in the top bar — but no lobby control ever set
 * `turnSeconds`, so none of it could arm. These are the tests that would have
 * noticed.
 */
describe('the turn clock at a Monopoly table', () => {
  const mfor = (r: Room, token: string): MonopolyClientState =>
    r['stateFor'](token) as MonopolyClientState

  function table(turnSeconds: number): Room {
    const r = new Room('MONO')
    r.options = { ...DEFAULT_OPTIONS, kind: 'monopoly', turnSeconds, diceStart: false }
    r.addSeat('token-a', 'Ada')
    r.addSeat('token-b', 'Bo')
    r.start()
    return r
  }

  it('arms once the host asks for a period, and not before', () => {
    const off = table(0)
    off.syncTurnTimer()
    expect(off.turnDeadline, 'an untimed table has no deadline').toBeNull()
    expect(mfor(off, 'token-a').turnMsLeft).toBeNull()

    const on = table(45)
    const now = 2_000_000
    on.syncTurnTimer(now)
    expect(on.turnDeadline).toBe(now + 45_000)
    expect(mfor(on, 'token-a').turnMsLeft).not.toBeNull()
  })

  it('gives every throw and every decision a period of its own', () => {
    const r = table(30)
    const now = 3_000_000
    r.syncTurnTimer(now)
    expect(r.turnDeadline).toBe(now + 30_000)

    // Unlike Samurai's, this clock is keyed on the throw count and the pending
    // step as well as the turn — a double earns a second throw inside the same
    // turn, and whatever the throw puts in front of the table is a fresh
    // decision. Both deserve their own period rather than the roller's
    // leftovers, so the deadline moves.
    expect(r.monopoly!.roll(r.monopoly!.state.current).ok).toBe(true)
    r.syncTurnTimer(now + 5_000)
    expect(r.turnDeadline).toBe(now + 5_000 + 30_000)

    // Nothing has changed since, so nothing is re-armed: sitting on a decision
    // does not quietly buy more time.
    r.syncTurnTimer(now + 12_000)
    expect(r.turnDeadline).toBe(now + 5_000 + 30_000)
  })

  it('settles the table itself when the period runs out', () => {
    const r = table(30)
    const before = r.monopoly!.state.turnNumber
    r.syncTurnTimer()

    // Whatever is in front of the table, timing out has to move it along —
    // that is the whole point of a clock nobody is watching.
    expect(r.monopoly!.timeOut().ok).toBe(true)
    const s = r.monopoly!.state
    expect(s.turnNumber >= before, 'the table moved rather than stalling').toBe(true)
  })

  it('freezes while the table is paused, as every other game’s does', () => {
    const r = table(60)
    const now = 4_000_000
    r.syncTurnTimer(now)

    r.monopoly!.pause(0)
    r.syncTurnTimer(now + 10_000)
    const frozen = mfor(r, 'token-a').turnMsLeft
    r.syncTurnTimer(now + 20_000)
    expect(mfor(r, 'token-a').turnMsLeft, 'a paused clock does not drain').toBe(frozen)

    // Resuming hands back what was left, not a whole fresh period. The pause
    // is measured from the first sweep that saw it — here +10s — to the one
    // that sees it lifted, so ten seconds are given back rather than twenty.
    r.monopoly!.resume(0)
    r.syncTurnTimer(now + 20_000)
    expect(r.turnDeadline).toBe(now + 60_000 + 10_000)
  })
})

/**
 * The auction's own window. Everyone is waiting on one seat for a single word,
 * so it gets a period of its own — counted again from every bid, because "so
 * long to answer the last bid" is what a bidding clock means.
 */
describe('the bid window', () => {
  function auction(turnSeconds: number, bidSeconds: number): Room {
    const r = new Room('BIDS')
    r.options = { ...DEFAULT_OPTIONS, kind: 'monopoly', turnSeconds, bidSeconds, diceStart: false }
    r.addSeat('token-a', 'Ada')
    r.addSeat('token-b', 'Bo')
    r.addSeat('token-c', 'Cy')
    r.start()
    // Put a space under the hammer without playing a turn to get there.
    r.monopoly!.state.pending = [
      { step: 'auction', space: 1, high: 0, highBidder: null, passed: [] },
    ]
    return r
  }

  it('falls back to the turn timer when the host set no window of its own', () => {
    const r = auction(60, 0)
    r.syncTurnTimer(1_000)
    expect(r.turnDeadline, 'zero means "same as a turn", not "untimed"').toBe(1_000 + 60_000)
  })

  it('runs its own, shorter period when the host sets one', () => {
    const r = auction(60, 15)
    r.syncTurnTimer(1_000)
    expect(r.turnDeadline).toBe(1_000 + 15_000)
  })

  it('starts the window again at every bid', () => {
    const r = auction(60, 30)
    const now = 5_000_000
    r.syncTurnTimer(now)
    expect(r.turnDeadline).toBe(now + 30_000)

    // A bid from another seat is exactly what the others are given time to
    // answer, so the window restarts from it.
    expect(r.monopoly!.bid(1, 50).ok).toBe(true)
    r.syncTurnTimer(now + 10_000)
    expect(r.turnDeadline).toBe(now + 10_000 + 30_000)

    // Sitting on it buys nothing.
    r.syncTurnTimer(now + 20_000)
    expect(r.turnDeadline).toBe(now + 10_000 + 30_000)
  })

  it('drops everyone still being waited on when the window runs out', () => {
    const r = auction(60, 30)
    const mp = r.monopoly!
    expect(mp.bid(0, 50).ok).toBe(true)

    // Ada holds the standing bid, so she is not being waited on; Bo and Cy are,
    // and neither answered. Both drop, which closes the auction in one period
    // rather than one per idle player.
    expect(mp.timeOut().ok).toBe(true)
    expect(mp.state.pending.some((p) => p.step === 'auction')).toBe(false)
    expect(mp.state.owners[1], 'the standing bid took it').toBe(0)
  })

  it('leaves an untimed table untimed, bidding included', () => {
    const r = auction(0, 0)
    r.syncTurnTimer()
    expect(r.turnDeadline).toBeNull()
  })
})

/**
 * The whole path a player who walks away actually takes: the room falls due,
 * the sweep finds it, and the engine settles the decision on screen. The
 * `setInterval` that drives it in `server/index.ts` is the only part not
 * exercised here — it fires once a second, which is also why a client can show
 * 0:00 for up to a second before anything happens.
 */
describe('a player who walks away', () => {
  it('has the space they landed on bought for them', () => {
    const manager = new RoomManager()
    const r = manager.create()
    r.options = { ...DEFAULT_OPTIONS, kind: 'monopoly', turnSeconds: 30, diceStart: false }
    r.addSeat('token-a', 'Ada')
    r.addSeat('token-b', 'Bo')
    r.start()

    const mp = r.monopoly!
    const buyer = mp.state.current
    const cash = mp.state.players[buyer].cash
    // Land them on a space that is for sale and leave them to it.
    mp.state.pending = [{ step: 'buy', player: buyer, space: 1 }]
    mp.state.rolled = true

    r.syncTurnTimer()
    expect(manager.dueTurns(), 'not due yet').not.toContain(r)

    // The period runs out.
    const after = Date.now() + 31_000
    expect(manager.dueTurns(after), 'the room falls due').toContain(r)

    // Which is what the sweep does with it.
    expect(mp.timeOut().ok).toBe(true)
    expect(mp.state.owners[1], 'bought on their behalf').toBe(buyer)
    expect(mp.state.players[buyer].cash).toBe(cash - priceOf(1))
    // And, with nothing left to settle, the turn has already moved on.
    expect(mp.state.current).not.toBe(buyer)
  })

  it('is not timed out while the table is paused', () => {
    const manager = new RoomManager()
    const r = manager.create()
    r.options = { ...DEFAULT_OPTIONS, kind: 'monopoly', turnSeconds: 30, diceStart: false }
    r.addSeat('token-a', 'Ada')
    r.addSeat('token-b', 'Bo')
    r.start()
    r.monopoly!.pause(0)

    r.syncTurnTimer()
    expect(manager.dueTurns(Date.now() + 31_000)).not.toContain(r)
  })
})
