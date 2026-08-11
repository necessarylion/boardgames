import { Rng } from './rng'
import type { LogEntry } from './types'

/**
 * Coup — a game of bluff and deduction for two to six, unrelated to Samurai and
 * to Halli Galli, and sharing none of their rules. Each player hides two
 * influence cards and claims whichever character suits them; the claim is only
 * as good as the table's willingness to let it stand. This module is the
 * authoritative engine: like the other two it owns the only real state,
 * validates every action and hands back `{ok:false,error}` for anything it
 * rejects, so the client can call the read-only helpers freely without ever
 * being able to mutate a game.
 *
 * The published game ships a deck and coins; the rules are not copyrightable and
 * this is an original wording of them. Nothing here is drawn from the printed
 * components, and the few points the rulebook leaves to convention are pinned
 * down as deliberate choices, flagged where they are.
 */

export type CoupCharacter = 'duke' | 'assassin' | 'captain' | 'ambassador' | 'contessa'

export const CHARACTERS: readonly CoupCharacter[] = [
  'duke',
  'assassin',
  'captain',
  'ambassador',
  'contessa',
]

/** Copies of each character in the court deck. Five characters, fifteen cards. */
export const COPIES_PER_CHARACTER = 3
export const DECK_SIZE = CHARACTERS.length * COPIES_PER_CHARACTER

export const STARTING_COINS = 2
export const STARTING_INFLUENCE = 2
export const COUP_COST = 7
export const ASSASSINATE_COST = 3
export const STEAL_AMOUNT = 2

/** At this many coins a player may do nothing but launch a coup. */
export const FORCED_COUP_AT = 10

export function buildDeck(): CoupCharacter[] {
  const deck: CoupCharacter[] = []
  for (const character of CHARACTERS) {
    for (let i = 0; i < COPIES_PER_CHARACTER; i++) deck.push(character)
  }
  return deck
}

export type CoupActionKind =
  | 'income'
  | 'foreignAid'
  | 'coup'
  | 'tax'
  | 'assassinate'
  | 'steal'
  | 'exchange'

/**
 * Everything the rules say about one action, in one place. Validation, the
 * challenge and block windows and the buttons the client offers are all read off
 * this table rather than restated, so an action cannot be challengeable in one
 * of those places and not another.
 */
export interface CoupActionSpec {
  /** Coins paid on declaring, and never refunded — see `declare`. */
  cost: number
  /** The character the action claims, or null when anyone may take it. */
  claim: CoupCharacter | null
  needsTarget: boolean
  /** Characters that may block it; empty when nothing can. */
  blockedBy: readonly CoupCharacter[]
}

export const COUP_ACTIONS: Record<CoupActionKind, CoupActionSpec> = {
  income: { cost: 0, claim: null, needsTarget: false, blockedBy: [] },
  foreignAid: { cost: 0, claim: null, needsTarget: false, blockedBy: ['duke'] },
  coup: { cost: COUP_COST, claim: null, needsTarget: true, blockedBy: [] },
  tax: { cost: 0, claim: 'duke', needsTarget: false, blockedBy: [] },
  assassinate: { cost: ASSASSINATE_COST, claim: 'assassin', needsTarget: true, blockedBy: ['contessa'] },
  steal: { cost: 0, claim: 'captain', needsTarget: true, blockedBy: ['captain', 'ambassador'] },
  exchange: { cost: 0, claim: 'ambassador', needsTarget: false, blockedBy: [] },
}

export const ACTION_KINDS = Object.keys(COUP_ACTIONS) as CoupActionKind[]

export interface CoupPlayer {
  id: number
  coins: number
  /** Face-down influence. Hidden from everyone but the holder. */
  hand: CoupCharacter[]
  /** Influence already given up, face up and public for the rest of the game. */
  revealed: CoupCharacter[]
  /** No influence left: out of the game, and neither acting nor responding. */
  out: boolean
}

/** Why a player is being made to give up an influence. */
export type CoupLossReason = 'coup' | 'assassinate' | 'challengeLost' | 'bluffCaught'

/**
 * What the table is waiting on. A challenge can force a card loss in front of
 * the action that provoked it, so these are held as a stack rather than a single
 * slot: `pending[0]` is the question being answered, and the entries behind it
 * are what resumes once it is settled.
 */
export type CoupPending =
  /**
   * An action is on the table. Any live opponent may challenge the claim behind
   * it or block it, and the first to do either closes the window; everyone else
   * has only to wave it through.
   */
  | {
      step: 'action'
      actor: number
      action: CoupActionKind
      target: number | null
      /** Opponents who have waved this window through and may not reopen it. */
      passed: number[]
      /** Cleared once a challenge has failed: the claim is proven, blocks remain. */
      challengeable: boolean
    }
  /** A block is on the table. Only the player it thwarts may challenge it. */
  | {
      step: 'block'
      actor: number
      action: CoupActionKind
      target: number | null
      blocker: number
      character: CoupCharacter
      passed: number[]
    }
  /** Someone owes an influence and must say which. */
  | { step: 'lose'; player: number; reason: CoupLossReason }
  /** An exchange is half-done: the drawn cards are held until two are returned. */
  | { step: 'exchange'; player: number; drawn: CoupCharacter[] }
  /** An action that survived every window, waiting behind a loss to be applied. */
  | { step: 'resolve'; actor: number; action: CoupActionKind; target: number | null }

/** The most recent notable moment, so the table can narrate and animate it. */
export type CoupEvent =
  | { kind: 'action'; actor: number; action: CoupActionKind; target: number | null }
  | { kind: 'block'; blocker: number; character: CoupCharacter; action: CoupActionKind }
  | {
      kind: 'challenge'
      challenger: number
      claimant: number
      character: CoupCharacter
      /** Whether the challenger was right — the claimant was bluffing. */
      won: boolean
    }
  | { kind: 'lose'; player: number; character: CoupCharacter; reason: CoupLossReason }
  | { kind: 'out'; player: number }

/** One seat's throw in the opening roll-off. */
export interface CoupRoll {
  player: number
  roll: number
}

/**
 * How the opening seat was decided, kept so the whole table can watch it rather
 * than being told the answer. Each entry is one round of throws; a round with a
 * tie at the top is followed by another between just those seats, so the last
 * round always has exactly one throw in it.
 */
export interface CoupOpening {
  rounds: CoupRoll[][]
  winner: number
}

/** Faces on the die rolled for the opening seat. */
export const DIE_FACES = 6

/** Enough rounds to settle any realistic tie; the bound is only a stop. */
const MAX_ROLL_OFFS = 12

function rollForFirst(rng: Rng, playerCount: number): CoupOpening {
  const rounds: CoupRoll[][] = []
  let contenders = Array.from({ length: playerCount }, (_, id) => id)
  while (contenders.length > 1 && rounds.length < MAX_ROLL_OFFS) {
    const round = contenders.map((player) => ({ player, roll: rng.int(DIE_FACES) + 1 }))
    rounds.push(round)
    const best = Math.max(...round.map((r) => r.roll))
    contenders = round.filter((r) => r.roll === best).map((r) => r.player)
  }
  return { rounds, winner: contenders[0] }
}

export interface CoupResult {
  /** The last player with influence, or null if the table emptied at once. */
  winner: number | null
  reason: string
}

export type CoupPhase = 'play' | 'over'

export interface CoupGameState {
  playerCount: number
  players: CoupPlayer[]
  /** The court deck, face down and never sent to anyone. */
  deck: CoupCharacter[]
  /**
   * Where the shuffler has got to. Coup returns a proven card to the deck and
   * reshuffles mid-game, so unlike the other two engines it cannot replay from
   * its original seed and carries the generator's position instead.
   */
  seed: number
  current: number
  /**
   * How the opening seat was chosen, or null when it was simply drawn. Either
   * way the seat is random: seat 0 has no claim on going first just for having
   * opened the room.
   */
  opening: CoupOpening | null
  phase: CoupPhase
  paused: boolean
  turnNumber: number
  pending: CoupPending[]
  log: LogEntry[]
  result: CoupResult | null
  lastEvent: CoupEvent | null
}

export type Outcome = { ok: true } | { ok: false; error: string }

const ok: Outcome = { ok: true }
const fail = (error: string): Outcome => ({ ok: false, error })

// --- read-only helpers, safe for the client to call --------------------------

/** Influence still held — the number of cards a player has left to lose. */
export const influence = (player: CoupPlayer): number => player.hand.length

const live = (players: CoupPlayer[]): CoupPlayer[] => players.filter((p) => !p.out)

/**
 * The actions a player may declare right now. Empty unless it is their turn with
 * nothing pending; at ten coins the only move left is a coup, which is what
 * stops a table stalling behind two players who will not spend.
 */
export function legalActions(state: CoupGameState, playerId: number): CoupActionKind[] {
  const player = state.players[playerId]
  if (state.phase !== 'play' || state.paused) return []
  if (state.pending.length > 0) return []
  if (!player || player.out || playerId !== state.current) return []
  if (player.coins >= FORCED_COUP_AT) return ['coup']
  return ACTION_KINDS.filter((kind) => {
    const spec = COUP_ACTIONS[kind]
    if (player.coins < spec.cost) return false
    // A targeted action needs somebody to aim at.
    if (spec.needsTarget && legalTargets(state, playerId).length === 0) return false
    return true
  })
}

/** Seats a targeted action may be aimed at: everyone else still in the game. */
export function legalTargets(state: CoupGameState, playerId: number): number[] {
  return live(state.players)
    .filter((p) => p.id !== playerId)
    .map((p) => p.id)
}

/**
 * Who is positionally entitled to block the pending action. Held cards are
 * secret, so this is only about seats: foreign aid is everyone's business, while
 * an assassination or a theft is answered by the player on the receiving end.
 */
export function blockSeats(
  state: CoupGameState,
  action: CoupActionKind,
  actor: number,
  target: number | null,
): number[] {
  const spec = COUP_ACTIONS[action]
  if (spec.blockedBy.length === 0) return []
  if (spec.needsTarget) return target !== null && !state.players[target]?.out ? [target] : []
  return live(state.players)
    .filter((p) => p.id !== actor)
    .map((p) => p.id)
}

/** Everyone still owed a say on the pending window, in seat order. */
export function responders(state: CoupGameState): number[] {
  const p = state.pending[0]
  if (!p) return []
  if (p.step === 'block') {
    // Only the player the block thwarts may call it a bluff.
    return p.passed.includes(p.actor) || state.players[p.actor]?.out ? [] : [p.actor]
  }
  if (p.step !== 'action') return []
  const eligible = p.challengeable
    ? live(state.players)
        .filter((x) => x.id !== p.actor)
        .map((x) => x.id)
    : blockSeats(state, p.action, p.actor, p.target)
  return eligible.filter((id) => !p.passed.includes(id))
}

/** Whether a player may call the pending claim a bluff. */
export function canChallenge(state: CoupGameState, playerId: number): boolean {
  const p = state.pending[0]
  if (!p || state.paused) return false
  if (p.step === 'action') return p.challengeable && responders(state).includes(playerId)
  if (p.step === 'block') return responders(state).includes(playerId)
  return false
}

/** Which characters a player may block the pending action with, if any. */
export function blockOptions(state: CoupGameState, playerId: number): CoupCharacter[] {
  const p = state.pending[0]
  if (!p || p.step !== 'action' || state.paused) return []
  if (!responders(state).includes(playerId)) return []
  if (!blockSeats(state, p.action, p.actor, p.target).includes(playerId)) return []
  return [...COUP_ACTIONS[p.action].blockedBy]
}

export class CoupGame {
  state: CoupGameState

  constructor(playerCount: number, seed: number, diceStart = true) {
    this.state = CoupGame.deal(playerCount, seed, diceStart)
  }

  /** Rebuild an engine around state read back from the database. */
  static fromState(state: CoupGameState): CoupGame {
    const game = Object.create(CoupGame.prototype) as CoupGame
    game.state = state
    return game
  }

  private static deal(playerCount: number, seed: number, diceStart: boolean): CoupGameState {
    const rng = new Rng(seed)
    const deck = rng.shuffle(buildDeck())
    const players: CoupPlayer[] = Array.from({ length: playerCount }, (_, id) => ({
      id,
      coins: STARTING_COINS,
      hand: [deck.pop()!, deck.pop()!],
      revealed: [],
      out: false,
    }))
    // Opening the room is not an advantage: the first seat is drawn, either by
    // a roll-off the table can watch or quietly from the same generator.
    const opening = diceStart ? rollForFirst(rng, playerCount) : null
    const current = opening ? opening.winner : rng.int(playerCount)
    return {
      playerCount,
      players,
      deck,
      seed: rng.position,
      current,
      opening,
      phase: 'play',
      paused: false,
      turnNumber: 1,
      pending: [],
      log: [
        {
          turn: 0,
          player: null,
          text: `Dealt ${STARTING_INFLUENCE} influence and ${STARTING_COINS} coins to ${playerCount} players.`,
        },
        { turn: 0, player: current, text: 'starts.' },
      ],
      result: null,
      lastEvent: null,
    }
  }

  // --- actions ---------------------------------------------------------------

  /**
   * Declare an action. Its cost is paid here rather than on resolution, and is
   * not refunded if the action is later blocked or the claim behind it is caught
   * — a bluffed assassination still costs the three coins, which is the whole
   * reason bluffing one is a risk worth weighing.
   */
  declare(playerId: number, action: CoupActionKind, target: number | null): Outcome {
    const s = this.state
    if (s.phase !== 'play') return fail('The game is over.')
    if (s.paused) return fail('The table is paused.')
    if (s.pending.length > 0) return fail('The table is still settling the last action.')
    if (playerId !== s.current) return fail('It is not your turn.')
    const player = s.players[playerId]
    if (!player || player.out) return fail('You are out of the game.')
    if (!legalActions(s, playerId).includes(action)) {
      if (player.coins >= FORCED_COUP_AT) return fail('At ten coins you must launch a coup.')
      return fail('You cannot take that action.')
    }

    const spec = COUP_ACTIONS[action]
    if (spec.needsTarget) {
      if (target === null) return fail('That action needs a target.')
      if (!legalTargets(s, playerId).includes(target)) return fail('That is not a valid target.')
    } else if (target !== null) {
      return fail('That action takes no target.')
    }

    player.coins -= spec.cost
    s.lastEvent = { kind: 'action', actor: playerId, action, target }
    this.log(playerId, `${describe(action)}${target !== null ? ` on ${this.name(target)}` : ''}.`)

    const challengeable = spec.claim !== null
    if (!challengeable && spec.blockedBy.length === 0) {
      // Income and a coup answer to nobody; they simply happen.
      this.apply(playerId, action, target)
    } else {
      s.pending.push({ step: 'action', actor: playerId, action, target, passed: [], challengeable })
    }
    this.advance()
    return ok
  }

  /** Call the pending claim a bluff. */
  challenge(playerId: number): Outcome {
    const s = this.state
    if (s.phase !== 'play') return fail('The game is over.')
    if (s.paused) return fail('The table is paused.')
    const p = s.pending[0]
    if (!p) return fail('There is nothing to challenge.')
    if (!s.players[playerId] || s.players[playerId].out) return fail('You are out of the game.')
    if (!canChallenge(s, playerId)) return fail('You cannot challenge that.')

    // The window comes off the stack first: settling the challenge puts a card
    // loss at the front, and whatever resumes has to queue up behind it.
    s.pending.shift()

    if (p.step === 'action') {
      const character = COUP_ACTIONS[p.action].claim!
      const held = this.settleChallenge(playerId, p.actor, character)
      if (held) {
        // The claim is proven, so the action stands — but a blockable one can
        // still be blocked by anyone who has not yet spoken.
        const passed = [...p.passed, playerId]
        const seats = blockSeats(s, p.action, p.actor, p.target).filter((id) => !passed.includes(id))
        if (seats.length > 0) {
          s.pending.push({ ...p, passed, challengeable: false })
        } else {
          s.pending.push({ step: 'resolve', actor: p.actor, action: p.action, target: p.target })
        }
      }
      // A caught bluff simply cancels the action; the cost stays spent.
    } else if (p.step === 'block') {
      const held = this.settleChallenge(playerId, p.blocker, p.character)
      // A proven block stops the action; a caught one lets it through.
      if (!held) s.pending.push({ step: 'resolve', actor: p.actor, action: p.action, target: p.target })
    }

    this.advance()
    return ok
  }

  /** Block the pending action by claiming a character that stops it. */
  block(playerId: number, character: CoupCharacter): Outcome {
    const s = this.state
    if (s.phase !== 'play') return fail('The game is over.')
    if (s.paused) return fail('The table is paused.')
    const p = s.pending[0]
    if (!p || p.step !== 'action') return fail('There is nothing to block.')
    if (!s.players[playerId] || s.players[playerId].out) return fail('You are out of the game.')
    if (!blockOptions(s, playerId).includes(character)) return fail('You cannot block that.')

    s.pending.shift()
    s.pending.push({
      step: 'block',
      actor: p.actor,
      action: p.action,
      target: p.target,
      blocker: playerId,
      character,
      passed: [],
    })
    s.lastEvent = { kind: 'block', blocker: playerId, character, action: p.action }
    this.log(playerId, `blocks with ${character}.`)
    this.advance()
    return ok
  }

  /** Wave the pending window through. Everyone must, for the action to stand. */
  pass(playerId: number): Outcome {
    const s = this.state
    if (s.phase !== 'play') return fail('The game is over.')
    if (s.paused) return fail('The table is paused.')
    const p = s.pending[0]
    if (!p || (p.step !== 'action' && p.step !== 'block')) return fail('There is nothing to answer.')
    if (!responders(s).includes(playerId)) return fail('You have already answered.')

    p.passed.push(playerId)
    this.advance()
    return ok
  }

  /** Give up one of your influence cards, face up. */
  loseInfluence(playerId: number, character: CoupCharacter): Outcome {
    const s = this.state
    if (s.phase !== 'play') return fail('The game is over.')
    if (s.paused) return fail('The table is paused.')
    const p = s.pending[0]
    if (!p || p.step !== 'lose' || p.player !== playerId) return fail('You owe no influence.')
    const player = s.players[playerId]
    if (!player || !player.hand.includes(character)) return fail('You do not hold that card.')

    this.reveal(player, character, p.reason)
    s.pending.shift()
    this.advance()
    return ok
  }

  /**
   * Finish an exchange by naming which cards to keep, indexed into your hand
   * followed by the two drawn. You keep exactly as many as you had influence, so
   * an exchange never changes how much you have left to lose.
   */
  exchange(playerId: number, keep: number[]): Outcome {
    const s = this.state
    if (s.phase !== 'play') return fail('The game is over.')
    if (s.paused) return fail('The table is paused.')
    const p = s.pending[0]
    if (!p || p.step !== 'exchange' || p.player !== playerId) return fail('You have no exchange to make.')
    const player = s.players[playerId]!

    const pool = [...player.hand, ...p.drawn]
    const wanted = player.hand.length
    if (keep.length !== wanted) return fail(`Keep exactly ${wanted} card${wanted === 1 ? '' : 's'}.`)
    if (new Set(keep).size !== keep.length) return fail('Pick each card once.')
    if (keep.some((i) => !Number.isInteger(i) || i < 0 || i >= pool.length)) {
      return fail('That is not one of the cards.')
    }

    player.hand = keep.map((i) => pool[i])
    s.deck.push(...pool.filter((_, i) => !keep.includes(i)))
    this.shuffleDeck()
    s.pending.shift()
    this.log(playerId, 'exchanges with the court deck.')
    this.advance()
    return ok
  }

  /**
   * The clock ran out on whoever the table was waiting for.
   *
   * Every branch takes the least damaging legal option, so a player who steps
   * away loses tempo rather than the game: an open window is waved through, a
   * forced loss gives up the first card held, an exchange keeps exactly the hand
   * it started with, and a turn with nothing pending takes income. The one
   * exception is a player sitting on ten coins, where a coup is the only move
   * the rules leave them.
   *
   * Unlike Samurai's, this takes no player: in Coup the table is often waiting
   * on a responder rather than on whoever's turn it is, so the timeout resolves
   * whatever the pending stack is actually asking.
   */
  timeOut(): Outcome {
    const s = this.state
    if (s.phase !== 'play') return fail('The game is over.')
    if (s.paused) return fail('The table is paused.')

    const p = s.pending[0]

    if (!p) {
      const actions = legalActions(s, s.current)
      if (actions.includes('income')) return this.declare(s.current, 'income', null)
      const target = legalTargets(s, s.current)[0]
      if (actions.includes('coup') && target !== undefined) {
        return this.declare(s.current, 'coup', target)
      }
      return fail('There is nothing to time out.')
    }

    if (p.step === 'lose') {
      const card = s.players[p.player]?.hand[0]
      if (!card) return fail('There is nothing to time out.')
      return this.loseInfluence(p.player, card)
    }

    if (p.step === 'exchange') {
      // Keep what they already had; the drawn pair goes straight back.
      const keep = s.players[p.player].hand.map((_, i) => i)
      return this.exchange(p.player, keep)
    }

    if (p.step === 'action' || p.step === 'block') {
      // Everyone still owing an answer waves it through. Guarded on the window
      // itself, because the last pass closes it and drains the stack onwards.
      while (s.pending[0] === p && responders(s).length > 0) {
        if (!this.pass(responders(s)[0]).ok) break
      }
      return ok
    }

    return fail('There is nothing to time out.')
  }

  /** Suspend the table; any seated player may. Mirrors the other two games. */
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

  /**
   * Drain everything the table can settle without being asked, then either stop
   * on a question for a human or pass the turn on.
   */
  private advance(): void {
    const s = this.state
    for (;;) {
      this.updateOut()
      if (this.checkEnd()) return

      const p = s.pending[0]
      if (!p) {
        this.nextTurn()
        return
      }

      if (p.step === 'resolve') {
        s.pending.shift()
        this.apply(p.actor, p.action, p.target)
        continue
      }

      // A player down to their last card has no choice to make, and one already
      // out has nothing left to give.
      if (p.step === 'lose') {
        const player = s.players[p.player]
        if (player && player.hand.length > 1) return
        if (player && player.hand.length === 1) this.reveal(player, player.hand[0], p.reason)
        s.pending.shift()
        continue
      }

      // Nobody left to answer: the window closes and the action stands.
      if ((p.step === 'action' || p.step === 'block') && responders(s).length === 0) {
        s.pending.shift()
        if (p.step === 'action') this.apply(p.actor, p.action, p.target)
        // An unchallenged block simply stops the action.
        continue
      }

      return
    }
  }

  /** Carry out an action whose window has closed in its favour. */
  private apply(actorId: number, action: CoupActionKind, target: number | null): void {
    const s = this.state
    const actor = s.players[actorId]
    if (!actor) return
    const victim = target !== null ? s.players[target] : null

    switch (action) {
      case 'income':
        actor.coins += 1
        break
      case 'foreignAid':
        actor.coins += 2
        break
      case 'tax':
        actor.coins += 3
        break
      case 'coup':
        if (victim && !victim.out) this.demandLoss(victim.id, 'coup')
        break
      case 'assassinate':
        if (victim && !victim.out) this.demandLoss(victim.id, 'assassinate')
        break
      case 'steal': {
        if (!victim || victim.out) break
        // Only as far as the target's coins reach — a theft from a player with
        // one coin takes the one, rather than failing or going into debt.
        const taken = Math.min(STEAL_AMOUNT, victim.coins)
        victim.coins -= taken
        actor.coins += taken
        this.log(actorId, `takes ${taken} coin${taken === 1 ? '' : 's'} from ${this.name(victim.id)}.`)
        break
      }
      case 'exchange': {
        const drawn = [s.deck.pop(), s.deck.pop()].filter((c): c is CoupCharacter => c !== undefined)
        s.pending.unshift({ step: 'exchange', player: actorId, drawn })
        break
      }
    }
  }

  /**
   * Settle a challenge against one claim. Returns whether the claimant held the
   * card: if they did the challenger pays for the accusation and the claimant
   * swaps the proven card for a fresh one, otherwise the bluffer pays.
   */
  private settleChallenge(challengerId: number, claimantId: number, character: CoupCharacter): boolean {
    const s = this.state
    const claimant = s.players[claimantId]!
    const held = claimant.hand.includes(character)

    s.lastEvent = { kind: 'challenge', challenger: challengerId, claimant: claimantId, character, won: !held }
    if (held) {
      this.log(
        challengerId,
        `challenges ${this.name(claimantId)} on ${character} and is wrong — the card was there.`,
      )
      // Proven cards go back into the deck and are replaced, so a player who
      // shows a card is not marked as holding it for the rest of the game.
      claimant.hand.splice(claimant.hand.indexOf(character), 1)
      s.deck.push(character)
      this.shuffleDeck()
      const replacement = s.deck.pop()
      if (replacement) claimant.hand.push(replacement)
      this.demandLoss(challengerId, 'challengeLost')
    } else {
      this.log(challengerId, `challenges ${this.name(claimantId)} on ${character} and is right.`)
      this.demandLoss(claimantId, 'bluffCaught')
    }
    return held
  }

  /** Put a card loss at the front of the queue, ahead of whatever provoked it. */
  private demandLoss(playerId: number, reason: CoupLossReason): void {
    const player = this.state.players[playerId]
    if (!player || player.out || player.hand.length === 0) return
    this.state.pending.unshift({ step: 'lose', player: playerId, reason })
  }

  private reveal(player: CoupPlayer, character: CoupCharacter, reason: CoupLossReason): void {
    player.hand.splice(player.hand.indexOf(character), 1)
    player.revealed.push(character)
    this.state.lastEvent = { kind: 'lose', player: player.id, character, reason }
    this.log(player.id, `gives up ${character}.`)
  }

  private shuffleDeck(): void {
    const rng = new Rng(this.state.seed)
    this.state.deck = rng.shuffle(this.state.deck)
    this.state.seed = rng.position
  }

  // --- turn order and endings ------------------------------------------------

  private nextTurn(): void {
    const s = this.state
    for (let step = 1; step <= s.playerCount; step++) {
      const id = (s.current + step) % s.playerCount
      if (!s.players[id].out) {
        s.current = id
        s.turnNumber++
        return
      }
    }
  }

  private updateOut(): void {
    for (const p of this.state.players) {
      if (!p.out && p.hand.length === 0) {
        p.out = true
        this.state.lastEvent = { kind: 'out', player: p.id }
        this.log(p.id, 'is out of the game.')
      }
    }
  }

  private checkEnd(): boolean {
    const s = this.state
    if (s.phase === 'over') return true
    const remaining = live(s.players)
    if (remaining.length > 1) return false
    s.phase = 'over'
    s.pending = []
    s.result = {
      winner: remaining[0]?.id ?? null,
      reason: remaining.length === 1 ? 'last player with influence' : 'the table lost its last influence at once',
    }
    return true
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
    this.state.log.push({ turn: this.state.turnNumber, player, text })
    // Keep the log from growing without bound over a long game.
    if (this.state.log.length > 200) this.state.log.splice(0, this.state.log.length - 200)
  }
}

/** The play-log wording for an action, in the engine's own English. */
function describe(action: CoupActionKind): string {
  switch (action) {
    case 'income':
      return 'takes income'
    case 'foreignAid':
      return 'asks for foreign aid'
    case 'coup':
      return 'launches a coup'
    case 'tax':
      return 'claims Duke and taxes'
    case 'assassinate':
      return 'claims Assassin and strikes'
    case 'steal':
      return 'claims Captain and steals'
    case 'exchange':
      return 'claims Ambassador and exchanges'
  }
}
