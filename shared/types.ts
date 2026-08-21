import type { HexId } from './hex'

/**
 * Which game a room is playing. `samurai` is the original Knizia implementation;
 * `halligalli`, `coup`, `carnivals` and `cop` are further, unrelated card games,
 * and `snake` an arcade game, all sharing only this app's room, seat and
 * reconnection machinery, never its rules layer.
 */
export type GameKind = 'samurai' | 'halligalli' | 'coup' | 'carnivals' | 'cop' | 'snake'

export const GAME_KINDS: readonly GameKind[] = [
  'samurai',
  'halligalli',
  'coup',
  'carnivals',
  'cop',
  'snake',
]

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

/** Board sections, added as the player count grows. A ⊂ A+B ⊂ … ⊂ A+B+C+D+E. */
export type Section = 'A' | 'B' | 'C' | 'D' | 'E'

/**
 * Table size. `MAX_PLAYERS` is the hard ceiling shared across every game — it is
 * how many distinct player colours the palette carries and the most seats a room
 * will ever open. Each game then draws its own maximum from `GAME_MAX_PLAYERS`,
 * because the games do not all seat the same number: the card games run to a full
 * eight, but Samurai stops at six, since its board only carries sections A–E and
 * a seventh or eighth seat would need map sections that do not exist.
 */
export const MIN_PLAYERS = 2
export const MAX_PLAYERS = 8

/** The largest table each game can seat. Never above `MAX_PLAYERS`. */
export const GAME_MAX_PLAYERS: Record<GameKind, number> = {
  samurai: 6,
  halligalli: 8,
  coup: 8,
  carnivals: 8,
  cop: 8,
  snake: 8,
}

/** How many seats a room running `kind` may open. */
export function maxPlayersFor(kind: GameKind): number {
  return GAME_MAX_PLAYERS[kind]
}

/**
 * Which island chain a table plays on. Each holds the supply exactly at every
 * player count, and each keeps its open land inside the tile supply so a game
 * can always reach an ending.
 */
export const BOARD_SHAPES = ['mountain', 'valley', 'bay', 'circle', 'slash', 'serpent'] as const
export type BoardShape = (typeof BOARD_SHAPES)[number]

export const BOARD_SHAPE_LABEL: Record<BoardShape, string> = {
  mountain: 'Mountains',
  valley: 'Valley',
  bay: 'Bay',
  circle: 'Circle',
  slash: 'Slash',
  serpent: 'Serpent',
}

export const BOARD_SHAPE_HINT: Record<BoardShape, string> = {
  mountain: 'Two peaks either side of a valley.',
  valley: 'A broad chevron dropping to a point in the middle.',
  bay: 'Shores curving away either side of a deep centre.',
  circle: 'A round island, growing ring by ring from Edo.',
  slash: 'One long island on the diagonal, Edo halfway along it.',
  serpent: 'An island winding an S from north to south.',
}

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

export type PlayerColour =
  | 'gold'
  | 'red'
  | 'green'
  | 'purple'
  | 'teal'
  | 'rose'
  | 'orange'
  | 'indigo'

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

/** A team's pooled totals, the unit leader tokens are decided on in team play. */
export interface TeamBreakdown {
  team: number
  /** Seat ids on this team, in turn order. */
  members: number[]
  counts: Record<Caste, number>
  leaderTokens: Caste[]
  otherCastePieces: number
  totalPieces: number
}

export interface GameResult {
  winners: number[]
  breakdown: ScoreBreakdown[]
  /** Pooled per-team totals in a team game; null in a free-for-all. */
  teams: TeamBreakdown[] | null
  /** Castes whose leader token went unclaimed because of a tie. */
  unclaimed: Caste[]
  reason: string
}
