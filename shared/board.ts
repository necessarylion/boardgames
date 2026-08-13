import { hexId, neighbourIds, offsetToAxial } from './hex'
import { GAME_MAX_PLAYERS, MIN_PLAYERS, type BoardShape, type Section, type Space, type SettlementKind } from './types'

/** Samurai's own ceiling: its board only carries sections A–E, so six seats. */
const SAMURAI_MAX_PLAYERS = GAME_MAX_PLAYERS.samurai

/** Sections from the centre of a map outward. */
export const SECTION_ORDER: readonly Section[] = ['A', 'B', 'C', 'D', 'E']

/**
 * The game boards, authored as text in odd-r offset coordinates.
 *
 *   ' '  off the map      '~'  sea space        '.'  land space
 *   'v'  village (1 piece)  'c'  city (2 pieces)  'E'  Edo (3 pieces)
 *
 * Every space belongs to one of five sections, each opening up as another player
 * joins. A alone is the two-player board, A+B the three-player board, A+B+C the
 * four-player board — the same nesting the physical board's five map pieces
 * produce. D and E carry that outward to five and six players, which the
 * published game does not offer; they are outlying islands off each shore.
 *
 * The section piece totals are what make setup work out exactly, every section
 * carrying three more cities and three more villages than the one inside it:
 *   A         = Edo + 6 cities + 6 villages   = 21 pieces (7 of each caste)
 *   A+B       = Edo + 9 cities + 9 villages   = 30 pieces (10 of each caste)
 *   A+B+C     = Edo + 12 cities + 12 villages = 39 pieces (13 of each caste)
 *   A+…+D     = Edo + 15 cities + 15 villages = 48 pieces (16 of each caste)
 *   A+…+E     = Edo + 18 cities + 18 villages = 57 pieces (19 of each caste)
 *
 * Every map also gives each settlement at least three adjacent land spaces on
 * the smallest board it appears on, since that count is exactly the number of
 * tiles needed to surround it — one or two makes a settlement fall for free.
 *
 * The published maps are ringed by sea, so an outer section can only reach the
 * landmass by taking over part of that rim. Rather than redraw A, B or C, the
 * band edges stop one column short of the old map, handing its outermost column
 * to D. That column is open water on all three maps, so every settlement, every
 * land space and the whole supply survive untouched at two, three and four
 * players; the four-player board simply gives up ten spaces of empty sea at its
 * outer edge, far enough from any settlement that no ship there ever counted.
 */
interface MapDef {
  rows: readonly string[]
  section: (row: number, col: number) => Section
}

/**
 * The long maps grow outward from their middle column, so sections are a
 * function of how far across a space sits — A is the centre, then B, then C, and
 * D and E out at the shores. The centre differs per map because the maps are not
 * all the same width, and so do the band edges, because the maps do not widen at
 * the same rate.
 *
 * `edges` gives the outer reach of every section but the last; anything past
 * the final edge belongs to the outermost section.
 */
const outwardFrom =
  (centre: number, edges: readonly number[]) =>
  (_row: number, col: number): Section => {
    const dx = Math.abs(col - centre)
    const band = edges.findIndex((edge) => dx <= edge)
    return SECTION_ORDER[band === -1 ? SECTION_ORDER.length - 1 : band]
  }

/** How far apart two rows sit, measured in column widths. */
const ROW_PITCH = Math.sqrt(3) / 2

/**
 * A round map grows out of a point rather than a column, so its sections are
 * rings rather than bands. The distance has to be measured in the geometry the
 * board is actually drawn in — odd rows sit half a column to the right, and a
 * row is only √3/2 of a column tall — or the rings come out as ellipses.
 *
 * `edges` are radii, in column widths, on the same footing as `outwardFrom`.
 *
 * Row parity is load-bearing here: adding or dropping a row shifts which rows
 * carry the half-column offset, which is a different lattice and a different set
 * of neighbours. Mirror the columns as well if a round map ever has to move.
 */
const ringsFrom =
  (centreCol: number, centreRow: number, edges: readonly number[]) =>
  (row: number, col: number): Section => {
    const dx = col + (row & 1) * 0.5 - centreCol
    const dy = (row - centreRow) * ROW_PITCH
    const distance = Math.hypot(dx, dy)
    const band = edges.findIndex((edge) => distance <= edge)
    return SECTION_ORDER[band === -1 ? SECTION_ORDER.length - 1 : band]
  }

/**
 * A map that doubles back on itself has no centre column to grow from: the same
 * column holds two different stretches of the island. So its sections are
 * stretches of a spine instead — every space takes the section of the nearest
 * point on the curve, measured by how far along the curve that point sits from
 * its middle.
 *
 * `spine` is a curve over t ∈ [-1, 1] in drawn coordinates, for the same reason
 * ringsFrom measures there: the lattice, not the text grid, is what the bands
 * have to follow. `edges` are arc lengths either side of the middle.
 */
const alongSpine = (
  spine: (t: number) => { x: number; y: number },
  edges: readonly number[],
) => {
  const SAMPLES = 400
  const points: { x: number; y: number; along: number }[] = []
  let length = 0
  for (let i = 0; i <= SAMPLES; i++) {
    const { x, y } = spine(-1 + (2 * i) / SAMPLES)
    if (i > 0) length += Math.hypot(x - points[i - 1].x, y - points[i - 1].y)
    points.push({ x, y, along: length })
  }
  const middle = length / 2

  return (row: number, col: number): Section => {
    const x = col + (row & 1) * 0.5
    const y = row * ROW_PITCH
    let nearest = points[0]
    let best = Infinity
    for (const point of points) {
      const d = Math.hypot(point.x - x, point.y - y)
      if (d < best) {
        best = d
        nearest = point
      }
    }
    const distance = Math.abs(nearest.along - middle)
    const band = edges.findIndex((edge) => distance <= edge)
    return SECTION_ORDER[band === -1 ? SECTION_ORDER.length - 1 : band]
  }
}

const MAPS: Record<BoardShape, MapDef> = {
  /** Two peaks either side of a valley. The valley is the two-player board. */
  mountain: {
    section: outwardFrom(23.5, [7, 11, 15, 19]),
    rows: [
      '               ~~~~          ~~~~',
      '             ~~.c..~        ~.v..~~',
      '            ~.v...c.~~    ~~.c..c..~          ~',
      '  ~~ ~~~   ~c...v..v.c~  ~v...c..c..~  ~~   ~~.',
      '~~~.~~..~ ~...v~~~~....~~c..v~~~~..c.~ ..~ ~~..',
      '.v.c..c..~c..~~    ~.E....v.~    ~~.v.~c.~~.~c~',
      '~.~..v..c...~       ~~.v.c~~       ~.....v.c...',
      '.~~v.~~~~v.~          ~..~          ~v.v~...~~~',
      '~~ ~~~ ~..~            ~~            ~..~~~v~',
      '       ~.~                            ~~  ~.~',
    ],
  },
  /** A broad chevron, its two shores dropping to a point in the middle. */
  valley: {
    section: outwardFrom(23, [7, 10, 14, 18]),
    rows: [
      '..~~.v...~~                         ~~..v...c..',
      '.v..~.c.c..~~~                   ~~~v.c~.~c..v~',
      '~~.c......v.v.~~               ~~.......v...~~~',
      ' ~~.v~~~~....v.c~~~         ~~~v..c.c.~..~.~',
      '   ~~~  ~~~.c....c.~~~   ~~~.c...v..~~~~~~~~',
      '           ~~~.c..v.v.~~~.c....c.~~~',
      '              ~~.c.....v.....v.~~',
      '                ~~~c.E..c.v.~~~',
      '                   ~~~.v.~~~',
      '                      ~~~',
    ],
  },
  /** A rounded bay, its shores curving away either side of a deep centre. */
  bay: {
    section: outwardFrom(23.5, [7, 11, 15, 19]),
    rows: [
      '~.v..v..c~                            ~..v.c..v',
      'v.~c..c...                            .c..~.c..',
      '..~......v~                          ~c..v~....',
      '~~~~~~~~~..~                        ~....~~~~~~',
      '        ~~c.~~                    ~~.v~~~~',
      '          ....~~~~            ~~~~....',
      '          ~.v.v.v.~~~~~~~~~~~~.c....c~',
      '           ~.....v.v.v.v.v.c.....v..~',
      '            ~~..c.............v.c.~~',
      '              ~~~~c.c.E.c.c.c.~~~~',
      '                  ~~~~~~~~~~~~',
    ],
  },
  /**
   * A round island with Edo at its centre and lagoons cut into the land. Its
   * sections are rings rather than bands — the only map where they are — so
   * every board from two players up to six comes out circular.
   */
  circle: {
    section: ringsFrom(9.5, 9, [4.583, 5.43, 6.041, 6.557]),
    rows: [
      '        ~~~~',
      '     ~~~~.~~~~',
      '     ~~....c.~~',
      '   ~~..c.c....~~',
      '   ~~c....~~.v.~~',
      '  ~v..~~c~~~...c~',
      '  ~..c~~~.~~v.v..~',
      '  ~...~~.c..~~.v~',
      '  ~.c.c.c..v~~~..~',
      ' ~v..~~..E..~~..c~',
      '  ~..~~~c..v.v.v.~',
      '  ~c.~~..v.~~...~',
      '  ~..c.c~~.~~~v..~',
      '  ~v...~~~v~~..c~',
      '   ~~.c.~~....v~~',
      '   ~~....v.v..~~',
      '     ~~.v....~~',
      '     ~~~~.~~~~',
      '        ~~~~',
    ],
  },
  /**
   * One long island lying on the diagonal, north-east down to south-west, with
   * Edo halfway along it. Its column bands cut across the slant, so every board
   * is a shorter slash of the same island.
   */
  slash: {
    section: outwardFrom(15.5, [2.5, 4.5, 6.5, 8.5]),
    rows: [
      '                    ~~~v...v.~',
      '                  ~~~~..v...~~',
      '                  ~~v~....v~~~',
      '                 ~~...c.v~~~',
      '                ~~~~c.....~',
      '               ~~.v..c.c~~~',
      '              ~~~v....~~.~',
      '             ~~...c.v..~~~',
      '            ~~~c.....~~~~',
      '           ~~c....v~~~~',
      '          ~~~....v.~~',
      '         ~~c.v.E..c~',
      '        ~~~......c~~~',
      '       ~~v.c...v.~~',
      '      ~~~.....c~~~~',
      '    ~~~.......~~~',
      '   ~~~.c.v..v.~~',
      '   ~......c~~~~',
      '  ~~~c...v.~~~',
      '~~~~..v...~~',
      ' ~.c.c..c~~~',
    ],
  },
  /**
   * An island winding an S from north to south, Edo at the turn in the middle.
   * The same column carries three separate stretches of it, so this is the map
   * the spine sections exist for.
   */
  serpent: {
    section: alongSpine(
      (t) => ({ x: 7 + 4.2 * Math.sin(1.5 * Math.PI * t), y: (1 + t) * 11 * ROW_PITCH }),
      [4.816, 7.292, 9.785, 12.496],
    ),
    rows: [
      '         ~.c.~',
      '    ~~~~~v...~',
      '   ~~.c~...c~~',
      ' ~~.~...c.~~',
      ' ~.v.v...~~',
      '~~.....v.~',
      '~..v..v.~~',
      '~v....~~',
      '~...c.c~~',
      '~c.....E~~~',
      ' ~~v..v..c.~',
      '  ~.v.....c~~',
      '   ~~.v..c...~',
      '    ~~.v...c.~',
      '      ~~~.v..~',
      '      ~~~...v~',
      '     ~~v...c..~',
      '    ~...c...c~',
      '   ~~~.....c.~',
      '  ~..v.c.c~~~',
      '  ~v...~.~~',
      '~~...v~~~',
      '~..c.~~',
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
  // Two players share the innermost section; each further player opens the next
  // ring outward, so a six-player table plays on all five.
  const rings = clampPlayers(playerCount) - 1
  return [...SECTION_ORDER.slice(0, rings)]
}

function clampPlayers(playerCount: number): number {
  return Math.min(Math.max(playerCount, MIN_PLAYERS), SAMURAI_MAX_PLAYERS)
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
