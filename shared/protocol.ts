import type {
  CarnivalAffordances,
  CarnivalEvent,
  CarnivalResult,
  CarnivalRoundResult,
  CarnivalStep,
} from './carnivals'
import type {
  CoupActionKind,
  CoupCharacter,
  CoupEvent,
  CoupLossReason,
  CoupResult,
} from './coup'
import type { Opening } from './opening'
import type { GameOptions, Phase } from './engine'
import type { Card, Fruit, HalliEvent, HalliResult } from './halligalli'
import type { PieceRef } from './rules'
import type { Caste, GameResult, LogEntry, PlacedTile, PlayerColour } from './types'

export const PROTOCOL_VERSION = 4

/**
 * How often the server pings each client. A client that hears nothing for a few
 * of these assumes the connection is dead and reconnects, and the server drops
 * sockets that stop answering.
 */
export const HEARTBEAT_MS = 20_000

/**
 * Close code for a socket dropped because the same seat said hello somewhere
 * else. The client must not reconnect on it: the two tabs would take the seat
 * from each other in turn and neither would stay connected.
 */
export const CLOSE_REPLACED = 4000

/** What every client knows about every seat. */
export interface PublicPlayer {
  id: number
  name: string
  colour: PlayerColour
  connected: boolean
  /** Tiles held, but not which ones. */
  handCount: number
  stackCount: number
  capturedCount: number
  /** Only populated when the room runs with open information, or once over. */
  captured: Caste[] | null
  /** Draft phase: whether this player has locked in a starting hand. */
  ready: boolean
}

/**
 * The redacted game state sent to one client. Tile definitions are recoverable
 * from their ids, so only ids travel; a player's stack and the other players'
 * hands never leave the server.
 */
export interface ClientState {
  /** Discriminates the two games sharing this protocol; Samurai's is 'samurai'. */
  kind: 'samurai'
  code: string
  phase: 'lobby' | Phase
  options: GameOptions
  hostId: number
  /** This client's seat, or null when watching without a seat. */
  you: number | null
  players: PublicPlayer[]
  /** Present once the game has started. */
  playerCount: number
  pieces: Record<string, Caste[]>
  placed: Record<string, PlacedTile>
  current: number
  turnNumber: number
  placedThisTurn: string[]
  /** Where the previous turn's tiles landed, so the whole table can see them. */
  lastPlaced: string[]
  /** Every space another player has filled since your own turn last ended. */
  sinceYourTurn: string[]
  /** How the opening seat was decided, or null when it was drawn quietly. */
  opening: Opening | null
  /** Whether the viewer has anything to take back this turn. */
  canUndo: boolean
  playedNonFast: boolean
  setAside: Caste[]
  log: LogEntry[]
  result: GameResult | null
  lastCaptures: { caste: Caste; spaceId: string; winner: number | null }[]
  /** Your own hidden information. */
  hand: string[]
  captured: Caste[]
  /** During the draft, the 20 tiles you choose your opening hand from. */
  draftPool: string[]
  canEndTurn: boolean
  /** Whether the viewer may redraw their hand this turn (their turn, round 2+). */
  canRedraw: boolean
  /** Custom side names by team index; a blank or missing one falls back to a letter. */
  teamNames: string[]
  /** The table is suspended — any seated player may pause or resume it. */
  paused: boolean
  /**
   * Milliseconds left on the current player's shot clock, or null when the
   * table is untimed. Sent as a remainder rather than a deadline so a client
   * whose clock is off by minutes still counts down the right number. Frozen at
   * its remaining value while the game is paused.
   */
  turnMsLeft: number | null
}

/** What every client knows about a Halli Galli seat. Stacks travel as a count. */
export interface HalliPublicPlayer {
  id: number
  name: string
  colour: PlayerColour
  connected: boolean
  /** Cards in the face-down draw pile — a count only; the cards stay hidden. */
  stackCount: number
  /** The face-up pile, public in full; its last card is the one that counts. */
  faceUp: Card[]
  /** Out of the game — no cards left anywhere. */
  out: boolean
}

/**
 * The Halli Galli state sent to one client. Almost nothing is secret here: only
 * the order of a face-down stack is hidden, and it never leaves the server, so a
 * seat's stack travels as a bare count and everything else is sent in full.
 */
export interface HalliClientState {
  kind: 'halligalli'
  code: string
  phase: 'lobby' | 'play' | 'over'
  options: GameOptions
  hostId: number
  you: number | null
  players: HalliPublicPlayer[]
  playerCount: number
  /** Whose turn it is to flip; ringing is open to everyone. */
  current: number
  /** How the opening seat was decided, or null when it was drawn quietly. */
  opening: Opening | null
  turnNumber: number
  /** The visible total of each fruit, computed server-side to avoid drift. */
  totals: Record<Fruit, number>
  /** The fruit at exactly five right now, if any — a bell worth ringing. */
  ring: Fruit | null
  lastEvent: HalliEvent | null
  log: LogEntry[]
  result: HalliResult | null
  paused: boolean
}

/** What every client knows about a Coup seat. Held influence travels as a count. */
export interface CoupPublicPlayer {
  id: number
  name: string
  colour: PlayerColour
  connected: boolean
  coins: number
  /** Face-down influence still held — a count only; the cards stay hidden. */
  influence: number
  /** Influence already given up, face up and public for the rest of the game. */
  revealed: CoupCharacter[]
  /** Out of the game — no influence left. */
  out: boolean
}

/**
 * The head of the server's pending stack, redacted for one viewer. Everything
 * here is public knowledge except an exchange's drawn cards, which travel as a
 * count and reach only the player holding them, through `drawn` below.
 */
export type CoupPendingView =
  | {
      step: 'action'
      actor: number
      action: CoupActionKind
      target: number | null
      passed: number[]
      challengeable: boolean
      /** Seats entitled to block, so the table can see who is being waited on. */
      blockers: number[]
    }
  | {
      step: 'block'
      actor: number
      action: CoupActionKind
      target: number | null
      blocker: number
      character: CoupCharacter
      passed: number[]
    }
  | { step: 'lose'; player: number; reason: CoupLossReason }
  | { step: 'exchange'; player: number; count: number }

/**
 * What this viewer may do right now. Decided on the server from the unredacted
 * state and sent ready-made, the way Halli Galli sends its fruit totals: the
 * client cannot work out a challenge window from a redacted hand without
 * guessing, and a button that disagrees with the engine is worse than no button.
 */
export interface CoupAffordances {
  /** Actions the viewer may declare; empty unless it is their turn. */
  actions: CoupActionKind[]
  /** Seats a targeted action may be aimed at. */
  targets: number[]
  challenge: boolean
  /** Characters the viewer may block the pending action with. */
  blocks: CoupCharacter[]
  /** The viewer still owes the pending window an answer. */
  pass: boolean
  /** The viewer owes an influence and must say which. */
  lose: boolean
  /** How many cards to keep from `hand` + `drawn`, or null when not exchanging. */
  exchange: number | null
}

/**
 * The Coup state sent to one client. A player's own influence is the whole of
 * the secret here: hands never leave the server except to their holder, the
 * court deck travels as a count and nothing else, and the two cards drawn for an
 * exchange reach only the player who drew them.
 */
export interface CoupClientState {
  kind: 'coup'
  code: string
  phase: 'lobby' | 'play' | 'over'
  options: GameOptions
  hostId: number
  you: number | null
  players: CoupPublicPlayer[]
  playerCount: number
  current: number
  turnNumber: number
  /**
   * The roll-off that decided who opens, or null when the seat was drawn
   * quietly. Public in full — the point of rolling is that the table sees it.
   */
  opening: Opening | null
  /** What the table is waiting on, or null when it is simply someone's turn. */
  pending: CoupPendingView | null
  /** Your own face-down influence. Empty for a spectator. */
  hand: CoupCharacter[]
  /** The cards you drew for an exchange; only ever your own. */
  drawn: CoupCharacter[]
  /** Cards left in the court deck — a count only. */
  deckCount: number
  can: CoupAffordances
  lastEvent: CoupEvent | null
  log: LogEntry[]
  result: CoupResult | null
  paused: boolean
  /**
   * Milliseconds left on the clock for the decision in front of the table, or
   * null when it is untimed. Sent as a remainder rather than a deadline for the
   * same reason Samurai's is: a client whose own clock is minutes out still
   * counts down the right number. Frozen while the table is paused.
   */
  turnMsLeft: number | null
}

/**
 * What every client knows about a Carnivals seat. The two cards are the whole
 * secret: `red` and `blue` are filled per viewer by the server, following
 * Carnivals' upside-down visibility — you see your own red and never your own
 * blue, and everyone else's blue and never their red.
 */
export interface CarnivalPublicPlayer {
  id: number
  name: string
  colour: PlayerColour
  connected: boolean
  /** The seat's bankroll. */
  carnivals: number
  /** Carnivals it has put into this hand's pot. */
  committed: number
  folded: boolean
  out: boolean
  /** Has picked its two cards this hand. */
  selected: boolean
  /** Has turned its hand face up at the showdown. */
  revealed: boolean
  /** Its private card, sent only to its owner (and to everyone once shown). */
  red: number | null
  /** Its public card, hidden from its owner until it turns the hand over. */
  blue: number | null
}

/**
 * The Carnivals state sent to one client. A player's two cards are the only
 * secret; every bet figure, the pot and the current bet are public, and the
 * showdown reveal — once it exists — is sent to the whole table in full.
 */
export interface CarnivalClientState {
  kind: 'carnivals'
  code: string
  phase: 'lobby' | 'play' | 'over'
  options: GameOptions
  hostId: number
  you: number | null
  players: CarnivalPublicPlayer[]
  playerCount: number
  /** Whose turn it is to act in the betting round. */
  current: number
  turnNumber: number
  /** The roll-off that decided the first dealer, or null when drawn quietly. */
  opening: Opening | null
  /** Whether the table is picking cards, betting, or showing hands down. */
  step: CarnivalStep
  /** How many face-down cards of each colour a seat picks from, for the layout. */
  handCards: number
  pot: number
  currentBet: number
  minRaise: number
  can: CarnivalAffordances
  /** The finished hand, laid face up — present only during the showdown step. */
  roundResult: CarnivalRoundResult | null
  lastEvent: CarnivalEvent | null
  log: LogEntry[]
  result: CarnivalResult | null
  paused: boolean
  /**
   * Milliseconds left on the clock for the decision in front of the table, or
   * null when it is untimed. Sent as a remainder rather than a deadline for the
   * same reason the others are; frozen while the table is paused.
   */
  turnMsLeft: number | null
}

/** Any game's redacted state; `kind` says which, for the client to route on. */
export type AnyClientState =
  | ClientState
  | HalliClientState
  | CoupClientState
  | CarnivalClientState

export type ClientMessage =
  /** `code` is the table this client believes it is at, so a server that has
   *  never heard of it can say so instead of leaving a dead board on screen. */
  | { t: 'hello'; token: string | null; code?: string | null }
  | { t: 'pong' }
  | { t: 'create'; name: string; options: GameOptions }
  | { t: 'join'; code: string; name: string }
  | { t: 'rename'; name: string }
  /** Team leaders only: rename their side. A blank name resets it to a letter. */
  | { t: 'renameTeam'; team: number; name: string }
  | { t: 'options'; options: GameOptions }
  | { t: 'start' }
  | { t: 'leave' }
  | { t: 'draft'; picks: string[] }
  | { t: 'play'; tileId: string; spaceId: string }
  | { t: 'switch'; tileId: string; a: PieceRef; b: PieceRef }
  | { t: 'move'; tileId: string; from: string; to: string }
  | { t: 'undo' }
  | { t: 'endTurn' }
  /** Trade the whole hand for a fresh draw, at the cost of the turn (round 2+). */
  | { t: 'redraw' }
  /** Halli Galli: turn your top card face up (only on your turn). */
  | { t: 'flip' }
  /** Halli Galli: ring the bell — open to any player at any moment. */
  | { t: 'slap' }
  /** Coup: declare this turn's action, with a seat to aim it at if it needs one. */
  | { t: 'coupAct'; action: CoupActionKind; target?: number | null }
  /** Coup: call the pending claim a bluff. */
  | { t: 'coupChallenge' }
  /** Coup: stop the pending action by claiming a character that blocks it. */
  | { t: 'coupBlock'; character: CoupCharacter }
  /** Coup: wave the pending window through. */
  | { t: 'coupPass' }
  /** Coup: give up one of your influence cards, face up. */
  | { t: 'coupLose'; character: CoupCharacter }
  /** Coup: finish an exchange, indexing into your hand followed by the drawn cards. */
  | { t: 'coupExchange'; keep: number[] }
  /**
   * Carnivals: a move. `to` carries the total for a raise; `red` and `blue` are
   * the face-down positions picked for a select.
   */
  | {
      t: 'carnivalAct'
      move: 'select' | 'check' | 'call' | 'raise' | 'allIn' | 'fold' | 'reveal' | 'next'
      to?: number
      red?: number
      blue?: number
    }
  /** Suspend or resume the table. Open to any seated player. */
  | { t: 'pause' }
  | { t: 'resume' }
  | { t: 'rematch' }
  /** Host only: abandon the game in progress and return everyone to the lobby. */
  | { t: 'abandon' }

export type ServerMessage =
  | { t: 'hello'; token: string; version: number }
  | { t: 'state'; state: AnyClientState }
  | { t: 'error'; message: string }
  | { t: 'left' }
  | { t: 'ping' }

export function encode(message: ServerMessage | ClientMessage): string {
  return JSON.stringify(message)
}
