import { describe, expect, it } from 'vitest'

import { COLOUR_ORDER } from '../shared/colours'
import { DEFAULT_OPTIONS } from '../shared/engine'
import { Room } from '../server/rooms'
import { MAX_PLAYERS } from '../shared/types'

/** A full table, seated in order. */
function fullRoom(code: string) {
  const room = new Room(code)
  for (let i = 0; i < MAX_PLAYERS; i++) room.addSeat(`token-${i}`, `Player ${i}`)
  return room
}

describe('seat colours', () => {
  it('gives every player at a table a colour of their own', () => {
    const room = fullRoom('FULL')
    const colours = room.seats.map((s) => s.colour)

    expect(new Set(colours).size).toBe(MAX_PLAYERS)
    expect([...colours].sort()).toEqual([...COLOUR_ORDER].sort())
  })

  it('does not deal the same colour first at every table', () => {
    const first = Array.from({ length: 24 }, (_, i) => {
      const room = new Room(`R${i}`)
      room.addSeat('token-a', 'Ada')
      return room.seats[0].colour
    })

    // The host was gold at every table before the palette was shuffled. With
    // six colours over two dozen tables, one repeated colour throughout would
    // mean the shuffle is not running at all.
    expect(new Set(first).size).toBeGreaterThan(1)
  })

  it('keeps to the same palette when a seat opens up', () => {
    const room = fullRoom('LEAV')
    const palette = [...room.colours]

    room.removeSeat('token-2')

    expect(room.seats.map((s) => s.colour)).toEqual(palette.slice(0, MAX_PLAYERS - 1))
    expect(new Set(room.seats.map((s) => s.colour)).size).toBe(MAX_PLAYERS - 1)
  })

  it('leaves colours where they are when a game is abandoned', () => {
    const room = fullRoom('KEEP')
    room.start()
    const before = room.seats.map((s) => s.colour)

    room.abandon()

    expect(room.seats.map((s) => s.colour)).toEqual(before)
  })
})

describe('team play', () => {
  function teamRoom(seatCount: number, teams: number) {
    const room = new Room('TEAM')
    for (let i = 0; i < seatCount; i++) room.addSeat(`token-${i}`, `P${i}`)
    room.options = { ...DEFAULT_OPTIONS, randomHands: true, teams }
    return room
  }

  it('only starts a split that divides the table into equal sides', () => {
    expect(teamRoom(3, 2).start()).not.toBeNull() // three into two is uneven
    expect(teamRoom(5, 2).start()).not.toBeNull()
    expect(teamRoom(6, 4).start()).not.toBeNull() // four sides of one and a half
    expect(teamRoom(4, 2).start()).toBeNull() // 2 v 2
    expect(teamRoom(6, 2).start()).toBeNull() // 3 v 3
    expect(teamRoom(6, 3).start()).toBeNull() // 2 v 2 v 2
  })

  it('opens captured pieces to teammates but not to opponents', () => {
    const room = teamRoom(4, 2)
    expect(room.start()).toBeNull()
    // Seats 0 and 2 are one side; 1 and 3 the other.
    room.game!.state.players[2].captured.push('buddha')
    for (const seat of room.seats) seat.connected = true

    const view = room.stateFor('token-0')
    expect(view.players.find((p) => p.id === 2)!.captured).toEqual(['buddha'])
    expect(view.players.find((p) => p.id === 1)!.captured).toBeNull()
  })

  it('splits six into three sides of two when asked', () => {
    const room = teamRoom(6, 3)
    expect(room.start()).toBeNull()
    // Seats 0 and 3 share a side; seat 1 is on another.
    room.game!.state.players[3].captured.push('rice')
    for (const seat of room.seats) seat.connected = true

    const view = room.stateFor('token-0')
    expect(view.players.find((p) => p.id === 3)!.captured).toEqual(['rice'])
    expect(view.players.find((p) => p.id === 1)!.captured).toBeNull()
  })
})
