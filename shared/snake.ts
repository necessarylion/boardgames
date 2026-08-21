import { Rng } from './rng'
import type { LogEntry } from './types'

/**
 * Snake — the arcade classic played head to head, unrelated to every other game
 * here and sharing only the room machinery. All snakes move one cell per frame
 * on a shared clock the server drives; players only steer. Like the other
 * engines this one owns the only real state, validates every action and hands
 * back `{ok:false,error}` for anything it rejects.
 *
 * There is no opening seat and no turn order — every snake moves every frame —
 * so unlike the other games nothing here draws from `shared/opening.ts` and
 * `opening` is always null. The generator is still carried by position rather
 * than seed, the way Coup carries its deck, because apples spawn mid-game.
 */

export type SnakeDir = 'up' | 'down' | 'left' | 'right'

/** One board frame. The server ticks every running game on this clock. */
export const SNAKE_TICK_MS = 200

/** Frames of stillness after the deal, so nobody dies hunting for the keys. */
export const COUNTDOWN_TICKS = 15

export const START_LENGTH = 3
const GROW_PER_APPLE = 2
/** Steering presses buffered ahead of the next frame, so a quick double turn
 *  (up, then immediately left) lands as two turns rather than only the last. */
const DIR_BUFFER = 2

/** A board cell, `[x, y]` with y growing downwards. */
export type Cell = [number, number]

export const DELTA: Record<SnakeDir, Cell> = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
}

const OPPOSITE: Record<SnakeDir, SnakeDir> = {
  up: 'down',
  down: 'up',
  left: 'right',
  right: 'left',
}

/** Bigger tables get a bigger board, capped where cells would get too small. */
export function gridFor(playerCount: number): number {
  return Math.min(31, 17 + playerCount * 2)
}

/** How many apples the board keeps on it. */
export function foodTarget(playerCount: number): number {
  return playerCount + 2
}

export interface SnakeSeat {
  id: number
  /** Cells occupied, head first. Emptied at death — a crashed snake leaves the board. */
  body: Cell[]
  dir: SnakeDir
  /** Turns waiting to be applied, one per frame. */
  pending: SnakeDir[]
  alive: boolean
  /** Segments still owed from apples eaten. */
  grow: number
  apples: number
  /** Body length, frozen at death for the final standing. */
  length: number
}

export interface SnakeResult {
  winner: number | null
  reason: string
}

export type SnakePhase = 'play' | 'over'

export interface SnakeGameState {
  playerCount: number
  gridSize: number
  players: SnakeSeat[]
  food: Cell[]
  /** Frames until the snakes start moving. */
  countdown: number
  phase: SnakePhase
  paused: boolean
  /** Frames played — the log's turn column and the shell's turn number. */
  turnNumber: number
  /** Nobody has a turn; kept at 0 for the generic shell. */
  current: number
  /** No opening seat exists — every snake moves at once. Kept for the shell. */
  opening: null
  log: LogEntry[]
  result: SnakeResult | null
  /** Where the generator has got to, since apples spawn mid-game. */
  rngPosition: number
}

export type Outcome = { ok: true } | { ok: false; error: string }

const ok: Outcome = { ok: true }
const fail = (error: string): Outcome => ({ ok: false, error })

const key = (cell: Cell): string => `${cell[0]},${cell[1]}`
const sameCell = (a: Cell, b: Cell): boolean => a[0] === b[0] && a[1] === b[1]

/**
 * Seats spaced round a ring, each facing clockwise along it — the direction
 * with the longest open run, so nobody starts pointed at a nearby wall.
 */
function spawnSnakes(playerCount: number, size: number): SnakeSeat[] {
  const centre = (size - 1) / 2
  const radius = size / 2 - 4
  return Array.from({ length: playerCount }, (_, id) => {
    const angle = -Math.PI / 2 + (id * 2 * Math.PI) / playerCount
    const head: Cell = [
      Math.round(centre + radius * Math.cos(angle)),
      Math.round(centre + radius * Math.sin(angle)),
    ]
    // The clockwise tangent at `angle` (y grows downwards), snapped to an axis.
    const tx = -Math.sin(angle)
    const ty = Math.cos(angle)
    const dir: SnakeDir =
      Math.abs(tx) >= Math.abs(ty) ? (tx > 0 ? 'right' : 'left') : (ty > 0 ? 'down' : 'up')
    const [dx, dy] = DELTA[dir]
    const body: Cell[] = Array.from({ length: START_LENGTH }, (_, k) => [
      head[0] - k * dx,
      head[1] - k * dy,
    ])
    return { id, body, dir, pending: [], alive: true, grow: 0, apples: 0, length: START_LENGTH }
  })
}

/** Top the board back up to its apple count, drawing free cells from the rng. */
function spawnFood(state: SnakeGameState, rng: Rng): void {
  const taken = new Set<string>()
  for (const p of state.players) for (const cell of p.body) taken.add(key(cell))
  for (const cell of state.food) taken.add(key(cell))
  while (state.food.length < foodTarget(state.playerCount)) {
    // ponytail: full free-cell scan per apple; fine at ≤31×31 once a frame.
    const free: Cell[] = []
    for (let x = 0; x < state.gridSize; x++) {
      for (let y = 0; y < state.gridSize; y++) {
        if (!taken.has(key([x, y]))) free.push([x, y])
      }
    }
    if (free.length === 0) return
    const cell = free[rng.int(free.length)]
    state.food.push(cell)
    taken.add(key(cell))
  }
}

export class SnakeGame {
  state: SnakeGameState

  constructor(playerCount: number, seed: number) {
    this.state = SnakeGame.deal(playerCount, seed)
  }

  /** Rebuild an engine around state read back from the database. */
  static fromState(state: SnakeGameState): SnakeGame {
    const game = Object.create(SnakeGame.prototype) as SnakeGame
    game.state = state
    return game
  }

  private static deal(playerCount: number, seed: number): SnakeGameState {
    const size = gridFor(playerCount)
    const rng = new Rng(seed)
    const state: SnakeGameState = {
      playerCount,
      gridSize: size,
      players: spawnSnakes(playerCount, size),
      food: [],
      countdown: COUNTDOWN_TICKS,
      phase: 'play',
      paused: false,
      turnNumber: 0,
      current: 0,
      opening: null,
      log: [
        { turn: 0, player: null, text: `${playerCount} snakes on a ${size}×${size} board.` },
      ],
      result: null,
      rngPosition: 0,
    }
    spawnFood(state, rng)
    state.rngPosition = rng.position
    return state
  }

  // --- actions ---------------------------------------------------------------

  /**
   * Queue a turn for the next frame. A repeat of the current heading, or a
   * reversal — which would be instant death into your own neck — is quietly
   * ignored rather than refused, so a held key never rains error toasts.
   */
  setDirection(playerId: number, dir: SnakeDir): Outcome {
    const s = this.state
    if (s.phase !== 'play') return fail('The game is over.')
    if (s.paused) return fail('The table is paused.')
    if (!(dir in DELTA)) return fail('Unknown direction.')
    const player = s.players[playerId]
    if (!player) return fail('You have no seat in this game.')
    if (!player.alive) return fail('Your snake has crashed.')
    const last = player.pending[player.pending.length - 1] ?? player.dir
    if (dir === last || dir === OPPOSITE[last]) return ok
    if (player.pending.length < DIR_BUFFER) player.pending.push(dir)
    return ok
  }

  /** Suspend the table; any seated player may. Mirrors the other games' pause. */
  pause(playerId: number): Outcome {
    const s = this.state
    if (s.phase === 'over') return fail('The game is already over.')
    if (s.paused) return fail('The table is already paused.')
    if (!s.players[playerId]) return fail('You have no seat in this game.')
    s.paused = true
    return ok
  }

  resume(playerId: number): Outcome {
    const s = this.state
    if (!s.paused) return fail('The table is not paused.')
    if (!s.players[playerId]) return fail('You have no seat in this game.')
    s.paused = false
    return ok
  }

  // --- the frame -------------------------------------------------------------

  /** Advance one frame. Driven by the server's clock, never by a client. */
  tick(): void {
    const s = this.state
    if (s.phase !== 'play' || s.paused) return
    s.turnNumber++
    if (s.countdown > 0) {
      s.countdown--
      return
    }

    const movers = s.players.filter((p) => p.alive)
    for (const p of movers) {
      const next = p.pending.shift()
      if (next) p.dir = next
    }

    // Cells still occupied once every tail has moved: entering a cell a tail is
    // vacating this same frame is legal, so tails that move are left out.
    const occupied = new Set<string>()
    for (const p of movers) {
      const held = p.grow > 0 ? p.body.length : p.body.length - 1
      for (let i = 0; i < held; i++) occupied.add(key(p.body[i]))
    }

    const heads = new Map<number, Cell>()
    for (const p of movers) {
      const [dx, dy] = DELTA[p.dir]
      heads.set(p.id, [p.body[0][0] + dx, p.body[0][1] + dy])
    }

    const dying: SnakeSeat[] = []
    for (const p of movers) {
      const [x, y] = heads.get(p.id)!
      const offBoard = x < 0 || y < 0 || x >= s.gridSize || y >= s.gridSize
      // Two heads on one cell — or trading cells head-on — kill both snakes.
      const headOn = movers.some((q) => q.id !== p.id && sameCell(heads.get(q.id)!, [x, y]))
      if (offBoard || occupied.has(key([x, y])) || headOn) dying.push(p)
    }

    for (const p of movers) {
      if (dying.includes(p)) continue
      const head = heads.get(p.id)!
      p.body.unshift(head)
      const bite = s.food.findIndex((f) => sameCell(f, head))
      if (bite >= 0) {
        s.food.splice(bite, 1)
        p.apples++
        p.grow += GROW_PER_APPLE
      }
      if (p.grow > 0) p.grow--
      else p.body.pop()
      p.length = p.body.length
    }

    for (const p of dying) {
      p.alive = false
      p.length = p.body.length
      p.body = []
      p.pending = []
      this.log(p.id, `crashes at ${p.length} long.`)
    }

    const rng = new Rng(s.rngPosition)
    spawnFood(s, rng)
    s.rngPosition = rng.position

    this.checkEnd(dying)
  }

  // --- endings ---------------------------------------------------------------

  private checkEnd(dying: SnakeSeat[]): void {
    const s = this.state
    const alive = s.players.filter((p) => p.alive)
    if (alive.length > 1) return
    s.phase = 'over'
    if (alive.length === 1) {
      s.result = { winner: alive[0].id, reason: 'last snake slithering' }
    } else {
      // The last crash took everyone at once; the longest at impact takes it.
      const most = Math.max(...dying.map((p) => p.length))
      const leaders = dying.filter((p) => p.length === most)
      s.result =
        leaders.length === 1
          ? { winner: leaders[0].id, reason: 'longest snake when the last crash came' }
          : { winner: null, reason: 'crashed level' }
    }
    this.log(null, 'The game is over.')
  }

  private log(player: number | null, text: string): void {
    this.state.log.push({ turn: this.state.turnNumber, player, text })
    // Keep the log from growing without bound over a long game.
    if (this.state.log.length > 200) this.state.log.splice(0, this.state.log.length - 200)
  }
}
