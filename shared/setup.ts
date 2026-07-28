import { settlementsOf, type Board } from './board'
import type { Rng } from './rng'
import { CASTES, type Caste } from './types'

/** Caste pieces of each type in the supply, by player count. */
export function supplyPerCaste(playerCount: number): number {
  if (playerCount <= 2) return 7
  if (playerCount === 3) return 10
  return 13
}

const CITY_PAIRS: readonly [Caste, Caste][] = [
  ['buddha', 'rice'],
  ['buddha', 'castle'],
  ['rice', 'castle'],
]

/**
 * Deal the supply onto the board's settlements.
 *
 * Edo takes one piece of each caste, every city takes two pieces of *different*
 * castes, and every village takes one. The board is built so that using each
 * city pair an equal number of times, and each caste in an equal number of
 * villages, consumes the supply exactly.
 */
export function distributePieces(board: Board, playerCount: number, rng: Rng): Record<string, Caste[]> {
  const settlements = settlementsOf(board)
  const cities = settlements.filter((s) => s.settlement === 'city')
  const villages = settlements.filter((s) => s.settlement === 'village')
  const edo = settlements.filter((s) => s.settlement === 'edo')

  const perCaste = supplyPerCaste(playerCount)
  const expected = edo.length * 3 + cities.length * 2 + villages.length
  if (expected !== perCaste * 3) {
    throw new Error(
      `board holds ${expected} pieces but the ${playerCount}-player supply is ${perCaste * 3}`,
    )
  }
  if (cities.length % 3 !== 0 || villages.length % 3 !== 0) {
    throw new Error('board must have a multiple of three cities and villages')
  }

  const cityPairs = rng.shuffle(
    CITY_PAIRS.flatMap((pair) => Array.from({ length: cities.length / 3 }, () => pair)),
  )
  const villageCastes = rng.shuffle(
    CASTES.flatMap((caste) => Array.from({ length: villages.length / 3 }, () => caste)),
  )

  const pieces: Record<string, Caste[]> = {}
  for (const space of edo) pieces[space.id] = [...CASTES]
  cities.forEach((space, i) => {
    pieces[space.id] = rng.shuffle([...cityPairs[i]])
  })
  villages.forEach((space, i) => {
    pieces[space.id] = [villageCastes[i]]
  })
  return pieces
}

/** Count of each caste still standing on the board. */
export function remainingByCaste(pieces: Record<string, Caste[]>): Record<Caste, number> {
  const counts: Record<Caste, number> = { buddha: 0, rice: 0, castle: 0 }
  for (const list of Object.values(pieces)) {
    for (const caste of list) counts[caste]++
  }
  return counts
}
