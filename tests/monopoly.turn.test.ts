import { describe, expect, it } from 'vitest'

import { DEFAULT_OPTIONS } from '../shared/engine'
import { LOG_KEEP, MonopolyGame, SPACES, groupSpaces, tradePartners } from '../shared/monopoly'
import type { MonopolyGameState } from '../shared/monopoly'
import type { MonopolyClientState } from '../shared/protocol'
import { Room } from '../server/rooms'

/**
 * How a Monopoly turn begins and ends, now that neither is in a player's hands.
 *
 * A turn ends itself the moment its throw is settled — there is no button — and
 * a trade may be offered by any seat at any time the table is idle. The two
 * changes are the same change really: nothing is left that only the seat on
 * turn may do, so there is nothing for an end-turn button to wait for.
 */
function started(playerCount = 3, seed = 7): MonopolyGame {
  const game = new MonopolyGame(playerCount, seed, false)
  game.state.current = 0
  return game
}

/** Put the next throw where the test wants it by trying seeds until it lands. */
function rollOf(game: MonopolyGame, a: number, b: number) {
  const before = JSON.stringify(game.state)
  for (let seed = 1; seed < 200_000; seed++) {
    const probe = MonopolyGame.fromState(JSON.parse(before) as MonopolyGameState)
    probe.state.rngPosition = seed
    probe.roll(probe.state.current)
    const dice = probe.state.lastRoll?.dice
    if (dice && dice[0] === a && dice[1] === b) {
      game.state.rngPosition = seed
      return
    }
  }
  throw new Error(`no seed throws ${a} and ${b}`)
}

const give = (game: MonopolyGame, seat: number, ...spaces: number[]) => {
  for (const i of spaces) game.state.owners[i] = seat
}

const side = (cash = 0, spaces: number[] = []) => ({ cash, spaces })

describe('a turn that ends itself', () => {
  it('passes play as soon as the throw is settled', () => {
    const game = started()
    rollOf(game, 1, 2)
    game.roll(0)

    // Landing somewhere unowned is a decision, and a decision holds the turn.
    expect(game.state.pending).toHaveLength(1)
    expect(game.state.current).toBe(0)

    // Declining sends it to auction, which every solvent seat must answer —
    // the one who declined the purchase included.
    game.pass(0)
    for (const seat of [0, 1, 2]) game.pass(seat)

    expect(game.state.pending).toHaveLength(0)
    expect(game.state.current, 'nobody pressed anything').toBe(1)
    expect(game.state.rolled).toBe(false)
  })

  it('does not end on a double, which earns another throw', () => {
    const game = started()
    rollOf(game, 2, 2)
    game.roll(0)
    game.state.pending = []

    expect(game.state.doubles).toBe(1)
    expect(game.state.rolled, 'the throw is not spent').toBe(false)
    expect(game.state.current, 'so the turn has not moved').toBe(0)
  })

  it('leaves the drawn card on the board for the table to see', () => {
    const game = started()
    // Space 4 is a Market; a throw of 1 and 2 from 4 lands on the next one.
    game.state.players[0].pos = 4
    rollOf(game, 1, 2)
    game.roll(0)

    // The turn may well have passed already — the card must not go with it.
    expect(game.state.lastCard, 'a card was drawn').not.toBeNull()
    expect(game.state.cardCount).toBe(1)
  })

  it('clears the last card only when somebody throws again', () => {
    const game = started()
    game.state.lastCard = { deck: 'chance', text: 'something', player: 1 }
    game.state.pending = []
    rollOf(game, 1, 2)
    game.roll(game.state.current)
    expect(game.state.lastCard?.player, 'the new throw owns the board').not.toBe(1)
  })

  it('hands the turn on when a seat goes bankrupt on its own', () => {
    const game = started()
    game.state.pending = [{ step: 'debt', player: 0, amount: 99_999, creditor: 1 }]
    game.declareBankrupt(0)

    expect(game.state.players[0].bankrupt).toBe(true)
    expect(game.state.current, 'a bankrupt seat is nobody to wait for').not.toBe(0)
  })

  it('still refuses a throw from a seat that is not on turn', () => {
    const game = started()
    expect(game.roll(1).ok).toBe(false)
    expect(game.roll(2).ok).toBe(false)
  })
})

describe('trading from any seat', () => {
  it('lets a seat that is not on turn open an offer', () => {
    const game = started()
    give(game, 1, 6)
    expect(game.state.current).toBe(0)

    // Seat 1 is not on turn, and offers anyway.
    expect(game.offerTrade(1, 2, side(0, [6]), side(50)).ok).toBe(true)
    const p = game.state.pending[0]
    expect(p?.step).toBe('trade')
    expect(p?.step === 'trade' && p.from).toBe(1)
    expect(p?.step === 'trade' && p.to).toBe(2)
  })

  it('holds up the throw until the offer is answered', () => {
    const game = started()
    give(game, 1, 6)
    expect(game.offerTrade(1, 2, side(0, [6]), side(50)).ok).toBe(true)

    // The table only ever holds one question, so the seat on turn waits.
    expect(game.roll(0).ok).toBe(false)
    expect(game.declineTrade(2).ok).toBe(true)
    expect(game.roll(0).ok, 'and carries on once it is answered').toBe(true)
  })

  it('will not jump a decision already in front of the table', () => {
    const game = started()
    give(game, 1, 6)
    rollOf(game, 1, 2)
    game.roll(0)
    expect(game.state.pending).toHaveLength(1)

    expect(game.offerTrade(1, 2, side(0, [6]), side(50)).ok).toBe(false)
  })

  it('still refuses an offer of what is not yours', () => {
    const game = started()
    give(game, 2, 6)
    // Seat 1 offering seat 2's space.
    expect(game.offerTrade(1, 2, side(0, [6]), side(0)).ok).toBe(false)
  })

  it('still refuses a group with buildings standing on it', () => {
    const set = groupSpaces('brown')
    const game = started()
    give(game, 1, ...set)
    game.state.houses[set[0]] = 1

    expect(game.offerTrade(1, 2, side(0, [set[0]]), side(10)).ok).toBe(false)
  })

  it('still refuses an empty offer, and one aimed at nobody', () => {
    const game = started()
    expect(game.offerTrade(1, 2, side(0), side(0)).ok).toBe(false)
    expect(game.offerTrade(1, 9, side(10), side(0)).ok).toBe(false)
    expect(game.offerTrade(1, 1, side(10), side(0)).ok).toBe(false)
  })

  it('still refuses cash a side cannot cover', () => {
    const game = started()
    expect(game.offerTrade(1, 2, side(99_999), side(0)).ok).toBe(false)
  })

  it('names every other seat still in the game as a partner', () => {
    const game = started()
    expect(tradePartners(game.state, 1)).toEqual([0, 2])
    game.state.players[2].bankrupt = true
    expect(tradePartners(game.state, 1)).toEqual([0])
  })
})

describe('what a Monopoly client is offered', () => {
  const view = (r: Room, token: string): MonopolyClientState =>
    r['stateFor'](token) as MonopolyClientState

  function table(): Room {
    const r = new Room('TURN')
    r.options = { ...DEFAULT_OPTIONS, kind: 'monopoly', diceStart: false }
    r.addSeat('token-a', 'Ada')
    r.addSeat('token-b', 'Bo')
    r.start()
    r.monopoly!.state.current = 0
    return r
  }

  it('offers a trade to the seat waiting as well as the seat on turn', () => {
    const r = table()
    expect(view(r, 'token-a').can.partners).toHaveLength(1)
    expect(view(r, 'token-b').can.partners, 'not only the current seat').toHaveLength(1)
  })

  it('withdraws the offer while the table is waiting on something', () => {
    const r = table()
    r.monopoly!.state.pending = [{ step: 'buy', player: 0, space: 1 }]
    for (const token of ['token-a', 'token-b']) {
      expect(view(r, token).can.partners).toHaveLength(0)
    }
  })

  it('no longer carries an end-turn affordance at all', () => {
    const r = table()
    expect('endTurn' in view(r, 'token-a').can).toBe(false)
  })

  it('offers the throw to the seat on turn and nobody else', () => {
    const r = table()
    expect(view(r, 'token-a').can.roll).toBe(true)
    expect(view(r, 'token-b').can.roll).toBe(false)
  })

  it('lets either seat manage its own holdings whenever it likes', () => {
    const r = table()
    const mp = r.monopoly!
    const set = groupSpaces('brown')
    mp.state.owners[set[0]] = 1
    mp.state.owners[set[1]] = 1

    // Seat 1 is not on turn, and may still build and mortgage.
    const bo = view(r, 'token-b').can
    expect(bo.build.length).toBeGreaterThan(0)
    expect(bo.mortgage).toContain(set[0])
  })
})

describe('the space names the board actually uses', () => {
  it('calls the holding square Antitrust, not a gaol', () => {
    const jail = SPACES.find((s) => s.kind === 'jail')
    const goTo = SPACES.find((s) => s.kind === 'goToJail')
    expect(jail?.name).toBe('Antitrust')
    expect(goTo?.name).toBe('Go to Antitrust')
  })
})

/**
 * The play log. The whole state goes out on every action and is written to the
 * database whole, so a log that grew for a two-hundred-turn game was a cost
 * paid over and over — and a length that stops changing is a badge that stops
 * counting.
 */
describe('the play log', () => {
  it('keeps the last two hundred lines and no more', () => {
    const game = started(2)
    for (let i = 0; i < LOG_KEEP + 120; i++) game['log'](0, `line ${i}`)

    expect(game.state.log).toHaveLength(LOG_KEEP)
    expect(game.state.log.at(-1)!.text, 'the newest survive').toBe(`line ${LOG_KEEP + 119}`)
    expect(game.state.log[0].text, 'the oldest are gone').not.toBe('line 0')
  })

  it('counts every line ever written, which the length cannot', () => {
    const game = started(2)
    for (let i = 0; i < LOG_KEEP + 5; i++) game['log'](0, `line ${i}`)

    const full = game.state.log.length
    const count = game.state.logCount
    game['log'](0, 'one more')

    // This is the pair a badge needs: the list is full and still, the count is
    // not. Keyed on the length, the unread marker would never move again.
    expect(game.state.log).toHaveLength(full)
    expect(game.state.logCount).toBe(count + 1)
  })

  it('carries the count over the wire so the table can use it', () => {
    const r = new Room('LOGS')
    r.options = { ...DEFAULT_OPTIONS, kind: 'monopoly', diceStart: false }
    r.addSeat('token-a', 'Ada')
    r.addSeat('token-b', 'Bo')
    r.start()

    const state = r['stateFor']('token-a') as MonopolyClientState
    expect(state.logCount).toBe(state.log.length)
    expect(state.logCount).toBeGreaterThan(0)
  })
})
