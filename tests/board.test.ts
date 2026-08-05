import { describe, expect, it } from 'vitest'

import { buildBoard, settlementsOf } from '../shared/board'
import { Rng } from '../shared/rng'
import { TILES_PER_PLAYER } from '../shared/tiles'
import { distributePieces, supplyPerCaste } from '../shared/setup'
import { BOARD_SHAPES, CASTES, SETTLEMENT_CAPACITY, type BoardShape, type Caste } from '../shared/types'

const PLAYER_COUNTS = [2, 3, 4, 5, 6]

/**
 * Fewest adjacent land spaces any settlement may have.
 *
 * Two is a floor, not a target: the maps aim for four adjacent land spaces per
 * settlement and only drop to two where a section cannot otherwise be filled,
 * so across all six maps only a handful sit this low. Raising the floor to
 * three is possible, but only by widening the maps enough that four players run
 * out of tiles before any caste is cleared — and then no game can ever end.
 */
const MIN_LAND_EDGES = 2

/** Every assertion below runs against every shape a table can be dealt. */
const CASES: [BoardShape, number][] = BOARD_SHAPES.flatMap((shape) =>
  PLAYER_COUNTS.map((count) => [shape, count] as [BoardShape, number]),
)

describe('board layout', () => {
  it.each(CASES)('holds exactly the supply on %s at %i players', (shape, count) => {
    const board = buildBoard(count, shape)
    const total = settlementsOf(board).reduce(
      (sum, s) => sum + SETTLEMENT_CAPACITY[s.settlement!],
      0,
    )
    expect(total).toBe(supplyPerCaste(count) * 3)
  })

  it.each(CASES)('has exactly one Edo on %s at %i players', (shape, count) => {
    const edo = settlementsOf(buildBoard(count, shape)).filter((s) => s.settlement === 'edo')
    expect(edo).toHaveLength(1)
  })

  it.each(CASES)('keeps every settlement capturable on %s at %i players', (shape, count) => {
    const board = buildBoard(count, shape)
    for (const settlement of settlementsOf(board)) {
      // Zero land neighbours would mean the settlement is surrounded from the
      // very first turn, before anyone has placed a tile.
      expect(settlement.landNeighbours.length).toBeGreaterThan(0)
      expect(settlement.landNeighbours.length).toBeLessThanOrEqual(6)
    }
  })

  it.each(CASES)('gives every settlement room to fight over on %s at %i players', (shape, count) => {
    const board = buildBoard(count, shape)
    for (const settlement of settlementsOf(board)) {
      // The number of adjacent land spaces is exactly the number of tiles it
      // takes to trigger the capture, so a settlement with one falls for free.
      expect(
        settlement.landNeighbours.length,
        `${settlement.settlement} at ${settlement.col},${settlement.row}`,
      ).toBeGreaterThanOrEqual(MIN_LAND_EDGES)
    }
  })

  it.each(CASES)('stays small enough to finish on %s at %i players', (shape, count) => {
    const board = buildBoard(count, shape)
    const plainLand = board.order.filter((id) => board.spaces[id].kind === 'land').length
    // A game ends only when a caste is cleared or enough pieces are set aside —
    // there is no "everyone ran out of tiles" ending. So if the empty land
    // outruns the tile supply, players can exhaust their stacks with the board
    // still open and the game can never end. Keep a real margin.
    const tileSupply = count * TILES_PER_PLAYER
    expect(plainLand, `${plainLand} land vs ${tileSupply} tiles`).toBeLessThan(tileSupply)
  })

  it.each(CASES)('has a fully connected landmass on %s at %i players', (shape, count) => {
    const board = buildBoard(count, shape)
    const land = board.order.filter((id) => board.spaces[id].kind !== 'sea')
    const seen = new Set<string>([land[0]])
    const stack = [land[0]]
    while (stack.length) {
      const id = stack.pop()!
      for (const next of board.spaces[id].neighbours) {
        if (board.spaces[next].kind === 'sea' || seen.has(next)) continue
        seen.add(next)
        stack.push(next)
      }
    }
    expect(seen.size).toBe(land.length)
  })

  it.each(BOARD_SHAPES)('nests smaller boards inside larger ones on %s', (shape) => {
    for (const [i, count] of PLAYER_COUNTS.slice(1).entries()) {
      const inner = new Set(buildBoard(PLAYER_COUNTS[i], shape).order)
      const outer = new Set(buildBoard(count, shape).order)
      for (const id of inner) expect(outer.has(id)).toBe(true)
    }
  })
})

describe('piece distribution', () => {
  it.each(CASES)('deals the whole supply on %s at %i players', (shape, count) => {
    for (let seed = 1; seed <= 25; seed++) {
      const board = buildBoard(count, shape)
      const pieces = distributePieces(board, count, new Rng(seed))
      const tally: Record<Caste, number> = { buddha: 0, rice: 0, castle: 0 }
      for (const list of Object.values(pieces)) for (const c of list) tally[c]++
      for (const caste of CASTES) expect(tally[caste]).toBe(supplyPerCaste(count))
    }
  })

  it.each(CASES)('respects capacity and uniqueness on %s at %i players', (shape, count) => {
    const board = buildBoard(count, shape)
    const pieces = distributePieces(board, count, new Rng(7))
    for (const settlement of settlementsOf(board)) {
      const list = pieces[settlement.id]
      expect(list).toHaveLength(SETTLEMENT_CAPACITY[settlement.settlement!])
      // No settlement may hold two pieces of the same caste.
      expect(new Set(list).size).toBe(list.length)
    }
  })
})
