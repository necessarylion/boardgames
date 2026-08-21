import { describe, expect, it } from 'vitest'

import {
  COUNTDOWN_TICKS,
  SnakeGame,
  boardFor,
  foodTarget,
  type Cell,
  type SnakeGameState,
} from '../shared/snake'

/** A dealt game with the countdown already run down, so snakes move at once. */
function started(playerCount = 2, seed = 7): SnakeGame {
  const game = new SnakeGame(playerCount, seed)
  game.state.countdown = 0
  return game
}

const head = (game: SnakeGame, id: number): Cell => game.state.players[id].body[0]

/** Pin both snakes to known cells, so collisions can be arranged exactly. */
function surgery(game: SnakeGame, bodies: { body: Cell[]; dir: 'up' | 'down' | 'left' | 'right' }[]) {
  bodies.forEach((b, id) => {
    game.state.players[id].body = b.body.map((c) => [...c] as Cell)
    game.state.players[id].dir = b.dir
    game.state.players[id].pending = []
    game.state.players[id].length = b.body.length
  })
  // Off the snakes' paths, so nothing grows mid-scenario by accident.
  game.state.food = [[0, 0]]
}

describe('dealing', () => {
  it('spawns three-segment snakes on a sized board with apples, at every count', () => {
    for (let n = 2; n <= 8; n++) {
      const game = new SnakeGame(n, 1)
      const s = game.state
      expect({ w: s.gridW, h: s.gridH }).toEqual(boardFor(n))
      expect(s.gridW).toBeGreaterThan(s.gridH)
      expect(s.players).toHaveLength(n)
      expect(s.countdown).toBe(COUNTDOWN_TICKS)
      const seen = new Set<string>()
      for (const p of s.players) {
        expect(p.body).toHaveLength(3)
        for (const [x, y] of p.body) {
          expect(x).toBeGreaterThanOrEqual(0)
          expect(y).toBeGreaterThanOrEqual(0)
          expect(x).toBeLessThan(s.gridW)
          expect(y).toBeLessThan(s.gridH)
          expect(seen.has(`${x},${y}`)).toBe(false)
          seen.add(`${x},${y}`)
        }
      }
      expect(s.food).toHaveLength(foodTarget(n))
      for (const cell of s.food) expect(seen.has(`${cell[0]},${cell[1]}`)).toBe(false)
    }
  })
})

describe('frames', () => {
  it('holds every snake still through the countdown', () => {
    const game = new SnakeGame(2, 7)
    const before = game.state.players.map((p) => [...p.body[0]])
    game.tick()
    expect(game.state.countdown).toBe(COUNTDOWN_TICKS - 1)
    game.state.players.forEach((p, i) => expect(p.body[0]).toEqual(before[i]))
  })

  it('moves each snake one cell per frame along its heading', () => {
    const game = started()
    surgery(game, [
      { body: [[5, 5], [4, 5], [3, 5]], dir: 'right' },
      { body: [[15, 15], [14, 15], [13, 15]], dir: 'right' },
    ])
    game.tick()
    expect(head(game, 0)).toEqual([6, 5])
    expect(game.state.players[0].body).toHaveLength(3)
  })

  it('queues a turn and quietly ignores a reversal', () => {
    const game = started()
    surgery(game, [
      { body: [[5, 5], [4, 5], [3, 5]], dir: 'right' },
      { body: [[15, 15], [14, 15], [13, 15]], dir: 'right' },
    ])
    expect(game.setDirection(0, 'left').ok).toBe(true)
    game.tick()
    // Still heading right: the reversal was dropped, not queued.
    expect(head(game, 0)).toEqual([6, 5])
    expect(game.setDirection(0, 'up').ok).toBe(true)
    game.tick()
    expect(head(game, 0)).toEqual([6, 4])
  })

  it('does not tick while paused', () => {
    const game = started()
    const before = game.state.players.map((p) => [...p.body[0]])
    expect(game.pause(0).ok).toBe(true)
    game.tick()
    game.state.players.forEach((p, i) => expect(p.body[0]).toEqual(before[i]))
    expect(game.resume(1).ok).toBe(true)
    game.tick()
    expect(game.state.players[0].body[0]).not.toEqual(before[0])
  })
})

describe('eating', () => {
  it('an apple grows the snake by two over the next frames and scores it', () => {
    const game = started()
    surgery(game, [
      { body: [[5, 5], [4, 5], [3, 5]], dir: 'right' },
      { body: [[15, 15], [14, 15], [13, 15]], dir: 'right' },
    ])
    game.state.food = [[6, 5]]
    game.tick()
    expect(game.state.players[0].apples).toBe(1)
    expect(game.state.players[0].body).toHaveLength(4)
    game.tick()
    expect(game.state.players[0].body).toHaveLength(5)
    game.tick()
    expect(game.state.players[0].body).toHaveLength(5)
    // The board was topped back up to its apple count.
    expect(game.state.food).toHaveLength(foodTarget(2))
  })
})

describe('crashing', () => {
  it('a snake that meets the wall crashes out and the last one slithering wins', () => {
    const game = started()
    surgery(game, [
      { body: [[0, 5], [1, 5], [2, 5]], dir: 'left' },
      { body: [[15, 15], [14, 15], [13, 15]], dir: 'right' },
    ])
    game.tick()
    const crashed = game.state.players[0]
    expect(crashed.alive).toBe(false)
    expect(crashed.body).toHaveLength(0)
    expect(crashed.length).toBe(3)
    expect(game.state.phase).toBe('over')
    expect(game.state.result).toEqual({ winner: 1, reason: 'last snake slithering' })
  })

  it('running into a body crashes the runner', () => {
    const game = started(3)
    surgery(game, [
      { body: [[9, 5], [8, 5], [7, 5]], dir: 'right' },
      { body: [[10, 7], [10, 6], [10, 5], [10, 4]], dir: 'down' },
      { body: [[15, 15], [14, 15], [13, 15]], dir: 'right' },
    ])
    game.tick()
    // Snake 0 drove into [10, 5] — the middle of snake 1's body, not its tail.
    expect(game.state.players[0].alive).toBe(false)
    expect(game.state.players[1].alive).toBe(true)
    expect(game.state.phase).toBe('play')
  })

  it('two heads meeting on one cell crash both, and the longer takes the game', () => {
    const game = started()
    surgery(game, [
      { body: [[5, 5], [4, 5], [3, 5], [2, 5]], dir: 'right' },
      { body: [[7, 5], [8, 5], [9, 5]], dir: 'left' },
    ])
    game.tick()
    expect(game.state.players[0].alive).toBe(false)
    expect(game.state.players[1].alive).toBe(false)
    expect(game.state.phase).toBe('over')
    expect(game.state.result?.winner).toBe(0)
  })

  it('trading cells head-on crashes both, level lengths drawing the game', () => {
    const game = started()
    surgery(game, [
      { body: [[5, 5], [4, 5], [3, 5]], dir: 'right' },
      { body: [[6, 5], [7, 5], [8, 5]], dir: 'left' },
    ])
    game.tick()
    expect(game.state.phase).toBe('over')
    expect(game.state.result).toEqual({ winner: null, reason: 'crashed level' })
  })

  it('a cell a tail is vacating this frame is safe to enter', () => {
    const game = started()
    surgery(game, [
      { body: [[9, 3], [8, 3], [7, 3]], dir: 'right' },
      { body: [[10, 5], [10, 4], [10, 3]], dir: 'down' },
    ])
    game.tick()
    expect(head(game, 0)).toEqual([10, 3])
    expect(game.state.players[0].alive).toBe(true)
    expect(game.state.players[1].alive).toBe(true)
  })

  it('refuses steering for a crashed snake', () => {
    const game = started(3)
    surgery(game, [
      { body: [[0, 5], [1, 5], [2, 5]], dir: 'left' },
      { body: [[15, 15], [14, 15], [13, 15]], dir: 'right' },
      { body: [[15, 10], [14, 10], [13, 10]], dir: 'right' },
    ])
    game.tick()
    expect(game.setDirection(0, 'up').ok).toBe(false)
  })
})

describe('restoring', () => {
  it('is rebuilt intact by fromState and plays on identically', () => {
    const game = started(4, 99)
    game.tick()
    game.setDirection(0, 'up')
    const copy = SnakeGame.fromState(
      JSON.parse(JSON.stringify(game.state)) as SnakeGameState,
    )
    game.tick()
    copy.tick()
    expect(copy.state).toEqual(game.state)
  })
})
