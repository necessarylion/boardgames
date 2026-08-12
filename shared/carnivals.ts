import { chooseFirst, type Opening } from './opening'
import { Rng } from './rng'
import type { LogEntry } from './types'

/**
 * Carnivals — a card-and-betting game of hidden information for two to six,
 * unrelated to Samurai, Halli Galli and Coup and sharing none of their rules.
 * Each hand a player holds two cards: a red one only they can see, and a blue
 * one only everyone *else* can see. You bet poker-style on a total you can never
 * fully know — you read your own red and the table's blues, and infer the rest.
 *
 * A hand runs in three steps. First everyone *picks* their two cards blind, from
 * a face-down row of each colour: the pick is a ritual, not a read, because the
 * numbers are hidden while you choose — and once chosen you are shown only your
 * red, never your blue. Then the *betting* goes round poker-style. Finally, at
 * the *showdown*, each player still in the hand turns their own cards over by
 * hand; the highest total once everyone has shown takes the pot.
 *
 * This module is the authoritative engine: like the other three it owns the only
 * real state, validates every action and hands back `{ok:false,error}` for
 * anything it rejects, so the client can call the read-only helpers freely
 * without ever being able to mutate a game.
 *
 * The published rules sheet stops before it names a winner — "the game's card
 * comparison or scoring system, to be defined later" — so the scoring here, and
 * the whole betting structure around it, are original choices, flagged where
 * they matter. Nothing is drawn from any published component.
 */

export type CardColour = 'red' | 'blue'

/** Every player starts a game with this many Carnivals. */
export const STARTING_CARNIVALS = 1000
/** The least a bet or raise may add on top of the current bet. */
export const MIN_RAISE = 10
/** Both colours run from this to `CARD_HIGH`, one of each dealt per hand. */
export const CARD_LOW = 1
export const CARD_HIGH = 10
/** How many face-down cards of each colour a player picks from each hand. */
export const HAND_CARDS = CARD_HIGH - CARD_LOW + 1

/** The ordered values behind the face-down row a player picks from. */
function fullSuit(): number[] {
  return Array.from({ length: HAND_CARDS }, (_, i) => CARD_LOW + i)
}

export interface CarnivalPlayer {
  id: number
  /** The player's bankroll, all that survives between hands. */
  carnivals: number
  /**
   * This hand's private card, visible only to its owner once picked, or null
   * before the pick. A player reads this and bets partly on the strength of it.
   */
  red: number | null
  /**
   * This hand's public card, visible to *everyone but* its owner — the twist the
   * whole game turns on — until the owner turns it over at the showdown. Null
   * before the pick.
   */
  blue: number | null
  /**
   * The face-down values this seat picks its two cards from this hand, one
   * shuffled suit per colour. Never sent to anyone: the pick is blind, so the
   * numbers behind the row are the server's alone.
   */
  redPool: number[]
  bluePool: number[]
  /** Has picked both cards this hand. */
  selected: boolean
  /** Has turned their own hand face up at the showdown. */
  revealed: boolean
  /** Carnivals put into the pot this hand, ante included. */
  committed: number
  /** Folded out of the current hand, forfeiting whatever is already committed. */
  folded: boolean
  /** Eliminated: no longer able to cover the ante, and out of the game for good. */
  out: boolean
}

/**
 * A hand runs through picking the cards, betting on them, and turning them over.
 */
export type CarnivalStep = 'selecting' | 'betting' | 'showdown'

/** One player's cards laid face up at showdown. */
export interface CarnivalReveal {
  player: number
  red: number
  blue: number
  /** Their score — the sum of the two — decided the pot. */
  total: number
}

/** How a hand finished, kept so the whole table can see the cards and the split. */
export interface CarnivalRoundResult {
  hand: number
  /** Every player who turned their hand over — the seats still contesting it. */
  reveals: CarnivalReveal[]
  /** The seat(s) that won the pot; more than one only on a tie. */
  winners: number[]
  pot: number
  /** Carnivals paid out to each winning seat, id → amount. */
  shares: Record<number, number>
  /** True when the pot was conceded by folds, so nobody had to show. */
  byFold: boolean
}

/** The most recent notable moment, so the table can narrate and animate it. */
export type CarnivalEvent =
  | { kind: 'deal'; hand: number }
  | { kind: 'select'; player: number }
  | { kind: 'check'; player: number }
  | { kind: 'call'; player: number; amount: number }
  | { kind: 'raise'; player: number; to: number; by: number }
  | { kind: 'allIn'; player: number; amount: number; to: number }
  | { kind: 'fold'; player: number }
  | { kind: 'reveal'; player: number }
  | { kind: 'showdown'; winners: number[]; pot: number }
  | { kind: 'out'; player: number }

export interface CarnivalResult {
  /** The last player left with Carnivals, or null if the table emptied at once. */
  winner: number | null
  reason: string
}

export type CarnivalPhase = 'play' | 'over'

export interface CarnivalGameState {
  playerCount: number
  players: CarnivalPlayer[]
  /**
   * Where the generator has got to. Carnivals deals a fresh hand from the same
   * stream every round rather than replaying from a seed, so like Coup it stores
   * the generator's position rather than its original seed.
   */
  seed: number
  /** Whose turn it is to act in the betting round. */
  current: number
  /**
   * How the opening seat was chosen, or null when it was simply drawn. The seat
   * is random either way: opening the room is no advantage. Shared with the
   * other three games; see `shared/opening.ts`.
   */
  opening: Opening | null
  phase: CarnivalPhase
  step: CarnivalStep
  paused: boolean
  /** Mirrors `handNumber`, for the generic shell that reads `turnNumber`. */
  turnNumber: number
  handNumber: number
  /** The seat that acts first this hand; it rotates one live seat each hand. */
  dealer: number
  pot: number
  /** The highest anyone has committed this hand: what a call has to match. */
  currentBet: number
  minRaise: number
  /**
   * Who has acted since the last raise. Betting closes once every player still
   * in the hand is in here and has matched the current bet — a raise empties it
   * back to just the raiser, so everyone else owes another decision.
   */
  acted: number[]
  lastEvent: CarnivalEvent | null
  /** Set only once a hand is resolved; null while it is still being played. */
  roundResult: CarnivalRoundResult | null
  log: LogEntry[]
  result: CarnivalResult | null
}

export type Outcome = { ok: true } | { ok: false; error: string }

const ok: Outcome = { ok: true }
const fail = (error: string): Outcome => ({ ok: false, error })

// --- read-only helpers, safe for the client to call --------------------------

/** Players still in the game — able to be dealt into a hand. */
const live = (players: CarnivalPlayer[]): CarnivalPlayer[] => players.filter((p) => !p.out)

/** Players still contesting the current hand — dealt in and not folded. */
const contesting = (players: CarnivalPlayer[]): CarnivalPlayer[] =>
  players.filter((p) => !p.out && !p.folded)

/** A player's score for the hand: their two cards summed, or null before a pick. */
export function score(player: CarnivalPlayer): number | null {
  return player.red === null || player.blue === null ? null : player.red + player.blue
}

/**
 * How a hand ranks against another. The higher total wins; a tie on the total is
 * broken by the higher single card, so two hands share only when they are truly
 * the same pair. A hand not yet dealt ranks below every real one.
 */
export function handRank(player: CarnivalPlayer): number {
  if (player.red === null || player.blue === null) return -Infinity
  return (player.red + player.blue) * 100 + Math.max(player.red, player.blue)
}

/**
 * What this viewer may do right now, decided from the full state and sent
 * ready-made the way Coup sends its affordances. Everything here could in
 * principle be worked out on the client from the public figures, but the table
 * already trusts the server for what a hand is worth, so it trusts it for the
 * buttons too — a button that disagrees with the engine is worse than none.
 */
export interface CarnivalAffordances {
  /** The picking step is open and this seat has not yet chosen its two cards. */
  select: boolean
  check: boolean
  call: boolean
  /** Carnivals a call would cost — the gap up to the current bet. */
  callAmount: number
  raise: boolean
  /** The smallest total a raise may bring this seat's commitment to. */
  minRaiseTo: number
  /** The largest — everything the seat has behind it. */
  maxRaiseTo: number
  /** The seat cannot cover the bet but may stay in for all it has left. */
  allIn: boolean
  /** What that all-in would put in — the seat's whole remaining stack. */
  allInAmount: number
  fold: boolean
  /** The showdown is on and this seat still has a hand to turn over. */
  reveal: boolean
  /** The hand is resolved and this seat may deal the next one. */
  nextHand: boolean
}

export function affordances(state: CarnivalGameState, playerId: number): CarnivalAffordances {
  const idle: CarnivalAffordances = {
    select: false,
    check: false,
    call: false,
    callAmount: 0,
    raise: false,
    minRaiseTo: 0,
    maxRaiseTo: 0,
    allIn: false,
    allInAmount: 0,
    fold: false,
    reveal: false,
    nextHand: false,
  }
  const player = state.players[playerId]
  if (!player || player.out || state.phase !== 'play' || state.paused) return idle

  if (state.step === 'selecting') return { ...idle, select: !player.selected }

  if (state.step === 'showdown') {
    // Once the pot is resolved the only thing left is to move the game on;
    // before that, every seat still in the hand turns its own cards over.
    if (state.roundResult) return { ...idle, nextHand: true }
    return { ...idle, reveal: !player.folded && !player.revealed }
  }

  // betting
  if (player.folded || playerId !== state.current) return idle
  const callAmount = state.currentBet - player.committed
  const minRaiseTo = state.currentBet + state.minRaise
  const maxRaiseTo = player.committed + player.carnivals
  return {
    ...idle,
    // With the ante counted as everyone's opening bet, the first to act has
    // nothing to match and so may check.
    check: callAmount === 0,
    // A call is offered when the seat can cover the bet outright.
    call: callAmount > 0 && player.carnivals >= callAmount,
    callAmount,
    // A raise has to reach at least the minimum and can never exceed the stack.
    raise: maxRaiseTo >= minRaiseTo,
    minRaiseTo,
    maxRaiseTo,
    // Cannot cover the bet but has chips left: stay in for everything, and let
    // the side pots settle who can win what at the showdown.
    allIn: callAmount > 0 && player.carnivals > 0 && player.carnivals < callAmount,
    allInAmount: player.carnivals,
    fold: true,
  }
}

export class CarnivalGame {
  state: CarnivalGameState

  constructor(playerCount: number, seed: number, diceStart = true) {
    this.state = CarnivalGame.deal(playerCount, seed, diceStart)
  }

  /** Rebuild an engine around state read back from the database. */
  static fromState(state: CarnivalGameState): CarnivalGame {
    const game = Object.create(CarnivalGame.prototype) as CarnivalGame
    game.state = state
    return game
  }

  private static deal(playerCount: number, seed: number, diceStart: boolean): CarnivalGameState {
    const rng = new Rng(seed)
    const players: CarnivalPlayer[] = Array.from({ length: playerCount }, (_, id) => ({
      id,
      carnivals: STARTING_CARNIVALS,
      red: null,
      blue: null,
      redPool: [],
      bluePool: [],
      selected: false,
      revealed: false,
      committed: 0,
      folded: false,
      out: false,
    }))
    // Opening the room is not an advantage: the first dealer is drawn, either by
    // a roll-off the table watches or quietly from the same generator. Drawn
    // last of everything the deal takes, so inserting it does not shift the deal.
    const { first: dealer, opening } = chooseFirst(rng, playerCount, diceStart)

    const state: CarnivalGameState = {
      playerCount,
      players,
      seed: rng.position,
      current: dealer,
      opening,
      phase: 'play',
      step: 'selecting',
      paused: false,
      turnNumber: 0,
      handNumber: 0,
      dealer,
      pot: 0,
      currentBet: 0,
      minRaise: MIN_RAISE,
      acted: [],
      lastEvent: null,
      roundResult: null,
      log: [
        {
          turn: 0,
          player: null,
          text: `Dealt ${STARTING_CARNIVALS} Carnivals to ${playerCount} players.`,
        },
      ],
      result: null,
    }
    const game = CarnivalGame.fromState(state)
    game.beginHand(dealer)
    return state
  }

  // --- actions ---------------------------------------------------------------

  /**
   * Pick this hand's two cards, blind, by their face-down position in each
   * colour's row. The numbers behind the row are hidden while you choose, so the
   * pick decides nothing you can read — and once made you are shown only your
   * red, your blue staying turned away from you as the game demands.
   */
  select(playerId: number, redIndex: number, blueIndex: number): Outcome {
    const s = this.state
    if (s.phase !== 'play') return fail('The game is over.')
    if (s.paused) return fail('The table is paused.')
    if (s.step !== 'selecting') return fail('The cards are already chosen.')
    const player = s.players[playerId]
    if (!player || player.out) return fail('You are out of the game.')
    if (player.selected) return fail('You have already chosen your cards.')
    if (!Number.isInteger(redIndex) || redIndex < 0 || redIndex >= player.redPool.length) {
      return fail('That is not one of your red cards.')
    }
    if (!Number.isInteger(blueIndex) || blueIndex < 0 || blueIndex >= player.bluePool.length) {
      return fail('That is not one of your blue cards.')
    }

    player.red = player.redPool[redIndex]
    player.blue = player.bluePool[blueIndex]
    player.selected = true
    s.lastEvent = { kind: 'select', player: playerId }
    this.log(playerId, 'picks their cards.')

    // Once everyone still in the game has chosen, the betting opens.
    if (live(s.players).every((p) => p.selected)) this.startBetting()
    return ok
  }

  /** Match the current bet without raising it, when there is nothing to match. */
  check(playerId: number): Outcome {
    const guard = this.guardBetting(playerId)
    if (guard) return guard
    const player = this.state.players[playerId]
    if (this.state.currentBet - player.committed !== 0) return fail('There is a bet to call.')

    this.markActed(playerId)
    this.state.lastEvent = { kind: 'check', player: playerId }
    this.log(playerId, 'checks.')
    this.advanceBetting()
    return ok
  }

  /** Match the current bet, paying the gap up to it into the pot. */
  call(playerId: number): Outcome {
    const guard = this.guardBetting(playerId)
    if (guard) return guard
    const s = this.state
    const player = s.players[playerId]
    const amount = s.currentBet - player.committed
    if (amount <= 0) return fail('There is nothing to call.')
    if (player.carnivals < amount) return fail('You cannot cover that bet.')

    this.commit(player, amount)
    this.markActed(playerId)
    s.lastEvent = { kind: 'call', player: playerId, amount }
    this.log(playerId, `calls ${amount}.`)
    this.advanceBetting()
    return ok
  }

  /**
   * Raise the bet, bringing this seat's total commitment to `to`. The raise has
   * to clear the current bet by at least the minimum and can never put in more
   * than the seat holds — table stakes, and no side pots to keep it that way.
   */
  raise(playerId: number, to: number): Outcome {
    const guard = this.guardBetting(playerId)
    if (guard) return guard
    const s = this.state
    const player = s.players[playerId]
    if (!Number.isInteger(to)) return fail('That is not a valid raise.')
    const minRaiseTo = s.currentBet + s.minRaise
    if (to < minRaiseTo) return fail(`A raise must reach at least ${minRaiseTo}.`)
    if (to > player.committed + player.carnivals) return fail('You cannot raise beyond your stack.')

    const by = to - s.currentBet
    this.commit(player, to - player.committed)
    s.currentBet = to
    // A raise reopens the round: everyone but the raiser owes a fresh decision.
    s.acted = [playerId]
    s.lastEvent = { kind: 'raise', player: playerId, to, by }
    this.log(playerId, `raises to ${to}.`)
    this.advanceBetting()
    return ok
  }

  /**
   * Put in everything you have left. A seat that cannot cover the bet stays in
   * this way rather than folding: it can win only as much as it matched from
   * each opponent, which the side pots work out at the showdown. Should the
   * whole stack happen to clear the current bet, it counts as a raise and
   * reopens the round; otherwise it is a short call that leaves the bet where it
   * stood.
   */
  allIn(playerId: number): Outcome {
    const guard = this.guardBetting(playerId)
    if (guard) return guard
    const s = this.state
    const player = s.players[playerId]
    const amount = player.carnivals
    if (amount <= 0) return fail('You have nothing left to put in.')

    this.commit(player, amount)
    const to = player.committed
    if (to > s.currentBet) {
      s.currentBet = to
      s.acted = [playerId]
    } else {
      this.markActed(playerId)
    }
    s.lastEvent = { kind: 'allIn', player: playerId, amount, to }
    this.log(playerId, `goes all in for ${amount}.`)
    this.advanceBetting()
    return ok
  }

  /** Leave the hand, forfeiting everything already committed to the pot. */
  fold(playerId: number): Outcome {
    const guard = this.guardBetting(playerId)
    if (guard) return guard
    const player = this.state.players[playerId]
    player.folded = true
    this.state.lastEvent = { kind: 'fold', player: playerId }
    this.log(playerId, 'folds.')
    this.advanceBetting()
    return ok
  }

  /**
   * Turn your own hand face up at the showdown. Your red goes public to the whole
   * table, and your blue — the one card the game kept from you all hand — is
   * finally shown to you too. The pot is settled once everyone still in has shown.
   */
  reveal(playerId: number): Outcome {
    const s = this.state
    if (s.phase !== 'play') return fail('The game is over.')
    if (s.paused) return fail('The table is paused.')
    if (s.step !== 'showdown' || s.roundResult) return fail('There is nothing to reveal.')
    const player = s.players[playerId]
    if (!player || player.out || player.folded) return fail('You are not in this hand.')
    if (player.revealed) return fail('You have already shown your hand.')

    player.revealed = true
    s.lastEvent = { kind: 'reveal', player: playerId }
    this.log(playerId, 'turns their hand over.')

    if (contesting(s.players).every((p) => p.revealed)) this.resolvePot(true)
    return ok
  }

  /** Deal the next hand once the last is resolved. Open to any live player. */
  nextHand(playerId: number): Outcome {
    const s = this.state
    if (s.phase !== 'play') return fail('The game is over.')
    if (s.paused) return fail('The table is paused.')
    if (s.step !== 'showdown' || !s.roundResult) return fail('The hand is not over yet.')
    const player = s.players[playerId]
    if (!player || player.out) return fail('You are out of the game.')
    this.dealNext()
    return ok
  }

  /**
   * The clock ran out on whoever the table was waiting for. Every branch takes
   * the least damaging legal move: an unmade pick is made blind from the first
   * cards, mid-hand the safest option is to check where there is nothing to call
   * and otherwise to fold, an unshown hand is turned over, and a resolved hand
   * is dealt past so the table never stalls on an absent winner.
   *
   * Like Coup's, this takes no player — the table may be waiting on several
   * seats at once — so it resolves whatever the step is asking.
   */
  timeOut(): Outcome {
    const s = this.state
    if (s.phase !== 'play') return fail('The game is over.')
    if (s.paused) return fail('The table is paused.')

    if (s.step === 'selecting') {
      let acted = false
      for (const p of live(s.players)) {
        if (!p.selected) acted = this.select(p.id, 0, 0).ok || acted
      }
      return acted ? ok : fail('There is nobody to time out.')
    }

    if (s.step === 'showdown') {
      if (s.roundResult) {
        this.dealNext()
        return ok
      }
      let acted = false
      for (const p of contesting(s.players)) {
        if (!p.revealed) acted = this.reveal(p.id).ok || acted
      }
      return acted ? ok : fail('There is nobody to time out.')
    }

    const player = s.players[s.current]
    if (!player || player.out || player.folded) return fail('There is nobody to time out.')
    return s.currentBet - player.committed === 0 ? this.check(s.current) : this.fold(s.current)
  }

  /** Suspend the table; any seated player may. Mirrors the other three games. */
  pause(playerId: number): Outcome {
    const s = this.state
    if (s.phase === 'over') return fail('The game is already over.')
    if (s.paused) return fail('The table is already paused.')
    if (!s.players[playerId]) return fail('You have no seat in this game.')
    s.paused = true
    return ok
  }

  resume(playerId: number): Outcome {
    const s = this.state
    if (!s.paused) return fail('The table is not paused.')
    if (!s.players[playerId]) return fail('You have no seat in this game.')
    s.paused = false
    return ok
  }

  // --- betting internals -----------------------------------------------------

  /** The checks every betting action shares, in one place. */
  private guardBetting(playerId: number): Outcome | null {
    const s = this.state
    if (s.phase !== 'play') return fail('The game is over.')
    if (s.paused) return fail('The table is paused.')
    if (s.step !== 'betting') return fail('Betting is not open.')
    const player = s.players[playerId]
    if (!player || player.out) return fail('You are out of the game.')
    if (player.folded) return fail('You have folded this hand.')
    if (playerId !== s.current) return fail('It is not your turn.')
    return null
  }

  private commit(player: CarnivalPlayer, amount: number): void {
    player.carnivals -= amount
    player.committed += amount
    this.state.pot += amount
  }

  private markActed(playerId: number): void {
    if (!this.state.acted.includes(playerId)) this.state.acted.push(playerId)
  }

  /** Open the betting once every seat has chosen its cards. */
  private startBetting(): void {
    const s = this.state
    s.step = 'betting'
    s.acted = []
    s.current = s.dealer
  }

  /** Whether the betting round has run its course. */
  private bettingClosed(): boolean {
    const s = this.state
    const inHand = contesting(s.players)
    // Everyone else folded: the pot is decided without a comparison.
    if (inHand.length <= 1) return true
    // Otherwise everyone still in must be settled — either all in with nothing
    // left to say, or level with the current bet having spoken since the last
    // raise.
    return inHand.every(
      (p) => p.carnivals === 0 || (s.acted.includes(p.id) && p.committed === s.currentBet),
    )
  }

  /**
   * Close the round if it is done, else pass the turn to the next seat that can
   * still act — skipping folded seats and those already all in with nothing left.
   */
  private advanceBetting(): void {
    const s = this.state
    if (this.bettingClosed()) {
      this.toShowdown()
      return
    }
    for (let step = 1; step <= s.playerCount; step++) {
      const id = (s.current + step) % s.playerCount
      const p = s.players[id]
      if (!p.out && !p.folded && p.carnivals > 0) {
        s.current = id
        return
      }
    }
  }

  /**
   * Betting is done. If only one seat is left in, the pot is conceded and
   * resolved at once — nobody has to show. Otherwise the hand goes to a showdown
   * where each seat still in turns its own cards over by hand.
   */
  private toShowdown(): void {
    const s = this.state
    s.step = 'showdown'
    if (contesting(s.players).length <= 1) this.resolvePot(false)
  }

  /**
   * Decide the winner(s) and pay out the pot. `shown` is whether the seats
   * turned their hands over — true at a real showdown, false when the pot was
   * conceded by folds and nobody had to reveal.
   *
   * The pot is settled in layers so an all-in seat can win only as much as it
   * matched. Each layer is peeled off at the smallest live commitment: every
   * seat that put in at least that much shares the layer, folded seats fund it
   * as dead money, and only the seats still in the hand can win it. In the
   * ordinary hand, where nobody is short, this collapses to a single pot and one
   * best hand takes the lot.
   */
  private resolvePot(shown: boolean): void {
    const s = this.state
    const inHand = contesting(s.players)
    // A hand is contested once two seats are still in it. When only one is — the
    // rest folded — nobody's bet was really "uncalled", so the sole seat simply
    // takes the whole pot rather than having its own excess handed back.
    const contested = inHand.length >= 2

    // Every seat's committed chips, to be peeled into layers below.
    const remaining = new Map<number, number>()
    for (const p of s.players) if (p.committed > 0) remaining.set(p.id, p.committed)

    const shares: Record<number, number> = {}
    const award = (amount: number, eligibleIds: number[]) => {
      // The best hand among the seats entitled to this layer; a true tie splits
      // it, and the odd Carnivals that will not divide go to the seats nearest
      // the top. Ranking breaks a level total by the higher single card, so only
      // matching pairs share.
      const eligible = eligibleIds.length ? eligibleIds : inHand.map((p) => p.id)
      const best = Math.max(...eligible.map((id) => handRank(s.players[id])))
      const winners = eligible.filter((id) => handRank(s.players[id]) === best).sort((a, b) => a - b)
      const each = Math.floor(amount / winners.length)
      let remainder = amount - each * winners.length
      for (const id of winners) {
        const extra = remainder > 0 ? 1 : 0
        remainder -= extra
        const won = each + extra
        shares[id] = (shares[id] ?? 0) + won
        s.players[id].carnivals += won
      }
    }

    while ([...remaining.values()].some((v) => v > 0)) {
      const positive = [...remaining.entries()].filter(([, v]) => v > 0)
      const layer = Math.min(...positive.map(([, v]) => v))
      let amount = 0
      for (const [id, v] of positive) {
        remaining.set(id, v - layer)
        amount += layer
      }
      const contributors = positive.map(([id]) => id)
      const inHandContribs = contributors.filter((id) => inHand.some((p) => p.id === id))
      // A layer only one seat reached is an uncalled bet: nobody matched it, so
      // it is returned to its better rather than won. This is what stops a bigger
      // stack being paid for chips no one could ever cover — the returned amount
      // is not winnings, so the seat is not counted among the pot's winners.
      if (contested && contributors.length === 1 && inHandContribs.length === 1) {
        s.players[inHandContribs[0]].carnivals += amount
        continue
      }
      award(amount, inHandContribs)
    }

    const winners = Object.keys(shares)
      .map(Number)
      .sort((a, b) => a - b)
    const won = winners.reduce((sum, id) => sum + shares[id], 0)
    const reveals: CarnivalReveal[] = shown
      ? inHand.map((p) => ({ player: p.id, red: p.red!, blue: p.blue!, total: p.red! + p.blue! }))
      : []

    s.roundResult = { hand: s.handNumber, reveals, winners, pot: won, shares, byFold: !shown }
    s.lastEvent = { kind: 'showdown', winners, pot: won }
    if (winners.length === 0) {
      // Nobody bet a thing, so there is no pot to award — the hand is checked down.
      this.log(null, 'The hand is checked down — no pot.')
    } else {
      const names = winners.map((id) => this.name(id)).join(', ')
      this.log(null, `${names} ${winners.length > 1 ? 'share' : 'takes'} the pot of ${won} Carnivals.`)
    }
  }

  // --- hand and game flow ----------------------------------------------------

  /** Lay out a fresh face-down row of each colour for every seat, pot empty. */
  private beginHand(dealer: number): void {
    const s = this.state
    const rng = new Rng(s.seed)
    s.handNumber += 1
    s.turnNumber = s.handNumber
    s.dealer = dealer
    // There is no ante: the pot starts empty and grows only as the table bets.
    s.pot = 0
    s.currentBet = 0
    s.acted = []
    s.roundResult = null
    s.step = 'selecting'

    for (const p of s.players) {
      if (p.out) continue
      // Each colour is a shuffled full suit, so the ten face-down cards are the
      // numbers one to ten in some order — a real choice of card, blind.
      p.redPool = rng.shuffle(fullSuit())
      p.bluePool = rng.shuffle(fullSuit())
      p.red = null
      p.blue = null
      p.selected = false
      p.revealed = false
      p.folded = false
      p.committed = 0
    }
    s.seed = rng.position
    s.current = dealer
    s.lastEvent = { kind: 'deal', hand: s.handNumber }
    this.log(null, `Hand ${s.handNumber} dealt.`)
  }

  /**
   * Move the game on after a resolved hand: drop anyone who has run out of
   * Carnivals, end the game if only one seat is left, otherwise deal again with
   * the button passed one live seat along.
   */
  private dealNext(): void {
    const s = this.state
    for (const p of s.players) {
      if (!p.out && p.carnivals <= 0) {
        p.out = true
        s.lastEvent = { kind: 'out', player: p.id }
        this.log(p.id, 'runs out of Carnivals and is out of the game.')
      }
    }

    const remaining = live(s.players)
    if (remaining.length <= 1) {
      s.phase = 'over'
      const winner = remaining[0] ?? null
      s.result = {
        winner: winner?.id ?? null,
        reason: winner ? 'the last player with Carnivals' : 'the table went broke at once',
      }
      if (winner) this.log(winner.id, 'wins the game.')
      return
    }

    // Pass the button to the next seat still in the game.
    let dealer = s.dealer
    for (let step = 1; step <= s.playerCount; step++) {
      const id = (s.dealer + step) % s.playerCount
      if (!s.players[id].out) {
        dealer = id
        break
      }
    }
    this.beginHand(dealer)
  }

  /**
   * A seat referred to inside a log line. The engine has no idea what anyone is
   * called — names live on the room's seats, not in the rules — so it writes a
   * token and the client swaps in the real name when it prints the log. The
   * subject of a line is not tokenised: that is what `LogEntry.player` is for.
   */
  private name(playerId: number): string {
    return `#${playerId}`
  }

  private log(player: number | null, text: string): void {
    this.state.log.push({ turn: this.state.handNumber, player, text })
    // Keep the log from growing without bound over a long game.
    if (this.state.log.length > 200) this.state.log.splice(0, this.state.log.length - 200)
  }
}
