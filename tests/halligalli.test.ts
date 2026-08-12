import { describe, expect, it } from 'vitest'

import {
  DECK_SIZE,
  FRUITS,
  HalliGame,
  buildDeck,
  fruitTotals,
  ringingFruit,
  type Card,
  type HalliGameState,
} from '../shared/halligalli'

/** Build a game and force its stacks/piles to a known layout for a scenario. */
function scripted(piles: { stack?: Card[]; faceUp?: Card[]; out?: boolean }[]): HalliGame {
  const game = new HalliGame(piles.length, 1)
  game.state.players.forEach((p, i) => {
    p.stack = piles[i].stack ?? []
    p.faceUp = piles[i].faceUp ?? []
    p.out = piles[i].out ?? false
  })
  game.state.current = 0
  return game
}

const card = (fruit: Card['fruit'], n: number): Card => ({ fruit, n })

describe('the opening seat', () => {
  it('is drawn rather than always falling to seat zero', () => {
    const counts = [0, 0, 0]
    for (let seed = 1; seed <= 180; seed++) counts[new HalliGame(3, seed).state.current]++
    for (const seat of counts) expect(seat).toBeGreaterThan(20)
  })

  it('keeps the roll-off only when the dice are on', () => {
    expect(new HalliGame(3, 7, true).state.opening).not.toBeNull()
    expect(new HalliGame(3, 7, false).state.opening).toBeNull()
    // Either way somebody real is on the clock.
    expect([0, 1, 2]).toContain(new HalliGame(3, 7, false).state.current)
  })
})

describe('the deck', () => {
  it('holds fifty-six cards, fourteen of each fruit', () => {
    const deck = buildDeck()
    expect(deck).toHaveLength(DECK_SIZE)
    expect(DECK_SIZE).toBe(56)
    for (const fruit of FRUITS) {
      expect(deck.filter((c) => c.fruit === fruit)).toHaveLength(14)
    }
  })

  it('weights low counts common and fives rare, per fruit', () => {
    const deck = buildDeck()
    for (const fruit of FRUITS) {
      const of = (n: number) => deck.filter((c) => c.fruit === fruit && c.n === n).length
      expect([of(1), of(2), of(3), of(4), of(5)]).toEqual([5, 3, 3, 2, 1])
    }
  })
})

describe('dealing', () => {
  it('shares every card out and keeps none back', () => {
    const game = new HalliGame(3, 42)
    const held = game.state.players.reduce((a, p) => a + p.stack.length, 0)
    expect(held).toBe(DECK_SIZE)
    // 56 across 3 spreads as evenly as it can: 19, 19, 18.
    const sizes = game.state.players.map((p) => p.stack.length).sort()
    expect(sizes).toEqual([18, 19, 19])
  })

  it('is reproducible from a seed', () => {
    const a = new HalliGame(4, 7).state.players.map((p) => p.stack)
    const b = new HalliGame(4, 7).state.players.map((p) => p.stack)
    expect(a).toEqual(b)
  })
})

describe('ringing detection', () => {
  it('reads only the top card of each pile', () => {
    const players = [
      { id: 0, out: false, stack: [], faceUp: [card('lime', 4), card('banana', 2)] },
      { id: 1, out: false, stack: [], faceUp: [card('banana', 3)] },
    ]
    // Tops are 2 banana + 3 banana = 5; the buried 4 lime does not count.
    expect(fruitTotals(players).banana).toBe(5)
    expect(ringingFruit(players)).toBe('banana')
  })

  it('finds no bell when nothing totals five', () => {
    const players = [
      { id: 0, out: false, stack: [], faceUp: [card('lime', 2)] },
      { id: 1, out: false, stack: [], faceUp: [card('lime', 2)] },
    ]
    expect(ringingFruit(players)).toBeNull()
  })
})

describe('flipping', () => {
  it('moves the top card up and passes the turn on', () => {
    const game = scripted([
      { stack: [card('lime', 1), card('banana', 3)] },
      { stack: [card('plum', 2)] },
    ])
    expect(game.flip(0).ok).toBe(true)
    // The last stack card is the one turned over.
    expect(game.state.players[0].faceUp).toEqual([card('banana', 3)])
    expect(game.state.current).toBe(1)
  })

  it('refuses a flip that is not the current player’s', () => {
    const game = scripted([{ stack: [card('lime', 1)] }, { stack: [card('lime', 1)] }])
    expect(game.flip(1).ok).toBe(false)
  })

  it('skips a player who has no cards to flip', () => {
    const game = scripted([
      { stack: [card('lime', 1)] },
      { stack: [] }, // seat 1 cannot flip
      { stack: [card('plum', 1)] },
    ])
    game.flip(0)
    // The turn jumps over the empty seat 1 to seat 2.
    expect(game.state.current).toBe(2)
  })
})

describe('a correct ring', () => {
  it('sweeps every face-up pile to the ringer and passes play on', () => {
    const game = scripted([
      { stack: [card('lime', 1)], faceUp: [card('banana', 2)] },
      { stack: [], faceUp: [card('banana', 3)] },
      { stack: [card('plum', 1)], faceUp: [card('lime', 4)] },
    ])
    // Seat 2 rings on the banana total of five.
    const before = game.state.players[2].stack.length
    expect(game.slap(2).ok).toBe(true)
    // Won the three face-up cards.
    expect(game.state.players[2].stack.length).toBe(before + 3)
    expect(game.state.players.every((p) => p.faceUp.length === 0)).toBe(true)
    // Play resumes to the left of the ringer.
    expect(game.state.current).toBe(0)
  })
})

describe('a false ring', () => {
  it('pays one card to each opponent', () => {
    const game = scripted([
      { stack: [card('lime', 1), card('lime', 1), card('lime', 1)], faceUp: [card('lime', 2)] },
      { stack: [card('plum', 1)], faceUp: [card('plum', 2)] },
      { stack: [card('banana', 1)], faceUp: [card('banana', 1)] },
    ])
    // No fruit totals five, so seat 0 rings by mistake.
    expect(game.slap(0).ok).toBe(true)
    expect(game.state.players[0].stack).toHaveLength(1) // paid two of three
    expect(game.state.players[1].stack).toHaveLength(2)
    expect(game.state.players[2].stack).toHaveLength(2)
  })

  it('puts a player out when a mistake empties their last cards', () => {
    const game = scripted([
      { stack: [card('lime', 1)], faceUp: [] },
      { stack: [card('plum', 1)], faceUp: [card('plum', 2)] },
    ])
    // Seat 0 rings wrongly with a single card and nothing face up: they go out.
    expect(game.slap(0).ok).toBe(true)
    expect(game.state.players[0].out).toBe(true)
    // Only one player left, so the game is over and they win.
    expect(game.state.phase).toBe('over')
    expect(game.state.result?.winner).toBe(1)
  })
})

describe('winning', () => {
  it('ends when a ring leaves only one player holding cards', () => {
    const game = scripted([
      // Seat 0 rings; seat 1 has no stack, only the face-up cards it is about to lose.
      { stack: [card('lime', 1)], faceUp: [card('banana', 2)] },
      { stack: [], faceUp: [card('banana', 3)] },
    ])
    expect(game.slap(0).ok).toBe(true)
    expect(game.state.players[1].out).toBe(true)
    expect(game.state.phase).toBe('over')
    expect(game.state.result?.winner).toBe(0)
  })

  it('settles a stalemate on who holds the most cards', () => {
    const game = scripted([
      // Nobody can flip (all stacks empty) and no fruit totals five: frozen.
      { stack: [], faceUp: [card('lime', 1), card('lime', 1)] },
      { stack: [], faceUp: [card('plum', 2)] },
    ])
    // A mistaken ring by seat 1 triggers the end check without changing who leads.
    game.slap(1)
    expect(game.state.phase).toBe('over')
    expect(game.state.result?.winner).toBe(0)
  })
})

describe('ringing an empty board', () => {
  it('is refused when no card is face up, but allowed once one is', () => {
    const game = scripted([
      { stack: [card('lime', 1)], faceUp: [] },
      { stack: [card('plum', 1)], faceUp: [] },
    ])
    // Nothing is showing, so there is nothing to ring for.
    expect(game.slap(0).ok).toBe(false)
    // A stackless ringer is still allowed once a card is face up.
    game.state.players[1].stack = []
    game.state.players[1].faceUp = [card('plum', 2)]
    expect(game.slap(1).ok).toBe(true)
  })
})

describe('pause', () => {
  it('blocks flips and rings until resumed', () => {
    const game = scripted([{ stack: [card('lime', 1)] }, { stack: [card('lime', 1)] }])
    expect(game.pause(0).ok).toBe(true)
    expect(game.flip(0).ok).toBe(false)
    expect(game.slap(1).ok).toBe(false)
    expect(game.resume(0).ok).toBe(true)
    expect(game.flip(0).ok).toBe(true)
  })
})

describe('persistence', () => {
  it('round-trips through JSON and keeps playing', () => {
    const game = new HalliGame(3, 99)
    game.flip(0)
    const snapshot = JSON.parse(JSON.stringify(game.state)) as HalliGameState
    const back = HalliGame.fromState(snapshot)
    expect(back.state).toEqual(game.state)
    // The rebuilt engine still validates actions.
    expect(back.flip(0).ok).toBe(false) // not seat 0's turn any more
  })
})
