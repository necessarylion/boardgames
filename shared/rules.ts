import type { Board } from './board'
import { influenceFor, isSeaTile } from './tiles'
import {
  CASTES,
  type Caste,
  type CaptureContest,
  type GameResult,
  type PlacedTile,
  type ScoreBreakdown,
  type Tile,
  type TileDef,
} from './types'

/** The read-only slice of game state the rules operate on. */
export interface RulesView {
  board: Board
  /** Caste pieces still standing, by settlement space id. */
  pieces: Record<string, Caste[]>
  /** Tiles on the board, by space id. */
  placed: Record<string, PlacedTile>
  /** Every tile in the game, by tile id. */
  tiles: Record<string, Tile>
  playerCount: number
}

/** A single caste piece sitting on a settlement. */
export interface PieceRef {
  spaceId: string
  index: number
}

// ---------------------------------------------------------------------------
// Placement
// ---------------------------------------------------------------------------

/**
 * Space ids where `tile` may legally be placed. Ships go on empty sea spaces
 * and nothing else; every other placeable tile goes on an empty land space.
 * Settlement spaces never take tiles.
 */
export function legalPlacements(view: RulesView, tile: TileDef): string[] {
  const wantsSea = isSeaTile(tile)
  return view.board.order.filter((id) => {
    const space = view.board.spaces[id]
    if (id in view.placed) return false
    return wantsSea ? space.kind === 'sea' : space.kind === 'land'
  })
}

/** Tiles this player may pick up with a move tile: their own, non-fast, already on the board. */
export function movableTiles(view: RulesView, playerId: number, excludeSpaces: string[] = []): string[] {
  return Object.entries(view.placed)
    .filter(([spaceId, placed]) => {
      if (placed.owner !== playerId) return false
      if (excludeSpaces.includes(spaceId)) return false
      return !view.tiles[placed.tileId].fast
    })
    .map(([spaceId]) => spaceId)
}

/** Empty land spaces a moved tile may be dropped on. */
export function moveDestinations(view: RulesView, fromSpaceId: string): string[] {
  return view.board.order.filter((id) => {
    if (id === fromSpaceId) return false
    if (id in view.placed) return false
    return view.board.spaces[id].kind === 'land'
  })
}

// ---------------------------------------------------------------------------
// Switch tile
// ---------------------------------------------------------------------------

export function pieceAt(view: RulesView, ref: PieceRef): Caste | undefined {
  return view.pieces[ref.spaceId]?.[ref.index]
}

/**
 * A switch tile swaps two caste pieces. The rulebook forbids a swap that would
 * put two pieces of the same type on one settlement; swapping identical castes
 * or two pieces of the same settlement changes nothing, so both are rejected.
 */
export function canSwitch(view: RulesView, a: PieceRef, b: PieceRef): boolean {
  if (a.spaceId === b.spaceId) return false
  const casteA = pieceAt(view, a)
  const casteB = pieceAt(view, b)
  if (!casteA || !casteB || casteA === casteB) return false
  const restA = (view.pieces[a.spaceId] ?? []).filter((_, i) => i !== a.index)
  const restB = (view.pieces[b.spaceId] ?? []).filter((_, i) => i !== b.index)
  return !restA.includes(casteB) && !restB.includes(casteA)
}

/** Whether any legal swap exists at all, used to grey out an unusable switch tile. */
export function hasAnySwitch(view: RulesView): boolean {
  const refs: PieceRef[] = []
  for (const [spaceId, list] of Object.entries(view.pieces)) {
    list.forEach((_, index) => refs.push({ spaceId, index }))
  }
  for (let i = 0; i < refs.length; i++) {
    for (let j = i + 1; j < refs.length; j++) {
      if (canSwitch(view, refs[i], refs[j])) return true
    }
  }
  return false
}

// ---------------------------------------------------------------------------
// Captures
// ---------------------------------------------------------------------------

/** A settlement is surrounded once every adjacent *land* space holds a tile. */
export function isSurrounded(view: RulesView, spaceId: string): boolean {
  const space = view.board.spaces[spaceId]
  if (space?.kind !== 'settlement') return false
  return space.landNeighbours.every((id) => id in view.placed)
}

/** Influence each player brings to bear on a piece of `caste` at `spaceId`. */
export function influenceAt(view: RulesView, spaceId: string, caste: Caste): number[] {
  const totals = new Array<number>(view.playerCount).fill(0)
  for (const neighbourId of view.board.spaces[spaceId].neighbours) {
    const placed = view.placed[neighbourId]
    if (!placed) continue
    const tile = view.tiles[placed.tileId]
    totals[placed.owner] += influenceFor(tile, caste)
  }
  return totals
}

/**
 * Resolve one caste piece. The highest total influence takes it; a tie for the
 * highest means nobody does and the piece is set aside. A piece nobody
 * influences at all is also set aside.
 */
export function contest(view: RulesView, spaceId: string, caste: Caste): CaptureContest {
  const influence = influenceAt(view, spaceId, caste)
  const best = Math.max(...influence)
  const leaders = influence.flatMap((value, id) => (value === best ? [id] : []))
  return {
    spaceId,
    caste,
    influence,
    winner: best > 0 && leaders.length === 1 ? leaders[0] : null,
  }
}

/**
 * Every capture triggered by the current board position.
 *
 * The rulebook lets the active player choose the order in which surrounded
 * settlements and their pieces resolve. Because tiles are never removed by a
 * capture, the influence totals — and so the outcome — are the same whatever
 * order is used, so this resolves in board order for determinism.
 */
export function pendingCaptures(view: RulesView): CaptureContest[] {
  const results: CaptureContest[] = []
  for (const spaceId of view.board.order) {
    const pieces = view.pieces[spaceId]
    if (!pieces?.length) continue
    if (!isSurrounded(view, spaceId)) continue
    for (const caste of pieces) results.push(contest(view, spaceId, caste))
  }
  return results
}

// ---------------------------------------------------------------------------
// End of game
// ---------------------------------------------------------------------------

export interface EndCheck {
  over: boolean
  reason: string
}

/**
 * Checked at the end of every turn: the game ends when a caste has been cleared
 * off the board, or when four pieces have been set aside.
 */
export function checkEnd(view: RulesView, setAside: Caste[]): EndCheck {
  const counts: Record<Caste, number> = { buddha: 0, rice: 0, castle: 0 }
  for (const list of Object.values(view.pieces)) {
    for (const caste of list) counts[caste]++
  }
  const exhausted = CASTES.filter((caste) => counts[caste] === 0)
  if (exhausted.length) {
    return {
      over: true,
      reason: `No ${exhausted.join(' or ')} pieces remain on the board.`,
    }
  }
  if (setAside.length >= 4) {
    return { over: true, reason: 'Four caste pieces have been set aside.' }
  }
  return { over: false, reason: '' }
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

/** Everything scoring needs to know about a player. */
export interface Scoreable {
  id: number
  captured: Caste[]
}

function countCaptured(player: Scoreable): Record<Caste, number> {
  const counts: Record<Caste, number> = { buddha: 0, rice: 0, castle: 0 }
  for (const caste of player.captured) counts[caste]++
  return counts
}

/**
 * Leader tokens go to whoever captured strictly the most pieces of a caste; a
 * tie leaves that token unclaimed. Most leader tokens wins, with the rulebook's
 * two tiebreakers behind it.
 */
export function scoreGame(players: Scoreable[]): GameResult {
  const breakdown: ScoreBreakdown[] = players.map((player) => ({
    playerId: player.id,
    counts: countCaptured(player),
    leaderTokens: [],
    otherCastePieces: 0,
    totalPieces: player.captured.length,
  }))

  const unclaimed: Caste[] = []
  for (const caste of CASTES) {
    const best = Math.max(...breakdown.map((b) => b.counts[caste]))
    const leaders = breakdown.filter((b) => b.counts[caste] === best)
    if (best > 0 && leaders.length === 1) leaders[0].leaderTokens.push(caste)
    else unclaimed.push(caste)
  }

  for (const entry of breakdown) {
    const led = new Set(entry.leaderTokens)
    entry.otherCastePieces = CASTES.filter((c) => !led.has(c)).reduce(
      (sum, c) => sum + entry.counts[c],
      0,
    )
  }

  const mostTokens = Math.max(...breakdown.map((b) => b.leaderTokens.length))
  let contenders = breakdown.filter((b) => b.leaderTokens.length === mostTokens)

  if (contenders.length === 1) {
    return {
      winners: [contenders[0].playerId],
      breakdown,
      unclaimed,
      reason: `Claimed ${mostTokens} leader token${mostTokens === 1 ? '' : 's'}.`,
    }
  }

  // No leader tokens at all: most captured pieces overall wins.
  if (mostTokens === 0) {
    const best = Math.max(...contenders.map((b) => b.totalPieces))
    const winners = contenders.filter((b) => b.totalPieces === best)
    return {
      winners: winners.map((b) => b.playerId),
      breakdown,
      unclaimed,
      reason: 'No leader tokens were claimed — most caste pieces overall wins.',
    }
  }

  // Tied on leader tokens: compare pieces from the castes they do not lead.
  const bestOther = Math.max(...contenders.map((b) => b.otherCastePieces))
  contenders = contenders.filter((b) => b.otherCastePieces === bestOther)
  if (contenders.length === 1) {
    return {
      winners: [contenders[0].playerId],
      breakdown,
      unclaimed,
      reason: `Tied on leader tokens — most pieces from the other two castes (${bestOther}).`,
    }
  }

  // Still tied: most pieces across all castes, and failing that the win is shared.
  const bestTotal = Math.max(...contenders.map((b) => b.totalPieces))
  const winners = contenders.filter((b) => b.totalPieces === bestTotal)
  return {
    winners: winners.map((b) => b.playerId),
    breakdown,
    unclaimed,
    reason:
      winners.length === 1
        ? `Tied on leader tokens and other castes — most caste pieces overall (${bestTotal}).`
        : 'Tied on every tiebreaker — the victory is shared.',
  }
}
