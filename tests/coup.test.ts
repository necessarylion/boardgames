import { describe, expect, it } from 'vitest'

import {
  CHARACTERS,
  COPIES_PER_CHARACTER,
  CoupGame,
  DECK_SIZE,
  FORCED_COUP_AT,
  STARTING_COINS,
  blockOptions,
  buildDeck,
  canChallenge,
  legalActions,
  responders,
  type CoupCharacter,
  type CoupGameState,
} from '../shared/coup'

/**
 * Build a game and force its hands, coins and court deck to a known layout. Coup
 * turns entirely on who holds what, so almost every scenario below needs to say
 * so outright rather than deal for it.
 */
function scripted(hands: CoupCharacter[][], coins?: number[]): CoupGame {
  const game = new CoupGame(hands.length, 7)
  game.state.players.forEach((p, i) => {
    p.hand = [...hands[i]]
    p.revealed = []
    p.out = false
    p.coins = coins?.[i] ?? STARTING_COINS
  })
  // Whatever was dealt is irrelevant once the hands are set; leave the deck a
  // known remainder so a replacement draw is predictable.
  game.state.deck = ['duke', 'captain', 'ambassador', 'contessa', 'assassin']
  game.state.current = 0
  game.state.pending = []
  game.state.phase = 'play'
  return game
}

describe('the court deck', () => {
  it('holds three of each of the five characters', () => {
    const deck = buildDeck()
    expect(deck).toHaveLength(DECK_SIZE)
    expect(DECK_SIZE).toBe(15)
    for (const character of CHARACTERS) {
      expect(deck.filter((c) => c === character)).toHaveLength(COPIES_PER_CHARACTER)
    }
  })
})

describe('dealing', () => {
  it('gives every player two influence and two coins', () => {
    const game = new CoupGame(4, 99)
    expect(game.state.players).toHaveLength(4)
    for (const p of game.state.players) {
      expect(p.hand).toHaveLength(2)
      expect(p.coins).toBe(STARTING_COINS)
      expect(p.revealed).toEqual([])
      expect(p.out).toBe(false)
    }
    // Four players take eight of the fifteen; the rest stay in the court deck.
    expect(game.state.deck).toHaveLength(DECK_SIZE - 8)
  })

  it('seats six players, the most the base deck stretches to', () => {
    const game = new CoupGame(6, 5)
    expect(game.state.deck).toHaveLength(DECK_SIZE - 12)
    expect(game.state.players.every((p) => p.hand.length === 2)).toBe(true)
  })
})

describe('income', () => {
  it('takes a coin and passes the turn, answering to nobody', () => {
    const game = scripted([['duke', 'captain'], ['contessa', 'ambassador']])
    expect(game.declare(0, 'income', null).ok).toBe(true)
    expect(game.state.players[0].coins).toBe(3)
    expect(game.state.pending).toEqual([])
    expect(game.state.current).toBe(1)
  })

  it('is refused when it is not your turn', () => {
    const game = scripted([['duke', 'captain'], ['contessa', 'ambassador']])
    expect(game.declare(1, 'income', null)).toEqual({ ok: false, error: 'It is not your turn.' })
  })
})

describe('a coup', () => {
  it('costs seven, cannot be answered, and takes an influence', () => {
    const game = scripted([['duke', 'captain'], ['contessa', 'ambassador']], [7, 2])
    expect(game.declare(0, 'coup', 1).ok).toBe(true)
    expect(game.state.players[0].coins).toBe(0)
    // Nothing to challenge or block: the target is straight onto choosing.
    expect(game.state.pending[0]).toEqual({ step: 'lose', player: 1, reason: 'coup' })
    expect(canChallenge(game.state, 1)).toBe(false)

    expect(game.loseInfluence(1, 'contessa').ok).toBe(true)
    expect(game.state.players[1].hand).toEqual(['ambassador'])
    expect(game.state.players[1].revealed).toEqual(['contessa'])
    expect(game.state.current).toBe(1)
  })

  it('is unaffordable below seven coins', () => {
    const game = scripted([['duke', 'captain'], ['contessa', 'ambassador']], [6, 2])
    expect(legalActions(game.state, 0)).not.toContain('coup')
    expect(game.declare(0, 'coup', 1).ok).toBe(false)
  })

  it('is the only move left at ten coins', () => {
    const game = scripted([['duke', 'captain'], ['contessa', 'ambassador']], [FORCED_COUP_AT, 2])
    expect(legalActions(game.state, 0)).toEqual(['coup'])
    expect(game.declare(0, 'income', null)).toEqual({
      ok: false,
      error: 'At ten coins you must launch a coup.',
    })
  })
})

describe('a challenge on an action', () => {
  it('costs the challenger an influence when the claim was true', () => {
    const game = scripted([['duke', 'captain'], ['contessa', 'ambassador']])
    game.declare(0, 'tax', null)
    expect(canChallenge(game.state, 1)).toBe(true)
    expect(game.challenge(1).ok).toBe(true)

    // The challenger pays first; the tax is queued behind that loss.
    expect(game.state.pending[0]).toEqual({ step: 'lose', player: 1, reason: 'challengeLost' })
    expect(game.loseInfluence(1, 'contessa').ok).toBe(true)
    expect(game.state.players[0].coins).toBe(5)
    expect(game.state.players[1].revealed).toEqual(['contessa'])
  })

  it('returns the proven card to the deck and draws a replacement', () => {
    const game = scripted([['duke', 'captain'], ['contessa', 'ambassador']])
    const before = game.state.deck.length
    game.declare(0, 'tax', null)
    game.challenge(1)

    const hand = game.state.players[0].hand
    expect(hand).toHaveLength(2)
    expect(hand).toContain('captain')
    // The Duke went back in and something came out, so the deck is level again.
    expect(game.state.deck).toHaveLength(before)
    expect(game.state.deck.filter((c) => c === 'duke').length).toBeGreaterThan(0)
  })

  it('costs the bluffer an influence and cancels the action', () => {
    const game = scripted([['captain', 'captain'], ['contessa', 'ambassador']])
    game.declare(0, 'tax', null)
    expect(game.challenge(1).ok).toBe(true)

    expect(game.state.pending[0]).toEqual({ step: 'lose', player: 0, reason: 'bluffCaught' })
    expect(game.loseInfluence(0, 'captain').ok).toBe(true)
    // No tax was collected, and the turn moves on.
    expect(game.state.players[0].coins).toBe(STARTING_COINS)
    expect(game.state.current).toBe(1)
  })

  it('cannot be made twice by the same player', () => {
    const game = scripted([
      ['captain', 'captain'],
      ['contessa', 'ambassador'],
      ['duke', 'duke'],
    ])
    game.declare(0, 'tax', null)
    game.pass(1)
    expect(canChallenge(game.state, 1)).toBe(false)
    expect(game.challenge(1)).toEqual({ ok: false, error: 'You cannot challenge that.' })
  })

  it('leaves a blockable action still blockable once the claim is proven', () => {
    const game = scripted(
      [
        ['assassin', 'duke'],
        ['contessa', 'ambassador'],
        ['captain', 'captain'],
      ],
      [3, 2, 2],
    )
    game.declare(0, 'assassinate', 1)
    // Seat 2 challenges the Assassin claim and is wrong.
    expect(game.challenge(2).ok).toBe(true)
    expect(game.state.pending[0]).toEqual({ step: 'lose', player: 2, reason: 'challengeLost' })
    game.loseInfluence(2, 'captain')

    // The strike is proven but not yet landed: the target may still say Contessa.
    expect(game.state.pending[0]?.step).toBe('action')
    expect(blockOptions(game.state, 1)).toEqual(['contessa'])
    expect(canChallenge(game.state, 1)).toBe(false)
  })
})

describe('a block', () => {
  it('stops foreign aid when nobody challenges the Duke', () => {
    const game = scripted([
      ['captain', 'captain'],
      ['duke', 'ambassador'],
      ['contessa', 'contessa'],
    ])
    game.declare(0, 'foreignAid', null)
    // Foreign aid claims nothing, so it can only be blocked, never challenged.
    expect(canChallenge(game.state, 1)).toBe(false)
    expect(blockOptions(game.state, 1)).toEqual(['duke'])

    expect(game.block(1, 'duke').ok).toBe(true)
    // Only the player it thwarts may call the block a bluff.
    expect(responders(game.state)).toEqual([0])
    expect(game.pass(0).ok).toBe(true)

    expect(game.state.players[0].coins).toBe(STARTING_COINS)
    expect(game.state.current).toBe(1)
  })

  it('lets the action through when the blocker is caught bluffing', () => {
    const game = scripted([['captain', 'captain'], ['ambassador', 'ambassador']])
    game.declare(0, 'foreignAid', null)
    game.block(1, 'duke')
    expect(game.challenge(0).ok).toBe(true)

    expect(game.state.pending[0]).toEqual({ step: 'lose', player: 1, reason: 'bluffCaught' })
    game.loseInfluence(1, 'ambassador')
    // The block failed, so the two coins are collected after all.
    expect(game.state.players[0].coins).toBe(STARTING_COINS + 2)
  })

  it('is open only to the target of a targeted action', () => {
    const game = scripted([
      ['captain', 'duke'],
      ['contessa', 'ambassador'],
      ['duke', 'duke'],
    ])
    game.declare(0, 'steal', 1)
    expect(blockOptions(game.state, 1)).toEqual(['captain', 'ambassador'])
    // Seat 2 is not being robbed, so it has nothing to block — only to challenge.
    expect(blockOptions(game.state, 2)).toEqual([])
    expect(canChallenge(game.state, 2)).toBe(true)
  })
})

describe('assassination', () => {
  it('spends the three coins even when a Contessa turns it away', () => {
    const game = scripted([['assassin', 'duke'], ['contessa', 'ambassador']], [3, 2])
    game.declare(0, 'assassinate', 1)
    expect(game.state.players[0].coins).toBe(0)

    game.block(1, 'contessa')
    game.pass(0)

    // Blocked, but the coins are gone and the target keeps both cards.
    expect(game.state.players[0].coins).toBe(0)
    expect(game.state.players[1].hand).toHaveLength(2)
    expect(game.state.current).toBe(1)
  })

  it('lands when it goes unanswered', () => {
    const game = scripted([['assassin', 'duke'], ['contessa', 'ambassador']], [3, 2])
    game.declare(0, 'assassinate', 1)
    game.pass(1)
    expect(game.state.pending[0]).toEqual({ step: 'lose', player: 1, reason: 'assassinate' })
    game.loseInfluence(1, 'ambassador')
    expect(game.state.players[1].hand).toEqual(['contessa'])
  })
})

describe('stealing', () => {
  it('takes two coins from the target', () => {
    const game = scripted([['captain', 'duke'], ['contessa', 'ambassador']], [2, 5])
    game.declare(0, 'steal', 1)
    game.pass(1)
    expect(game.state.players[0].coins).toBe(4)
    expect(game.state.players[1].coins).toBe(3)
  })

  it('takes only as far as a poor target reaches', () => {
    const game = scripted([['captain', 'duke'], ['contessa', 'ambassador']], [2, 1])
    game.declare(0, 'steal', 1)
    game.pass(1)
    expect(game.state.players[0].coins).toBe(3)
    expect(game.state.players[1].coins).toBe(0)
  })
})

describe('an exchange', () => {
  it('draws two and keeps as many cards as the player had influence', () => {
    const game = scripted([['ambassador', 'duke'], ['contessa', 'contessa']])
    game.declare(0, 'exchange', null)
    game.pass(1)

    const head = game.state.pending[0]
    expect(head?.step).toBe('exchange')
    expect(head?.step === 'exchange' && head.drawn).toHaveLength(2)

    const deckBefore = game.state.deck.length
    expect(game.exchange(0, [0, 1]).ok).toBe(true)
    expect(game.state.players[0].hand).toEqual(['ambassador', 'duke'])
    // The two not kept go back, so the deck is where it started.
    expect(game.state.deck).toHaveLength(deckBefore + 2)
    expect(game.state.current).toBe(1)
  })

  it('refuses to keep the wrong number of cards', () => {
    const game = scripted([['ambassador', 'duke'], ['contessa', 'contessa']])
    game.declare(0, 'exchange', null)
    game.pass(1)
    expect(game.exchange(0, [0])).toEqual({ ok: false, error: 'Keep exactly 2 cards.' })
    expect(game.exchange(0, [0, 0])).toEqual({ ok: false, error: 'Pick each card once.' })
    expect(game.exchange(0, [0, 9])).toEqual({ ok: false, error: 'That is not one of the cards.' })
  })

  it('keeps only one card for a player down to one influence', () => {
    const game = scripted([['ambassador'], ['contessa', 'contessa']])
    game.declare(0, 'exchange', null)
    game.pass(1)
    expect(game.exchange(0, [0, 1])).toEqual({ ok: false, error: 'Keep exactly 1 card.' })
    expect(game.exchange(0, [1]).ok).toBe(true)
    expect(game.state.players[0].hand).toHaveLength(1)
  })
})

describe('losing the last influence', () => {
  it('puts a player out and ends a two-handed game', () => {
    const game = scripted([['duke', 'captain'], ['contessa']], [7, 2])
    expect(game.declare(0, 'coup', 1).ok).toBe(true)

    // One card left means no choice to make: it is taken automatically.
    expect(game.state.players[1].out).toBe(true)
    expect(game.state.phase).toBe('over')
    expect(game.state.result).toEqual({
      winner: 0,
      reason: 'last player with influence',
    })
  })

  it('skips a player who is out when passing the turn on', () => {
    const game = scripted([
      ['duke', 'captain'],
      ['contessa'],
      ['ambassador', 'assassin'],
    ], [7, 2, 2])
    game.declare(0, 'coup', 1)
    expect(game.state.players[1].out).toBe(true)
    expect(game.state.phase).toBe('play')
    // Seat 1 is gone, so play carries on to seat 2.
    expect(game.state.current).toBe(2)
  })

  it('refuses every action once the game is over', () => {
    const game = scripted([['duke', 'captain'], ['contessa']], [7, 2])
    game.declare(0, 'coup', 1)
    expect(game.declare(0, 'income', null)).toEqual({ ok: false, error: 'The game is over.' })
  })
})

describe('pausing', () => {
  it('suspends the table for everyone and lifts again', () => {
    const game = scripted([['duke', 'captain'], ['contessa', 'ambassador']])
    expect(game.pause(0).ok).toBe(true)
    expect(game.declare(0, 'income', null)).toEqual({ ok: false, error: 'The table is paused.' })
    expect(legalActions(game.state, 0)).toEqual([])

    expect(game.resume(1).ok).toBe(true)
    expect(game.declare(0, 'income', null).ok).toBe(true)
  })
})

describe('running out of time', () => {
  it('takes income for a player who never chose an action', () => {
    const game = scripted([['duke', 'captain'], ['contessa', 'ambassador']])
    expect(game.timeOut().ok).toBe(true)
    expect(game.state.players[0].coins).toBe(3)
    expect(game.state.current).toBe(1)
  })

  it('launches a coup for a player who has to, having sat on ten coins', () => {
    const game = scripted([['duke', 'captain'], ['contessa', 'ambassador']], [FORCED_COUP_AT, 2])
    expect(game.timeOut().ok).toBe(true)
    expect(game.state.players[0].coins).toBe(FORCED_COUP_AT - 10 + 3)
    expect(game.state.pending[0]).toEqual({ step: 'lose', player: 1, reason: 'coup' })
  })

  it('waves an open window through for everyone still owing an answer', () => {
    const game = scripted([
      ['duke', 'captain'],
      ['contessa', 'ambassador'],
      ['assassin', 'assassin'],
    ])
    game.declare(0, 'tax', null)
    expect(responders(game.state)).toEqual([1, 2])

    expect(game.timeOut().ok).toBe(true)
    // Both allowed it, so the tax stands and the turn moves on.
    expect(game.state.players[0].coins).toBe(5)
    expect(game.state.pending).toEqual([])
    expect(game.state.current).toBe(1)
  })

  it('gives up the first card when a loss is owed', () => {
    const game = scripted([['duke', 'captain'], ['contessa', 'ambassador']], [7, 2])
    game.declare(0, 'coup', 1)
    expect(game.state.pending[0]?.step).toBe('lose')

    expect(game.timeOut().ok).toBe(true)
    expect(game.state.players[1].revealed).toEqual(['contessa'])
    expect(game.state.players[1].hand).toEqual(['ambassador'])
  })

  it('keeps the hand it started with when an exchange is owed', () => {
    const game = scripted([['ambassador', 'duke'], ['contessa', 'contessa']])
    game.declare(0, 'exchange', null)
    game.pass(1)
    expect(game.state.pending[0]?.step).toBe('exchange')

    expect(game.timeOut().ok).toBe(true)
    expect(game.state.players[0].hand).toEqual(['ambassador', 'duke'])
    expect(game.state.pending).toEqual([])
  })

  it('does nothing to a paused or finished table', () => {
    const paused = scripted([['duke', 'captain'], ['contessa', 'ambassador']])
    paused.pause(0)
    expect(paused.timeOut()).toEqual({ ok: false, error: 'The table is paused.' })

    const over = scripted([['duke', 'captain'], ['contessa']], [7, 2])
    over.declare(0, 'coup', 1)
    expect(over.state.phase).toBe('over')
    expect(over.timeOut()).toEqual({ ok: false, error: 'The game is over.' })
  })
})

describe('persistence', () => {
  it('survives a round trip through JSON mid-window', () => {
    const game = scripted([
      ['duke', 'captain'],
      ['contessa', 'ambassador'],
      ['assassin', 'assassin'],
    ])
    game.declare(0, 'tax', null)
    game.pass(1)

    const back = CoupGame.fromState(JSON.parse(JSON.stringify(game.state)) as CoupGameState)
    expect(back.state).toEqual(game.state)

    // The rebuilt engine still validates: the last responder closes the window.
    expect(back.pass(2).ok).toBe(true)
    expect(back.state.players[0].coins).toBe(5)
    expect(back.state.pending).toEqual([])
  })

  it('carries the shuffler’s position, so a reshuffle is not replayed', () => {
    const game = scripted([['duke', 'captain'], ['contessa', 'ambassador']])
    const seedBefore = game.state.seed
    game.declare(0, 'tax', null)
    game.challenge(1)
    // Proving the Duke reshuffled the deck, which has to move the generator on.
    expect(game.state.seed).not.toBe(seedBefore)
  })
})
