import { describe, expect, it } from 'vitest'

import {
  CONFISCATE_LIMIT,
  CopGame,
  ROOM_COUNT,
  ROUNDS_PER_COP,
  STARTING_EACH,
  affordances,
  isCop,
  lootTotal,
  thieves,
  type CopGameState,
} from '../shared/cop'

/**
 * A fresh game with the badge pinned to seat 0, so the tests that drive a round
 * are not at the mercy of the random opening Cop.
 */
function game(players = 3): CopGame {
  const g = new CopGame(players, 42, false)
  g.state.cop = 0
  g.state.firstCop = 0
  return g
}

/** Put every thief behind a door, one per room, so the search step opens up. */
function hideAll(g: CopGame, rooms?: number[]): void {
  const t = thieves(g.state)
  t.forEach((id, i) => g.select(id, rooms ? rooms[i] : i + 1))
}

describe('setting up a game', () => {
  it('deals eight rooms, richest first, and three of each to everyone', () => {
    const s = game().state
    expect(s.rooms).toHaveLength(ROOM_COUNT)
    for (let i = 1; i < s.rooms.length; i++) {
      expect(lootTotal(s.rooms[i - 1])).toBeGreaterThanOrEqual(lootTotal(s.rooms[i]))
    }
    for (const p of s.players) {
      expect(p.loot).toEqual({ key: STARTING_EACH, stamp: STARTING_EACH, card: STARTING_EACH })
      expect(p.caught).toBe(0)
    }
  })

  it('runs two rounds per player and starts on the choosing step', () => {
    const s = game(4).state
    expect(s.totalRounds).toBe(4 * ROUNDS_PER_COP)
    expect(s.round).toBe(1)
    expect(s.step).toBe('select')
  })

  it('lets every game but seat 0 open, when the roll is on', () => {
    const seen = new Set<number>()
    for (let i = 0; i < 100; i++) seen.add(new CopGame(3, 1000 + i, true).state.cop)
    // A three-player table should, over a hundred deals, seat the badge somewhere
    // other than seat 0 at least once.
    expect(seen.size).toBeGreaterThan(1)
  })
})

describe('choosing doors', () => {
  it('only lets thieves choose, and only once', () => {
    const g = game()
    expect(g.select(0, 1).ok).toBe(false) // seat 0 is the Cop
    expect(g.select(1, 2).ok).toBe(true)
    expect(g.select(1, 3).ok).toBe(false) // already chosen
  })

  it('opens the search step once every thief is hidden', () => {
    const g = game()
    expect(g.state.step).toBe('select')
    g.select(1, 0)
    expect(g.state.step).toBe('select')
    g.select(2, 1)
    expect(g.state.step).toBe('search')
  })

  it('rejects a room that is off the board', () => {
    const g = game()
    expect(g.select(1, ROOM_COUNT).ok).toBe(false)
    expect(g.select(1, -1).ok).toBe(false)
  })
})

describe('opening doors', () => {
  it('only lets the Cop open, and only two distinct doors', () => {
    const g = game()
    hideAll(g)
    expect(g.search(1, 0, 1).ok).toBe(false) // not the Cop
    expect(g.search(0, 2, 2).ok).toBe(false) // same door twice
    expect(g.search(0, 0, 1).ok).toBe(true)
  })

  it('catches the thieves behind an opened door and counts the catch', () => {
    const g = game()
    // Seat 1 in room 0, seat 2 in room 5.
    g.select(1, 0)
    g.select(2, 5)
    g.search(0, 0, 3) // opens 0 (catches seat 1) and 3 (empty)
    expect(g.state.roundResult?.caught).toEqual([1])
    expect(g.state.players[1].caught).toBe(1)
    expect(g.state.step).toBe('arrest')
  })

  it('gives a caught thief no loot from the room they were raided in', () => {
    const g = game()
    g.state.rooms[0] = { key: 6, stamp: 6, card: 3 } // a rich room
    g.select(1, 0)
    g.select(2, 5)
    const before = lootTotal(g.state.players[1].loot)
    g.search(0, 0, 3) // opens room 0, catching seat 1
    // Seat 1 was caught: they carry off nothing, and the room outcome is empty.
    expect(lootTotal(g.state.players[1].loot)).toBe(before)
    const room0 = g.state.roundResult!.rooms.find((r) => r.room === 0)!
    expect(room0.loot).toEqual({})
  })

  it('shares a shut room and settles it straight to resolved when nobody is caught', () => {
    const g = game(3)
    // Both thieves into room 0; the Cop opens two other doors.
    const room = 0
    g.state.rooms[room] = { key: 4, stamp: 2, card: 3 }
    g.select(1, room)
    g.select(2, room)
    g.search(0, 6, 7)
    expect(g.state.step).toBe('resolved')
    // Four keys between two: two each. Stamps: one each. Cards: three → one each,
    // and the odd one to a die roll — so between them they hold the whole room.
    const gained = (id: number) => lootTotal(g.state.players[id].loot) - STARTING_EACH * 3
    expect(gained(1) + gained(2)).toBe(lootTotal({ key: 4, stamp: 2, card: 3 }))
    expect(g.state.players[1].loot.key).toBe(STARTING_EACH + 2)
  })
})

describe('the arrest', () => {
  it('moves loot from a caught thief to the Cop, capped at two', () => {
    const g = game()
    g.select(1, 0)
    g.select(2, 5)
    g.search(0, 0, 1) // catches seat 1 in room 0
    expect(g.state.step).toBe('arrest')

    // More than two in total is refused.
    expect(g.confiscate(0, { 1: { key: 2, stamp: 1, card: 0 } }).ok).toBe(false)

    const before = { ...g.state.players[0].loot }
    expect(g.confiscate(0, { 1: { key: 2, stamp: 0, card: 0 } }).ok).toBe(true)
    expect(g.state.players[1].loot).toEqual({ key: 1, stamp: 3, card: 3 })
    expect(g.state.players[0].loot).toEqual({ key: before.key + 2, stamp: before.stamp, card: before.card })
    expect(g.state.step).toBe('resolved')
  })

  it('clamps a confiscation to what a caught thief holds, taking no more', () => {
    const g = game()
    g.state.players[1].loot = { key: 1, stamp: 0, card: 0 }
    g.select(1, 0)
    g.select(2, 5)
    g.search(0, 0, 1) // catches seat 1
    const copKey = g.state.players[0].loot.key
    // The Cop asks for two keys; the thief holds only one, so one is taken.
    expect(g.confiscate(0, { 1: { key: 2, stamp: 0, card: 0 } }).ok).toBe(true)
    expect(g.state.players[1].loot.key).toBe(0)
    expect(g.state.players[0].loot.key).toBe(copKey + 1)
    expect(g.state.roundResult!.confiscations[1]).toEqual({ key: 1, stamp: 0, card: 0 })
  })

  it('lets the Cop take nothing at all', () => {
    const g = game()
    g.select(1, 0)
    g.select(2, 0)
    g.search(0, 0, 1)
    const before = g.state.players.map((p) => ({ ...p.loot }))
    expect(g.confiscate(0, {}).ok).toBe(true)
    expect(g.state.players.map((p) => p.loot)).toEqual(before)
    expect(g.state.step).toBe('resolved')
  })
})

describe('the badge and the end', () => {
  it('passes the badge every two rounds and ends after everyone has worn it', () => {
    const g = game(3)
    const copsByRound: number[] = []
    // Drive the game to its end, always opening two empty doors.
    for (let guard = 0; guard < 50 && g.state.phase === 'play'; guard++) {
      const s = g.state
      if (s.step === 'select') {
        copsByRound[s.round] = s.cop
        for (const id of thieves(s)) if (s.selections[id] === null) g.select(id, id % ROOM_COUNT)
      } else if (s.step === 'search') {
        // Open two rooms no thief chose, so nobody is caught and no arrest stalls.
        const taken = new Set(s.selections.filter((r): r is number => r !== null))
        const doors: number[] = []
        for (let r = 0; r < ROOM_COUNT && doors.length < 2; r++) if (!taken.has(r)) doors.push(r)
        g.search(s.cop, doors[0], doors[1])
      } else if (s.step === 'arrest') {
        g.confiscate(s.cop, {})
      } else {
        g.next(0)
      }
    }
    expect(g.state.phase).toBe('over')
    // Seat 0 for rounds 1–2, seat 1 for 3–4, seat 2 for 5–6.
    expect(copsByRound[1]).toBe(0)
    expect(copsByRound[2]).toBe(0)
    expect(copsByRound[3]).toBe(1)
    expect(copsByRound[5]).toBe(2)
    expect(g.state.result).not.toBeNull()
  })

  it('awards a leader token per resource and picks the winner on tokens', () => {
    const g = game(2)
    // Force a finished board where seat 1 outright leads all three resources.
    g.state.round = g.state.totalRounds
    g.state.step = 'resolved'
    g.state.players[0].loot = { key: 1, stamp: 1, card: 1 }
    g.state.players[1].loot = { key: 5, stamp: 5, card: 5 }
    g.next(0)
    expect(g.state.phase).toBe('over')
    const r = g.state.result!
    expect(r.leaders).toEqual({ key: 1, stamp: 1, card: 1 })
    expect(r.winners).toEqual([1])
  })

  it('leaves a tied resource token unclaimed', () => {
    const g = game(2)
    g.state.round = g.state.totalRounds
    g.state.step = 'resolved'
    g.state.players[0].loot = { key: 4, stamp: 1, card: 2 }
    g.state.players[1].loot = { key: 4, stamp: 3, card: 1 }
    g.next(0)
    const r = g.state.result!
    // Keys are level, so that token goes unwon; stamps to seat 1, cards to seat 0.
    expect(r.leaders.key).toBeNull()
    expect(r.leaders.stamp).toBe(1)
    expect(r.leaders.card).toBe(0)
  })
})

describe('affordances and timeouts', () => {
  it('offers select to a waiting thief and search to the Cop', () => {
    const g = game()
    expect(affordances(g.state, 1).select).toBe(true)
    expect(affordances(g.state, 0).select).toBe(false)
    hideAll(g)
    expect(affordances(g.state, 0).search).toBe(true)
    expect(affordances(g.state, 1).search).toBe(false)
  })

  it('times a stalled step out to the least eventful legal move', () => {
    const g = game()
    // Nobody chose: the timeout hides every thief behind door 0 and opens search.
    expect(g.timeOut().ok).toBe(true)
    expect(g.state.step).toBe('search')
    // The Cop never opened: the timeout opens the first two doors.
    expect(g.timeOut().ok).toBe(true)
    expect(['arrest', 'resolved']).toContain(g.state.step)
  })

  it('rebuilds from state with fromState and is still an engine', () => {
    const g = game()
    hideAll(g)
    const back = CopGame.fromState(JSON.parse(JSON.stringify(g.state)) as CopGameState)
    expect(back.state.step).toBe('search')
    expect(back.search(0, 0, 1).ok).toBe(true)
    expect(isCop(back.state, 0)).toBe(true)
  })
})

describe('confiscation limits', () => {
  it('the cap is two resources', () => {
    expect(CONFISCATE_LIMIT).toBe(2)
  })
})
