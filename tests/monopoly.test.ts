import { describe, expect, it } from 'vitest'

import {
  BOARD_SIZE,
  CHANCE,
  CHEST,
  GO_SALARY,
  GROUPS,
  HOTEL,
  JAIL_FINE,
  JAIL_SPACE,
  MonopolyGame,
  SPACES,
  START_CASH,
  buildable,
  groupSpaces,
  inAuction,
  isOwnable,
  liquidValue,
  mortgageValue,
  mortgageable,
  ownsGroup,
  priceOf,
  rentFor,
  sellable,
  unmortgageCost,
  type MonopolyGameState,
  type Outcome,
} from '../shared/monopoly'

/** Why an action was refused, or null when it was allowed. */
function refusal(outcome: Outcome): string | null {
  return outcome.ok ? null : outcome.error
}

/** A dealt game whose opening seat is pinned, so turns can be scripted. */
function started(playerCount = 2, seed = 7): MonopolyGame {
  const game = new MonopolyGame(playerCount, seed, false)
  game.state.current = 0
  return game
}

/**
 * Put the next throw where the test wants it by trying seeds until it lands.
 * `act` is how the throw is made — `roll()` normally, but a seat in the gaol
 * throws through `jailChoice`, and the seed has to be found the same way.
 */
function rollOf(
  game: MonopolyGame,
  a: number,
  b: number,
  act: (g: MonopolyGame) => void = (g) => g.roll(g.state.current),
) {
  const before = JSON.stringify(game.state)
  for (let seed = 1; seed < 200_000; seed++) {
    const probe = MonopolyGame.fromState(JSON.parse(before) as MonopolyGameState)
    probe.state.rngPosition = seed
    act(probe)
    const dice = probe.state.lastRoll?.dice
    if (dice && dice[0] === a && dice[1] === b) {
      game.state.rngPosition = seed
      return
    }
  }
  throw new Error(`no seed throws ${a} and ${b}`)
}

/** The same, for a throw made from inside the gaol. */
const jailRoll = (game: MonopolyGame, a: number, b: number) =>
  rollOf(game, a, b, (g) => g.jailChoice(g.state.current, 'roll'))

/** Hand a space straight to a seat, skipping the buying. */
function give(game: MonopolyGame, seat: number, ...spaces: number[]) {
  for (const i of spaces) game.state.owners[i] = seat
}

describe('the board', () => {
  it('is forty spaces with eight colour groups of two or three', () => {
    expect(SPACES).toHaveLength(BOARD_SIZE)
    for (const group of GROUPS) {
      const spaces = groupSpaces(group)
      expect(spaces.length === 2 || spaces.length === 3).toBe(true)
    }
    expect(SPACES.filter((s) => s.kind === 'station')).toHaveLength(4)
    expect(SPACES.filter((s) => s.kind === 'utility')).toHaveLength(2)
    // 22 streets + 4 stations + 2 utilities is what a seat can ever own.
    expect(SPACES.filter((_, i) => isOwnable(i))).toHaveLength(28)
  })

  it('puts the corners a quarter of the way round from one another', () => {
    expect(SPACES[0].kind).toBe('go')
    expect(SPACES[10].kind).toBe('jail')
    expect(SPACES[20].kind).toBe('parking')
    expect(SPACES[30].kind).toBe('goToJail')
    expect(JAIL_SPACE).toBe(10)
  })

  it('climbs in price and rent as it goes round', () => {
    const streets = SPACES.map((s, i) => ({ s, i })).filter((x) => x.s.kind === 'street')
    for (const { s } of streets) {
      if (s.kind !== 'street') continue
      // Every rung of the rent table is worth more than the one below it.
      for (let n = 1; n < s.rent.length; n++) expect(s.rent[n]).toBeGreaterThan(s.rent[n - 1])
      expect(s.price).toBeGreaterThan(0)
      expect(s.houseCost).toBeGreaterThan(0)
    }
    const first = streets[0].s
    const last = streets[streets.length - 1].s
    if (first.kind === 'street' && last.kind === 'street') {
      expect(last.price).toBeGreaterThan(first.price)
    }
  })

  it('carries two decks whose every card does something', () => {
    expect(CHANCE.length).toBeGreaterThanOrEqual(16)
    expect(CHEST.length).toBeGreaterThanOrEqual(16)
    for (const card of [...CHANCE, ...CHEST]) {
      expect(card.text.length).toBeGreaterThan(0)
      expect(card.effect.do).toBeTruthy()
    }
  })
})

describe('the play log', () => {
  it('writes every figure in the same unit the board uses', () => {
    const game = started()
    give(game, 1, 3)
    game.state.players[0].pos = 0
    rollOf(game, 1, 2)
    game.roll(0)
    const text = game.state.log.map((e) => e.text).join(' | ')
    // The log is the engine's, and the board is the client's, but a player reads
    // them side by side — so a bare ladder number in either is a bug.
    expect(text).toContain('$1,500B')
    expect(text).toMatch(/owes \$\d+B in rent/)
    expect(text).not.toMatch(/\bfor \d+\.|\bcollects \d+\.|\bowes \d+ /)
  })

  it('calls the first corner the IPO, which is what the board calls it', () => {
    const game = started()
    give(game, 0, 1)
    game.state.players[0].pos = 36
    rollOf(game, 2, 3)
    game.roll(0)
    const text = game.state.log.map((e) => e.text).join(' | ')
    expect(text).toContain('passes the IPO')
    expect(text).not.toContain('passes Go')
  })

  it('prices every card in the same unit too', () => {
    for (const card of [...CHANCE, ...CHEST]) {
      // A card naming a figure has to name it the way everything else does.
      const bare = card.text.match(/(?<![$\d,])\b\d+\b(?!B)/)
      expect(bare, card.text).toBeNull()
    }
  })
})

describe('the deal', () => {
  it('sets everyone on Go with the same purse, a seat drawn to open', () => {
    const game = new MonopolyGame(4, 11, false)
    expect(game.state.players.map((p) => p.cash)).toEqual([START_CASH, START_CASH, START_CASH, START_CASH])
    expect(game.state.players.every((p) => p.pos === 0)).toBe(true)
    expect(game.state.current).toBeLessThan(4)
    expect(game.state.owners.every((o) => o === null)).toBe(true)
  })

  it('draws the opening seat before the decks, so a seed always opens the same way', () => {
    // The trap this repo has hit before: the generator is a plain LCG, so a draw
    // inserted ahead of the opening seat silently changes who opens.
    for (const seed of [1, 2, 3, 99, 12345]) {
      const a = new MonopolyGame(4, seed, false)
      const b = new MonopolyGame(4, seed, false)
      expect(a.state.current).toBe(b.state.current)
      expect(a.state.chance).toEqual(b.state.chance)
    }
  })

  it('rebuilds from its own state without losing anything', () => {
    const game = started(3)
    game.roll(0)
    const back = MonopolyGame.fromState(JSON.parse(JSON.stringify(game.state)) as MonopolyGameState)
    expect(back.state).toEqual(game.state)
    expect(back.roll).toBeTypeOf('function')
  })
})

describe('moving', () => {
  it('walks the dice and collects the salary on the way past Go', () => {
    const game = started()
    // Onto a street this seat already owns, so the salary is the only movement
    // of money the throw causes.
    give(game, 0, 1)
    game.state.players[0].pos = 36
    rollOf(game, 2, 3)
    game.roll(0)
    expect(game.state.players[0].pos).toBe(1)
    expect(game.state.players[0].cash).toBe(START_CASH + GO_SALARY)
    expect(game.state.lastRoll!.passedGo).toBe(true)
  })

  it('gives a second throw for doubles, and the gaol for a third', () => {
    const game = started()
    rollOf(game, 2, 2)
    game.roll(0)
    expect(game.state.doubles).toBe(1)
    expect(game.state.rolled).toBe(false)
    expect(game.endTurn(0).ok).toBe(false)

    // Clear whatever the first move landed on, so the next throws are free.
    game.state.pending = []
    rollOf(game, 3, 3)
    game.roll(0)
    game.state.pending = []
    rollOf(game, 5, 5)
    game.roll(0)
    expect(game.state.players[0].pos).toBe(JAIL_SPACE)
    expect(game.state.players[0].jailed).toBe(true)
    expect(game.state.rolled).toBe(true)
  })

  it('counts every card turned over, so the table can replay each draw', () => {
    const game = started()
    expect(game.state.cardCount).toBe(0)
    // Land on a card space: 7 is the first Market.
    game.state.players[0].pos = 4
    rollOf(game, 1, 2)
    game.roll(0)
    expect(game.state.cardCount).toBe(1)
    expect(game.state.lastCard).not.toBeNull()
    expect(game.state.lastCard!.player).toBe(0)
  })

  it('counts every throw, including the second one a double earns', () => {
    const game = started()
    expect(game.state.rollCount).toBe(0)
    rollOf(game, 2, 2)
    game.roll(0)
    expect(game.state.rollCount).toBe(1)
    // The turn number does not move for a second throw, which is exactly why
    // the count exists: the table's dice and the shot clock both key on it.
    const turn = game.state.turnNumber
    game.state.pending = []
    rollOf(game, 1, 3)
    game.roll(0)
    expect(game.state.rollCount).toBe(2)
    expect(game.state.turnNumber).toBe(turn)
  })

  it('counts a throw made from under review too', () => {
    const game = started()
    game.state.players[0].jailed = true
    game.state.players[0].pos = JAIL_SPACE
    game.state.pending = [{ step: 'jail', player: 0 }]
    const before = game.state.rollCount
    jailRoll(game, 2, 5)
    game.jailChoice(0, 'roll')
    expect(game.state.rollCount).toBe(before + 1)
  })

  it('sends you to Antitrust from the corner that says so', () => {
    const game = started()
    game.state.players[0].pos = 28
    rollOf(game, 1, 1)
    game.roll(0)
    expect(game.state.players[0].pos).toBe(JAIL_SPACE)
    expect(game.state.players[0].jailed).toBe(true)
    // A trip to the gaol ends the turn even on a double.
    expect(game.state.rolled).toBe(true)
  })
})

describe('buying and auctions', () => {
  it('offers the space you stop on, and takes the money when you take it', () => {
    const game = started()
    game.state.players[0].pos = 0
    rollOf(game, 1, 2)
    game.roll(0)
    const pending = game.state.pending[0]
    expect(pending).toEqual({ step: 'buy', player: 0, space: 3 })
    expect(game.buy(0).ok).toBe(true)
    expect(game.state.owners[3]).toBe(0)
    expect(game.state.players[0].cash).toBe(START_CASH - priceOf(3))
  })

  it('sends a space to auction when the lander declines, and to the last bidder standing', () => {
    const game = started(3)
    game.state.players[0].pos = 0
    rollOf(game, 1, 2)
    game.roll(0)
    expect(game.pass(0).ok).toBe(true)
    expect(game.state.pending[0].step).toBe('auction')

    expect(game.bid(1, 50).ok).toBe(true)
    expect(game.bid(2, 70).ok).toBe(true)
    // Bidding against yourself is not a move: the standing bid is already yours.
    expect(game.bid(2, 80).ok).toBe(false)
    expect(game.pass(0).ok).toBe(true)
    expect(game.pass(1).ok).toBe(true)
    expect(game.state.owners[3]).toBe(2)
    expect(game.state.players[2].cash).toBe(START_CASH - 70)
    expect(game.state.pending).toHaveLength(0)
  })

  it('leaves a space with the bank when nobody bids', () => {
    const game = started(2)
    game.state.players[0].pos = 0
    rollOf(game, 1, 2)
    game.roll(0)
    game.pass(0)
    game.pass(0)
    game.pass(1)
    expect(game.state.owners[3]).toBeNull()
    expect(game.state.pending).toHaveLength(0)
  })

  it('refuses a bid larger than the cash the bidder is holding', () => {
    const game = started(3)
    game.state.players[0].pos = 0
    rollOf(game, 1, 2)
    game.roll(0)
    game.pass(0)

    game.state.players[1].cash = 120
    expect(refusal(game.bid(1, 121))).toBe('You cannot cover that bid.')
    expect(game.state.pending[0]).toMatchObject({ high: 0, highBidder: null })

    // Every last note of it, though, is a bid like any other.
    expect(game.bid(1, 120).ok).toBe(true)
    expect(game.state.pending[0]).toMatchObject({ high: 120, highBidder: 1 })

    // And winning it spends exactly that, leaving the seat with nothing.
    expect(game.pass(0).ok).toBe(true)
    expect(game.pass(2).ok).toBe(true)
    expect(game.state.owners[3]).toBe(1)
    expect(game.state.players[1].cash).toBe(0)
  })

  it('keeps a seat that drops out out of it, however high the bidding goes', () => {
    const game = started(3)
    game.state.players[0].pos = 0
    rollOf(game, 1, 2)
    game.roll(0)
    game.pass(0) // the lander sends it to auction

    expect(game.bid(1, 50).ok).toBe(true)
    expect(game.pass(2).ok).toBe(true) // seat 2 walks away at $50

    // Seat 0 raises. Under the old rule that reopened the window to everyone;
    // now it buys seat 2 nothing at all.
    expect(game.bid(0, 60).ok).toBe(true)
    expect(game.bid(2, 100).ok).toBe(false)
    expect(refusal(game.bid(2, 100))).toBe('You are not in this auction.')
    expect(game.state.pending[0]).toMatchObject({ step: 'auction', passed: [2] })

    // So it comes down to the two who stayed in, and closes when one of them
    // gives up rather than when the whole table has answered again.
    expect(game.pass(1).ok).toBe(true)
    expect(game.state.owners[3]).toBe(0)
    expect(game.state.players[0].cash).toBe(START_CASH - 60)
    expect(game.state.pending).toHaveLength(0)
  })

  it('holds the standing bidder to their bid — no raising it, no walking away', () => {
    const game = started(3)
    game.state.players[0].pos = 0
    rollOf(game, 1, 2)
    game.roll(0)
    game.pass(0)

    expect(game.bid(1, 50).ok).toBe(true)
    expect(refusal(game.bid(1, 90))).toBe('Your bid is already the standing one.')
    expect(refusal(game.pass(1))).toBe('Your bid stands; you cannot drop out of it.')

    // The auction is still waiting on the seats that have not answered — and on
    // seat 1 again only if one of them outbids it.
    expect(game.state.pending[0].step).toBe('auction')
    expect(inAuction(game.state, 1)).toBe(false)
    expect(inAuction(game.state, 0)).toBe(true)
    expect(game.bid(2, 60).ok).toBe(true)
    expect(inAuction(game.state, 1)).toBe(true)
  })

  it('goes straight to auction when the lander cannot afford it', () => {
    const game = started()
    game.state.players[0].cash = 10
    game.state.players[0].pos = 0
    rollOf(game, 1, 2)
    game.roll(0)
    expect(game.state.pending[0].step).toBe('auction')
  })
})

describe('rent', () => {
  it('doubles a bare street once its owner holds the group', () => {
    const game = started()
    const [a, b] = groupSpaces('brown')
    give(game, 1, a)
    const street = SPACES[a]
    if (street.kind !== 'street') throw new Error('expected a street')
    expect(rentFor(game.state, a, 7)).toBe(street.rent[0])
    give(game, 1, b)
    expect(ownsGroup(game.state, 1, 'brown')).toBe(true)
    expect(rentFor(game.state, a, 7)).toBe(street.rent[0] * 2)
  })

  it('charges the built rate once there are houses, and nothing when mortgaged', () => {
    const game = started()
    const spaces = groupSpaces('brown')
    give(game, 1, ...spaces)
    const street = SPACES[spaces[0]]
    if (street.kind !== 'street') throw new Error('expected a street')
    game.state.houses[spaces[0]] = 3
    expect(rentFor(game.state, spaces[0], 7)).toBe(street.rent[3])
    game.state.mortgaged[spaces[0]] = true
    expect(rentFor(game.state, spaces[0], 7)).toBe(0)
  })

  it('scales stations by how many are held and utilities by the throw', () => {
    const game = started()
    const stations = SPACES.map((s, i) => ({ s, i })).filter((x) => x.s.kind === 'station').map((x) => x.i)
    give(game, 1, stations[0])
    expect(rentFor(game.state, stations[0], 7)).toBe(25)
    give(game, 1, stations[1], stations[2])
    expect(rentFor(game.state, stations[0], 7)).toBe(100)

    const utilities = SPACES.map((s, i) => ({ s, i })).filter((x) => x.s.kind === 'utility').map((x) => x.i)
    give(game, 1, utilities[0])
    expect(rentFor(game.state, utilities[0], 9)).toBe(36)
    give(game, 1, utilities[1])
    expect(rentFor(game.state, utilities[0], 9)).toBe(90)
  })

  it('moves the money from the lander to the owner', () => {
    const game = started()
    give(game, 1, 3)
    game.state.players[0].pos = 0
    rollOf(game, 1, 2)
    game.roll(0)
    const street = SPACES[3]
    if (street.kind !== 'street') throw new Error('expected a street')
    expect(game.state.players[0].cash).toBe(START_CASH - street.rent[0])
    expect(game.state.players[1].cash).toBe(START_CASH + street.rent[0])
  })

  it('charges nothing on your own space', () => {
    const game = started()
    give(game, 0, 3)
    game.state.players[0].pos = 0
    rollOf(game, 1, 2)
    game.roll(0)
    expect(game.state.players[0].cash).toBe(START_CASH)
    expect(game.state.pending).toHaveLength(0)
  })
})

describe('building', () => {
  it('needs the whole group, and goes up evenly across it', () => {
    const game = started()
    const [a, b, c] = groupSpaces('pink')
    give(game, 0, a, b)
    expect(buildable(game.state, 0)).toEqual([])

    give(game, 0, c)
    expect(buildable(game.state, 0)).toEqual([a, b, c])
    expect(game.build(0, a).ok).toBe(true)
    // `a` is now ahead of the others, so it waits until they catch up.
    expect(buildable(game.state, 0)).toEqual([b, c])
    expect(game.build(0, a).ok).toBe(false)
    game.build(0, b)
    game.build(0, c)
    expect(buildable(game.state, 0)).toEqual([a, b, c])
  })

  it('turns the fifth house into a hotel and takes the money each time', () => {
    const game = started()
    const spaces = groupSpaces('brown')
    give(game, 0, ...spaces)
    const street = SPACES[spaces[0]]
    if (street.kind !== 'street') throw new Error('expected a street')
    for (let n = 0; n < HOTEL; n++) {
      for (const i of spaces) game.build(0, i)
    }
    expect(game.state.houses[spaces[0]]).toBe(HOTEL)
    expect(game.state.players[0].cash).toBe(START_CASH - street.houseCost * HOTEL * spaces.length)
    expect(game.build(0, spaces[0]).ok).toBe(false)
  })

  it('will not build on a mortgaged group, or mortgage a built one', () => {
    const game = started()
    const spaces = groupSpaces('brown')
    give(game, 0, ...spaces)
    game.state.mortgaged[spaces[1]] = true
    expect(buildable(game.state, 0)).toEqual([])
    game.state.mortgaged[spaces[1]] = false

    game.build(0, spaces[0])
    expect(mortgageable(game.state, 0)).toEqual([])
    // Selling the house back opens the mortgage up again.
    expect(game.sell(0, spaces[0]).ok).toBe(true)
    expect(mortgageable(game.state, 0)).toEqual(spaces)
  })

  it('sells houses back from the top down, at half price', () => {
    const game = started()
    const spaces = groupSpaces('brown')
    give(game, 0, ...spaces)
    const street = SPACES[spaces[0]]
    if (street.kind !== 'street') throw new Error('expected a street')
    game.build(0, spaces[0])
    game.build(0, spaces[1])
    game.build(0, spaces[0])
    // Only the taller one may come down first.
    expect(sellable(game.state, 0)).toEqual([spaces[0]])
    const before = game.state.players[0].cash
    game.sell(0, spaces[0])
    expect(game.state.players[0].cash).toBe(before + Math.round(street.houseCost / 2))
  })
})

describe('mortgages', () => {
  it('pays half on the way in and charges interest on the way out', () => {
    const game = started()
    give(game, 0, 3)
    expect(game.mortgage(0, 3).ok).toBe(true)
    expect(game.state.players[0].cash).toBe(START_CASH + mortgageValue(3))
    expect(game.state.mortgaged[3]).toBe(true)
    expect(unmortgageCost(3)).toBeGreaterThan(mortgageValue(3))

    expect(game.unmortgage(0, 3).ok).toBe(true)
    expect(game.state.mortgaged[3]).toBe(false)
    expect(game.state.players[0].cash).toBe(START_CASH + mortgageValue(3) - unmortgageCost(3))
  })
})

describe('antitrust', () => {
  it('asks the seat under review at the top of its turn, and takes the fine', () => {
    const game = started()
    game.state.players[0].jailed = true
    game.state.rolled = true
    game.endTurn(0)
    game.state.rolled = true
    game.endTurn(1)
    expect(game.state.current).toBe(0)
    expect(game.state.pending[0]).toEqual({ step: 'jail', player: 0 })
    // Nothing else may happen until the seat answers.
    expect(game.roll(0).ok).toBe(false)

    expect(game.jailChoice(0, 'pay').ok).toBe(true)
    expect(game.state.players[0].jailed).toBe(false)
    expect(game.state.players[0].cash).toBe(START_CASH - JAIL_FINE)
    expect(game.state.rolled).toBe(false)
  })

  it('lets a card open the door', () => {
    const game = started()
    game.state.players[0].jailed = true
    game.state.players[0].jailCards = 1
    game.state.pending = [{ step: 'jail', player: 0 }]
    expect(game.jailChoice(0, 'card').ok).toBe(true)
    expect(game.state.players[0].jailCards).toBe(0)
    expect(game.state.players[0].jailed).toBe(false)
  })

  it('walks you out on doubles, without also giving another throw', () => {
    const game = started()
    game.state.players[0].jailed = true
    game.state.players[0].pos = JAIL_SPACE
    game.state.pending = [{ step: 'jail', player: 0 }]
    jailRoll(game, 4, 4)
    expect(game.jailChoice(0, 'roll').ok).toBe(true)
    expect(game.state.players[0].jailed).toBe(false)
    expect(game.state.players[0].pos).toBe(JAIL_SPACE + 8)
    expect(game.state.rolled).toBe(true)
  })

  it('charges the fine once the third throw has failed', () => {
    const game = started()
    const player = game.state.players[0]
    player.jailed = true
    player.pos = JAIL_SPACE
    player.jailTurns = 2
    game.state.pending = [{ step: 'jail', player: 0 }]
    jailRoll(game, 2, 3)
    game.jailChoice(0, 'roll')
    expect(player.jailed).toBe(false)
    expect(player.cash).toBe(START_CASH - JAIL_FINE)
    expect(player.pos).toBe(JAIL_SPACE + 5)
  })
})

describe('trading', () => {
  it('swaps spaces and cash when the offer is taken', () => {
    const game = started()
    give(game, 0, 1)
    give(game, 1, 3)
    expect(
      game.offerTrade(0, 1, { spaces: [1], cash: 100 }, { spaces: [3], cash: 0 }).ok,
    ).toBe(true)
    expect(game.state.pending[0].step).toBe('trade')
    // Only the seat it was aimed at may answer it.
    expect(game.acceptTrade(0).ok).toBe(false)
    expect(game.acceptTrade(1).ok).toBe(true)
    expect(game.state.owners[1]).toBe(1)
    expect(game.state.owners[3]).toBe(0)
    expect(game.state.players[0].cash).toBe(START_CASH - 100)
    expect(game.state.players[1].cash).toBe(START_CASH + 100)
  })

  it('leaves everything where it was when the offer is turned down', () => {
    const game = started()
    give(game, 0, 1)
    game.offerTrade(0, 1, { spaces: [1], cash: 0 }, { spaces: [], cash: 50 })
    expect(game.declineTrade(1).ok).toBe(true)
    expect(game.state.owners[1]).toBe(0)
    expect(game.state.players[1].cash).toBe(START_CASH)
    expect(game.state.pending).toHaveLength(0)
  })

  it('refuses an offer of something you do not own, or of a built group', () => {
    const game = started()
    give(game, 1, 1)
    expect(game.offerTrade(0, 1, { spaces: [1], cash: 0 }, { spaces: [], cash: 0 }).ok).toBe(false)

    const spaces = groupSpaces('brown')
    give(game, 0, ...spaces)
    game.build(0, spaces[0])
    expect(
      game.offerTrade(0, 1, { spaces: [spaces[1]], cash: 0 }, { spaces: [], cash: 0 }).ok,
    ).toBe(false)
  })

  it('refuses an empty offer and one the offerer cannot cover', () => {
    const game = started()
    expect(game.offerTrade(0, 1, { spaces: [], cash: 0 }, { spaces: [], cash: 0 }).ok).toBe(false)
    expect(
      game.offerTrade(0, 1, { spaces: [], cash: START_CASH + 1 }, { spaces: [], cash: 0 }).ok,
    ).toBe(false)
  })
})

describe('debt and bankruptcy', () => {
  it('values a built holding at exactly what selling and mortgaging it pays', () => {
    // `liquidValue` is what decides whether a debt is payable at all, so it has
    // to agree to the last unit with what the seat can really raise. It rounds
    // per office, and `houseCost` is odd at two tiers — rounding the total
    // instead would call a payable debt bankruptcy.
    const game = started()
    const spaces = groupSpaces('brown')
    give(game, 0, ...spaces)
    game.build(0, spaces[0])
    game.build(0, spaces[1])
    game.build(0, spaces[0])

    const expected = liquidValue(game.state, 0)
    for (let next = sellable(game.state, 0); next.length; next = sellable(game.state, 0)) {
      game.sell(0, next[0])
    }
    for (const i of mortgageable(game.state, 0)) game.mortgage(0, i)
    expect(game.state.players[0].cash).toBe(expected)
  })

  it('leaves a debt on the stack when the rent cannot be covered', () => {
    const game = started()
    give(game, 1, 1, 3)
    game.state.houses[3] = 1
    // Enough left to mortgage that the debt is worth waiting on: one the debtor
    // could never reach settles itself instead, which the next test covers.
    give(game, 0, 6)
    game.state.players[0].cash = 5
    game.state.players[0].pos = 0
    rollOf(game, 1, 2)
    game.roll(0)

    expect(game.state.pending[0].step).toBe('debt')
    // Selling and mortgaging are the ways out, so they still work; rolling does not.
    expect(game.roll(0).ok).toBe(false)
    expect(game.mortgage(0, 6).ok).toBe(true)
    expect(game.state.pending).toHaveLength(0)
  })

  it('settles the debt the moment enough has been raised', () => {
    const game = started()
    give(game, 1, 3)
    give(game, 0, 1, 6, 8, 9)
    const owed = 150
    game.state.players[0].cash = 0
    game.state.pending = [{ step: 'debt', player: 0, amount: owed, creditor: 1 }]
    for (const space of [1, 6, 8, 9]) {
      if (game.state.pending.length) game.mortgage(0, space)
    }
    expect(game.state.pending).toHaveLength(0)
    expect(game.state.players[1].cash).toBe(START_CASH + owed)
  })

  it('hands everything to the creditor when a player gives up', () => {
    const game = started(3)
    give(game, 0, 1, 3)
    game.state.players[0].cash = 40
    game.state.pending = [{ step: 'debt', player: 0, amount: 500, creditor: 1 }]
    expect(game.declareBankrupt(0).ok).toBe(true)
    expect(game.state.players[0].bankrupt).toBe(true)
    expect(game.state.owners[1]).toBe(1)
    expect(game.state.owners[3]).toBe(1)
    expect(game.state.players[1].cash).toBe(START_CASH + 40)
  })

  it('puts everything back on the market when the bank is the creditor', () => {
    const game = started(3)
    give(game, 0, 1, 3)
    game.state.mortgaged[1] = true
    game.state.pending = [{ step: 'debt', player: 0, amount: 5000, creditor: null }]
    game.declareBankrupt(0)
    expect(game.state.owners[1]).toBeNull()
    expect(game.state.owners[3]).toBeNull()
    expect(game.state.mortgaged[1]).toBe(false)
  })

  it('goes bankrupt on its own when nothing left could ever cover it', () => {
    const game = started(3)
    give(game, 1, 1, 3)
    game.state.houses[3] = HOTEL
    game.state.players[0].cash = 5
    game.state.players[0].pos = 0
    expect(liquidValue(game.state, 0)).toBe(5)
    rollOf(game, 1, 2)
    game.roll(0)
    // Nothing to sell and nothing to mortgage: there is no decision to wait for.
    expect(game.state.players[0].bankrupt).toBe(true)
    expect(game.state.pending).toHaveLength(0)
  })

  it('moves the turn on when the player whose turn it is goes bankrupt', () => {
    // The table deadlocked here: a seat that went bankrupt on its own turn was
    // left as `current`, and it could not act (the guard rejects a bankrupt
    // player) while nobody else could either (it was not their turn).
    const game = started(3)
    give(game, 1, 1, 3)
    game.state.houses[3] = HOTEL
    game.state.players[0].cash = 5
    game.state.players[0].pos = 0
    rollOf(game, 1, 2)
    game.roll(0)

    expect(game.state.players[0].bankrupt).toBe(true)
    expect(game.state.phase).toBe('play')
    // The turn must have moved to a seat that can actually take it.
    expect(game.state.current).not.toBe(0)
    expect(game.state.players[game.state.current].bankrupt).toBe(false)
    expect(game.state.pending).toHaveLength(0)
    expect(game.state.rolled).toBe(false)
    // And that seat can get on with it.
    expect(game.roll(game.state.current).ok).toBe(true)
  })

  it('skips a seat that went bankrupt to a creditor on its own turn', () => {
    const game = started(3)
    give(game, 0, 1)
    game.state.players[0].cash = 0
    game.state.rolled = true
    game.state.pending = [{ step: 'debt', player: 0, amount: 5000, creditor: 1 }]
    expect(game.declareBankrupt(0).ok).toBe(true)
    expect(game.state.current).not.toBe(0)
    expect(game.state.players[game.state.current].bankrupt).toBe(false)
  })

  it('never leaves the shot clock pointing at a seat that cannot play', () => {
    const game = started(3)
    give(game, 1, 1, 3)
    game.state.houses[3] = HOTEL
    game.state.players[0].cash = 5
    game.state.players[0].pos = 0
    rollOf(game, 1, 2)
    game.roll(0)
    // The clock settles whatever the table waits on; with the turn moved on it
    // has a live seat to act for, rather than retrying a rejected action forever.
    expect(game.timeOut().ok).toBe(true)
  })

  it('ends when one solvent player is left', () => {
    const game = started()
    game.state.pending = [{ step: 'debt', player: 1, amount: 9999, creditor: 0 }]
    game.declareBankrupt(1)
    expect(game.state.phase).toBe('over')
    expect(game.state.result).toEqual({
      winner: 0,
      standings: [0, 1],
      reason: 'last player left solvent',
    })
    // Nothing works once it is over.
    expect(game.roll(0).ok).toBe(false)
  })
})

describe('the turn', () => {
  it('will not end before the dice are thrown, or while something is pending', () => {
    const game = started()
    expect(game.endTurn(0).ok).toBe(false)
    rollOf(game, 1, 2)
    game.roll(0)
    expect(game.endTurn(0).ok).toBe(false)
    game.pass(0)
    game.pass(0)
    game.pass(1)
    expect(game.endTurn(0).ok).toBe(true)
    expect(game.state.current).toBe(1)
    expect(game.state.rolled).toBe(false)
  })

  it('skips a bankrupt seat when passing play on', () => {
    const game = started(3)
    game.state.players[1].bankrupt = true
    game.state.rolled = true
    game.endTurn(0)
    expect(game.state.current).toBe(2)
  })

  it('refuses every action from a seat that is not at the table', () => {
    const game = started()
    expect(game.roll(9).ok).toBe(false)
    expect(game.pause(9).ok).toBe(false)
  })
})

describe('pause and the clock', () => {
  it('suspends the table for any seated player, and refuses actions while it is down', () => {
    const game = started()
    expect(game.pause(1).ok).toBe(true)
    expect(game.roll(0).ok).toBe(false)
    expect(game.pause(1).ok).toBe(false)
    expect(game.resume(0).ok).toBe(true)
    expect(game.roll(0).ok).toBe(true)
  })

  it('settles whatever the table is waiting on when the clock runs out', () => {
    const game = started(3)
    game.state.players[0].pos = 0
    rollOf(game, 1, 2)
    game.roll(0)
    // A purchase nobody answers goes to auction, and then to nobody.
    expect(game.timeOut().ok).toBe(true)
    expect(game.state.pending[0].step).toBe('auction')
    game.timeOut()
    game.timeOut()
    game.timeOut()
    expect(game.state.pending).toHaveLength(0)
    expect(game.state.owners[3]).toBeNull()

    // With nothing pending it simply ends the turn.
    expect(game.timeOut().ok).toBe(true)
    expect(game.state.current).toBe(1)
  })

  it('raises what it can rather than bankrupting an absent player who could pay', () => {
    const game = started()
    give(game, 0, 1, 3, 6)
    game.state.players[0].cash = 0
    game.state.pending = [{ step: 'debt', player: 0, amount: 60, creditor: 1 }]
    game.timeOut()
    expect(game.state.players[0].bankrupt).toBe(false)
    expect(game.state.pending).toHaveLength(0)
    expect(game.state.mortgaged.some((m) => m)).toBe(true)
  })
})
