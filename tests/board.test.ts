import { describe, expect, it } from 'vitest'

import { buildBoard, settlementsOf } from '../shared/board'
import { Rng } from '../shared/rng'
import { distributePieces, supplyPerCaste } from '../shared/setup'
import { CASTES, SETTLEMENT_CAPACITY, type Caste } from '../shared/types'

const PLAYER_COUNTS = [2, 3, 4]

describe('board layout', () => {
  it.each(PLAYER_COUNTS)('holds exactly the %i-player supply', (count) => {
    const board = buildBoard(count)
    const total = settlementsOf(board).reduce(
      (sum, s) => sum + SETTLEMENT_CAPACITY[s.settlement!],
      0,
    )
    expect(total).toBe(supplyPerCaste(count) * 3)
  })

  it.each(PLAYER_COUNTS)('has exactly one Edo at %i players', (count) => {
    const edo = settlementsOf(buildBoard(count)).filter((s) => s.settlement === 'edo')
    expect(edo).toHaveLength(1)
  })

  it.each(PLAYER_COUNTS)('keeps every settlement capturable at %i players', (count) => {
    const board = buildBoard(count)
    for (const settlement of settlementsOf(board)) {
      // Zero land neighbours would mean the settlement is surrounded from the
      // very first turn, before anyone has placed a tile.
      expect(settlement.landNeighbours.length).toBeGreaterThan(0)
      expect(settlement.landNeighbours.length).toBeLessThanOrEqual(6)
    }
  })

  it.each(PLAYER_COUNTS)('has a fully connected landmass at %i players', (count) => {
    const board = buildBoard(count)
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

  it('nests smaller boards inside larger ones', () => {
    const two = new Set(buildBoard(2).order)
    const three = new Set(buildBoard(3).order)
    const four = buildBoard(4).order
    for (const id of two) expect(three.has(id)).toBe(true)
    for (const id of three) expect(four).toContain(id)
  })
})

describe('piece distribution', () => {
  it.each(PLAYER_COUNTS)('deals the whole supply at %i players', (count) => {
    for (let seed = 1; seed <= 25; seed++) {
      const board = buildBoard(count)
      const pieces = distributePieces(board, count, new Rng(seed))
      const tally: Record<Caste, number> = { buddha: 0, rice: 0, castle: 0 }
      for (const list of Object.values(pieces)) for (const c of list) tally[c]++
      for (const caste of CASTES) expect(tally[caste]).toBe(supplyPerCaste(count))
    }
  })

  it.each(PLAYER_COUNTS)('respects settlement capacity and uniqueness at %i players', (count) => {
    const board = buildBoard(count)
    const pieces = distributePieces(board, count, new Rng(7))
    for (const settlement of settlementsOf(board)) {
      const list = pieces[settlement.id]
      expect(list).toHaveLength(SETTLEMENT_CAPACITY[settlement.settlement!])
      // No settlement may hold two pieces of the same caste.
      expect(new Set(list).size).toBe(list.length)
    }
  })
})
