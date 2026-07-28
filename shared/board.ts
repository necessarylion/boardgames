import { hexId, neighbourIds, offsetToAxial } from './hex'
import type { BoardShape, Section, Space, SettlementKind } from './types'

/**
 * The game boards, authored as text in odd-r offset coordinates.
 *
 *   ' '  off the map      '~'  sea space        '.'  land space
 *   'v'  village (1 piece)  'c'  city (2 pieces)  'E'  Edo (3 pieces)
 *
 * Every space belongs to one of three sections. Section A alone is the
 * two-player board; A+B is the three-player board; A+B+C is the four-player
 * board — the same nesting the physical board's five map pieces produce.
 *
 * The section piece totals are what make setup work out exactly:
 *   A     = Edo + 6 cities + 6 villages   = 21 pieces (7 of each caste)
 *   A+B   = Edo + 9 cities + 9 villages   = 30 pieces (10 of each caste)
 *   A+B+C = Edo + 12 cities + 12 villages = 39 pieces (13 of each caste)
 *
 * Every map also gives each settlement at least three adjacent land spaces on
 * the smallest board it appears on, since that count is exactly the number of
 * tiles needed to surround it — one or two makes a settlement fall for free.
 *
 * A map's sections are a function of the space, not just its row: the V maps
 * grow upward from the vertex so they split by row, while the mountain grows
 * outward from its valley so it splits by column.
 */
interface MapDef {
  rows: readonly string[]
  section: (row: number, col: number) => Section
}

/**
 * Every map grows outward from its middle column, so sections are a function of
 * how far across a space sits — A is the centre, then B, then C at the shores.
 * The centre differs per map because the maps are not all the same width.
 */
const outwardFrom =
  (centre: number, bEdge = 11) =>
  (_row: number, col: number): Section => {
    const dx = Math.abs(col - centre)
    return dx <= 7 ? 'A' : dx <= bEdge ? 'B' : 'C'
  }

const MAPS: Record<BoardShape, MapDef> = {
  /** Two peaks either side of a valley. The valley is the two-player board. */
  mountain: {
    section: outwardFrom(15.5),
    rows: [
      '       ~~~~          ~~~~',
      '     ~~.c..~        ~.v..~~',
      '    ~.v...c.~~    ~~.c..c..~',
      '   ~c...v..v.c~  ~v...c..c..~',
      '  ~...v~~~~....~~c..v~~~~..c.~',
      '~~c..~~    ~.E....v.~    ~~.v.~~',
      '~...~       ~~.v.c~~       ~...~',
      '~v.~          ~..~          ~v.~',
      '~.~            ~~            ~.~',
      '~~                            ~~',
    ],
  },
  /** A broad chevron, its two shores dropping to a point in the middle. */
  valley: {
    section: outwardFrom(15, 10),
    rows: [
      '~~~                         ~~~',
      '~..~~~                   ~~~v.~',
      '~.v.v.~~               ~~.....~',
      '~....v.c~~~         ~~~v..c.c.~',
      '~~~.c....c.~~~   ~~~.c...v..~~~',
      '   ~~~.c..v.v.~~~.c....c.~~~',
      '      ~~.c.....v.....v.~~',
      '        ~~~c.E..c.v.~~~',
      '           ~~~.v.~~~',
      '              ~~~',
    ],
  },
  /** A rounded bay, its shores curving away either side of a deep centre. */
  bay: {
    section: outwardFrom(15.5),
    rows: [
      '~~                            ~~',
      '~.                            .~',
      '~v~                          ~c~',
      '~..~                        ~..~',
      '~~c.~~                    ~~.v~~',
      '  ....~~~~            ~~~~....',
      '  ~.v.v.v.~~~~~~~~~~~~.c....c~',
      '   ~.....v.v.v.v.v.c.....v..~',
      '    ~~..c.............v.c.~~',
      '      ~~~~c.c.E.c.c.c.~~~~',
      '          ~~~~~~~~~~~~',
    ],
  },
}

export const DEFAULT_BOARD_SHAPE: BoardShape = 'mountain'

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

export function buildBoard(playerCount: number, shape: BoardShape = DEFAULT_BOARD_SHAPE): Board {
  const sections = new Set(sectionsFor(playerCount))
  const map = MAPS[shape] ?? MAPS[DEFAULT_BOARD_SHAPE]
  const rows = map.rows
  const spaces: Record<string, Space> = {}
  const order: string[] = []

  for (let row = 0; row < rows.length; row++) {
    const line = rows[row]
    for (let col = 0; col < line.length; col++) {
      const ch = line[col]
      if (ch === ' ') continue
      const section = map.section(row, col)
      if (!sections.has(section)) continue
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
