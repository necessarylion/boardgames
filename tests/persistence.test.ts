import { DEFAULT_OPTIONS } from '../shared/engine'
import { describe, expect, it } from 'vitest'

import { Game } from '../shared/engine'
import { legalPlacements } from '../shared/rules'
import { tileFromId } from '../shared/tiles'
import { Room, type RoomSnapshot } from '../server/rooms'

/** Round-trip through JSON, the way the database column does. */
function reload(room: Room): Room {
  return Room.fromSnapshot(JSON.parse(JSON.stringify(room.toSnapshot())) as RoomSnapshot)
}

/** Play a few legal tiles so the restored game has some history to compare. */
function playSomeTurns(game: Game, turns: number) {
  for (let i = 0; i < turns; i++) {
    const player = game.state.current
    const tileId = game.state.players[player].hand.find((id) => {
      const tile = tileFromId(id)
      if (tile.kind === 'switch' || tile.kind === 'move') return false
      return legalPlacements(game.view, tile).length > 0
    })
    if (tileId) {
      const spaceId = legalPlacements(game.view, tileFromId(tileId))[0]
      expect(game.playTile(player, tileId, spaceId).ok).toBe(true)
    }
    expect(game.endTurn(player).ok).toBe(true)
  }
}

describe('rooms survive a restart', () => {
  it('restores a lobby with its seats, host and settings', () => {
    const room = new Room('LOBY')
    room.options = { ...DEFAULT_OPTIONS, randomHands: true, openInformation: true }
    room.addSeat('token-a', 'Ada')
    room.addSeat('token-b', 'Bo')
    room.members.add('token-a')
    room.members.add('token-b')
    room.hostToken = 'token-b'

    const back = reload(room)

    expect(back.code).toBe('LOBY')
    expect(back.options).toEqual({ ...DEFAULT_OPTIONS, randomHands: true, openInformation: true })
    expect(back.seats.map((s) => s.name)).toEqual(['Ada', 'Bo'])
    expect(back.seats.map((s) => s.colour)).toEqual(room.seats.map((s) => s.colour))
    expect(back.hostToken).toBe('token-b')
    expect([...back.members].sort()).toEqual(['token-a', 'token-b'])
    expect(back.started).toBe(false)
  })

  it('marks everyone as disconnected, since no socket survives a restart', () => {
    const room = new Room('DROP')
    room.addSeat('token-a', 'Ada')
    room.addSeat('token-b', 'Bo')
    expect(room.seats.every((s) => s.connected)).toBe(true)

    expect(reload(room).seats.every((s) => s.connected)).toBe(false)
  })

  it('restores a game in progress move for move', () => {
    const room = new Room('GAME')
    room.options = { ...DEFAULT_OPTIONS, randomHands: true, openInformation: false }
    room.addSeat('token-a', 'Ada')
    room.addSeat('token-b', 'Bo')
    expect(room.start()).toBeNull()
    playSomeTurns(room.game!, 6)

    const back = reload(room)

    expect(back.game).not.toBeNull()
    expect(back.game!.state).toEqual(room.game!.state)
    // Rebuilt, not stored: both are pure functions of the player count.
    expect(back.game!.board).toEqual(room.game!.board)
    expect(back.game!.tiles).toEqual(room.game!.tiles)

    // The view a returning player is sent is the same one they had, bar the
    // connection flags, which only a live socket can set.
    for (const seat of back.seats) seat.connected = true
    expect(back.stateFor('token-a')).toEqual(room.stateFor('token-a'))
  })

  it('keeps playing from where the restored game left off', () => {
    const room = new Room('CONT')
    room.options = { ...DEFAULT_OPTIONS, randomHands: true, openInformation: false }
    room.addSeat('token-a', 'Ada')
    room.addSeat('token-b', 'Bo')
    room.start()
    playSomeTurns(room.game!, 3)

    const back = reload(room)
    playSomeTurns(back.game!, 3)
    playSomeTurns(room.game!, 3)

    expect(back.game!.state).toEqual(room.game!.state)
  })

  it('restores a drafting room without leaking the pool it deals', () => {
    const room = new Room('DRFT')
    room.addSeat('token-a', 'Ada')
    room.addSeat('token-b', 'Bo')
    room.start()
    expect(room.game!.state.phase).toBe('draft')
    const picks = room.game!.draftPool(0).slice(0, 5)
    expect(room.game!.submitDraft(0, picks).ok).toBe(true)

    const back = reload(room)

    expect(back.game!.state.phase).toBe('draft')
    expect(back.game!.draftPool(1)).toEqual(room.game!.draftPool(1))
    expect(back.game!.state.players[0].hand).toEqual(picks)
    // Ada has confirmed, so she is offered nothing further to choose from.
    expect(back.stateFor('token-a').draftPool).toEqual([])
  })
})
