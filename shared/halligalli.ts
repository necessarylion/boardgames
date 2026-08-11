import { chooseFirst, type Opening } from './opening'
import { Rng } from './rng'
import type { LogEntry } from './types'

/**
 * Halli Galli — a real-time reflex card game, unrelated to Samurai and sharing
 * none of its rules. Players flip cards onto face-up piles in turn; the instant
 * the visible fruit of one kind totals exactly five across the table, anyone may
 * ring the bell. This module is the authoritative engine: like Samurai's it owns
 * the only real state, validates every action and hands back `{ok:false,error}`
 * for anything it rejects, so the client can call the read-only helpers freely
 * without ever being able to mutate a game.
 *
 * The published game ships a deck and a bell; the rules are not copyrightable and
 * this is an original wording of them. A few points the rulebook leaves to
 * convention are pinned down here as deliberate choices, flagged where they are.
 */

export type Fruit = 'banana' | 'lime' | 'strawberry' | 'plum'

export const FRUITS: readonly Fruit[] = ['banana', 'lime', 'strawberry', 'plum']

/** The number a ringing fruit must reach across every visible top card. */
export const RING_TOTAL = 5

/** A single card: some number of one fruit. */
export interface Card {
  fruit: Fruit
  n: number
}

/**
 * The deck: for each of the four fruits, cards showing 1–5 of it, weighted so
 * low counts are common and a five is rare. Fourteen per fruit, fifty-six total.
 */
const CARD_WEIGHTS: Record<number, number> = { 1: 5, 2: 3, 3: 3, 4: 2, 5: 1 }
export const DECK_SIZE = FRUITS.length * Object.values(CARD_WEIGHTS).reduce((a, b) => a + b, 0)

export function buildDeck(): Card[] {
  const deck: Card[] = []
  for (const fruit of FRUITS) {
    for (const [n, count] of Object.entries(CARD_WEIGHTS)) {
      for (let i = 0; i < count; i++) deck.push({ fruit, n: Number(n) })
    }
  }
  return deck
}

export interface HalliPlayer {
  id: number
  /** Face-down draw pile; the card flipped next is the last one (`pop`). Hidden. */
  stack: Card[]
  /** Face-up pile; only its last card — the most recent flip — counts. Public. */
  faceUp: Card[]
  /** Out of the game: no cards anywhere, skipped and unable to ring. */
  out: boolean
}

/** The most recent notable moment, so the table can narrate and animate it. */
export type HalliEvent =
  | { kind: 'flip'; player: number; card: Card }
  | { kind: 'ring'; player: number; correct: true; fruit: Fruit; taken: number }
  | { kind: 'ring'; player: number; correct: false; penalty: number }

export interface HalliResult {
  /** The last player left holding cards, or null if the table emptied at once. */
  winner: number | null
  reason: string
}

export type HalliPhase = 'play' | 'over'

export interface HalliGameState {
  playerCount: number
  players: HalliPlayer[]
  /** Whose turn it is to flip. Ringing the bell is open to everyone, always. */
  current: number
  /** How the opening seat was decided, or null when it was drawn quietly. */
  opening: Opening | null
  phase: HalliPhase
  paused: boolean
  /** Flips so far, used as the log's turn column. */
  turnNumber: number
  log: LogEntry[]
  result: HalliResult | null
  lastEvent: HalliEvent | null
}

export type Outcome = { ok: true } | { ok: false; error: string }

const ok: Outcome = { ok: true }
const fail = (error: string): Outcome => ({ ok: false, error })

// --- read-only helpers, safe for the client to call --------------------------

/** The visible total of each fruit — the sum of the top cards showing it. */
export function fruitTotals(players: HalliPlayer[]): Record<Fruit, number> {
  const totals: Record<Fruit, number> = { banana: 0, lime: 0, strawberry: 0, plum: 0 }
  for (const p of players) {
    const top = p.faceUp[p.faceUp.length - 1]
    if (top) totals[top.fruit] += top.n
  }
  return totals
}

/** The fruit whose visible total is exactly five, if any — a valid bell. */
export function ringingFruit(players: HalliPlayer[]): Fruit | null {
  const totals = fruitTotals(players)
  return FRUITS.find((f) => totals[f] === RING_TOTAL) ?? null
}

const totalCards = (p: HalliPlayer): number => p.stack.length + p.faceUp.length

export class HalliGame {
  state: HalliGameState

  constructor(playerCount: number, seed: number, diceStart = true) {
    this.state = HalliGame.deal(playerCount, seed, diceStart)
  }

  /** Rebuild an engine around state read back from the database. */
  static fromState(state: HalliGameState): HalliGame {
    const game = Object.create(HalliGame.prototype) as HalliGame
    game.state = state
    return game
  }

  private static deal(playerCount: number, seed: number, diceStart: boolean): HalliGameState {
    const rng = new Rng(seed)
    const deck = rng.shuffle(buildDeck())
    // Whoever opened the room has no claim on the first flip; the seat is drawn.
    const { first, opening } = chooseFirst(rng, playerCount, diceStart)
    const players: HalliPlayer[] = Array.from({ length: playerCount }, (_, id) => ({
      id,
      stack: [],
      faceUp: [],
      out: false,
    }))
    // Round-robin, so a count that does not divide fifty-six spreads the
    // remainder evenly rather than piling it on the last seat.
    deck.forEach((card, i) => players[i % playerCount].stack.push(card))
    return {
      playerCount,
      players,
      current: first,
      opening,
      phase: 'play',
      paused: false,
      turnNumber: 1,
      log: [{ turn: 0, player: null, text: `Dealt ${DECK_SIZE} cards to ${playerCount} players.` }],
      result: null,
      lastEvent: null,
    }
  }

  // --- actions ---------------------------------------------------------------

  /** The current player turns their top card face up. */
  flip(playerId: number): Outcome {
    const s = this.state
    if (s.phase !== 'play') return fail('The game is over.')
    if (s.paused) return fail('The table is paused.')
    if (playerId !== s.current) return fail('It is not your turn to flip.')
    const player = s.players[playerId]
    if (!player || player.out) return fail('You are out of the game.')
    if (player.stack.length === 0) return fail('You have no cards left to flip.')

    const card = player.stack.pop()!
    player.faceUp.push(card)
    s.turnNumber++
    s.lastEvent = { kind: 'flip', player: playerId, card }
    this.log(playerId, `flips ${card.n} ${card.fruit}.`)
    // The next flip goes to the player on the left who still has a stack.
    s.current = this.nextFlipper(playerId)
    return ok
  }

  /**
   * Ring the bell. Anyone still in the game may, whoever's turn it is. If a fruit
   * shows exactly five the ringer sweeps every face-up pile; otherwise they pay a
   * card to each remaining opponent.
   */
  slap(playerId: number): Outcome {
    const s = this.state
    if (s.phase !== 'play') return fail('The game is over.')
    if (s.paused) return fail('The table is paused.')
    const player = s.players[playerId]
    if (!player || player.out) return fail('You are out of the game.')

    const fruit = ringingFruit(s.players)
    if (fruit) this.resolveCorrectRing(playerId, fruit)
    else this.resolveFalseRing(playerId)

    this.updateOut()
    this.checkEnd()
    if (s.phase === 'play') s.current = this.normalisedCurrent()
    return ok
  }

  /** Suspend the table; any seated player may. Mirrors Samurai's pause. */
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

  // --- resolution ------------------------------------------------------------

  private resolveCorrectRing(playerId: number, fruit: Fruit): void {
    const s = this.state
    const winner = s.players[playerId]
    const gathered: Card[] = []
    for (const p of s.players) {
      gathered.push(...p.faceUp)
      p.faceUp = []
    }
    // Won cards go face-down under the ringer's stack, so they are drawn last.
    winner.stack.unshift(...gathered)
    s.lastEvent = { kind: 'ring', player: playerId, correct: true, fruit, taken: gathered.length }
    this.log(playerId, `rings on ${fruit} and takes ${gathered.length} cards.`)
  }

  /**
   * A false ring costs the ringer one card to each remaining opponent. Cards are
   * paid from the bottom of the stack, and only as far as they reach — a ringer
   * with too few simply pays what they have and may go out for it.
   */
  private resolveFalseRing(playerId: number): void {
    const s = this.state
    const ringer = s.players[playerId]
    const opponents = s.players.filter((p) => p.id !== playerId && !p.out)
    let paid = 0
    for (const opponent of opponents) {
      const card = ringer.stack.shift()
      if (!card) break
      opponent.stack.unshift(card)
      paid++
    }
    s.lastEvent = { kind: 'ring', player: playerId, correct: false, penalty: paid }
    this.log(playerId, `rings by mistake and pays ${paid} card${paid === 1 ? '' : 's'}.`)
  }

  // --- turn order and endings ------------------------------------------------

  /** The next player clockwise who is in the game and has a card to flip. */
  private nextFlipper(from: number): number {
    const s = this.state
    for (let step = 1; step <= s.playerCount; step++) {
      const id = (from + step) % s.playerCount
      const p = s.players[id]
      if (!p.out && p.stack.length > 0) return id
    }
    // Nobody can flip; leave the pointer where it was for `checkEnd` to settle.
    return from
  }

  /** Keep `current` on someone who can actually flip after a redistribution. */
  private normalisedCurrent(): number {
    const p = this.state.players[this.state.current]
    if (p && !p.out && p.stack.length > 0) return this.state.current
    return this.nextFlipper(this.state.current)
  }

  private updateOut(): void {
    for (const p of this.state.players) {
      if (!p.out && totalCards(p) === 0) {
        p.out = true
        this.log(p.id, 'is out of the game.')
      }
    }
  }

  private checkEnd(): void {
    const s = this.state
    const alive = s.players.filter((p) => !p.out)
    if (alive.length <= 1) {
      s.phase = 'over'
      s.result = {
        winner: alive[0]?.id ?? null,
        reason: alive.length === 1 ? 'last player holding cards' : 'the table emptied at once',
      }
      return
    }
    // Nobody can flip and no bell is available: the table is frozen, so it is
    // settled on who holds the most cards rather than left stuck forever.
    const canFlip = s.players.some((p) => !p.out && p.stack.length > 0)
    if (!canFlip && !ringingFruit(s.players)) {
      const most = Math.max(...alive.map(totalCards))
      const leaders = alive.filter((p) => totalCards(p) === most)
      s.phase = 'over'
      s.result = {
        winner: leaders.length === 1 ? leaders[0].id : null,
        reason: leaders.length === 1 ? 'held the most cards when the table stalled' : 'stalled level',
      }
    }
  }

  private log(player: number | null, text: string): void {
    this.state.log.push({ turn: this.state.turnNumber, player, text })
    // Keep the log from growing without bound over a long, fast game.
    if (this.state.log.length > 200) this.state.log.splice(0, this.state.log.length - 200)
  }
}
