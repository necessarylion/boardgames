import type { GameOptions, Phase } from './engine'
import type { PieceRef } from './rules'
import type { Caste, GameResult, LogEntry, PlacedTile, PlayerColour } from './types'

export const PROTOCOL_VERSION = 2

/**
 * How often the server pings each client. A client that hears nothing for a few
 * of these assumes the connection is dead and reconnects, and the server drops
 * sockets that stop answering.
 */
export const HEARTBEAT_MS = 20_000

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
  /**
   * Milliseconds left on the current player's shot clock, or null when the
   * table is untimed. Sent as a remainder rather than a deadline so a client
   * whose clock is off by minutes still counts down the right number.
   */
  turnMsLeft: number | null
}

export type ClientMessage =
  /** `code` is the table this client believes it is at, so a server that has
   *  never heard of it can say so instead of leaving a dead board on screen. */
  | { t: 'hello'; token: string | null; code?: string | null }
  | { t: 'pong' }
  | { t: 'create'; name: string; options: GameOptions }
  | { t: 'join'; code: string; name: string }
  | { t: 'rename'; name: string }
  | { t: 'options'; options: GameOptions }
  | { t: 'start' }
  | { t: 'leave' }
  | { t: 'draft'; picks: string[] }
  | { t: 'play'; tileId: string; spaceId: string }
  | { t: 'switch'; tileId: string; a: PieceRef; b: PieceRef }
  | { t: 'move'; tileId: string; from: string; to: string }
  | { t: 'undo' }
  | { t: 'endTurn' }
  | { t: 'rematch' }
  /** Host only: abandon the game in progress and return everyone to the lobby. */
  | { t: 'abandon' }

export type ServerMessage =
  | { t: 'hello'; token: string; version: number }
  | { t: 'state'; state: ClientState }
  | { t: 'error'; message: string }
  | { t: 'left' }
  | { t: 'ping' }

export function encode(message: ServerMessage | ClientMessage): string {
  return JSON.stringify(message)
}
