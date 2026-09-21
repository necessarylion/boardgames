// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'

import LobbyScreen from '../src/components/samurai/LobbyScreen.vue'
import MonopolyLobby from '../src/components/monopoly/MonopolyLobby.vue'
import StartScreen from '../src/components/common/StartScreen.vue'
import { Room } from '../server/rooms'
import { COLOUR_ORDER, PLAYER_COLOURS } from '../shared/colours'
import { DEFAULT_OPTIONS } from '../shared/engine'
import type { ClientState, MonopolyClientState } from '../shared/protocol'
import { MAX_POSITIONS, maxPlayersFor, type GameKind } from '../shared/types'
import { useGameStore } from '../src/stores/game'

/**
 * The room flow, which is the one part of the app that is the same for every
 * game: host or join, then a lobby where the host picks what to play and every
 * player picks their own colour.
 *
 * These drive a real `Room` through the real server code and render the state
 * it hands back, so a rule the server enforces and the screen contradicts shows
 * up here rather than in front of four people waiting to start.
 */
const sfor = (r: Room, token: string): ClientState => r['stateFor'](token) as ClientState
const mfor = (r: Room, token: string): MonopolyClientState =>
  r['stateFor'](token) as MonopolyClientState

function lobby(names = ['Takeda', 'Uesugi', 'Mori'], kind: GameKind = 'samurai') {
  const r = new Room('TEST')
  // Before the seats: a room only opens as many as the game it is pointed at
  // can hold, so a seventh player has to be seated at a game that seats seven.
  r.options = { ...DEFAULT_OPTIONS, kind }
  names.forEach((name, i) => r.addSeat(`token-${i}`, name))
  return r
}

/** Seat this browser at `token`, with the room's state as that seat sees it. */
function seatAs(r: Room, token: string) {
  const game = useGameStore()
  game.state = sfor(r, token)
  return game
}

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
  window.innerWidth = 1200
})

describe('the front door', () => {
  it('asks for a name and a room, and never for a game', () => {
    const wrapper = mount(StartScreen)
    expect(wrapper.text()).toContain('Create a room or join your friends')
    expect(wrapper.find('#player-name').exists()).toBe(true)
    expect(wrapper.find('.btn.primary').text()).toBe('Create room')
    expect(wrapper.find('#room-code').exists()).toBe(true)

    // Nothing here names a game or offers one: that is the lobby's business.
    expect(wrapper.findAll('.game-option')).toHaveLength(0)
    expect(wrapper.findAll('.seal')).toHaveLength(0)
    expect(wrapper.text()).not.toContain('Samurai')
  })

  it('says what is missing, where it is missing', async () => {
    // Both actions are held until there is a socket to send them down, and in
    // a test there never is one — so say there is.
    useGameStore().connection = 'open'
    const wrapper = mount(StartScreen)
    await wrapper.find('.btn.primary').trigger('click')
    // Answered under the box rather than in a toast at the foot of the screen.
    expect(wrapper.find('.error').text()).toContain('Enter a name first')
    expect(wrapper.find('#player-name').attributes('aria-invalid')).toBe('true')

    await wrapper.find('#player-name').setValue('Ada')
    expect(wrapper.find('.error').exists(), 'typing clears it').toBe(false)

    await wrapper.find('#room-code').setValue('AB')
    await wrapper.find('.join').trigger('click')
    expect(wrapper.find('.error').text()).toContain('four characters')
  })

  it('collapses to the join when the link carries a room code', () => {
    const url = `${location.origin}${location.pathname}?room=WXYZ`
    history.replaceState(null, '', url)
    const wrapper = mount(StartScreen)

    // One action, already filled in — the guest has nothing to decide.
    expect((wrapper.find('#room-code').element as HTMLInputElement).value).toBe('WXYZ')
    expect(wrapper.find('.btn.primary').text()).toBe('Join room')
    expect(wrapper.text()).not.toContain('Create room')
    // Hosting is still one tap away for anyone who followed a link by mistake.
    expect(wrapper.find('.linkish').exists()).toBe(true)

    history.replaceState(null, '', location.pathname)
  })
})

describe('the lobby', () => {
  it('shows the room code, the game and the seat count to everyone', () => {
    const r = lobby()
    seatAs(r, 'token-1')
    const wrapper = mount(LobbyScreen)

    expect(wrapper.find('.code').text().replace(/\s+/g, '')).toBe('TEST')
    expect(wrapper.find('.chosen-game').text()).toContain('Samurai')
    expect(wrapper.find('.count').text().replace(/\s+/g, '')).toBe(
      `3/${maxPlayersFor('samurai')}`,
    )
  })

  it('counts the seats against the game being played, not the palette', () => {
    const r = lobby()
    r.options = { ...r.options, kind: 'monopoly' }
    const game = useGameStore()
    game.monopoly = mfor(r, 'token-0')
    const wrapper = mount(MonopolyLobby)
    expect(wrapper.find('.count').text().replace(/\s+/g, '')).toBe(
      `3/${maxPlayersFor('monopoly')}`,
    )
  })

  it('labels the host and the viewer, and never mixes the two up', () => {
    const r = lobby()
    seatAs(r, 'token-1')
    const seats = mount(LobbyScreen).findAll('.seat:not(.empty)')

    expect(seats[0].text()).toContain('Host')
    expect(seats[0].text()).not.toContain('You')
    expect(seats[1].text()).toContain('You')
    expect(seats[1].text()).not.toContain('Host')
  })
})

describe('picking the game', () => {
  it('offers the shelf to the host and withholds it from everyone else', async () => {
    const r = lobby()

    // Seat 1 is not the host, and is seated before the render so the absence
    // below is the guest being refused rather than an empty screen.
    seatAs(r, 'token-1')
    const guest = mount(LobbyScreen)
    expect(guest.find('.seat.mine').exists()).toBe(true)
    expect(guest.findAll('.game-option')).toHaveLength(0)
    // Told what is being played, rather than shown eight cards they cannot use.
    expect(guest.find('.chosen-name').text()).toBe('Samurai')
    expect(guest.text()).toContain('The host chooses what the table plays')

    setActivePinia(createPinia())
    seatAs(r, 'token-0')
    const host = mount(LobbyScreen)
    // The shelf is the screen, not a tap under it: picking the game is the
    // whole of what a host does in a lobby.
    const options = host.findAll('.game-option')
    expect(options).toHaveLength(8)
    const chosen = options.filter((o) => o.classes().includes('chosen'))
    expect(chosen, 'exactly one game is marked as the table’s').toHaveLength(1)
    expect(chosen[0].text()).toContain('Samurai')
  })

  it('sends the room at a new game without disturbing the seats', () => {
    const r = lobby()
    // What the client does: the same options message, with `kind` swapped.
    expect(r.options.kind).toBe('samurai')
    r.options = { ...r.options, kind: 'monopoly' }

    const after = mfor(r, 'token-0')
    expect(after.kind).toBe('monopoly')
    expect(after.phase).toBe('lobby')
    expect(after.players.map((p) => p.name)).toEqual(['Takeda', 'Uesugi', 'Mori'])
    // The colours a table chose survive the change of game.
    expect(after.players.map((p) => p.colour)).toEqual(
      sfor(r, 'token-0').players.map((p) => p.colour),
    )
  })

  it('refuses a game the table has already outgrown', () => {
    const r = lobby(['A', 'B', 'C', 'D', 'E', 'F', 'G'], 'coup')
    expect(r.seats).toHaveLength(7)

    // Seven can play Coup, but Samurai seats six.
    r.options = { ...r.options, kind: 'samurai' }
    expect(r.start()).toMatch(/at most 6/i)

    seatAs(r, 'token-0')
    const wrapper = mount(LobbyScreen)
    expect(wrapper.find('.over').exists()).toBe(true)
    expect(wrapper.find('.actions button').attributes('disabled')).toBeDefined()
  })

  it('greys out a game that would not seat the table, and only that one', () => {
    const r = lobby(['A', 'B', 'C', 'D', 'E', 'F', 'G'], 'coup')
    r.options = { ...r.options, kind: 'samurai' }
    seatAs(r, 'token-0')
    const wrapper = mount(LobbyScreen)
    const options = wrapper.findAll('.game-option')
    const samurai = options.find((o) => o.text().includes('Samurai'))!
    const monopoly = options.find((o) => o.text().includes('Monopoly'))!

    expect(samurai.attributes('disabled')).toBeDefined()
    expect(monopoly.attributes('disabled')).toBeUndefined()
  })
})

describe('picking a colour', () => {
  it('gives every seat its own palette, whichever seat that is', () => {
    const r = lobby()

    for (const [index, token] of ['token-0', 'token-1', 'token-2'].entries()) {
      setActivePinia(createPinia())
      seatAs(r, token)
      const seats = mount(LobbyScreen).findAll('.seat:not(.empty)')

      // Exactly one palette, on the row belonging to the player looking.
      expect(seats.filter((s) => s.find('.palette').exists())).toHaveLength(1)
      expect(seats[index].find('.palette').exists()).toBe(true)
      expect(seats[index].findAll('.pick')).toHaveLength(COLOUR_ORDER.length)
    }
  })

  it('does not put a control on anybody else’s row', () => {
    const r = lobby()
    seatAs(r, 'token-2')
    const seats = mount(LobbyScreen).findAll('.seat:not(.empty)')

    expect(seats[0].findAll('button')).toHaveLength(0)
    expect(seats[1].findAll('button')).toHaveLength(0)
    expect(seats[2].findAll('.pick').length).toBeGreaterThan(0)
  })

  it('marks the colours other players are wearing as taken', () => {
    const r = lobby()
    seatAs(r, 'token-1')
    const wrapper = mount(LobbyScreen)

    const mine = r.seats[1].colour
    const theirs = r.seats.filter((_, i) => i !== 1).map((s) => s.colour)

    for (const colour of COLOUR_ORDER) {
      const pick = wrapper
        .findAll('.pick')
        .find((p) => p.attributes('aria-label') === PLAYER_COLOURS[colour].label)!
      if (colour === mine) {
        expect(pick.classes()).toContain('worn')
        expect(pick.attributes('disabled')).toBeUndefined()
      } else if (theirs.includes(colour)) {
        expect(pick.classes()).toContain('taken')
        expect(pick.attributes('disabled')).toBeDefined()
        expect(pick.attributes('title')).toMatch(/taken by/i)
      } else {
        expect(pick.attributes('disabled')).toBeUndefined()
      }
    }
  })

  it('lets the second of two players take a colour the first has let go', () => {
    const r = lobby()
    const [a, b] = [r.seats[0], r.seats[1]]
    // Two colours nobody is wearing. The palette is shuffled per room, so which
    // ones they are cannot be assumed — only that a three-seat table playing an
    // eight-colour game has some spare.
    const spare = COLOUR_ORDER.filter((c) => !r.seats.some((s) => s.colour === c))
    const [free, other] = spare

    expect(r.setColour('token-0', free)).toBeNull()
    // The same colour, asked for by someone else: the first request holds it.
    expect(r.setColour('token-1', free)).toMatch(/no longer available/i)
    expect(a.colour).toBe(free)
    expect(b.colour).not.toBe(free)

    // Once the first moves on, it is there for the taking.
    expect(r.setColour('token-0', other)).toBeNull()
    expect(r.setColour('token-1', free)).toBeNull()
    expect(b.colour).toBe(free)
  })

  it('leaves a spectator no palette at all', () => {
    const r = lobby()
    const game = useGameStore()
    game.state = { ...sfor(r, 'token-0'), you: null }
    const wrapper = mount(LobbyScreen)
    expect(wrapper.find('.palette').exists()).toBe(false)
  })
})

describe('the lobby on a phone', () => {
  it('keeps the start button out of the scrolling column', () => {
    const r = lobby()
    seatAs(r, 'token-0')
    const wrapper = mount(LobbyScreen)

    // The bar is a child of the lobby itself, not of the panel that holds the
    // rules — which is what lets it be pinned in one place for both layouts.
    const actions = wrapper.find('.lobby-split > .actions')
    expect(actions.exists()).toBe(true)
    expect(actions.find('button').text()).toContain('Start game')
    expect(wrapper.find('.conf .actions').exists()).toBe(false)
  })

  it('still shows a guest the button, saying whose turn it is to press it', () => {
    const r = lobby()
    seatAs(r, 'token-1')
    const wrapper = mount(LobbyScreen)
    const button = wrapper.find('.actions button')
    expect(button.text()).toContain('Waiting for the host')
    expect(button.attributes('disabled')).toBeDefined()
  })
})

describe('turn positions', () => {
  it('seats each arrival at the first vacant position', () => {
    const r = lobby(['A', 'B', 'C'])
    expect(r.seats.map((s) => s.position)).toEqual([1, 2, 3])
  })

  it('lets a player take a vacant position without moving anyone', () => {
    const r = lobby(['A', 'B', 'C'])
    // B leaves 2 for 4. A stays at 1, C stays at 3, and 2 falls vacant.
    expect(r.setPosition('token-1', 4)).toBeNull()
    expect(r.seats.map((s) => [s.name, s.position])).toEqual([
      ['A', 1],
      ['B', 4],
      ['C', 3],
    ])

    // Which C may now take, because B let it go.
    expect(r.setPosition('token-2', 2)).toBeNull()
    expect(r.seats.map((s) => s.position)).toEqual([1, 4, 2])
  })

  it('refuses a position another player holds, and says who to ask', () => {
    const r = lobby(['A', 'B', 'C'])
    expect(r.setPosition('token-2', 1)).toMatch(/Position 1 is no longer available/)
    expect(r.setPosition('token-2', 2)).toMatch(/no longer available/)
    // Refused means unchanged, not moved somewhere else.
    expect(r.seats[2].position).toBe(3)
  })

  it('gives a contested position to whoever asked first', () => {
    const r = lobby(['A', 'B', 'C'])
    // Both reach for 5. Requests are handled one at a time, so one wins.
    expect(r.setPosition('token-0', 5)).toBeNull()
    expect(r.setPosition('token-1', 5)).toMatch(/Position 5 is no longer available/)
    expect(r.seats[0].position).toBe(5)
    expect(r.seats[1].position, 'the loser keeps what they had').toBe(2)
  })

  it('offers exactly eight, and nothing outside them', () => {
    const r = lobby(['A'])
    expect(r.setPosition('token-0', MAX_POSITIONS)).toBeNull()
    for (const bad of [0, -1, 9, 1.5, Number.NaN]) {
      expect(r.setPosition('token-0', bad)).toMatch(/no such position/i)
    }
    expect(r.seats[0].position).toBe(MAX_POSITIONS)
  })

  it('frees a position when its player leaves, and moves nobody', () => {
    const r = lobby(['A', 'B', 'C'])
    r.removeSeat('token-1')

    // A and C keep 1 and 3; nothing slides up to fill the hole.
    expect(r.seats.map((s) => [s.name, s.position])).toEqual([
      ['A', 1],
      ['C', 3],
    ])
    // And the next arrival takes the vacancy rather than the end of the queue.
    r.addSeat('token-9', 'D')
    expect(r.seats.at(-1)!.position).toBe(2)
  })

  it('locks the positions once the game is dealt', () => {
    const r = lobby(['A', 'B'])
    expect(r.start()).toBeNull()
    expect(r.setPosition('token-0', 7)).toMatch(/already started/i)
  })

  it('refuses a stranger outright', () => {
    const r = lobby(['A', 'B'])
    expect(r.setPosition('nobody', 5)).toMatch(/no seat/i)
  })
})

describe('positions as the turn order', () => {
  it('deals the seats in position order, skipping the gaps', () => {
    const r = lobby(['A', 'B', 'C'])
    // 1, 3 and 6 — so play runs A, C, B.
    expect(r.setPosition('token-1', 6)).toBeNull()
    expect(r.setPosition('token-2', 3)).toBeNull()
    expect(r.start()).toBeNull()

    // Seat ids are what every engine plays in order, so the order is the ids.
    expect(r.seats.map((s) => [s.name, s.id])).toEqual([
      ['A', 0],
      ['C', 1],
      ['B', 2],
    ])
  })

  it('reverses the table when the positions are reversed', () => {
    const r = lobby(['A', 'B', 'C'])
    expect(r.setPosition('token-0', 8)).toBeNull()
    expect(r.setPosition('token-2', 1)).toBeNull()
    expect(r.start()).toBeNull()
    expect(r.seats.map((s) => s.name)).toEqual(['C', 'B', 'A'])
  })

  it('will not deal a table with two players in one position', () => {
    const r = lobby(['A', 'B'])
    // Only reachable by hand — the setter refuses to create it — which is what
    // a room restored from a snapshot written before positions could look like.
    r.seats[1].position = r.seats[0].position
    expect(r.start()).toMatch(/share a turn position/i)
  })

  it('will not deal a table with two players in one colour', () => {
    const r = lobby(['A', 'B'])
    r.seats[1].colour = r.seats[0].colour
    expect(r.start()).toMatch(/share a colour/i)
  })
})

/**
 * Who opens, which is where turn positions and the opening roll-off meet.
 *
 * The roll-off exists because seat 0 used to be an accident of who joined
 * first, and handing it the opening turn would have rewarded nothing. Positions
 * removed that accident — seat 0 is now whoever *chose* position 1 — so turning
 * the roll-off off is how a table says the positions should decide this too. It
 * used to draw at random in that case as well, which made the option a choice
 * about ceremony rather than about anything.
 */
describe('who opens', () => {
  function table(dice: boolean, kind: GameKind = 'coup') {
    const r = new Room('OPEN')
    r.options = { ...DEFAULT_OPTIONS, kind, diceStart: dice }
    for (const [i, name] of ['Ada', 'Bo', 'Cy'].entries()) r.addSeat(`token-${i}`, name)
    return r
  }

  it('gives the first turn to position 1 when the table is not rolling for it', () => {
    const r = table(false)
    // Cy asks to go first; Ada, who opened the room, drops to position 4.
    expect(r.setPosition('token-0', 4)).toBeNull()
    expect(r.setPosition('token-2', 1)).toBeNull()
    expect(r.start()).toBeNull()

    const cy = r.seats.find((s) => s.token === 'token-2')!
    expect(cy.position).toBe(1)
    expect(cy.id, 'dealt into the first seat').toBe(0)
    expect(r.coup!.state.current, 'and opens the game').toBe(0)
  })

  it('opens on position 1 every time, not just usually', () => {
    for (let attempt = 0; attempt < 30; attempt++) {
      const r = table(false)
      expect(r.start()).toBeNull()
      expect(r.coup!.state.current).toBe(0)
    }
  })

  it('still rolls for it when the table asks, so opening the room wins nothing', () => {
    // The host holds position 1 by default, so a roll-off is the only thing
    // standing between them and the first turn of every game.
    const seen = new Set<number>()
    for (let attempt = 0; attempt < 60; attempt++) {
      const r = table(true)
      expect(r.start()).toBeNull()
      seen.add(r.coup!.state.current)
      expect(r.coup!.state.opening, 'the throws are kept to be replayed').not.toBeNull()
    }
    expect(seen.size, 'more than one seat opens across sixty deals').toBeGreaterThan(1)
  })

  it('keeps the positions as the order even when the roll picks the opener', () => {
    const r = table(true)
    expect(r.setPosition('token-0', 7)).toBeNull()
    expect(r.start()).toBeNull()
    // Whoever the roll chose, the seating is still the order the table asked
    // for — Ada went to the back of it.
    expect(r.seats.map((s) => s.name)).toEqual(['Bo', 'Cy', 'Ada'])
  })
})
