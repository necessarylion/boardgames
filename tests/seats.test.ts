import { describe, expect, it } from 'vitest'

import { COLOUR_ORDER } from '../shared/colours'
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
