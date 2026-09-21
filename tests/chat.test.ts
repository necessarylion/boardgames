import { describe, expect, it } from 'vitest'

import { Room } from '../server/rooms'
import { CHAT_KEEP, CHAT_MAX, sanitiseChat } from '../shared/chat'
import { DEFAULT_OPTIONS } from '../shared/engine'
import type { MonopolyClientState } from '../shared/protocol'

/**
 * Table talk, which is the one thing in the app a player types rather than
 * clicks — so it is the one thing that has to be cleaned on the way in, kept to
 * the room it was said in, and refused to anyone who is not at that table.
 */
const view = (r: Room, token: string): MonopolyClientState =>
  r['stateFor'](token) as MonopolyClientState

function room(names = ['Ada', 'Bo']) {
  const r = new Room('TALK')
  r.options = { ...DEFAULT_OPTIONS, kind: 'monopoly' }
  names.forEach((name, i) => r.addSeat(`token-${i}`, name))
  return r
}

/** Only what somebody typed, in order. */
const said = (r: Room) => r.chat.filter((e) => e.kind === 'said').map((e) => e.text)

describe('sanitising a message', () => {
  it('keeps ordinary text exactly as it was typed', () => {
    expect(sanitiseChat('Trade you Orange for two stations?')).toBe(
      'Trade you Orange for two stations?',
    )
  })

  it('leaves angle brackets alone, because the escaping is the renderer’s job', () => {
    // Deliberately not stripped: "5 < 6" is a thing a person types, and every
    // client renders a message as text rather than as markup.
    expect(sanitiseChat('5 < 6 & 7 > 6')).toBe('5 < 6 & 7 > 6')
    expect(sanitiseChat('<script>alert(1)</script>')).toBe('<script>alert(1)</script>')
  })

  it('flattens newlines, so one message cannot become ten lines', () => {
    expect(sanitiseChat('one\n\n\ntwo')).toBe('one two')
    expect(sanitiseChat('tab\there')).toBe('tab here')
  })

  it('drops the characters that hide or reorder what is written', () => {
    // A right-to-left override can make a string render backwards.
    expect(sanitiseChat(`bad${String.fromCharCode(0x202e)}word`)).toBe('badword')
    expect(sanitiseChat(`zero${String.fromCharCode(0x200b)}width`)).toBe('zerowidth')
  })

  it('trims, and holds the line to its limit', () => {
    expect(sanitiseChat('   spaced   ')).toBe('spaced')
    expect(sanitiseChat('x'.repeat(CHAT_MAX + 50))).toHaveLength(CHAT_MAX)
  })

  it('answers with nothing for anything that was never a message', () => {
    for (const junk of [undefined, null, 42, {}, '', '   ', '\n\n']) {
      expect(sanitiseChat(junk)).toBe('')
    }
  })
})

describe('a room’s talk', () => {
  it('records who said it, in their colour, stamped by the server', () => {
    const r = room()
    const before = Date.now()
    expect(r.say('token-1', 'Hello table')).toBeNull()

    const entry = r.chat.at(-1)!
    expect(entry.kind).toBe('said')
    expect(entry.text).toBe('Hello table')
    expect(entry.name).toBe('Bo')
    expect(entry.seat).toBe(1)
    expect(entry.colour).toBe(r.seats[1].colour)
    expect(entry.at).toBeGreaterThanOrEqual(before)
  })

  it('refuses a message from someone with no seat at the table', () => {
    const r = room()
    expect(r.say('a-stranger', 'let me in')).toMatch(/no seat/i)
    expect(said(r)).toEqual([])
  })

  it('refuses a message that is empty once it has been cleaned', () => {
    const r = room()
    expect(r.say('token-0', '   ')).toMatch(/nothing to send/i)
    expect(r.say('token-0', String.fromCharCode(0x200b))).toMatch(/nothing to send/i)
    expect(said(r)).toEqual([])
  })

  it('cleans on the way in, not on the way out', () => {
    const r = room()
    r.say('token-0', 'line one\nline two')
    expect(said(r)).toEqual(['line one line two'])
  })

  it('gives every line an id of its own, even after the old ones are dropped', () => {
    const r = room()
    for (let i = 0; i < CHAT_KEEP + 20; i++) r.say('token-0', `message ${i}`)

    expect(r.chat).toHaveLength(CHAT_KEEP)
    // The oldest have gone and the newest are all still there.
    expect(r.chat.at(-1)!.text).toBe(`message ${CHAT_KEEP + 19}`)
    expect(new Set(r.chat.map((e) => e.id)).size).toBe(CHAT_KEEP)
  })
})

describe('what the room says for itself', () => {
  it('notes each player as they take a seat', () => {
    const r = room()
    expect(r.chat.map((e) => [e.kind, e.name])).toEqual([
      ['joined', 'Ada'],
      ['joined', 'Bo'],
    ])
  })

  it('notes a player leaving before the game, and going away during it', () => {
    const r = room()
    r.removeSeat('token-1')
    expect(r.chat.at(-1)!.kind).toBe('left')
    expect(r.chat.at(-1)!.name).toBe('Bo')

    const playing = room()
    expect(playing.start()).toBeNull()
    playing.removeSeat('token-1')
    // Mid-game the seat is kept, so the player is away rather than gone.
    expect(playing.chat.at(-1)!.kind).toBe('away')
  })

  it('carries no text on a system line — each client words it itself', () => {
    const r = room()
    expect(r.chat.every((e) => e.text === '')).toBe(true)
  })
})

describe('who may read it', () => {
  it('sends the talk to a player at the table', () => {
    const r = room()
    r.say('token-0', 'mine to read')
    expect(view(r, 'token-0').chat.map((e) => e.text)).toContain('mine to read')
  })

  it('sends a spectator none of it', () => {
    const r = room()
    r.say('token-0', 'members only')
    const watcher = view(r, 'not-a-member')
    expect(watcher.you).toBeNull()
    expect(watcher.chat).toEqual([])
  })

  it('never carries one room’s talk into another', () => {
    const here = room()
    const there = new Room('ELSE')
    there.options = { ...DEFAULT_OPTIONS, kind: 'monopoly' }
    there.addSeat('token-0', 'Ada elsewhere')

    here.say('token-0', 'said in TALK')
    there.say('token-0', 'said in ELSE')

    // The same token sits at both, which is the case most likely to leak.
    expect(view(here, 'token-0').chat.map((e) => e.text)).toContain('said in TALK')
    expect(view(here, 'token-0').chat.map((e) => e.text)).not.toContain('said in ELSE')
    expect(view(there, 'token-0').chat.map((e) => e.text)).not.toContain('said in TALK')
  })
})

describe('across a reconnection', () => {
  it('keeps what was said while a player was away', () => {
    const r = room()
    expect(r.start()).toBeNull()
    r.say('token-0', 'before the drop')

    // The seat is kept and marked away; the talk is the room's, not the socket's.
    r.seats[1].connected = false
    r.say('token-0', 'while they were away')
    r.seats[1].connected = true

    expect(view(r, 'token-1').chat.map((e) => e.text)).toEqual(
      expect.arrayContaining(['before the drop', 'while they were away']),
    )
  })

  it('survives the room being written out and read back', () => {
    const r = room()
    r.say('token-0', 'remember me')
    const back = Room.fromSnapshot(JSON.parse(JSON.stringify(r.toSnapshot())))

    expect(said(back)).toEqual(['remember me'])
    // Ids carry on from where they left off rather than colliding.
    back.say('token-0', 'and me')
    expect(new Set(back.chat.map((e) => e.id)).size).toBe(back.chat.length)
  })
})

/**
 * Two things that only go wrong after a room has been talking for a while, and
 * so are easy to miss: the list stops growing, and the seating shifts under it.
 */
describe('a room that has been talking a long time', () => {
  it('goes on moving the newest id after the list itself is full', () => {
    const r = room()
    for (let i = 0; i < CHAT_KEEP + 10; i++) r.say('token-0', `message ${i}`)

    const full = r.chat.length
    const mark = r.chat.at(-1)!.id
    r.say('token-1', 'and one more')

    // The length is pinned at the cap, so nothing on the client may key on it:
    // a feed that did would stop following, and an unread badge would go quiet
    // for the rest of the game.
    expect(r.chat).toHaveLength(full)
    expect(r.chat.at(-1)!.id, 'the id is what moves').toBe(mark + 1)
    expect(r.chat.at(-1)!.text).toBe('and one more')
  })

  it('carries who said what across a change of seating', () => {
    const r = room(['Ada', 'Bo', 'Cy'])
    r.say('token-2', 'mine, whatever seat I end up in')
    const said = r.chat.at(-1)!
    expect(said.seat).toBe(2)

    // Ada leaves the lobby, so Bo and Cy are renumbered beneath the message.
    r.removeSeat('token-0')
    const cy = r.seats.find((s) => s.token === 'token-2')!
    expect(cy.id, 'Cy moved up').toBe(1)
    expect(said.seat, 'and the message moved with them').toBe(cy.id)
  })

  it('follows a speaker when the deal reorders the table by position', () => {
    const r = room(['Ada', 'Bo', 'Cy'])
    r.say('token-2', 'I asked to go first')
    const said = r.chat.at(-1)!

    expect(r.setPosition('token-0', 4)).toBeNull()
    expect(r.setPosition('token-2', 1)).toBeNull()
    expect(r.start()).toBeNull()

    const cy = r.seats.find((s) => s.token === 'token-2')!
    expect(cy.id, 'Cy chose to be dealt first').toBe(0)
    expect(said.seat).toBe(cy.id)
  })

  it('points a departed speaker at nobody rather than at their successor', () => {
    const r = room(['Ada', 'Bo', 'Cy'])
    r.say('token-0', 'goodbye')
    const said = r.chat.at(-1)!
    expect(said.seat).toBe(0)

    r.removeSeat('token-0')
    // Seat 0 belongs to Bo now; the line must not become Bo's.
    expect(r.seats[0].name).toBe('Bo')
    expect(said.seat, 'nobody').toBe(-1)
    expect(said.name, 'though it still says who wrote it').toBe('Ada')
  })
})
