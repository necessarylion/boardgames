import type { Tile, TileDef } from './types'

/**
 * The 20 tiles every player owns.
 *
 * The rulebook states the totals it constrains — 20 tiles per player, exactly
 * five bearing the fast icon, one switch tile and one move tile — but its
 * component list never breaks down the wild tiles individually. This set
 * satisfies every stated constraint; adjust the wild tiles here if you want to
 * match a different printing.
 */
export const TILE_SET: readonly TileDef[] = [
  // Caste-specific tiles: influence one caste only.
  { kind: 'caste', caste: 'buddha', value: 1, fast: false },
  { kind: 'caste', caste: 'buddha', value: 2, fast: false },
  { kind: 'caste', caste: 'buddha', value: 3, fast: false },
  { kind: 'caste', caste: 'buddha', value: 4, fast: false },
  { kind: 'caste', caste: 'rice', value: 1, fast: false },
  { kind: 'caste', caste: 'rice', value: 2, fast: false },
  { kind: 'caste', caste: 'rice', value: 3, fast: false },
  { kind: 'caste', caste: 'rice', value: 4, fast: false },
  { kind: 'caste', caste: 'castle', value: 1, fast: false },
  { kind: 'caste', caste: 'castle', value: 2, fast: false },
  { kind: 'caste', caste: 'castle', value: 3, fast: false },
  { kind: 'caste', caste: 'castle', value: 4, fast: false },

  // Wild tiles: influence all three castes.
  { kind: 'samurai', value: 2, fast: false },
  { kind: 'samurai', value: 3, fast: false },
  { kind: 'ronin', value: 1, fast: true },
  { kind: 'ronin', value: 1, fast: true },
  { kind: 'ship', value: 1, fast: true },
  { kind: 'ship', value: 1, fast: true },

  // Action tiles.
  { kind: 'switch', value: 0, fast: true },
  { kind: 'move', value: 0, fast: false },
]

export const TILES_PER_PLAYER = TILE_SET.length
export const STARTING_HAND_SIZE = 5

export function buildTiles(owner: number): Tile[] {
  return TILE_SET.map((def, index) => ({ ...def, id: tileId(owner, index), owner }))
}

export function tileId(owner: number, index: number): string {
  return `p${owner}-t${index}`
}

/**
 * Every tile's definition is recoverable from its id, so the network protocol
 * only ever has to send ids — never the tile data itself.
 */
export function tileFromId(id: string): Tile {
  const match = /^p(\d+)-t(\d+)$/.exec(id)
  if (!match) throw new Error(`malformed tile id: ${id}`)
  const owner = Number(match[1])
  const index = Number(match[2])
  const def = TILE_SET[index]
  if (!def) throw new Error(`unknown tile index in id: ${id}`)
  return { ...def, id, owner }
}

export function tileLabel(tile: TileDef): string {
  switch (tile.kind) {
    case 'caste':
      return `${tile.value}-${tile.caste}`
    case 'switch':
      return 'switch'
    case 'move':
      return 'move'
    default:
      return `${tile.value}-${tile.kind}`
  }
}

/** Ships are the only tile that may be placed on a sea space, and only there. */
export function isSeaTile(tile: TileDef): boolean {
  return tile.kind === 'ship'
}

/** Whether the tile is placed onto the board at all (the switch tile is not). */
export function isPlaceable(tile: TileDef): boolean {
  return tile.kind !== 'switch'
}

/** Whether the tile contributes influence toward capturing a piece of `caste`. */
export function influenceFor(tile: TileDef, caste: string): number {
  switch (tile.kind) {
    case 'caste':
      return tile.caste === caste ? tile.value : 0
    case 'samurai':
    case 'ronin':
    case 'ship':
      return tile.value // wild: influences all castes
    default:
      return 0 // action tiles have no influence value
  }
}
