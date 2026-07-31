import { describe, expect, it } from 'vitest'

import { hexId } from '../shared/hex'
import {
  canSwitch,
  checkEnd,
  contest,
  isSurrounded,
  legalPlacements,
  scoreGame,
  setAsideLimit,
} from '../shared/rules'
import type { Board } from '../shared/board'
import { TILE_SET, tileFromId, tileId } from '../shared/tiles'
import type { Caste, PlacedTile, Space, Tile } from '../shared/types'

/**
 * A hand-built micro board: one village ringed by three land spaces, one sea
 * space, and one neighbouring settlement, so captures can be reasoned about
 * exactly.
 */
function microBoard(): Board {
  const layout: [number, number, Space['kind'], Space['settlement']?][] = [
    [0, 0, 'settlement', 'village'],
    [1, 0, 'land'],
    [0, 1, 'land'],
    [-1, 1, 'land'],
    [-1, 0, 'sea'],
    [1, -1, 'land'],
    [0, -1, 'land'],
  ]
  const spaces: Record<string, Space> = {}
  const order: string[] = []
  for (const [q, r, kind, settlement] of layout) {
    const id = hexId(q, r)
    spaces[id] = {
      id,
      q,
      r,
      col: q,
      row: r,
      kind,
      ...(settlement ? { settlement } : {}),
      section: 'A',
      neighbours: [],
      landNeighbours: [],
    }
    order.push(id)
  }
  for (const space of Object.values(spaces)) {
    const dirs = [
      [1, 0],
      [1, -1],
      [0, -1],
      [-1, 0],
      [-1, 1],
      [0, 1],
    ]
    space.neighbours = dirs
      .map(([dq, dr]) => hexId(space.q + dq, space.r + dr))
      .filter((id) => id in spaces)
    space.landNeighbours = space.neighbours.filter((id) => spaces[id].kind === 'land')
  }
  return { spaces, order }
}

/** Index of a tile in TILE_SET matching a predicate, for readable fixtures. */
function indexOf(match: (t: (typeof TILE_SET)[number]) => boolean): number {
  const i = TILE_SET.findIndex(match)
  if (i < 0) throw new Error('no such tile in the set')
  return i
}

const BUDDHA_3 = indexOf((t) => t.kind === 'caste' && t.caste === 'buddha' && t.value === 3)
const RICE_2 = indexOf((t) => t.kind === 'caste' && t.caste === 'rice' && t.value === 2)
const SAMURAI_2 = indexOf((t) => t.kind === 'samurai' && t.value === 2)
const SHIP = indexOf((t) => t.kind === 'ship')

interface Fixture {
  board: Board
  pieces: Record<string, Caste[]>
  placed: Record<string, PlacedTile>
  tiles: Record<string, Tile>
  playerCount: number
}

function fixture(playerCount = 2): Fixture {
  return { board: microBoard(), pieces: {}, placed: {}, tiles: {}, playerCount }
}

function place(f: Fixture, spaceId: string, owner: number, tileIndex: number) {
  const id = tileId(owner, tileIndex)
  f.tiles[id] = tileFromId(id)
  f.placed[spaceId] = { tileId: id, owner }
}

const VILLAGE = hexId(0, 0)

describe('surrounding a settlement', () => {
  it('ignores adjacent sea spaces', () => {
    const f = fixture()
    // Every land neighbour filled; the sea neighbour is left empty on purpose.
    for (const id of f.board.spaces[VILLAGE].landNeighbours) place(f, id, 0, BUDDHA_3)
    expect(isSurrounded(f, VILLAGE)).toBe(true)
  })

  it('is not surrounded while a land neighbour is empty', () => {
    const f = fixture()
    const land = f.board.spaces[VILLAGE].landNeighbours
    for (const id of land.slice(1)) place(f, id, 0, BUDDHA_3)
    expect(isSurrounded(f, VILLAGE)).toBe(false)
  })
})

describe('resolving a contest', () => {
  it('gives the piece to the single highest influence', () => {
    const f = fixture()
    const [a, b] = f.board.spaces[VILLAGE].landNeighbours
    place(f, a, 0, BUDDHA_3) // 3 religion
    place(f, b, 1, SAMURAI_2) // 2 to every caste
    expect(contest(f, VILLAGE, 'buddha').winner).toBe(0)
  })

  it('counts wild tiles toward every caste but caste tiles toward only one', () => {
    const f = fixture()
    const [a, b] = f.board.spaces[VILLAGE].landNeighbours
    place(f, a, 0, BUDDHA_3) // no commerce influence at all
    place(f, b, 1, SAMURAI_2)
    const rice = contest(f, VILLAGE, 'rice')
    expect(rice.influence[0]).toBe(0)
    expect(rice.influence[1]).toBe(2)
    expect(rice.winner).toBe(1)
  })

  it('counts a ship on an adjacent sea space', () => {
    const f = fixture()
    const sea = f.board.spaces[VILLAGE].neighbours.find(
      (id) => f.board.spaces[id].kind === 'sea',
    )!
    place(f, sea, 1, SHIP)
    expect(contest(f, VILLAGE, 'castle').influence[1]).toBe(1)
  })

  it('sets the piece aside when the highest influence is tied', () => {
    const f = fixture()
    const [a, b] = f.board.spaces[VILLAGE].landNeighbours
    place(f, a, 0, RICE_2)
    place(f, b, 1, SAMURAI_2)
    expect(contest(f, VILLAGE, 'rice').winner).toBeNull()
  })

  it('sets the piece aside when nobody has any influence', () => {
    const f = fixture()
    const [a] = f.board.spaces[VILLAGE].landNeighbours
    place(f, a, 0, BUDDHA_3)
    expect(contest(f, VILLAGE, 'castle').winner).toBeNull()
  })
})

describe('placement legality', () => {
  it('keeps ships on sea and everything else on land', () => {
    const f = fixture()
    const ship = tileFromId(tileId(0, SHIP))
    const buddha = tileFromId(tileId(0, BUDDHA_3))
    const shipTargets = legalPlacements(f, ship)
    const landTargets = legalPlacements(f, buddha)

    expect(shipTargets.every((id) => f.board.spaces[id].kind === 'sea')).toBe(true)
    expect(landTargets.every((id) => f.board.spaces[id].kind === 'land')).toBe(true)
    expect(landTargets).not.toContain(VILLAGE)
  })

  it('excludes occupied spaces', () => {
    const f = fixture()
    const [a] = f.board.spaces[VILLAGE].landNeighbours
    place(f, a, 0, BUDDHA_3)
    expect(legalPlacements(f, tileFromId(tileId(1, RICE_2)))).not.toContain(a)
  })
})

describe('the switch tile', () => {
  it('refuses a swap that would duplicate a caste on one settlement', () => {
    const f = fixture()
    const other = hexId(1, 0)
    f.board.spaces[other].kind = 'settlement'
    f.board.spaces[other].settlement = 'city'
    f.pieces[VILLAGE] = ['buddha']
    f.pieces[other] = ['buddha', 'rice']
    // Swapping the village's Buddha for the city's rice would leave the city
    // holding two Buddhas.
    expect(canSwitch(f, { spaceId: VILLAGE, index: 0 }, { spaceId: other, index: 1 })).toBe(false)
  })

  it('allows a swap that keeps every settlement unique', () => {
    const f = fixture()
    const other = hexId(1, 0)
    f.board.spaces[other].kind = 'settlement'
    f.board.spaces[other].settlement = 'village'
    f.pieces[VILLAGE] = ['buddha']
    f.pieces[other] = ['rice']
    expect(canSwitch(f, { spaceId: VILLAGE, index: 0 }, { spaceId: other, index: 0 })).toBe(true)
  })

  it('rejects swapping two pieces of the same caste', () => {
    const f = fixture()
    const other = hexId(1, 0)
    f.pieces[VILLAGE] = ['rice']
    f.pieces[other] = ['rice']
    expect(canSwitch(f, { spaceId: VILLAGE, index: 0 }, { spaceId: other, index: 0 })).toBe(false)
  })
})

describe('end conditions', () => {
  it('ends when a caste is cleared from the board', () => {
    const f = fixture()
    f.pieces[VILLAGE] = ['buddha', 'rice']
    expect(checkEnd(f, []).over).toBe(true)
  })

  it('ends when four pieces have been set aside', () => {
    const f = fixture()
    f.pieces[VILLAGE] = ['buddha', 'rice', 'castle']
    expect(checkEnd(f, ['rice', 'rice', 'buddha']).over).toBe(false)
    expect(checkEnd(f, ['rice', 'rice', 'buddha', 'castle']).over).toBe(true)
  })

  // Four is the published limit and holds for every table the printed game
  // supports; only the two larger boards raise it.
  it('raises the set-aside limit only past four players', () => {
    expect([2, 3, 4].map(setAsideLimit)).toEqual([4, 4, 4])
    expect([5, 6].map(setAsideLimit)).toEqual([5, 6])
  })

  it('holds a six-player game open until the sixth piece is set aside', () => {
    const f = fixture(6)
    f.pieces[VILLAGE] = ['buddha', 'rice', 'castle']
    const five: Caste[] = ['rice', 'rice', 'buddha', 'castle', 'castle']
    expect(checkEnd(f, five).over).toBe(false)
    expect(checkEnd(f, [...five, 'buddha']).over).toBe(true)
  })
})

describe('scoring', () => {
  const player = (id: number, captured: Caste[]) => ({ id, captured })

  it('awards a leader token only to a strict majority', () => {
    // Buddha 2–1 and rice 1–0 to player 0; castle is 1–1 and so goes unclaimed.
    const result = scoreGame([
      player(0, ['buddha', 'buddha', 'rice', 'castle']),
      player(1, ['buddha', 'castle']),
    ])
    const first = result.breakdown.find((b) => b.playerId === 0)!
    expect(first.leaderTokens).toEqual(['buddha', 'rice'])
    expect(result.unclaimed).toEqual(['castle'])
    expect(result.winners).toEqual([0])
  })

  it('breaks a one-token tie on pieces from the other castes', () => {
    // Player 0 leads religion, player 1 leads commerce, military is tied. Player
    // 0 then holds more pieces from the castes they do not lead: 3 against 2.
    const result = scoreGame([
      player(0, ['buddha', 'buddha', 'rice', 'castle', 'castle']),
      player(1, ['rice', 'rice', 'rice', 'castle', 'castle']),
    ])
    expect(result.breakdown.every((b) => b.leaderTokens.length === 1)).toBe(true)
    expect(result.breakdown.map((b) => b.otherCastePieces)).toEqual([3, 2])
    expect(result.winners).toEqual([0])
  })

  it('falls back to total pieces when no token was claimed', () => {
    const result = scoreGame([
      player(0, ['buddha', 'buddha', 'rice']),
      player(1, ['buddha', 'buddha', 'rice']),
      player(2, ['rice']),
    ])
    expect(result.unclaimed).toHaveLength(3)
    expect(result.winners).toEqual([0, 1])
  })

  it('shares the win when every tiebreaker ties', () => {
    const result = scoreGame([
      player(0, ['buddha', 'buddha', 'rice', 'castle']),
      player(1, ['rice', 'rice', 'buddha', 'castle']),
    ])
    expect(result.winners).toEqual([0, 1])
  })
})
