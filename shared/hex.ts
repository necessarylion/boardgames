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

/**
 * SVG `d` for the same hexagon with its corners rounded, as a fraction of the
 * edge length. Rounding has to happen in the geometry rather than through
 * `stroke-linejoin`, because a tile's fill is a cloth pattern, so a sharp fill
 * corner would still show through a rounded stroke.
 */
export function hexRoundedPath(centre: Point, size: number, round = 0.1): string {
  const corners: Point[] = []
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 30)
    corners.push({ x: centre.x + size * Math.cos(angle), y: centre.y + size * Math.sin(angle) })
  }
  // Every edge of a regular hexagon is `size` long, so the trim is a constant.
  const trim = size * Math.min(round, 0.5)
  const towards = (from: Point, to: Point) => {
    const dx = to.x - from.x
    const dy = to.y - from.y
    const len = Math.hypot(dx, dy)
    return { x: from.x + (dx / len) * trim, y: from.y + (dy / len) * trim }
  }
  const at = (p: Point) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`
  let d = ''
  for (let i = 0; i < 6; i++) {
    const c = corners[i]
    const start = towards(c, corners[(i + 5) % 6])
    const end = towards(c, corners[(i + 1) % 6])
    d += i === 0 ? `M${at(start)}` : `L${at(start)}`
    d += `Q${at(c)} ${at(end)}`
  }
  return `${d}Z`
}
