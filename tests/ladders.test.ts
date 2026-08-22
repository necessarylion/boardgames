import { describe, expect, it } from 'vitest'

import { JUMPS, LAST_SQUARE, LaddersGame, POWER_COUNTS, SLIP_STEPS, SPRINT_STEPS, drawPowers, squareAt, type Power } from '../shared/ladders'
import { Rng } from '../shared/rng'

/** A fixed set of power squares, so the scripted throws below land where they mean to. */
const FIXED_POWERS: Record<number, Power> = {
  56: 'sprint',
  94: 'sprint',
  38: 'slip',
  85: 'slip',
  36: 'again',
  78: 'skip',
  22: 'carry',
  68: 'carry',
  11: 'swap',
  60: 'swap',
}

/** A dealt game whose opening seat and powers are pinned, so turns can be scripted. */
function started(playerCount = 2, seed = 7): LaddersGame {
  const game = new LaddersGame(playerCount, seed, false)
  game.state.current = 0
  game.state.powers = { ...FIXED_POWERS }
  return game
}

/** Put the next throw where the test wants it by trying seeds until it lands. */
function rollOf(game: LaddersGame, want: number) {
  for (let seed = 1; seed < 10_000; seed++) {
    const probe = LaddersGame.fromState(JSON.parse(JSON.stringify({ ...game.state, rngPosition: seed })))
    probe.roll(probe.state.current)
    if (probe.state.lastRoll!.roll === want) {
      game.state.rngPosition = seed
      return
    }
  }
  throw new Error(`no seed throws a ${want}`)
}

describe('the board', () => {
  it('snakes back and forth, with no jump chaining into another', () => {
    expect(squareAt(1)).toEqual({ col: 0, row: 0 })
    expect(squareAt(10)).toEqual({ col: 9, row: 0 })
    expect(squareAt(11)).toEqual({ col: 9, row: 1 })
    expect(squareAt(20)).toEqual({ col: 0, row: 1 })
    expect(squareAt(100)).toEqual({ col: 0, row: 9 })
    const targets = new Set(Object.values(JUMPS))
    for (const from of Object.keys(JUMPS).map(Number)) {
      expect(targets.has(from)).toBe(false)
      expect(from).not.toBe(LAST_SQUARE)
    }
  })
})

describe('rolling', () => {
  it('deals everyone off the board, a seat drawn to open', () => {
    const game = new LaddersGame(3, 1, false)
    expect(game.state.players.map((p) => p.pos)).toEqual([0, 0, 0])
    expect(game.state.current).toBeLessThan(3)
    expect(game.state.opening).toBeNull()
    expect(new LaddersGame(3, 1, true).state.opening).not.toBeNull()
  })

  it('only the current seat may roll, and a roll passes the turn', () => {
    const game = started()
    expect(game.roll(1).ok).toBe(false)
    rollOf(game, 3)
    expect(game.roll(0).ok).toBe(true)
    expect(game.state.players[0].pos).toBe(3)
    expect(game.state.current).toBe(1)
    expect(game.state.turnNumber).toBe(2)
  })

  it('a six is just a six — the turn still passes', () => {
    const game = started()
    rollOf(game, 6)
    expect(game.roll(0).ok).toBe(true)
    expect(game.state.players[0].pos).toBe(6)
    expect(game.state.lastRoll?.again).toBe(false)
    expect(game.state.current).toBe(1)
  })

  it('climbs a ladder and slides down a snake', () => {
    const game = started()
    game.state.players[0].pos = 1
    rollOf(game, 3)
    game.roll(0) // lands on 4, the foot of a ladder
    expect(game.state.players[0].pos).toBe(JUMPS[4])
    expect(game.state.lastRoll).toMatchObject({ landed: 4, to: JUMPS[4] })

    game.state.players[1].pos = 25
    rollOf(game, 2)
    game.roll(1) // lands on 27, a snake's head
    expect(game.state.players[1].pos).toBe(JUMPS[27])
  })

  it('bounces back off the top, and at two seats ends the game on an exact finish', () => {
    const game = started()
    game.state.players[0].pos = 96
    rollOf(game, 6)
    game.roll(0) // 96 + 6: up to 100, then two back
    expect(game.state.players[0].pos).toBe(98)
    expect(game.state.lastRoll).toMatchObject({ landed: 98, to: 98 })
    expect(game.state.current).toBe(1)

    game.state.current = 0
    rollOf(game, 2)
    game.roll(0)
    expect(game.state.phase).toBe('over')
    expect(game.state.result).toMatchObject({ winner: 0, standings: [0, 1] })
    expect(game.roll(1).ok).toBe(false)
  })

  it('races on for the places behind the winner, skipping seats that have finished', () => {
    const game = started(3)
    game.state.players[0].pos = 99
    game.state.players[2].pos = 99
    rollOf(game, 1)
    game.roll(0)
    expect(game.state.phase).toBe('play')
    expect(game.state.standings).toEqual([0])
    expect(game.state.current).toBe(1)
    // Seat 0 is done: after seat 1 the turn goes straight to seat 2.
    rollOf(game, 2)
    game.roll(1)
    expect(game.state.current).toBe(2)
    rollOf(game, 1)
    game.roll(2)
    expect(game.state.phase).toBe('over')
    expect(game.state.result).toMatchObject({ winner: 0, standings: [0, 2, 1] })
  })

  it('draws a full set of power squares per game, clear of every jump and each other', () => {
    const jumpSquares = new Set([...Object.keys(JUMPS).map(Number), ...Object.values(JUMPS)])
    const total = Object.values(POWER_COUNTS).reduce((a, b) => a + b, 0)
    const layouts = new Set<string>()
    for (let seed = 1; seed <= 50; seed++) {
      const powers = drawPowers(new Rng(seed))
      const squares = Object.keys(powers).map(Number)
      expect(squares).toHaveLength(total)
      layouts.add(squares.sort((a, b) => a - b).join(','))
      for (const n of squares) {
        expect(n).toBeGreaterThan(4)
        expect(n).toBeLessThan(LAST_SQUARE)
        expect(jumpSquares.has(n)).toBe(false)
        expect(powers[n + SPRINT_STEPS]).toBeUndefined()
        expect(powers[n - SLIP_STEPS]).toBeUndefined()
      }
      for (const power of Object.keys(POWER_COUNTS) as Power[]) {
        expect(squares.filter((n) => powers[n] === power)).toHaveLength(POWER_COUNTS[power])
      }
    }
    expect(layouts.size).toBeGreaterThan(40)
    expect(Object.keys(new LaddersGame(2, 3).state.powers)).toHaveLength(total)
  })

  it('sprints on and slips back, with the stops kept for the replay', () => {
    const game = started()
    game.state.players[0].pos = 91
    rollOf(game, 3)
    game.roll(0) // 94: sprint
    expect(game.state.players[0].pos).toBe(97)
    expect(game.state.lastRoll).toMatchObject({ landed: 94, via: [], to: 97, power: 'sprint' })

    game.state.players[1].pos = 36
    rollOf(game, 2)
    game.roll(1) // 38: slip to 33, the foot of a ladder
    expect(game.state.lastRoll).toMatchObject({ landed: 38, via: [33], to: JUMPS[33], power: 'slip' })
    expect(game.state.players[1].pos).toBe(JUMPS[33])
  })

  it('grants an extra throw, and a skipped seat sits out once', () => {
    const game = started(3)
    game.state.players[0].pos = 34
    rollOf(game, 2)
    game.roll(0) // 36: again
    expect(game.state.current).toBe(0)
    expect(game.state.lastRoll?.again).toBe(true)

    game.state.players[0].pos = 75
    rollOf(game, 3)
    game.roll(0) // 78: skip
    expect(game.state.players[0].skip).toBe(true)
    expect(game.state.current).toBe(1)
    rollOf(game, 1)
    game.roll(1)
    expect(game.state.current).toBe(2)
    rollOf(game, 1)
    game.roll(2)
    // Seat 0 sits out; play returns to seat 1.
    expect(game.state.current).toBe(1)
    expect(game.state.players[0].skip).toBe(false)
  })

  it('carries friends from the square it left, and swaps with the player ahead', () => {
    const game = started(3)
    game.state.players[0].pos = 20
    game.state.players[1].pos = 20
    game.state.players[2].pos = 70
    rollOf(game, 2)
    game.roll(0) // 22: carry
    expect(game.state.players[1].pos).toBe(22)
    expect(game.state.lastRoll?.others).toEqual([{ player: 1, from: 20, to: 22 }])

    game.state.current = 1
    game.state.players[1].pos = 58
    rollOf(game, 2)
    game.roll(1) // 60: swap with seat 2 at 70
    expect(game.state.players[1].pos).toBe(70)
    expect(game.state.players[2].pos).toBe(60)
    expect(game.state.lastRoll).toMatchObject({ landed: 60, to: 70, power: 'swap', others: [{ player: 2, from: 70, to: 60 }] })
  })

  it('is not held to the seat by a pause, and times out for the roller', () => {
    const game = started()
    expect(game.pause(1).ok).toBe(true)
    expect(game.roll(0).ok).toBe(false)
    expect(game.resume(0).ok).toBe(true)
    expect(game.timeOut().ok).toBe(true)
    expect(game.state.players[0].rolls).toBe(1)
  })
})
