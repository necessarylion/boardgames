/**
 * Pointy-top hexagon geometry, addressed with axial coordinates (q, r).
 *
 * The board data is authored as text rows using "odd-r" offset coordinates
 * (odd rows are drawn shifted half a hex to the right), which is far easier to
 * read and edit by hand than raw axial coordinates.
 */

export interface Axial {
  q: number
  r: number
}

export type HexId = string

export function hexId(q: number, r: number): HexId {
  return `${q},${r}`
}

/** The six neighbour directions of a pointy-top hex, in axial space. */
export const DIRECTIONS: readonly Axial[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
]

export function neighbourIds(q: number, r: number): HexId[] {
  return DIRECTIONS.map((d) => hexId(q + d.q, r + d.r))
}

/** Convert an odd-r offset coordinate (as authored in the map text) to axial. */
export function offsetToAxial(col: number, row: number): Axial {
  return { q: col - (row - (row & 1)) / 2, r: row }
}

export interface Point {
  x: number
  y: number
}

/** Centre point of a hex, where `size` is the circumradius (centre to corner). */
export function hexCentre(q: number, r: number, size: number): Point {
  return {
    x: size * Math.sqrt(3) * (q + r / 2),
    y: size * 1.5 * r,
  }
}

/** SVG `points` attribute for a pointy-top hexagon of the given size. */
export function hexPolygon(centre: Point, size: number): string {
  const points: string[] = []
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 30)
    points.push(
      `${(centre.x + size * Math.cos(angle)).toFixed(3)},${(centre.y + size * Math.sin(angle)).toFixed(3)}`,
    )
  }
  return points.join(' ')
}

export const HEX_WIDTH_RATIO = Math.sqrt(3) // width  = size * √3
export const HEX_HEIGHT_RATIO = 2 // height = size * 2
