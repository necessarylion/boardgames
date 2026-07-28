import { hexId, neighbourIds, offsetToAxial } from './hex'
import type { Section, Space, SettlementKind } from './types'

/**
 * The game board, authored as text in odd-r offset coordinates.
 *
 *   ' '  off the map      '~'  sea space        '.'  land space
 *   'v'  village (1 piece)  'c'  city (2 pieces)  'E'  Edo (3 pieces)
 *
 * Rows belong to one of three sections. Section A alone is the two-player
 * board; A+B is the three-player board; A+B+C is the four-player board — the
 * same nesting the physical board's five map pieces produce.
 *
 * The section piece totals are what make setup work out exactly:
 *   A     = Edo + 6 cities + 6 villages  = 21 pieces (7 of each caste)
 *   A+B   = Edo + 9 cities + 9 villages  = 30 pieces (10 of each caste)
 *   A+B+C = Edo + 12 cities + 12 villages = 39 pieces (13 of each caste)
 */
const MAP_ROWS: readonly string[] = [
  '            ~~~~~',
  '            ~v.c.~',
  '           ~v....~',
  '           ~.c.c.~',
  '          ~.v...~',
  '          ~~..~~~',
  '         ~v..c.~',
  '         ~.c..v.~',
  '        ~.c..E.~',
  '        ~..c..v~',
  '       ~..c..v~',
  '       ~v..v..~',
  '      ~...c.~',
  '      ~~...~~',
  '     ~v..c.~',
  '     ~.c...~',
  '    ~.c..v~',
  '    ~..v.~',
  '   ~~~~~~',
]

/** Section for each row of MAP_ROWS, by index. */
const ROW_SECTION: readonly Section[] = MAP_ROWS.map((_, row) =>
  row <= 4 ? 'C' : row <= 13 ? 'A' : 'B',
)

const SETTLEMENT_CHARS: Record<string, SettlementKind> = {
  v: 'village',
  c: 'city',
  E: 'edo',
}

/** Sections present on the board for a given player count. */
export function sectionsFor(playerCount: number): Section[] {
  if (playerCount <= 2) return ['A']
  if (playerCount === 3) return ['A', 'B']
  return ['A', 'B', 'C']
}

export interface Board {
  spaces: Record<string, Space>
  /** Stable render/iteration order: top-left to bottom-right. */
  order: string[]
}

export function buildBoard(playerCount: number): Board {
  const sections = new Set(sectionsFor(playerCount))
  const spaces: Record<string, Space> = {}
  const order: string[] = []

  for (let row = 0; row < MAP_ROWS.length; row++) {
    const section = ROW_SECTION[row]
    if (!sections.has(section)) continue
    const line = MAP_ROWS[row]
    for (let col = 0; col < line.length; col++) {
      const ch = line[col]
      if (ch === ' ') continue
      const { q, r } = offsetToAxial(col, row)
      const id = hexId(q, r)
      const settlement = SETTLEMENT_CHARS[ch]
      spaces[id] = {
        id,
        q,
        r,
        col,
        row,
        kind: ch === '~' ? 'sea' : settlement ? 'settlement' : 'land',
        ...(settlement ? { settlement } : {}),
        section,
        neighbours: [],
        landNeighbours: [],
      }
      order.push(id)
    }
  }

  // Link neighbours only after every space exists, so edges of the trimmed
  // board simply have fewer of them.
  for (const space of Object.values(spaces)) {
    space.neighbours = neighbourIds(space.q, space.r).filter((id) => id in spaces)
    space.landNeighbours = space.neighbours.filter((id) => spaces[id].kind === 'land')
  }

  return { spaces, order }
}

/** Every settlement on the board, in render order. */
export function settlementsOf(board: Board): Space[] {
  return board.order.map((id) => board.spaces[id]).filter((s) => s.kind === 'settlement')
}
