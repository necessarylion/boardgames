// @vitest-environment jsdom
import { DEFAULT_OPTIONS } from '../shared/engine'
import { describe, expect, it, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'

import DraftScreen from '../src/components/samurai/DraftScreen.vue'
import GameScreen from '../src/components/samurai/GameScreen.vue'
import HomeScreen from '../src/components/common/HomeScreen.vue'
import LobbyScreen from '../src/components/samurai/LobbyScreen.vue'
import { Room } from '../server/rooms'
import type { ClientState } from '../shared/protocol'
import { legalPlacements } from '../shared/rules'
import { tileFromId } from '../shared/tiles'
import { maxPlayersFor } from '../shared/types'

/** Samurai's own ceiling — its lobby lays out this many seats, not the palette's. */
const SAMURAI_MAX = maxPlayersFor('samurai')
import { useGameStore } from '../src/stores/game'

/** These rooms all play Samurai, so read their state as a Samurai ClientState. */
const sfor = (r: Room, token: string): ClientState => r['stateFor'](token) as ClientState

/**
 * A real room, driven through the real server code, to render against, with
 * seat 0 put on turn — the opening seat is drawn now, and these tests are about
 * what ends up on screen rather than who won the roll for it.
 */
function room(started = true) {
  const r = new Room('TEST')
  r.addSeat('token-a', 'Takeda')
  r.addSeat('token-b', 'Uesugi')
  r.options = { ...DEFAULT_OPTIONS, randomHands: true, openInformation: false }
  if (started) {
    r.start()
    r.game!.state.first = 0
    r.game!.state.current = 0
  }
  return r
}

/**
 * A tile `playTile` will actually accept. `legalPlacements` answers only which
 * terrain suits a tile, so it happily returns spaces for a switch or move tile
 * that the play action then refuses — and since each room is dealt from a fresh
 * random seed, picking without this filter fails whenever one of those two
 * happens to come up first.
 */
function placeableTile(r: Room) {
  const view = r.game!.view
  return r
    .game!.state.players[0].hand.map(tileFromId)
    .find((t) => t.kind !== 'switch' && t.kind !== 'move' && legalPlacements(view, t).length > 0)!
}

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
})

describe('ending and restarting', () => {
  it('takes the room back to the lobby, keeping the players seated', () => {
    const r = room()
    expect(r.started).toBe(true)
    expect(r.abandon()).toBeNull()

    expect(r.started).toBe(false)
    expect(sfor(r, 'token-a').phase).toBe('lobby')
    expect(r.seats.map((s) => s.name)).toEqual(['Takeda', 'Uesugi'])
    // The board is gone, so a fresh game can be dealt with new settings.
    expect(sfor(r, 'token-a').pieces).toEqual({})
    expect(r.start()).toBeNull()
  })

  it('refuses to abandon when no game is running', () => {
    const r = room(false)
    expect(r.abandon()).toMatch(/no game/i)
  })

  it('drops absent players when a new game is dealt', () => {
    const r = room()
    r.seats[1].connected = false
    r.abandon()
    expect(r.seats.map((s) => s.name)).toEqual(['Takeda'])
    // One player left is not a game.
    expect(r.start()).toMatch(/at least two/i)
  })

  it('hands the host role to someone who is still present', () => {
    const r = room()
    expect(r.isHost('token-a')).toBe(true)
    r.seats[0].connected = false
    r.ensureHost()
    expect(r.isHost('token-b')).toBe(true)
  })

  it('will not rematch while a game is still in progress', () => {
    const r = room()
    expect(r.rematch()).toMatch(/still in progress/i)
  })
})

describe('rendering', () => {
  it('renders the home screen without a connection', () => {
    const wrapper = mount(HomeScreen)
    expect(wrapper.text()).toContain('Samurai')
    expect(wrapper.findAll('button').length).toBeGreaterThanOrEqual(2)
  })

  it('renders the lobby with both seats and the rest of the table empty', () => {
    const game = useGameStore()
    game.state = sfor(room(false), 'token-a')
    const wrapper = mount(LobbyScreen)
    expect(wrapper.text()).toContain('TEST')
    expect(wrapper.text()).toContain('Takeda')
    expect(wrapper.text()).toContain('Uesugi')
    expect(wrapper.findAll('.seat')).toHaveLength(SAMURAI_MAX)
    expect(wrapper.findAll('.seat.empty')).toHaveLength(SAMURAI_MAX - 2)
  })

  it('renders the board, every space and both hands from server state', () => {
    const r = room()
    const game = useGameStore()
    game.state = sfor(r, 'token-a')

    const wrapper = mount(GameScreen)
    const svg = wrapper.find('svg.board')
    expect(svg.exists()).toBe(true)

    // One terrain polygon per space on the two-player board.
    const spaceCount = Object.keys(r.game!.board.spaces).length
    expect(svg.findAll('polygon.hex')).toHaveLength(spaceCount)

    // Caste pieces are drawn for the whole starting supply of 21.
    expect(svg.findAll('.piece')).toHaveLength(21)

    // The seated player sees their own five tiles and it is their turn.
    expect(wrapper.text()).toContain('Your turn')
    expect(wrapper.findAll('.tile-btn')).toHaveLength(5)
  })

  it('offers a take-back only once something has been placed this turn', () => {
    const r = room()
    const game = useGameStore()
    game.state = sfor(r, 'token-a')

    // Nothing placed yet, so there is nothing to take back.
    expect(mount(GameScreen).text()).not.toContain('Take back')

    const tile = placeableTile(r)
    r.game!.playTile(0, tile.id, legalPlacements(r.game!.view, tile)[0])
    game.state = sfor(r, 'token-a')

    expect(mount(GameScreen).text()).toContain('Take back')
  })

  it('never offers a take-back to the player who is not on turn', () => {
    const r = room()
    const tile = placeableTile(r)
    r.game!.playTile(0, tile.id, legalPlacements(r.game!.view, tile)[0])

    const game = useGameStore()
    game.state = sfor(r, 'token-b')
    expect(mount(GameScreen).text()).not.toContain('Take back')
  })

  it('shows the opponent as waiting and hides their captured pieces', () => {
    const r = room()
    const game = useGameStore()
    game.state = sfor(r, 'token-b') // the player who is not on turn

    const wrapper = mount(GameScreen)
    expect(wrapper.text()).toContain("Takeda's turn")
    expect(wrapper.text()).toContain('Captured pieces kept behind their screen')
    // Nothing is playable while it is not your turn.
    expect(wrapper.findAll('.tile-btn:not([disabled])')).toHaveLength(0)
  })

  it('offers all twenty tiles during the draft and caps the picks at five', async () => {
    const r = new Room('DRFT')
    r.addSeat('token-a', 'Takeda')
    r.addSeat('token-b', 'Uesugi')
    r.options = { ...DEFAULT_OPTIONS, randomHands: false, openInformation: false }
    r.start()

    const game = useGameStore()
    game.state = sfor(r, 'token-a')
    const wrapper = mount(DraftScreen)
    expect(wrapper.findAll('.tile-btn')).toHaveLength(20)

    game.randomiseDraft()
    await wrapper.vm.$nextTick()
    expect(game.draftPicks).toHaveLength(5)
    expect(new Set(game.draftPicks).size).toBe(5)
    expect(wrapper.findAll('.tile-btn.picked')).toHaveLength(5)

    // A sixth pick is ignored rather than replacing one.
    const unpicked = game.draftPool.find((t) => !game.draftPicks.includes(t.id))!
    game.toggleDraftPick(unpicked.id)
    expect(game.draftPicks).toHaveLength(5)
  })

  it('ends the game only after a confirming second click', async () => {
    const r = room()
    const game = useGameStore()
    game.state = sfor(r, 'token-a') // the host
    const sent: string[] = []
    // Intercept outgoing messages instead of opening a real socket.
    game.abandonGame = () => sent.push('abandon')

    const wrapper = mount(GameScreen)
    expect(wrapper.text()).not.toContain('End game')

    await wrapper.find('.menu-wrap > button').trigger('click')
    expect(wrapper.text()).toContain('End game')
    expect(wrapper.text()).toContain('Leave table')

    // First click only asks for confirmation.
    await wrapper.find('.menu .item').trigger('click')
    expect(sent).toHaveLength(0)
    expect(wrapper.text()).toContain('End this game for everyone')

    await wrapper.find('.menu .row .btn').trigger('click')
    expect(sent).toEqual(['abandon'])
  })

  it('does not offer ending the game to a player who is not the host', async () => {
    const r = room()
    const game = useGameStore()
    game.state = sfor(r, 'token-b')

    const wrapper = mount(GameScreen)
    await wrapper.find('.menu-wrap > button').trigger('click')
    expect(wrapper.text()).toContain('Only the host can end the game')
    expect(wrapper.text()).toContain('Leave table')
  })

  it('flashes the round counter when the round turns over, but not on arrival', async () => {
    const r = room()
    const game = useGameStore()
    // Joining a table already several rounds in is not a change to announce.
    game.state = { ...sfor(r, 'token-a'), turnNumber: 3 }

    const wrapper = mount(GameScreen)
    expect(wrapper.find('.round').text()).toContain('Round 3')
    expect(wrapper.find('.round.changed').exists()).toBe(false)

    game.state = { ...game.state, turnNumber: 4 }
    await nextTick()
    expect(wrapper.find('.round.changed').text()).toContain('Round 4')

    // A broadcast that leaves the round alone leaves the flash alone too.
    game.state = { ...game.state, current: 1 }
    await nextTick()
    expect(wrapper.find('.round.changed').exists()).toBe(true)
  })

  it('highlights legal targets once a tile is selected', async () => {
    const r = room()
    const game = useGameStore()
    game.state = sfor(r, 'token-a')

    const wrapper = mount(GameScreen)
    expect(wrapper.findAll('.hex-target')).toHaveLength(0)

    // Hands are random here, so pick a tile that actually goes onto the board:
    // the move tile has nothing to reposition on turn one, and switch targets
    // pieces rather than spaces.
    const playable = game.playableTileIds.find((id) => {
      const kind = tileFromId(id).kind
      return kind !== 'move' && kind !== 'switch'
    })
    expect(playable).toBeTruthy()
    game.selectTile(playable!)
    await wrapper.vm.$nextTick()

    expect(game.highlightedSpaces.length).toBeGreaterThan(0)
    expect(wrapper.findAll('.hex-target')).toHaveLength(game.highlightedSpaces.length)
  })

  it('marks the last tile placed for the player who did not place it', async () => {
    const r = room()
    const game = useGameStore()
    game.state = sfor(r, 'token-b') // watching someone else's turn

    const wrapper = mount(GameScreen)
    expect(wrapper.findAll('.tile-mark')).toHaveLength(0)

    const tile = placeableTile(r)
    const space = legalPlacements(r.game!.view, tile)[0]
    r.game!.playTile(0, tile.id, space)
    game.state = sfor(r, 'token-b')
    await nextTick()
    expect(wrapper.findAll('.tile-mark')).toHaveLength(1)

    // Still marked once play has passed on, which is when it matters most.
    r.game!.endTurn(0)
    game.state = sfor(r, 'token-b')
    await nextTick()
    expect(wrapper.findAll('.tile-mark')).toHaveLength(1)
  })
})

describe('what each seat has yet to see', () => {
  /** Three handed, so a viewer can be two turns behind rather than one. */
  function table() {
    const r = new Room('LAPS')
    r.addSeat('token-a', 'Takeda')
    r.addSeat('token-b', 'Uesugi')
    r.addSeat('token-c', 'Hojo')
    r.options = { ...DEFAULT_OPTIONS, randomHands: true, openInformation: false }
    r.start()
    // Seat order is what this is about, so it starts from a known seat.
    r.game!.state.first = 0
    r.game!.state.current = 0
    return r
  }

  /** Play a placeable tile for whoever is on the clock and end their turn. */
  function turn(r: Room): string {
    const game = r.game!
    const seat = game.state.current
    const tile = game.state.players[seat].hand
      .map(tileFromId)
      .find(
        (t) => t.kind !== 'switch' && t.kind !== 'move' && legalPlacements(game.view, t).length > 0,
      )!
    const space = legalPlacements(game.view, tile)[0]
    expect(game.playTile(seat, tile.id, space).ok).toBe(true)
    expect(game.endTurn(seat).ok).toBe(true)
    return space
  }

  it('tells each seat only what has happened since their own turn', () => {
    const r = table()
    const first = turn(r)
    const second = turn(r)

    expect(sfor(r, 'token-c').sinceYourTurn).toEqual([first, second])
    expect(sfor(r, 'token-a').sinceYourTurn).toEqual([second])
    expect(sfor(r, 'token-b').sinceYourTurn).toEqual([])

    // A spectator gets the union of every bucket — the last lap of the table —
    // with each placement in it once, however many seats have yet to see it.
    expect([...sfor(r, 'nobody').sinceYourTurn].sort()).toEqual([first, second].sort())
  })

  it('keeps the earlier plays marked underneath the newest one', async () => {
    const r = table()
    const game = useGameStore()
    game.state = sfor(r, 'token-c')

    const wrapper = mount(GameScreen)
    expect(wrapper.findAll('.tile-earlier')).toHaveLength(0)

    turn(r)
    game.state = sfor(r, 'token-c')
    await nextTick()
    expect(wrapper.findAll('.tile-mark')).toHaveLength(1)
    expect(wrapper.findAll('.tile-earlier')).toHaveLength(1)

    // The second play takes over the fresh mark; the first is still on the
    // board rather than being replaced by it.
    turn(r)
    game.state = sfor(r, 'token-c')
    await nextTick()
    expect(wrapper.findAll('.tile-mark')).toHaveLength(1)
    expect(wrapper.findAll('.tile-earlier')).toHaveLength(2)

    // Seat 1 has just played, so they are caught up and nothing is left over.
    game.state = sfor(r, 'token-b')
    await nextTick()
    expect(wrapper.findAll('.tile-earlier')).toHaveLength(0)
  })
})

describe('the capture notice', () => {
  /**
   * A turn ending, as the client sees it: the server rewrites `lastCaptures` and
   * moves the turn on in the same broadcast.
   */
  function turnEnded(r: Room, token: string, winner: number) {
    return {
      ...sfor(r, token),
      current: 1,
      lastCaptures: [{ caste: 'buddha' as const, spaceId: r.game!.board.order[0], winner }],
    }
  }

  it('congratulates the player who took the piece, once', async () => {
    const r = room()
    const game = useGameStore()
    game.state = sfor(r, 'token-a')
    await nextTick()

    game.state = turnEnded(r, 'token-a', 0)
    await nextTick()

    const wrapper = mount(GameScreen)
    expect(wrapper.text()).toContain('Yay! You took a Buddha.')

    // Later broadcasts of the same turn must not reopen it once dismissed.
    await wrapper.find('.backdrop .btn').trigger('click')
    expect(wrapper.find('.backdrop').exists()).toBe(false)

    game.state = turnEnded(r, 'token-a', 0)
    await nextTick()
    expect(wrapper.find('.backdrop').exists()).toBe(false)
  })

  it('says nothing to the player who did not take it', async () => {
    const r = room()
    const game = useGameStore()
    game.state = sfor(r, 'token-b')
    await nextTick()

    game.state = turnEnded(r, 'token-b', 0) // seat 0 captured; this client is seat 1
    await nextTick()

    expect(game.capturedNotice).toEqual([])
    expect(mount(GameScreen).find('.backdrop').exists()).toBe(false)
  })

  it('does not replay a capture to a client that arrives mid-turn', async () => {
    const r = room()
    const game = useGameStore()
    game.state = turnEnded(r, 'token-a', 0) // the very first state this client sees
    await nextTick()

    expect(game.capturedNotice).toEqual([])
  })
})
