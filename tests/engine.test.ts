import { describe, expect, it } from 'vitest'

import { Game } from '../shared/engine'
import { legalPlacements } from '../shared/rules'
import { STARTING_HAND_SIZE, tileFromId } from '../shared/tiles'
import type { Tile } from '../shared/types'

function newGame(playerCount = 2) {
  return new Game(playerCount, { randomHands: true, openInformation: false }, 12345)
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

describe('turn structure', () => {
  it('deals five tiles to each player with random hands', () => {
    const game = newGame(3)
    for (const player of game.state.players) {
      expect(player.hand).toHaveLength(STARTING_HAND_SIZE)
      expect(player.stack).toHaveLength(20 - STARTING_HAND_SIZE)
    }
    expect(game.state.phase).toBe('play')
  })

  it('starts in the draft phase when hands are chosen', () => {
    const game = new Game(2, { randomHands: false, openInformation: false }, 99)
    expect(game.state.phase).toBe('draft')
    expect(game.draftPool(0)).toHaveLength(20)

    const picks = game.draftPool(0).slice(0, STARTING_HAND_SIZE)
    expect(game.submitDraft(0, picks).ok).toBe(true)
    expect(game.state.phase).toBe('draft') // still waiting on player 1
    expect(game.submitDraft(1, game.draftPool(1).slice(0, STARTING_HAND_SIZE)).ok).toBe(true)
    expect(game.state.phase).toBe('play')
  })

  it('rejects a draft that is the wrong size or not your own tiles', () => {
    const game = new Game(2, { randomHands: false, openInformation: false }, 99)
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

  it('refills the hand to five at the end of a turn', () => {
    const game = newGame()
    const tile = findInHand(game, 0, (t) => t.kind === 'caste')!
    game.playTile(0, tile.id, legalPlacements(game.view, tile)[0])
    expect(game.state.players[0].hand).toHaveLength(STARTING_HAND_SIZE - 1)
    game.endTurn(0)
    expect(game.state.players[0].hand).toHaveLength(STARTING_HAND_SIZE)
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

describe('a full game', () => {
  it('reaches a scored result by playing legal moves at random', () => {
    const game = newGame(4)
    let guard = 0

    while (game.state.phase === 'play' && guard++ < 500) {
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

    expect(game.state.phase).toBe('over')
    expect(game.state.result).not.toBeNull()
    expect(game.state.result!.winners.length).toBeGreaterThan(0)

    // Every piece is accounted for: captured, set aside, or still on the board.
    const onBoard = Object.values(game.state.pieces).flat().length
    const captured = game.state.players.reduce((n, p) => n + p.captured.length, 0)
    expect(onBoard + captured + game.state.setAside.length).toBe(39)
  })
})
