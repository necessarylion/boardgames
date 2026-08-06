import type { Board } from './board'
import { influenceFor, isSeaTile } from './tiles'
import {
  CASTES,
  type Caste,
  type CaptureContest,
  type GameResult,
  type PlacedTile,
  type ScoreBreakdown,
  type TeamBreakdown,
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
  /** Number of teams (two for 2v2 / 3v3), or 0/undefined for a free-for-all. */
  teams?: number
}

/**
 * Which scoring unit a seat belongs to. With `teams` set to a count (two, for a
 * 2v2 or 3v3), seats alternate between them by parity, so the turn order already
 * runs A, B, A, B and teammates never sit back to back. With no teams every
 * player is their own unit — which keeps the free-for-all a special case of the
 * team logic rather than a separate path through it.
 */
export function teamOf(playerId: number, teams: number): number {
  return teams >= 2 ? playerId % teams : playerId
}

/**
 * The team splits a table of `playerCount` can be played in: every count of
 * sides that divides the players into equal teams of at least two. Four gives
 * `[2]` (2 v 2); six gives `[2, 3]` (3 v 3 or 2 v 2 v 2); a prime like five
 * gives none. Turn order deals round the sides, so any of these alternates.
 */
export function teamArrangements(playerCount: number): number[] {
  const out: number[] = []
  for (let teams = 2; teams <= Math.floor(playerCount / 2); teams++) {
    if (playerCount % teams === 0) out.push(teams)
  }
  return out
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
 *
 * In team play the sides' influence is pooled first, so a piece goes to the team
 * with the highest combined total. The piece is then physically taken by whoever
 * on that team pushed hardest on it (ties within a team fall to the lower seat);
 * scoring pools captures back by team, so which teammate holds it never changes
 * a score. A free-for-all makes every player a team of one, and the individual
 * rules fall straight out of this.
 */
export function contest(view: RulesView, spaceId: string, caste: Caste): CaptureContest {
  const influence = influenceAt(view, spaceId, caste)
  const teams = view.teams ?? 0

  const byTeam = new Map<number, number>()
  influence.forEach((value, id) => {
    const team = teamOf(id, teams)
    byTeam.set(team, (byTeam.get(team) ?? 0) + value)
  })
  const best = Math.max(...byTeam.values())
  const topTeams = [...byTeam].filter(([, value]) => value === best).map(([team]) => team)

  let winner: number | null = null
  if (best > 0 && topTeams.length === 1) {
    const team = topTeams[0]
    influence.forEach((value, id) => {
      if (teamOf(id, teams) !== team) return
      if (winner === null || value > influence[winner]) winner = id
    })
  }
  return { spaceId, caste, influence, winner }
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
 * How many set-aside pieces end the game.
 *
 * The published game stops at four, a flat number for a table of at most four
 * players. Beyond that the same threshold would cut the game short: more players
 * means more ties, and the board is a third larger again, so the limit follows
 * the player count once it passes four.
 */
export function setAsideLimit(playerCount: number): number {
  return Math.max(4, playerCount)
}

/**
 * Checked at the end of every turn: the game ends when a caste has been cleared
 * off the board, or when enough pieces have been set aside.
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
  const limit = setAsideLimit(view.playerCount)
  if (setAside.length >= limit) {
    return { over: true, reason: `${limit} caste pieces have been set aside.` }
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
 * Leader tokens go to whichever side captured strictly the most pieces of a
 * caste; a tie leaves that token unclaimed. Most leader tokens wins, with the
 * rulebook's two tiebreakers behind it.
 *
 * The winner is settled between scoring units — a team apiece in a 2v2 or 3v3,
 * or one per player in a free-for-all, where the two collapse to the same thing.
 * The per-player `breakdown` is always returned for display; `teams` carries the
 * pooled totals when the table is playing in sides.
 */
export function scoreGame(players: Scoreable[], teams = 0): GameResult {
  const breakdown: ScoreBreakdown[] = players.map((player) => ({
    playerId: player.id,
    counts: countCaptured(player),
    leaderTokens: [],
    otherCastePieces: 0,
    totalPieces: player.captured.length,
  }))
  const byId = new Map(breakdown.map((b) => [b.playerId, b]))

  interface Unit {
    team: number
    members: number[]
    counts: Record<Caste, number>
    leaderTokens: Caste[]
    otherCastePieces: number
    totalPieces: number
  }
  const unitIds = [...new Set(players.map((p) => teamOf(p.id, teams)))].sort((a, b) => a - b)
  const units: Unit[] = unitIds.map((team) => {
    const members = players.filter((p) => teamOf(p.id, teams) === team)
    const counts: Record<Caste, number> = { buddha: 0, rice: 0, castle: 0 }
    for (const m of members) for (const c of m.captured) counts[c]++
    return {
      team,
      members: members.map((m) => m.id),
      counts,
      leaderTokens: [],
      otherCastePieces: 0,
      totalPieces: members.reduce((n, m) => n + m.captured.length, 0),
    }
  })

  const unclaimed: Caste[] = []
  for (const caste of CASTES) {
    const best = Math.max(...units.map((u) => u.counts[caste]))
    const leaders = units.filter((u) => u.counts[caste] === best)
    if (best > 0 && leaders.length === 1) leaders[0].leaderTokens.push(caste)
    else unclaimed.push(caste)
  }
  for (const unit of units) {
    const led = new Set(unit.leaderTokens)
    unit.otherCastePieces = CASTES.filter((c) => !led.has(c)).reduce(
      (sum, c) => sum + unit.counts[c],
      0,
    )
    // A free-for-all's units are single players, so its tokens belong on the row
    // the score table already renders. A team's tokens are the team's, not any
    // one member's, so they stay off the per-player rows.
    if (teams < 2) {
      const row = byId.get(unit.members[0])!
      row.leaderTokens = unit.leaderTokens
      row.otherCastePieces = unit.otherCastePieces
    }
  }

  const teamBreakdown: TeamBreakdown[] | null =
    teams >= 2
      ? units.map((u) => ({
          team: u.team,
          members: u.members,
          counts: u.counts,
          leaderTokens: u.leaderTokens,
          otherCastePieces: u.otherCastePieces,
          totalPieces: u.totalPieces,
        }))
      : null

  const finish = (winning: Unit[], reason: string): GameResult => ({
    winners: winning.flatMap((u) => u.members),
    breakdown,
    teams: teamBreakdown,
    unclaimed,
    reason,
  })

  const mostTokens = Math.max(...units.map((u) => u.leaderTokens.length))
  let contenders = units.filter((u) => u.leaderTokens.length === mostTokens)

  if (contenders.length === 1) {
    return finish(contenders, `Claimed ${mostTokens} leader token${mostTokens === 1 ? '' : 's'}.`)
  }

  // No leader tokens at all: most captured pieces overall wins.
  if (mostTokens === 0) {
    const best = Math.max(...contenders.map((u) => u.totalPieces))
    return finish(
      contenders.filter((u) => u.totalPieces === best),
      'No leader tokens were claimed — most caste pieces overall wins.',
    )
  }

  // Tied on leader tokens: compare pieces from the castes they do not lead.
  const bestOther = Math.max(...contenders.map((u) => u.otherCastePieces))
  contenders = contenders.filter((u) => u.otherCastePieces === bestOther)
  if (contenders.length === 1) {
    return finish(
      contenders,
      `Tied on leader tokens — most pieces from the other two castes (${bestOther}).`,
    )
  }

  // Still tied: most pieces across all castes, and failing that the win is shared.
  const bestTotal = Math.max(...contenders.map((u) => u.totalPieces))
  contenders = contenders.filter((u) => u.totalPieces === bestTotal)
  return finish(
    contenders,
    contenders.length === 1
      ? `Tied on leader tokens and other castes — most caste pieces overall (${bestTotal}).`
      : 'Tied on every tiebreaker — the victory is shared.',
  )
}
