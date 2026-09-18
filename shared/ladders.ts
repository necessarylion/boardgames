import { DIE_FACES, chooseFirst, type Opening } from './opening'
import { Rng } from './rng'
import type { LogEntry } from './types'

/**
 * Snakes & Ladders — the race game, unrelated to every other game here and
 * sharing only the room machinery. Players take turns rolling a die and moving
 * up a hundred-square track; a ladder's foot carries you up, a snake's head
 * drops you down. Like the other engines this one owns the only real state,
 * validates every action and hands back `{ok:false,error}` for anything it
 * rejects. The die is drawn from the `Rng`, so the generator is carried by
 * position the way Coup carries its deck — rolls happen all game long.
 *
 * The board layout is original: a 10×10 boustrophedon track with its own set
 * of snakes and ladders, not a copy of any published board.
 */

export const LAST_SQUARE = 100
export const BOARD_SIDE = 10

/**
 * Every jump on the board, foot/head → where it lands. Up is a ladder, down a
 * snake. No square is both the start of one jump and the end of another, so a
 * move never chains.
 */
export const JUMPS: Readonly<Record<number, number>> = {
  // ladders
  4: 25,
  9: 29,
  13: 46,
  33: 49,
  42: 63,
  50: 69,
  62: 81,
  74: 92,
  // snakes
  27: 5,
  40: 3,
  43: 18,
  54: 31,
  66: 45,
  76: 58,
  89: 53,
  99: 41,
}

export const isLadder = (from: number): boolean => (JUMPS[from] ?? from) > from
export const isSnake = (from: number): boolean => (JUMPS[from] ?? from) < from

/**
 * Power squares — a house rule, not part of the classic game. Landing on one
 * fires it at once: `sprint` and `slip` move you again (and a snake or ladder
 * where you stop still counts), `again` is an extra throw, `skip` costs your
 * next turn, `push` shoves the leading player back a few squares, and `swap`
 * trades places with the leading player (when they are ahead of you).
 *
 * Where they sit is drawn per game from the `Rng`, so no two tables are alike,
 * and redrawn every `POWER_SHUFFLE_MS` while the game runs. One swap always
 * waits at the foot of a snake — being eaten still hands you a trade. Otherwise
 * no power square is the start or end of a jump, and the spacing keeps a sprint
 * or slip from landing on another power, so one landing fires at most one power.
 */
export type Power = 'sprint' | 'slip' | 'again' | 'skip' | 'push' | 'swap'

export const SPRINT_STEPS = 3
export const SLIP_STEPS = 5
export const PUSH_STEPS = 3

/** How many of each power a board carries. */
export const POWER_COUNTS: Readonly<Record<Power, number>> = {
  sprint: 3,
  slip: 3,
  again: 2,
  skip: 2,
  push: 2,
  swap: 3,
}

/** Gaps between two powers that would let one move you onto the other, or sit side by side. */
const POWER_GAPS = new Set([0, 1, SPRINT_STEPS, SLIP_STEPS])

/** How often the power squares move while a game is running. */
export const POWER_SHUFFLE_MS = 2 * 60 * 1000

/** Where the snakes drop you — one of these always carries a swap. */
export const SNAKE_TAILS: readonly number[] = Object.entries(JUMPS)
  .filter(([from, to]) => to < Number(from))
  .map(([, to]) => to)

/** Draw the board's power squares: one swap on a snake's tail, the rest clear of every jump, the top, and each other. */
export function drawPowers(rng: Rng): Record<number, Power> {
  const jumpSquares = new Set([...Object.keys(JUMPS).map(Number), ...Object.values(JUMPS)])
  const candidates = rng.shuffle(
    Array.from({ length: LAST_SQUARE - 8 }, (_, i) => i + 5).filter((n) => !jumpSquares.has(n)),
  )
  const wanted: Power[] = []
  for (const [power, count] of Object.entries(POWER_COUNTS) as [Power, number][]) {
    for (let i = 0; i < count - (power === 'swap' ? 1 : 0); i++) wanted.push(power)
  }
  const tail = SNAKE_TAILS[rng.int(SNAKE_TAILS.length)]
  const powers: Record<number, Power> = { [tail]: 'swap' }
  const chosen: number[] = [tail]
  for (const n of candidates) {
    if (chosen.length > wanted.length) break
    if (chosen.some((c) => POWER_GAPS.has(Math.abs(c - n)))) continue
    powers[n] = wanted[chosen.length - 1]
    chosen.push(n)
  }
  return powers
}

/**
 * Where square `n` sits: `col` from the left, `row` from the bottom. Rows snake
 * back and forth, so every odd row counts from the right.
 */
export function squareAt(n: number): { col: number; row: number } {
  const row = Math.floor((n - 1) / BOARD_SIDE)
  const along = (n - 1) % BOARD_SIDE
  return { row, col: row % 2 === 0 ? along : BOARD_SIDE - 1 - along }
}

export interface LadderPlayer {
  id: number
  /** Square stood on; 0 is off the board, before the first move. */
  pos: number
  rolls: number
  /** Owes a missed turn, from a `skip` square. */
  skip: boolean
}

/** The most recent throw, kept so the table can animate it. */
export interface LastRoll {
  player: number
  roll: number
  from: number
  /** Where the move stopped before any snake or ladder. */
  landed: number
  /** Squares the token passed through between `landed` and `to`, in order. */
  via: number[]
  /** Where the token ended up. */
  to: number
  /** The power square fired by this throw, if any. */
  power: Power | null
  /** Other tokens a power moved, from where to where. */
  others: { player: number; from: number; to: number }[]
  /** An `again` square: the same seat rolls again. */
  again: boolean
}

export interface LaddersResult {
  winner: number
  /** Every seat in finishing order; the last one never reached the top. */
  standings: number[]
  reason: string
}

export type LaddersPhase = 'play' | 'over'

export interface LaddersGameState {
  playerCount: number
  players: LadderPlayer[]
  current: number
  /** How the opening seat was decided, or null when it was drawn quietly. */
  opening: Opening | null
  phase: LaddersPhase
  paused: boolean
  /** Rolls so far plus one — the log's turn column and the shell's turn number. */
  turnNumber: number
  lastRoll: LastRoll | null
  /** This game's power squares, drawn at the deal. */
  powers: Record<number, Power>
  /** Seats that have reached the last square, in the order they got there. */
  standings: number[]
  log: LogEntry[]
  result: LaddersResult | null
  /** Where the generator has got to, since the die is thrown all game long. */
  rngPosition: number
}

export type Outcome = { ok: true } | { ok: false; error: string }

const ok: Outcome = { ok: true }
const fail = (error: string): Outcome => ({ ok: false, error })

export class LaddersGame {
  state: LaddersGameState

  constructor(playerCount: number, seed: number, diceStart = true) {
    this.state = LaddersGame.deal(playerCount, seed, diceStart)
  }

  /** Rebuild an engine around state read back from the database. */
  static fromState(state: LaddersGameState): LaddersGame {
    const game = Object.create(LaddersGame.prototype) as LaddersGame
    game.state = state
    return game
  }

  private static deal(playerCount: number, seed: number, diceStart: boolean): LaddersGameState {
    const rng = new Rng(seed)
    const { first, opening } = chooseFirst(rng, playerCount, diceStart)
    // Drawn after the opening seat, so a seed still opens with the same seat.
    const powers = drawPowers(rng)
    return {
      playerCount,
      players: Array.from({ length: playerCount }, (_, id) => ({ id, pos: 0, rolls: 0, skip: false })),
      current: first,
      opening,
      phase: 'play',
      paused: false,
      turnNumber: 1,
      lastRoll: null,
      powers,
      standings: [],
      log: [{ turn: 0, player: null, text: `${playerCount} players line up at the start.` }],
      result: null,
      rngPosition: rng.position,
    }
  }

  // --- actions ---------------------------------------------------------------

  /** Throw the die and move. Only the seat whose turn it is may. */
  roll(playerId: number): Outcome {
    const s = this.state
    if (s.phase !== 'play') return fail('The game is over.')
    if (s.paused) return fail('The table is paused.')
    const player = s.players[playerId]
    if (!player) return fail('You have no seat in this game.')
    if (playerId !== s.current) return fail('It is not your turn.')
    if (s.standings.includes(playerId)) return fail('You have already finished.')

    const rng = new Rng(s.rngPosition)
    const roll = rng.int(DIE_FACES) + 1
    s.rngPosition = rng.position

    const from = player.pos
    // A throw past the top bounces back: count up to 100, then the rest backwards.
    const over = from + roll > LAST_SQUARE
    const landed = over ? 2 * LAST_SQUARE - from - roll : from + roll
    const via: number[] = []
    let to = JUMPS[landed] ?? landed
    if (to !== landed) via.push(to)
    player.rolls++

    let text = `rolls a ${roll}`
    if (over) text += ` and bounces back off the top to ${landed}.`
    else if (to === landed) text += ` and moves to ${to}.`
    if (to > landed) text += ` ${over ? 'Climbs' : 'and climbs'} a ladder from ${landed} to ${to}.`
    else if (to < landed) text += ` ${over ? 'Slides' : 'and slides'} down a snake from ${landed} to ${to}.`

    // A power square fires where the token comes to rest.
    const power = s.powers[to] ?? null
    const others: LastRoll['others'] = []
    let extraThrow = false
    if (power === 'sprint' || power === 'slip') {
      const step = power === 'sprint' ? SPRINT_STEPS : -SLIP_STEPS
      const stop = Math.max(0, to + step)
      if (stop <= LAST_SQUARE) {
        via.push(stop)
        const end = JUMPS[stop] ?? stop
        if (end !== stop) via.push(end)
        text += power === 'sprint' ? ` Sprints on to ${end}.` : ` Slips back to ${end}.`
        to = end
      }
    } else if (power === 'again') {
      extraThrow = true
      text += ' An extra throw!'
    } else if (power === 'skip') {
      player.skip = true
      text += ' Will sit out the next turn.'
    } else if (power === 'push') {
      // The racer furthest up the board (not you) is shoved back; a snake or
      // ladder where they land still counts for them.
      const leader = s.players
        .filter((p) => p.id !== playerId && p.pos > 0 && p.pos < LAST_SQUARE)
        .sort((a, b) => b.pos - a.pos)[0]
      if (leader) {
        const back = Math.max(0, leader.pos - PUSH_STEPS)
        const end = JUMPS[back] ?? back
        others.push({ player: leader.id, from: leader.pos, to: end })
        leader.pos = end
        text += ` Shoves the leader back to ${end}.`
      }
    } else if (power === 'swap') {
      // Trade places with whoever leads the race — if that is ahead of you.
      const leader = s.players
        .filter((p) => p.id !== playerId && p.pos > to && p.pos < LAST_SQUARE)
        .sort((a, b) => b.pos - a.pos)[0]
      if (leader) {
        others.push({ player: leader.id, from: leader.pos, to })
        const there = leader.pos
        leader.pos = to
        to = there
        text += ` Swaps places with the leader, up to ${to}.`
      }
    }
    // `via` ends where the token does, unless nothing followed the landing.
    if (via.length && via[via.length - 1] === to) via.pop()

    player.pos = to
    const won = to === LAST_SQUARE
    // One throw a turn, six or not; only the `again` square grants another.
    const again = extraThrow && !won
    s.lastRoll = { player: playerId, roll, from, landed, via, to, power, others, again }
    this.log(playerId, text)

    s.turnNumber++
    if (won) {
      s.standings.push(playerId)
      this.log(playerId, `finishes in place ${s.standings.length}.`)
    }
    // The race runs on for the places behind the winner, until one seat is
    // left — who is last without needing to roll for it.
    if (s.standings.length >= s.playerCount - 1) {
      const rest = s.players.map((p) => p.id).filter((id) => !s.standings.includes(id))
      s.phase = 'over'
      s.result = {
        winner: s.standings[0],
        standings: [...s.standings, ...rest],
        reason: 'first to reach the last square',
      }
      this.log(null, 'The game is over.')
    } else if (won || !again) {
      s.current = this.nextSeat(s.current)
    }
    return ok
  }

  /** The next seat still racing, clockwise from `from`; a seat owing a skip sits out. */
  private nextSeat(from: number): number {
    const s = this.state
    let id = from
    for (;;) {
      id = (id + 1) % s.playerCount
      if (s.standings.includes(id)) continue
      if (s.players[id].skip) {
        s.players[id].skip = false
        this.log(id, 'sits out the turn.')
        continue
      }
      return id
    }
  }

  /** The shot clock ran out: throw for whoever is holding the table up. */
  timeOut(): Outcome {
    return this.roll(this.state.current)
  }

  /** Move every power square, on the server's clock. Nothing in play is touched. */
  reshufflePowers(): void {
    const s = this.state
    if (s.phase !== 'play') return
    const rng = new Rng(s.rngPosition)
    s.powers = drawPowers(rng)
    s.rngPosition = rng.position
    this.log(null, 'The power squares move.')
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

  private log(player: number | null, text: string): void {
    this.state.log.push({ turn: this.state.turnNumber, player, text })
    // Capped as every other table's is: the whole state goes out on every
    // action, and nobody scrolls back two hundred lines.
    if (this.state.log.length > 200) this.state.log.splice(0, this.state.log.length - 200)
  }
}
