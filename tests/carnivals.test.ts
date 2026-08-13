import { describe, expect, it } from 'vitest'

import {
  CARD_HIGH,
  CARD_LOW,
  CarnivalGame,
  HAND_CARDS,
  MIN_RAISE,
  STARTING_CARNIVALS,
  affordances,
  score,
} from '../shared/carnivals'

/** A round bet each scripted seat has already put in, so there is a pot to win. */
const BET = 10

/**
 * Build a game and force its cards, stacks and the betting state to a known
 * layout, skipping the blind picking step so the betting scenarios can set the
 * two numbers each seat holds outright. Every seat begins having already bet
 * `BET`, so a pot exists (there is no ante — the pot is seeded here for tests).
 *
 * `stacks` are the Carnivals each player has left, after that opening bet.
 */
function scripted(cards: [number, number][], stacks?: number[]): CarnivalGame {
  const game = new CarnivalGame(cards.length, 7, false)
  const s = game.state
  s.players.forEach((p, i) => {
    p.red = cards[i][0]
    p.blue = cards[i][1]
    p.carnivals = stacks?.[i] ?? STARTING_CARNIVALS - BET
    p.committed = BET
    p.folded = false
    p.out = false
    p.selected = true
    p.revealed = false
  })
  s.pot = BET * cards.length
  s.currentBet = BET
  s.acted = []
  s.current = 0
  s.dealer = 0
  s.step = 'betting'
  s.roundResult = null
  return game
}

/** Turn every still-in seat's hand over, resolving the showdown. */
function revealAll(game: CarnivalGame): void {
  for (const p of game.state.players) {
    if (!p.out && !p.folded && !p.revealed) game.reveal(p.id)
  }
}

describe('picking cards', () => {
  it('starts a hand in the selecting step with nobody yet chosen', () => {
    const game = new CarnivalGame(3, 99, false)
    const s = game.state
    expect(s.step).toBe('selecting')
    for (const p of s.players) {
      expect(p.selected).toBe(false)
      expect(p.red).toBeNull()
      expect(p.blue).toBeNull()
      // A full face-down suit of each colour to pick from.
      expect(p.redPool).toHaveLength(HAND_CARDS)
      expect(p.bluePool).toHaveLength(HAND_CARDS)
      expect([...p.redPool].sort((a, b) => a - b)).toEqual(
        Array.from({ length: HAND_CARDS }, (_, i) => CARD_LOW + i),
      )
    }
  })

  it('takes the card behind the picked position and shows only the red', () => {
    const game = new CarnivalGame(2, 99, false)
    const p = game.state.players[0]
    const expectRed = p.redPool[3]
    const expectBlue = p.bluePool[7]
    expect(game.select(0, 3, 7).ok).toBe(true)
    expect(p.selected).toBe(true)
    expect(p.red).toBe(expectRed)
    expect(p.blue).toBe(expectBlue)
    expect(p.red).toBeGreaterThanOrEqual(CARD_LOW)
    expect(p.red).toBeLessThanOrEqual(CARD_HIGH)
  })

  it('opens the betting once everyone has chosen', () => {
    const game = new CarnivalGame(2, 99, false)
    game.select(0, 0, 0)
    expect(game.state.step).toBe('selecting')
    game.select(1, 0, 0)
    expect(game.state.step).toBe('betting')
    expect(game.state.current).toBe(game.state.dealer)
  })

  it('refuses a bad position, a second pick, and betting before the deal is chosen', () => {
    const game = new CarnivalGame(2, 99, false)
    expect(game.select(0, -1, 0).ok).toBe(false)
    expect(game.select(0, HAND_CARDS, 0).ok).toBe(false)
    expect(game.check(0).ok).toBe(false)
    expect(game.select(0, 0, 0).ok).toBe(true)
    expect(game.select(0, 1, 1).ok).toBe(false)
  })
})

describe('dealing', () => {
  it('starts each hand with an empty pot and no ante taken', () => {
    const game = new CarnivalGame(4, 99, false)
    const s = game.state
    for (const p of s.players) {
      expect(p.carnivals).toBe(STARTING_CARNIVALS)
      expect(p.committed).toBe(0)
    }
    expect(s.pot).toBe(0)
    expect(s.currentBet).toBe(0)
  })
})

describe('a round of checks', () => {
  it('ends betting once everyone has checked, and waits on the reveal', () => {
    const game = scripted([
      [5, 5],
      [3, 2],
      [9, 1],
    ])
    game.check(0)
    game.check(1)
    game.check(2)
    expect(game.state.step).toBe('showdown')
    // Nobody has shown yet, so the pot is not settled.
    expect(game.state.roundResult).toBeNull()
  })

  it('splits the pot only between matching pairs at the showdown', () => {
    const game = scripted([
      [4, 6], // 10, high card 6
      [6, 4], // 10, high card 6 — the same pair, so it ties seat 0
      [3, 2], // 5
    ])
    game.check(0)
    game.check(1)
    game.check(2)
    revealAll(game)
    const r = game.state.roundResult!
    expect(r.byFold).toBe(false)
    expect(r.pot).toBe(BET * 3)
    expect(r.winners.sort()).toEqual([0, 1])
    expect(r.shares).toEqual({ 0: 15, 1: 15 })
    expect(game.state.players[2].carnivals).toBe(STARTING_CARNIVALS - BET)
  })

  it('breaks a level total by the higher single card', () => {
    const game = scripted([
      [3, 7], // 10, high card 7 — wins
      [5, 5], // 10, high card 5
    ])
    game.check(0)
    game.check(1)
    revealAll(game)
    const r = game.state.roundResult!
    expect(r.winners).toEqual([0])
    expect(r.shares).toEqual({ 0: BET * 2 })
  })

  it('shows only the seats still in the hand, not the folded ones', () => {
    const game = scripted([
      [8, 8],
      [1, 1],
      [4, 4],
    ])
    game.fold(0)
    game.check(1)
    game.check(2)
    revealAll(game)
    const reveals = game.state.roundResult!.reveals
    expect(reveals.map((r) => r.player)).toEqual([1, 2])
  })
})

describe('turning hands over', () => {
  it('settles the pot only once every contender has revealed', () => {
    const game = scripted([
      [7, 7],
      [2, 2],
    ])
    game.check(0)
    game.check(1)
    expect(game.state.step).toBe('showdown')
    game.reveal(0)
    expect(game.state.roundResult).toBeNull()
    game.reveal(1)
    expect(game.state.roundResult).not.toBeNull()
    expect(game.state.roundResult!.winners).toEqual([0])
  })

  it('refuses a reveal from a folded seat or a second reveal', () => {
    const game = scripted([
      [7, 7],
      [2, 2],
      [3, 3],
    ])
    game.check(0)
    game.check(1)
    game.fold(2) // in turn order — seat 2 acts last
    expect(game.state.step).toBe('showdown')
    expect(game.reveal(2).ok).toBe(false) // folded
    expect(game.reveal(0).ok).toBe(true)
    expect(game.reveal(0).ok).toBe(false) // already shown
  })
})

describe('raising and calling', () => {
  it('reopens the round to everyone who had already acted', () => {
    const game = scripted([
      [5, 5],
      [6, 6],
      [7, 7],
    ])
    expect(game.check(0).ok).toBe(true)
    expect(game.raise(1, 30).ok).toBe(true)
    expect(game.state.currentBet).toBe(30)
    expect(game.state.current).toBe(2)
    expect(game.call(2).ok).toBe(true)
    expect(game.state.current).toBe(0)
    expect(game.call(0).ok).toBe(true)
    expect(game.state.step).toBe('showdown')
    revealAll(game)
    expect(game.state.roundResult!.pot).toBe(BET * 3 + 20 * 3)
  })

  it('gives the pot to the last player standing when all others fold, with no reveal', () => {
    const game = scripted([
      [2, 2],
      [9, 9],
      [8, 8],
    ])
    game.raise(0, 40)
    game.fold(1)
    game.fold(2)
    expect(game.state.step).toBe('showdown')
    const r = game.state.roundResult!
    expect(r.byFold).toBe(true)
    expect(r.reveals).toEqual([])
    expect(r.winners).toEqual([0])
    expect(game.state.players[0].carnivals).toBe(STARTING_CARNIVALS - BET - 30 + r.pot)
  })

  it('refuses a raise below the minimum or beyond the stack', () => {
    const game = scripted([[5, 5], [5, 5]], [100, 100])
    expect(game.raise(0, BET + MIN_RAISE - 1).ok).toBe(false)
    expect(game.raise(0, 111).ok).toBe(false)
    expect(game.raise(0, 110).ok).toBe(true)
  })
})

describe('what a seat may do', () => {
  it('offers an unchosen seat the pick, and nothing else', () => {
    const game = new CarnivalGame(2, 99, false)
    const can = affordances(game.state, 0)
    expect(can.select).toBe(true)
    expect(can.check).toBe(false)
    game.select(0, 0, 0)
    expect(affordances(game.state, 0).select).toBe(false)
  })

  it('offers the turn seat a check and a fold, and everyone else nothing', () => {
    const game = scripted([[5, 5], [5, 5]])
    const mine = affordances(game.state, 0)
    expect(mine.check).toBe(true)
    expect(mine.fold).toBe(true)
    expect(mine.call).toBe(false)
    expect(affordances(game.state, 1).fold).toBe(false)
  })

  it('offers a reveal to a contender at the showdown', () => {
    const game = scripted([[5, 5], [3, 3]])
    game.check(0)
    game.check(1)
    expect(affordances(game.state, 0).reveal).toBe(true)
    game.reveal(0)
    expect(affordances(game.state, 0).reveal).toBe(false)
  })

  it('offers a short-stacked seat an all-in and a fold, not a call', () => {
    const game = scripted([[5, 5], [5, 5]], [990, 5])
    game.raise(0, 30)
    const can = affordances(game.state, 1)
    expect(can.call).toBe(false)
    expect(can.raise).toBe(false)
    expect(can.allIn).toBe(true)
    expect(can.allInAmount).toBe(5)
    expect(can.fold).toBe(true)
  })
})

describe('going all in', () => {
  it('puts the whole stack in and closes the seat out of the betting', () => {
    const game = scripted([[1, 1], [9, 9]], [990, 15])
    game.raise(0, 50)
    expect(affordances(game.state, 1).allIn).toBe(true)
    expect(game.allIn(1).ok).toBe(true)
    expect(game.state.players[1].carnivals).toBe(0)
    expect(game.state.players[1].committed).toBe(25) // 10 opening bet + 15 all in
    expect(game.state.step).toBe('showdown')
  })

  it('gives the whole pot to the best hand, leaving the all-in loser with nothing', () => {
    // Seat 1 goes all in short and holds the better hand, so it takes everything —
    // seat 0's larger bet included. There is no side pot.
    const game = scripted([[1, 1], [9, 9]], [990, 15])
    game.raise(0, 50)
    game.allIn(1)
    revealAll(game)
    const r = game.state.roundResult!
    expect(r.winners).toEqual([1])
    expect(r.pot).toBe(75) // 50 from seat 0 + 25 from seat 1
    expect(r.shares).toEqual({ 1: 75 })
    expect(game.state.players[1].carnivals).toBe(75)
    expect(game.state.players[0].carnivals).toBe(950)
  })

  it('knocks out a covered seat that goes all in and loses', () => {
    // Seat 0 raises with the better hand; seat 1 can only call all in for less and
    // is left with nothing.
    const game = scripted([[9, 9], [1, 1]], [990, 15])
    game.raise(0, 50)
    game.allIn(1)
    revealAll(game)
    const r = game.state.roundResult!
    expect(r.winners).toEqual([0])
    expect(r.pot).toBe(75)
    expect(r.shares).toEqual({ 0: 75 })
    expect(game.state.players[0].carnivals).toBe(1025)
    expect(game.state.players[1].carnivals).toBe(0) // out at the next deal
  })

  it('pays the whole three-way pot to the single best hand', () => {
    const game = scripted([[1, 1], [9, 9], [5, 5]], [990, 20, 990])
    game.raise(0, 60)
    game.allIn(1)
    game.call(2)
    revealAll(game)
    const r = game.state.roundResult!
    // Seat 1 holds the best hand and takes all 150; seats 0 and 2 win nothing.
    expect(r.winners).toEqual([1])
    expect(r.shares).toEqual({ 1: 150 })
    expect(r.pot).toBe(150)
    expect(game.state.players[1].carnivals).toBe(150)
    expect(game.state.players[0].carnivals).toBe(940)
    expect(game.state.players[2].carnivals).toBe(940)
  })
})

describe('knockouts', () => {
  it('knocks out every all-in loser when the whole table is all in', () => {
    const game = scripted([[9, 9], [5, 5], [1, 1]], [990, 990, 990])
    game.allIn(0)
    game.allIn(1)
    game.allIn(2)
    expect(game.state.step).toBe('showdown')
    revealAll(game)
    // Seat 0 holds the best hand and sweeps the pot; the other two are left broke.
    expect(game.state.players[1].carnivals).toBe(0)
    expect(game.state.players[2].carnivals).toBe(0)
    game.nextHand(0)
    // Both losers drop out at once, ending the game.
    expect(game.state.players[1].out).toBe(true)
    expect(game.state.players[2].out).toBe(true)
    expect(game.state.phase).toBe('over')
    expect(game.state.result!.winner).toBe(0)
  })
})

describe('money conservation', () => {
  it('does not mint Carnivals from an eliminated seat’s stale bet', () => {
    // Seats 0 and 1 play the hand; seat 2 was knocked out an earlier hand but is
    // still carrying the 500 it had committed then. That amount is gone — it must
    // not be peeled back into this pot.
    const game = scripted([[5, 5], [3, 3], [9, 9]])
    game.state.players[2].out = true
    game.state.players[2].committed = 500
    game.state.players[2].carnivals = 0
    // The live pot is only the two contenders' bets.
    game.state.pot = 20
    game.state.players[0].committed = 10
    game.state.players[1].committed = 10

    const before = game.state.players.reduce((sum, p) => sum + p.carnivals, 0)
    game.check(0)
    game.check(1)
    game.reveal(0)
    game.reveal(1)
    const after = game.state.players.reduce((sum, p) => sum + p.carnivals, 0)

    // The 20 in the pot is redistributed and nothing else is created.
    expect(after).toBe(before + 20)
    expect(game.state.roundResult!.pot).toBe(20)
  })

  it('clears an eliminated seat’s committed when the next hand is dealt', () => {
    // Three seats so the game continues after one is knocked out.
    const game = scripted([[9, 9], [5, 5], [1, 1]], [990, 990, 0]) // seat 2 all in for nothing
    game.check(0)
    game.check(1)
    revealAll(game)
    // Seat 2 wins nothing, so it is dropped as the next hand is dealt.
    game.nextHand(0)
    expect(game.state.players[2].out).toBe(true)
    // Its committed is wiped, so no stale bet can leak into a later pot.
    expect(game.state.players[2].committed).toBe(0)
  })
})

describe('between hands', () => {
  it('deals a fresh hand on request, back to the picking step', () => {
    const game = scripted([[5, 5], [3, 3]])
    game.check(0)
    game.check(1)
    revealAll(game)
    expect(game.nextHand(0).ok).toBe(true)
    expect(game.state.handNumber).toBe(2)
    expect(game.state.step).toBe('selecting')
    // A fresh hand starts with an empty pot and nothing yet committed.
    expect(game.state.pot).toBe(0)
    for (const p of game.state.players) {
      expect(p.committed).toBe(0)
      expect(p.selected).toBe(false)
    }
  })

  it('rotates the deal to the next live seat', () => {
    const game = scripted([[5, 5], [3, 3], [1, 1]])
    game.check(0)
    game.check(1)
    game.check(2)
    revealAll(game)
    game.nextHand(0)
    expect(game.state.dealer).toBe(1)
  })

  it('drops a broke seat and ends the game', () => {
    // Seat 1 is all in for what it has already bet — nothing behind it.
    const game = scripted([[9, 9], [1, 1]], [990, 0])
    game.check(0) // seat 1 is all in, so this closes the betting
    revealAll(game)
    expect(game.state.players[1].carnivals).toBe(0)
    game.nextHand(0)
    expect(game.state.players[1].out).toBe(true)
    expect(game.state.phase).toBe('over')
    expect(game.state.result!.winner).toBe(0)
  })
})

describe('the clock and pausing', () => {
  it('picks blind for a seat that never chose', () => {
    const game = new CarnivalGame(2, 99, false)
    game.select(0, 0, 0)
    expect(game.timeOut().ok).toBe(true)
    expect(game.state.players[1].selected).toBe(true)
    expect(game.state.step).toBe('betting')
  })

  it('checks for an absent bettor when there is nothing to call', () => {
    const game = scripted([[5, 5], [3, 3]])
    expect(game.timeOut().ok).toBe(true)
    expect(game.state.players[0].folded).toBe(false)
    expect(game.state.current).toBe(1)
  })

  it('folds an absent bettor who faces a live bet', () => {
    const game = scripted([[5, 5], [3, 3]])
    game.raise(0, 30)
    expect(game.timeOut().ok).toBe(true)
    expect(game.state.players[1].folded).toBe(true)
    // Everyone else folded, so the pot is conceded and resolved at once.
    expect(game.state.roundResult!.byFold).toBe(true)
  })

  it('turns absent hands over, then deals the next hand', () => {
    const game = scripted([[5, 5], [3, 3]])
    game.check(0)
    game.check(1)
    expect(game.state.step).toBe('showdown')
    // First timeout shows the hands the players never turned over.
    expect(game.timeOut().ok).toBe(true)
    expect(game.state.roundResult).not.toBeNull()
    // The next deals past the settled hand.
    expect(game.timeOut().ok).toBe(true)
    expect(game.state.handNumber).toBe(2)
    expect(game.state.step).toBe('selecting')
  })

  it('refuses every action while paused, and resumes', () => {
    const game = scripted([[5, 5], [3, 3]])
    expect(game.pause(0).ok).toBe(true)
    expect(game.check(0).ok).toBe(false)
    expect(game.timeOut().ok).toBe(false)
    expect(game.resume(1).ok).toBe(true)
    expect(game.check(0).ok).toBe(true)
  })
})

describe('scoring helper', () => {
  it('sums the two cards, or is null before a pick', () => {
    expect(score({ red: 7, blue: 2 } as never)).toBe(9)
    expect(score({ red: null, blue: 3 } as never)).toBeNull()
  })
})
