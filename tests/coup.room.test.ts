import { describe, expect, it } from 'vitest'

import { DECK_SIZE } from '../shared/coup'
import { DEFAULT_OPTIONS } from '../shared/engine'
import type { CoupClientState } from '../shared/protocol'
import { Room, type RoomSnapshot } from '../server/rooms'

/**
 * A started three-player Coup room, with seat 0 put on turn.
 *
 * The opening seat is drawn at random now, so every test below that drives a
 * turn would otherwise be a coin toss. Fixing it here keeps those tests about
 * what they are actually checking; `the opening seat` covers the draw itself.
 */
function room(): Room {
  const r = new Room('CUPP')
  r.options = { ...DEFAULT_OPTIONS, kind: 'coup' }
  r.addSeat('token-a', 'Ada')
  r.addSeat('token-b', 'Bo')
  r.addSeat('token-c', 'Cy')
  r.start()
  r.coup!.state.current = 0
  return r
}

/** The same table, but on a shot clock. */
function timedRoom(turnSeconds: number): Room {
  const r = new Room('CUPT')
  r.options = { ...DEFAULT_OPTIONS, kind: 'coup', turnSeconds }
  r.addSeat('token-a', 'Ada')
  r.addSeat('token-b', 'Bo')
  r.addSeat('token-c', 'Cy')
  r.start()
  r.coup!.state.current = 0
  return r
}

const view = (r: Room, token: string) => r['stateFor'](token) as CoupClientState

describe('a Coup room', () => {
  it('deals a Coup engine, not one of the other two, from the option', () => {
    const r = room()
    expect(r.coup).not.toBeNull()
    expect(r.game).toBeNull()
    expect(r.hg).toBeNull()
    expect(r.started).toBe(true)
  })

  it('sends held influence as a count and never the cards themselves', () => {
    const r = room()
    const state = view(r, 'token-a')
    expect(state.kind).toBe('coup')
    expect(state.phase).toBe('play')
    for (const p of state.players) {
      expect(p.influence).toBe(2)
      // Nothing on the wire state names a face-down card.
      expect(p).not.toHaveProperty('hand')
      expect(p.revealed).toEqual([])
    }
  })

  it('shows each player their own hand and nobody else’s', () => {
    const r = room()
    const mine = view(r, 'token-a')
    expect(mine.hand).toHaveLength(2)
    expect(mine.hand).toEqual(r.coup!.state.players[0].hand)

    // B's view carries B's hand and no trace of anyone else's.
    const theirs = view(r, 'token-b')
    expect(theirs.hand).toEqual(r.coup!.state.players[1].hand)
    expect(JSON.stringify(theirs.players)).not.toContain(mine.hand[0])
  })

  it('gives a spectator no hand at all', () => {
    const r = room()
    const state = view(r, 'nobody')
    expect(state.you).toBeNull()
    expect(state.hand).toEqual([])
    expect(state.can.actions).toEqual([])
  })

  it('sends the court deck as a count only', () => {
    const r = room()
    const state = view(r, 'token-a')
    // Fifteen cards, six dealt out to three players.
    expect(state.deckCount).toBe(DECK_SIZE - 6)
    expect(state).not.toHaveProperty('deck')
  })

  it('offers the turn player actions and everyone else none', () => {
    const r = room()
    expect(view(r, 'token-a').can.actions.length).toBeGreaterThan(0)
    expect(view(r, 'token-b').can.actions).toEqual([])
    expect(view(r, 'token-a').can.targets).toEqual([1, 2])
  })

  it('opens a challenge window to the opponents once a claim is made', () => {
    const r = room()
    expect(r.coup!.declare(0, 'tax', null).ok).toBe(true)

    const actor = view(r, 'token-a')
    expect(actor.pending?.step).toBe('action')
    expect(actor.can.challenge).toBe(false)
    expect(actor.can.pass).toBe(false)

    const other = view(r, 'token-b')
    expect(other.can.challenge).toBe(true)
    expect(other.can.pass).toBe(true)
  })

  it('keeps an exchange’s drawn cards to the player who drew them', () => {
    const r = room()
    r.coup!.declare(0, 'exchange', null)
    r.coup!.pass(1)
    r.coup!.pass(2)

    const mine = view(r, 'token-a')
    expect(mine.pending?.step).toBe('exchange')
    expect(mine.drawn).toHaveLength(2)
    expect(mine.can.exchange).toBe(2)

    const theirs = view(r, 'token-b')
    // The other seats are told an exchange is happening, and how many cards are
    // in hand — never which they are.
    expect(theirs.pending).toEqual({ step: 'exchange', player: 0, count: 2 })
    expect(theirs.drawn).toEqual([])
  })

  it('survives a snapshot round-trip mid-window', () => {
    const r = room()
    r.coup!.declare(0, 'tax', null)
    r.coup!.pass(1)
    const back = Room.fromSnapshot(JSON.parse(JSON.stringify(r.toSnapshot())) as RoomSnapshot)
    expect(back.coup).not.toBeNull()
    expect(back.game).toBeNull()
    expect(back.coup!.state).toEqual(r.coup!.state)
    // The rebuilt engine is still an engine: the last responder closes the window.
    expect(back.coup!.pass(2).ok).toBe(true)
    expect(back.coup!.state.players[0].coins).toBe(5)
  })

  it('does not hand the opening seat to the host', () => {
    // Seat 0 opened the room; over many deals it must not open the game more
    // often than anyone else. A fixed first seat would sit at 100% here.
    const counts = [0, 0, 0]
    for (let i = 0; i < 200; i++) {
      const r = new Room(`R${i}`)
      r.options = { ...DEFAULT_OPTIONS, kind: 'coup' }
      r.addSeat('token-a', 'Ada')
      r.addSeat('token-b', 'Bo')
      r.addSeat('token-c', 'Cy')
      r.start()
      counts[r.coup!.state.current]++
    }
    for (const seats of counts) expect(seats).toBeGreaterThan(20)
    expect(counts[0] + counts[1] + counts[2]).toBe(200)
  })

  it('sends the roll-off that decided the opening seat', () => {
    const r = room()
    const opening = view(r, 'token-b').opening!
    expect(opening).not.toBeNull()
    // The last round settles it: one seat throws highest, and that is the winner.
    const last = opening.rounds[opening.rounds.length - 1]
    const best = Math.max(...last.map((x) => x.roll))
    const top = last.filter((x) => x.roll === best)
    expect(top).toHaveLength(1)
    expect(top[0].player).toBe(opening.winner)
    // Every earlier round ended in a tie at the top, which is why it went again,
    // and each one is thrown only by the seats still level.
    opening.rounds.slice(0, -1).forEach((round, i) => {
      const high = Math.max(...round.map((x) => x.roll))
      const tied = round.filter((x) => x.roll === high)
      expect(tied.length).toBeGreaterThan(1)
      expect(opening.rounds[i + 1].map((x) => x.player)).toEqual(tied.map((x) => x.player))
    })
  })

  it('draws the seat quietly when the roll is switched off', () => {
    const r = new Room('CUPQ')
    r.options = { ...DEFAULT_OPTIONS, kind: 'coup', diceStart: false }
    r.addSeat('token-a', 'Ada')
    r.addSeat('token-b', 'Bo')
    r.start()
    expect(r.coup!.state.opening).toBeNull()
    expect(view(r, 'token-a').opening).toBeNull()
    // Still a real seat, just chosen without an audience.
    expect([0, 1]).toContain(r.coup!.state.current)
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

  it('hands each pending decision its own period, not just each turn', () => {
    const r = timedRoom(30)
    const start = Date.now()
    r.syncTurnTimer(start)
    const armed = r.turnDeadline

    // Half a period later the actor declares, which opens a challenge window —
    // a new decision, and so a fresh period for the players who must answer it.
    r.coup!.declare(0, 'tax', null)
    r.syncTurnTimer(start + 15_000)
    expect(r.turnDeadline).toBeGreaterThan(armed!)
    expect(r.turnMsLeft(start + 15_000)).toBe(30_000)
  })

  it('gives a second forced loss in one turn its own period', () => {
    const r = timedRoom(30)
    const c = r.coup!
    // Player 1 challenges an assassination and is wrong, so they pay for the
    // challenge and then again for the strike it failed to stop — two losses
    // for the same player inside one turn.
    c.state.players[0].hand = ['assassin', 'duke']
    c.state.players[0].coins = 3
    c.state.players[1].hand = ['contessa', 'ambassador', 'captain']

    const start = Date.now()
    c.declare(0, 'assassinate', 1)
    c.challenge(1)
    r.syncTurnTimer(start)
    const firstDeadline = r.turnDeadline

    c.loseInfluence(1, 'captain')
    expect(c.state.pending[0]).toEqual({ step: 'lose', player: 1, reason: 'assassinate' })

    // Half a period later the second loss must be on a clock of its own, not
    // still running down the one the first loss started.
    r.syncTurnTimer(start + 15_000)
    expect(r.turnDeadline).toBeGreaterThan(firstDeadline!)
    expect(r.turnMsLeft(start + 15_000)).toBe(30_000)
  })

  it('freezes the clock while the table is paused', () => {
    const r = timedRoom(30)
    const start = Date.now()
    r.syncTurnTimer(start)
    r.coup!.pause(0)
    r.syncTurnTimer(start + 5_000)

    expect(r.paused).toBe(true)
    // Frozen at what was left when it stopped, however long the pause runs.
    expect(r.turnMsLeft(start + 5_000)).toBe(25_000)
    expect(r.turnMsLeft(start + 60_000)).toBe(25_000)
  })

  it('deals a fresh game on rematch once it is over', () => {
    const r = room()
    r.coup!.state.phase = 'over'
    r.coup!.state.result = { winner: 0, reason: 'test' }
    for (const seat of r.seats) seat.connected = true
    expect(r.rematch()).toBeNull()
    expect(r.coup!.state.phase).toBe('play')
  })
})
