import { describe, expect, it } from 'vitest'

import { DEFAULT_BOARD_SHAPE } from '../shared/board'
import { BOARD_SHAPES, type BoardShape } from '../shared/types'
import { DEFAULT_OPTIONS, Game } from '../shared/engine'
import { legalPlacements } from '../shared/rules'
import { STARTING_HAND_SIZE, tileFromId } from '../shared/tiles'
import type { Tile } from '../shared/types'

/**
 * A game with seat 0 on turn. The opening seat is drawn now, so every test that
 * walks the turn order would otherwise be a coin toss; `the opening seat` covers
 * the draw itself, and `openAt` below covers rounds counted from elsewhere.
 */
function newGame(playerCount = 2, boardShape: BoardShape = DEFAULT_BOARD_SHAPE) {
  return openAt(new Game(playerCount, { ...DEFAULT_OPTIONS, randomHands: true, boardShape }, 12345), 0)
}

/** Force a game to open on a given seat, rounds counted from there. */
function openAt(game: Game, seat: number): Game {
  game.state.first = seat
  game.state.current = seat
  return game
}

/**
 * Plays a whole game with a simple legal-move policy. Returns the game so the
 * caller can assert on how it ended — or that it ended at all.
 */
function playOut(game: Game) {
  let guard = 0
  while (game.state.phase === 'play' && guard++ < 2000) {
    const seat = game.state.current
    const playable = game.state.players[seat].hand
      .map(tileFromId)
      .filter((t) => t.kind !== 'switch' && t.kind !== 'move')
      .filter((t) => t.fast || !game.state.playedNonFast)
      .filter((t) => legalPlacements(game.view, t).length > 0)

    if (playable.length) {
      const tile = playable[0]
      const targets = legalPlacements(game.view, tile)
      game.playTile(seat, tile.id, targets[guard % targets.length])
    }
    if (game.canEndTurn(seat)) game.endTurn(seat)
    else break
  }
  return game
}

/** Play one placeable tile for whoever is on the clock, and end their turn. */
function takeTurn(game: Game): string[] {
  const seat = game.state.current
  const tile = game.state.players[seat].hand
    .map(tileFromId)
    .filter((t) => t.kind !== 'switch' && t.kind !== 'move')
    .find((t) => legalPlacements(game.view, t).length > 0)!
  const space = legalPlacements(game.view, tile)[0]
  expect(game.playTile(seat, tile.id, space).ok).toBe(true)
  expect(game.endTurn(seat).ok).toBe(true)
  return [space]
}

/** First tile in a player's hand matching a predicate. */
function findInHand(game: Game, playerId: number, match: (t: Tile) => boolean): Tile | undefined {
  return game.state.players[playerId].hand.map(tileFromId).find(match)
}

/** Force a specific tile into a player's hand, for deterministic scenarios. */
function stack(game: Game, playerId: number, tile: Tile) {
  const player = game.state.players[playerId]
  if (!player.hand.includes(tile.id)) {
    player.stack = player.stack.filter((id) => id !== tile.id)
    player.hand.push(tile.id)
  }
}

describe('the opening seat', () => {
  it('is drawn rather than handed to the seat that opened the room', () => {
    const counts = [0, 0, 0, 0]
    for (let seed = 1; seed <= 240; seed++) {
      const game = new Game(4, { ...DEFAULT_OPTIONS, randomHands: true }, seed)
      counts[game.state.current]++
      // Rounds are counted from wherever it landed.
      expect(game.state.first).toBe(game.state.current)
    }
    for (const seat of counts) expect(seat).toBeGreaterThan(20)
  })

  it('keeps the roll-off when the dice are on, and drops it when they are off', () => {
    const rolled = new Game(3, { ...DEFAULT_OPTIONS, randomHands: true, diceStart: true }, 7)
    expect(rolled.state.opening).not.toBeNull()
    expect(rolled.state.opening!.winner).toBe(rolled.state.first)

    const quiet = new Game(3, { ...DEFAULT_OPTIONS, randomHands: true, diceStart: false }, 7)
    expect(quiet.state.opening).toBeNull()
    expect([0, 1, 2]).toContain(quiet.state.first)
  })

  it('counts a round from the opening seat, not from seat zero', () => {
    // A table that opens on seat 2 finishes its first round when play returns to
    // seat 2 — counting on a wrap to zero would end it after a single turn.
    const game = openAt(newGame(3), 2)
    expect(game.state.turnNumber).toBe(1)

    const step = () => {
      const seat = game.state.current
      const tile = game.state.players[seat].hand
        .map(tileFromId)
        .find(
          (t) => t.kind !== 'switch' && t.kind !== 'move' && legalPlacements(game.view, t).length > 0,
        )!
      expect(game.playTile(seat, tile.id, legalPlacements(game.view, tile)[0]).ok).toBe(true)
      expect(game.endTurn(seat).ok).toBe(true)
    }

    step() // seat 2 -> 0
    expect(game.state.current).toBe(0)
    expect(game.state.turnNumber).toBe(1)
    step() // 0 -> 1
    expect(game.state.turnNumber).toBe(1)
    step() // 1 -> 2, back to the opener: the round closes
    expect(game.state.current).toBe(2)
    expect(game.state.turnNumber).toBe(2)
  })
})

describe('turn structure', () => {
  it('deals five tiles to each player with random hands', () => {
    const game = newGame(3)
    for (const player of game.state.players) {
      expect(player.hand).toHaveLength(STARTING_HAND_SIZE)
      expect(player.stack).toHaveLength(20 - STARTING_HAND_SIZE)
    }
    expect(game.state.phase).toBe('play')
  })

  it('keeps fast, switch and move tiles out of a random opening hand', () => {
    // Every seed, not just a lucky one: six of the twenty tiles are held back, so
    // a straight deal off the top of the stack turns one up more often than not.
    // Move is the one that is not fast, so it only stays out if it is held back
    // by kind — the case that made this rule wider than the fast flag.
    for (let seed = 1; seed <= 40; seed++) {
      const game = new Game(4, { ...DEFAULT_OPTIONS, randomHands: true }, seed)
      for (const player of game.state.players) {
        const hand = player.hand.map(tileFromId)
        expect(hand.some((t) => t.fast)).toBe(false)
        expect(hand.some((t) => t.kind === 'switch' || t.kind === 'move')).toBe(false)
        // Held back, not removed — they are still there to be drawn later.
        const stack = player.stack.map(tileFromId)
        expect(stack.filter((t) => t.fast)).toHaveLength(5)
        expect(stack.filter((t) => t.kind === 'move')).toHaveLength(1)
      }
    }
  })

  it('starts in the draft phase when hands are chosen', () => {
    const game = new Game(2, { ...DEFAULT_OPTIONS, randomHands: false, openInformation: false }, 99)
    expect(game.state.phase).toBe('draft')
    expect(game.draftPool(0)).toHaveLength(20)

    const picks = game.draftPool(0).slice(0, STARTING_HAND_SIZE)
    expect(game.submitDraft(0, picks).ok).toBe(true)
    expect(game.state.phase).toBe('draft') // still waiting on player 1
    expect(game.submitDraft(1, game.draftPool(1).slice(0, STARTING_HAND_SIZE)).ok).toBe(true)
    expect(game.state.phase).toBe('play')
  })

  it('rejects a draft that is the wrong size or not your own tiles', () => {
    const game = new Game(2, { ...DEFAULT_OPTIONS, randomHands: false, openInformation: false }, 99)
    expect(game.submitDraft(0, game.draftPool(0).slice(0, 4)).ok).toBe(false)
    expect(game.submitDraft(0, game.draftPool(1).slice(0, 5)).ok).toBe(false)
  })

  it('refuses actions from a player whose turn it is not', () => {
    const game = newGame()
    const tile = tileFromId(game.state.players[1].hand[0])
    const space = legalPlacements(game.view, tile)[0]
    const result = game.playTile(1, tile.id, space)
    expect(result).toEqual({ ok: false, error: 'It is not your turn.' })
  })

  it('allows only one non-fast tile but any number of fast tiles', () => {
    const game = newGame()
    const slow = findInHand(game, 0, (t) => !t.fast && t.kind === 'caste')!
    stack(game, 0, slow)
    expect(game.playTile(0, slow.id, legalPlacements(game.view, slow)[0]).ok).toBe(true)

    const another = findInHand(game, 0, (t) => !t.fast && t.kind === 'caste' && t.id !== slow.id)
    if (another) {
      const result = game.playTile(0, another.id, legalPlacements(game.view, another)[0])
      expect(result.ok).toBe(false)
    }

    const fast = tileFromId(
      game.state.players[0].stack.map(tileFromId).find((t) => t.fast && t.kind === 'ronin')!.id,
    )
    stack(game, 0, fast)
    expect(game.playTile(0, fast.id, legalPlacements(game.view, fast)[0]).ok).toBe(true)
  })

  it('will not end a turn before a tile has been placed', () => {
    const game = newGame()
    expect(game.canEndTurn(0)).toBe(false)
    expect(game.endTurn(0).ok).toBe(false)

    const tile = tileFromId(game.state.players[0].hand[0])
    const target = legalPlacements(game.view, tile)[0]
    if (tile.kind === 'caste' || tile.kind === 'samurai' || tile.kind === 'ronin' || tile.kind === 'ship') {
      expect(game.playTile(0, tile.id, target).ok).toBe(true)
      expect(game.canEndTurn(0)).toBe(true)
      expect(game.endTurn(0).ok).toBe(true)
      expect(game.state.current).toBe(1)
    }
  })

  it('keeps the turn’s placements marked once the turn has passed on', () => {
    const game = newGame()
    const tile = findInHand(game, 0, (t) => t.kind === 'caste' && !t.fast)!
    const space = legalPlacements(game.view, tile)[0]
    game.playTile(0, tile.id, space)
    game.endTurn(0)

    expect(game.state.placedThisTurn).toEqual([])
    expect(game.state.lastPlaced).toEqual([space])

    const next = findInHand(game, 1, (t) => t.kind === 'caste' && !t.fast)!
    const nextSpace = legalPlacements(game.view, next).find((id) => id !== space)!
    game.playTile(1, next.id, nextSpace)
    game.endTurn(1)
    expect(game.state.lastPlaced).toEqual([nextSpace])
  })

  it('holds every play for each player until they have had their own turn', () => {
    const game = newGame(4)
    const a = takeTurn(game)
    const b = takeTurn(game)
    const c = takeTurn(game)

    // Seat 3 has been waiting through all three; seat 0 has played since the
    // first of them, so that one is no longer news to them.
    expect(game.state.unseenPlaced[3]).toEqual([...a, ...b, ...c])
    expect(game.state.unseenPlaced[0]).toEqual([...b, ...c])
    expect(game.state.unseenPlaced[2]).toEqual([])

    const d = takeTurn(game)
    expect(game.state.unseenPlaced[3]).toEqual([])
    expect(game.state.unseenPlaced[0]).toEqual([...b, ...c, ...d])
  })

  it('counts a turn that places nothing as having seen the board', () => {
    const game = newGame(3)
    const first = takeTurn(game)
    expect(game.state.unseenPlaced[1]).toEqual(first)

    // Nothing playable is the one way a turn ends without touching the board.
    game.state.players[1].hand = []
    expect(game.canEndTurn(1)).toBe(true)
    expect(game.endTurn(1).ok).toBe(true)

    expect(game.state.unseenPlaced[1]).toEqual([])
    expect(game.state.unseenPlaced[2]).toEqual(first)
  })

  it('passes on the final turn of the game like any other', () => {
    const game = playOut(newGame(3))
    expect(game.state.phase).toBe('over')
    expect(game.state.lastPlaced.length).toBeGreaterThan(0)

    // The game ends before the turn passes on, so `current` is still whoever
    // closed it out.
    const ender = game.state.current
    expect(game.state.unseenPlaced[ender]).toEqual([])
    for (const seat of [0, 1, 2].filter((id) => id !== ender)) {
      expect(game.state.unseenPlaced[seat]).toEqual(expect.arrayContaining(game.state.lastPlaced))
    }
  })

  it('refills the hand to five at the end of a turn', () => {
    const game = newGame()
    const tile = findInHand(game, 0, (t) => t.kind === 'caste')!
    game.playTile(0, tile.id, legalPlacements(game.view, tile)[0])
    expect(game.state.players[0].hand).toHaveLength(STARTING_HAND_SIZE - 1)
    game.endTurn(0)
    expect(game.state.players[0].hand).toHaveLength(STARTING_HAND_SIZE)
  })
})

describe('taking back a placement', () => {
  it('returns the tile to the hand and clears the space', () => {
    const game = newGame()
    const tile = findInHand(game, 0, (t) => t.kind === 'caste' && !t.fast)!
    const space = legalPlacements(game.view, tile)[0]
    const logBefore = game.state.log.length

    game.playTile(0, tile.id, space)
    expect(game.state.placed[space]).toBeDefined()

    expect(game.undoLast(0).ok).toBe(true)
    expect(game.state.placed[space]).toBeUndefined()
    expect(game.state.players[0].hand).toContain(tile.id)
    expect(game.state.placedThisTurn).toEqual([])
    // The placement never happened, so the transcript should not mention it.
    expect(game.state.log).toHaveLength(logBefore)
  })

  it('hands the placement back so another tile can be played instead', () => {
    const game = newGame()
    const first = findInHand(game, 0, (t) => t.kind === 'caste' && !t.fast)!
    game.playTile(0, first.id, legalPlacements(game.view, first)[0])
    expect(game.state.playedNonFast).toBe(true)

    game.undoLast(0)
    expect(game.state.playedNonFast).toBe(false)

    const second = findInHand(game, 0, (t) => t.kind === 'caste' && !t.fast && t.id !== first.id)
    if (second) {
      expect(game.playTile(0, second.id, legalPlacements(game.view, second)[0]).ok).toBe(true)
    }
  })

  it('unwinds a whole turn one tile at a time, newest first', () => {
    const game = newGame()
    const slow = findInHand(game, 0, (t) => t.kind === 'caste' && !t.fast)!
    stack(game, 0, slow)
    game.playTile(0, slow.id, legalPlacements(game.view, slow)[0])

    const fast = tileFromId(
      game.state.players[0].stack.map(tileFromId).find((t) => t.fast && t.kind === 'ronin')!.id,
    )
    stack(game, 0, fast)
    const fastSpace = legalPlacements(game.view, fast)[0]
    game.playTile(0, fast.id, fastSpace)
    expect(game.state.placedThisTurn).toHaveLength(2)

    // Newest first: the fast tile comes back before the one under it.
    game.undoLast(0)
    expect(game.state.placed[fastSpace]).toBeUndefined()
    expect(game.state.playedNonFast).toBe(true)
    expect(game.state.placedThisTurn).toHaveLength(1)

    game.undoLast(0)
    expect(game.state.placedThisTurn).toEqual([])
    expect(game.state.playedNonFast).toBe(false)
    expect(game.undoLast(0).ok).toBe(false)
  })

  it('refuses to reach back past the end of a turn', () => {
    const game = newGame()
    const tile = findInHand(game, 0, (t) => t.kind === 'caste' && !t.fast)!
    const space = legalPlacements(game.view, tile)[0]
    game.playTile(0, tile.id, space)
    game.endTurn(0)

    // Captures have resolved and hands have refilled; the board is committed.
    expect(game.undoLast(1).ok).toBe(false)
    expect(game.state.placed[space]).toBeDefined()
  })

  it('refuses a take-back from a player whose turn it is not', () => {
    const game = newGame()
    const tile = findInHand(game, 0, (t) => t.kind === 'caste' && !t.fast)!
    game.playTile(0, tile.id, legalPlacements(game.view, tile)[0])
    expect(game.undoLast(1).ok).toBe(false)
    expect(game.state.placedThisTurn).toHaveLength(1)
  })
})

describe('the move tile', () => {
  it('relocates an earlier tile and leaves the move tile behind', () => {
    const game = newGame()
    const caste = findInHand(game, 0, (t) => t.kind === 'caste')!
    const from = legalPlacements(game.view, caste)[0]
    game.playTile(0, caste.id, from)
    game.endTurn(0)

    // Player 1 plays something so the turn comes back around.
    const theirs = findInHand(game, 1, (t) => t.kind === 'caste')!
    game.playTile(1, theirs.id, legalPlacements(game.view, theirs)[0])
    game.endTurn(1)

    const move = tileFromId(
      [...game.state.players[0].hand, ...game.state.players[0].stack]
        .map(tileFromId)
        .find((t) => t.kind === 'move')!.id,
    )
    stack(game, 0, move)

    const to = game.board.order.find(
      (id) => game.board.spaces[id].kind === 'land' && !(id in game.state.placed),
    )!
    expect(game.useMove(0, move.id, from, to).ok).toBe(true)
    expect(game.state.placed[to].tileId).toBe(caste.id)
    expect(game.state.placed[from].tileId).toBe(move.id)

    // Taking it back must send the relocated tile home and lift the move tile,
    // not merely clear the destination — this is the one action that touches
    // two spaces at once.
    expect(game.undoLast(0).ok).toBe(true)
    expect(game.state.placed[from].tileId).toBe(caste.id)
    expect(game.state.placed[to]).toBeUndefined()
    expect(game.state.players[0].hand).toContain(move.id)
    expect(game.state.playedNonFast).toBe(false)
  })

  it('will not relocate a tile placed on the same turn', () => {
    const game = newGame()
    const caste = findInHand(game, 0, (t) => t.kind === 'caste')!
    const from = legalPlacements(game.view, caste)[0]
    game.playTile(0, caste.id, from)

    const move = tileFromId(
      [...game.state.players[0].hand, ...game.state.players[0].stack]
        .map(tileFromId)
        .find((t) => t.kind === 'move')!.id,
    )
    stack(game, 0, move)
    const to = game.board.order.find(
      (id) => game.board.spaces[id].kind === 'land' && !(id in game.state.placed),
    )!
    expect(game.useMove(0, move.id, from, to).ok).toBe(false)
  })
})

describe('the switch tile', () => {
  /** Two villages holding different castes — always a legal swap. */
  function twoVillages(game: Game) {
    const villages = game.board.order
      .map((id) => game.board.spaces[id])
      .filter((s) => s.settlement === 'village')
    const first = villages.find((s) => game.state.pieces[s.id]?.length === 1)!
    const second = villages.find(
      (s) => s.id !== first.id && game.state.pieces[s.id]?.[0] !== game.state.pieces[first.id][0],
    )!
    return [first.id, second.id]
  }

  it('swaps two pieces without using up the turn\'s placement', () => {
    const game = newGame()
    const [a, b] = twoVillages(game)
    const before = [game.state.pieces[a][0], game.state.pieces[b][0]]

    const switchTile = tileFromId(
      [...game.state.players[0].hand, ...game.state.players[0].stack]
        .map(tileFromId)
        .find((t) => t.kind === 'switch')!.id,
    )
    stack(game, 0, switchTile)

    expect(game.useSwitch(0, switchTile.id, { spaceId: a, index: 0 }, { spaceId: b, index: 0 }).ok)
      .toBe(true)
    expect([game.state.pieces[a][0], game.state.pieces[b][0]]).toEqual([before[1], before[0]])

    // The switch tile is discarded, never placed, and a tile is still owed.
    expect(game.state.players[0].hand).not.toContain(switchTile.id)
    expect(Object.values(game.state.placed)).toHaveLength(0)
    expect(game.state.playedNonFast).toBe(false)
    expect(game.canEndTurn(0)).toBe(false)

    const caste = findInHand(game, 0, (t) => t.kind === 'caste')!
    expect(game.playTile(0, caste.id, legalPlacements(game.view, caste)[0]).ok).toBe(true)
    expect(game.canEndTurn(0)).toBe(true)
  })

  it('refuses a swap that would duplicate a caste on a settlement', () => {
    const game = newGame()
    const edo = game.board.order.find((id) => game.board.spaces[id].settlement === 'edo')!
    const village = game.board.order.find(
      (id) =>
        game.board.spaces[id].settlement === 'village' &&
        game.state.pieces[id][0] !== game.state.pieces[edo][0],
    )!

    const switchTile = tileFromId(
      [...game.state.players[0].hand, ...game.state.players[0].stack]
        .map(tileFromId)
        .find((t) => t.kind === 'switch')!.id,
    )
    stack(game, 0, switchTile)

    // Edo already holds one of every caste, so any swap into it duplicates.
    const result = game.useSwitch(
      0,
      switchTile.id,
      { spaceId: edo, index: 0 },
      { spaceId: village, index: 0 },
    )
    expect(result.ok).toBe(false)
    expect(game.state.players[0].hand).toContain(switchTile.id)
  })
})

describe('running out of time', () => {
  it('plays one tile on an empty space and passes the turn on', () => {
    const game = newGame(2)
    const hand = game.state.players[0].hand.length

    const result = game.timeOut(0)

    expect(result.ok).toBe(true)
    expect(Object.keys(game.state.placed)).toHaveLength(1)
    expect(game.state.current).toBe(1)
    // One tile left the hand, and the draw at the end of the turn refilled it.
    expect(game.state.players[0].hand).toHaveLength(hand)
    expect(game.state.players[0].stack).toHaveLength(20 - hand - 1)
  })

  it('leaves a placement already made alone and just ends the turn', () => {
    const game = newGame(2)
    const tile = findInHand(game, 0, (t) => t.kind === 'caste' && !t.fast)!
    game.playTile(0, tile.id, legalPlacements(game.view, tile)[0])

    game.timeOut(0)

    // The clock fills a gap; it does not play a second tile on top of a turn
    // the player had already taken.
    expect(Object.keys(game.state.placed)).toHaveLength(1)
    expect(game.state.current).toBe(1)
  })

  it('resolves the same way twice from the same state', () => {
    const a = newGame(3)
    const b = newGame(3)
    a.timeOut(0)
    b.timeOut(0)
    expect(a.state.placed).toEqual(b.state.placed)
  })

  it('refuses when it is not that player on the clock', () => {
    const game = newGame(2)
    expect(game.timeOut(1).ok).toBe(false)
    expect(Object.keys(game.state.placed)).toHaveLength(0)
  })

  it('carries a game to its end when nobody ever plays', () => {
    const game = newGame(2)
    let guard = 0
    while (game.state.phase === 'play' && guard++ < 2000) {
      const outcome = game.timeOut(game.state.current)
      expect(outcome.ok, `stalled on turn ${game.state.turnNumber}`).toBe(true)
    }
    expect(game.state.phase).toBe('over')
  })
})

describe('a full game', () => {
  // A game can only end by clearing a caste or setting enough pieces aside, so a
  // map with more open land than the players have tiles to fill it would leave
  // everyone stuck mid-game. Every shape a table can pick has to finish, at every
  // size — the outer sections D and E have no printed board to have been proven
  // on, so this is what stands in for that.
  it.each(BOARD_SHAPES.flatMap((shape) => [2, 3, 4, 5, 6].map((n) => [shape, n] as const)))(
    'finishes on %s at %i players',
    (shape, count) => {
      const game = playOut(newGame(count, shape))
      expect(game.state.phase, `stuck after ${game.state.turnNumber} rounds`).toBe('over')
      expect(game.state.result).not.toBeNull()
    },
  )

  it('reaches a scored result by playing legal moves at random', () => {
    const game = playOut(newGame(4))

    expect(game.state.phase).toBe('over')
    expect(game.state.result).not.toBeNull()
    expect(game.state.result!.winners.length).toBeGreaterThan(0)

    // Every piece is accounted for: captured, set aside, or still on the board.
    const onBoard = Object.values(game.state.pieces).flat().length
    const captured = game.state.players.reduce((n, p) => n + p.captured.length, 0)
    expect(onBoard + captured + game.state.setAside.length).toBe(39)
  })
})

describe('pausing the table', () => {
  it('blocks every action while paused, whoever is on the clock', () => {
    const game = newGame()
    // A player who is not the current one can still pause the table.
    expect(game.pause(1).ok).toBe(true)
    expect(game.state.paused).toBe(true)

    const tile = findInHand(game, 0, (t) => t.kind === 'caste' && !t.fast)!
    const space = legalPlacements(game.view, tile)[0]
    expect(game.playTile(0, tile.id, space)).toEqual({ ok: false, error: 'The game is paused.' })
    expect(game.endTurn(0).ok).toBe(false)

    // Pausing again is refused; resuming reopens the board.
    expect(game.pause(0).ok).toBe(false)
    expect(game.resume(0).ok).toBe(true)
    expect(game.state.paused).toBe(false)
    expect(game.playTile(0, tile.id, space).ok).toBe(true)
  })

  it('cannot be paused before the game is under way', () => {
    const drafting = new Game(2, { ...DEFAULT_OPTIONS, randomHands: false }, 5)
    expect(drafting.state.phase).toBe('draft')
    expect(drafting.pause(0).ok).toBe(false)
    expect(drafting.resume(0).ok).toBe(false)
  })
})

describe('redrawing a hand', () => {
  it('is withheld in the opening round', () => {
    const game = newGame()
    expect(game.state.turnNumber).toBe(1)
    expect(game.canRedraw(0)).toBe(false)
    expect(game.redrawHand(0).ok).toBe(false)
  })

  it('trades the whole hand for a fresh draw without ending the turn, from round two', () => {
    const game = newGame()
    takeTurn(game) // seat 0
    takeTurn(game) // seat 1 — play comes back to seat 0 in round two
    expect(game.state.turnNumber).toBe(2)
    expect(game.state.current).toBe(0)
    expect(game.canRedraw(0)).toBe(true)

    const poolSize = game.state.players[0].hand.length + game.state.players[0].stack.length
    expect(game.redrawHand(0).ok).toBe(true)

    // Still seat 0's turn, and the pool is conserved: a redraw hands out no more
    // tiles than a normal refill would.
    expect(game.state.current).toBe(0)
    const after = game.state.players[0].hand
    expect(after).toHaveLength(Math.min(STARTING_HAND_SIZE, poolSize))
    expect(after.length + game.state.players[0].stack.length).toBe(poolSize)

    // Only once a turn — and the player still takes their turn as normal.
    expect(game.canRedraw(0)).toBe(false)
    expect(game.redrawHand(0).ok).toBe(false)
    const tile = findInHand(game, 0, (t) => t.kind === 'caste' && !t.fast)!
    expect(game.playTile(0, tile.id, legalPlacements(game.view, tile)[0]).ok).toBe(true)
    expect(game.endTurn(0).ok).toBe(true)

    // The allowance comes back on the next turn.
    takeTurn(game) // seat 1
    expect(game.state.current).toBe(0)
    expect(game.canRedraw(0)).toBe(true)
  })

  it('refuses once a tile has been placed this turn', () => {
    const game = newGame()
    takeTurn(game)
    takeTurn(game)
    const tile = findInHand(game, 0, (t) => t.kind === 'caste' && !t.fast)!
    expect(game.playTile(0, tile.id, legalPlacements(game.view, tile)[0]).ok).toBe(true)
    expect(game.canRedraw(0)).toBe(false)
    expect(game.redrawHand(0).ok).toBe(false)
  })
})
