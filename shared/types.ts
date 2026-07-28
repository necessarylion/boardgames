import type { HexId } from './hex'

/** The three societal castes competed over in the game. */
export type Caste = 'buddha' | 'rice' | 'castle'

export const CASTES: readonly Caste[] = ['buddha', 'rice', 'castle']

export const CASTE_LABEL: Record<Caste, string> = {
  buddha: 'Religion',
  rice: 'Commerce',
  castle: 'Military',
}

export const CASTE_PIECE_LABEL: Record<Caste, string> = {
  buddha: 'Buddha',
  rice: 'Rice',
  castle: 'Castle',
}

export type SpaceKind = 'sea' | 'land' | 'settlement'

/** Settlements differ only in how many caste pieces they hold. */
export type SettlementKind = 'village' | 'city' | 'edo'

export const SETTLEMENT_CAPACITY: Record<SettlementKind, number> = {
  village: 1,
  city: 2,
  edo: 3,
}

/** Board sections, added as the player count grows. A ⊂ A+B ⊂ A+B+C. */
export type Section = 'A' | 'B' | 'C'

export interface Space {
  id: HexId
  q: number
  r: number
  col: number
  row: number
  kind: SpaceKind
  settlement?: SettlementKind
  section: Section
  /** Ids of the adjacent spaces that exist on the current board. */
  neighbours: HexId[]
  /** Adjacent land spaces — the ones that must be filled to surround a settlement. */
  landNeighbours: HexId[]
}

export type TileKind = 'caste' | 'samurai' | 'ronin' | 'ship' | 'switch' | 'move'

export interface TileDef {
  kind: TileKind
  /** Only set for caste-specific tiles; wild tiles influence every caste. */
  caste?: Caste
  /** Influence contributed to adjacent settlements. Action tiles contribute 0. */
  value: number
  /** Fast tiles do not use up the turn's single tile placement. */
  fast: boolean
}

export interface Tile extends TileDef {
  id: string
  owner: number
}

export interface Player {
  id: number
  name: string
  colour: PlayerColour
  /** Tile ids currently in hand (hidden from the other players). */
  hand: string[]
  /** Face-down draw stack, in draw order. */
  stack: string[]
  /** Caste pieces captured, kept behind the player screen. */
  captured: Caste[]
}

export type PlayerColour = 'gold' | 'red' | 'green' | 'purple'

export interface PlacedTile {
  tileId: string
  owner: number
}

export interface CaptureContest {
  spaceId: string
  caste: Caste
  /** Total influence per player, indexed by player id. */
  influence: number[]
  /** Winning player id, or null when the piece was set aside because of a tie. */
  winner: number | null
}

export interface LogEntry {
  turn: number
  player: number | null
  text: string
}

export interface ScoreBreakdown {
  playerId: number
  counts: Record<Caste, number>
  leaderTokens: Caste[]
  /** Pieces from the castes this player does *not* lead — the first tiebreaker. */
  otherCastePieces: number
  totalPieces: number
}

export interface GameResult {
  winners: number[]
  breakdown: ScoreBreakdown[]
  /** Castes whose leader token went unclaimed because of a tie. */
  unclaimed: Caste[]
  reason: string
}
