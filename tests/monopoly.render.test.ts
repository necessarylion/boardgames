// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'

import MonopolyGameScreen from '../src/components/monopoly/MonopolyGameScreen.vue'
import { COMPANY_LOGOS, companyLogo } from '../src/game/companies'
import { money } from '../shared/money'
import { DEFAULT_OPTIONS } from '../shared/engine'
import { LOG_KEEP, SPACES, groupSpaces, mortgageValue, priceOf, rentFor } from '../shared/monopoly'
import type { MonopolyClientState } from '../shared/protocol'
import { Room } from '../server/rooms'
import { useGameStore } from '../src/stores/game'

/**
 * Monopoly's table carries rules of its own, which is the bar for a game having
 * its own render suite: which of the auction, trade and building controls a seat
 * sees is decided per viewer, and offering the wrong one hands someone a button
 * the engine is about to refuse.
 */
function room(seats = 3): Room {
  const r = new Room('TEST')
  r.options = { ...DEFAULT_OPTIONS, kind: 'monopoly', diceStart: false }
  const names = ['Ada', 'Bo', 'Cy']
  for (let i = 0; i < seats; i++) r.addSeat(`token-${i}`, names[i])
  r.start()
  r.monopoly!.state.current = 0
  return r
}

const view = (r: Room, token: string) => r['stateFor'](token) as MonopolyClientState

/** Mount the table as one seat sees it. */
function screenFor(r: Room, token: string) {
  const store = useGameStore()
  store.monopoly = view(r, token)
  return mount(MonopolyGameScreen)
}

/** The table decides its shape from the window; jsdom keeps one per file. */
function widthOf(px: number) {
  window.innerWidth = px
}

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
  // A desktop window unless a test says otherwise, so the three columns — and
  // every expectation written against them — are what mounts.
  widthOf(1200)
})

describe('the Monopoly table', () => {
  it('draws all forty spaces on the ring, Go at the bottom right', () => {
    const r = room()
    const screen = screenFor(r, 'token-0')
    expect(screen.findAll('.space')).toHaveLength(40)
    const go = screen.findAll('.space')[0]
    expect(go.attributes('style')).toContain('grid-column: 11')
    expect(go.attributes('style')).toContain('grid-row: 11')
    expect(screen.text()).toContain(SPACES[1].name)
  })

  it('offers the throw to the seat whose turn it is, and to nobody else', () => {
    const r = room()
    expect(screenFor(r, 'token-0').text()).toContain('Throw the dice')
    const waiting = screenFor(r, 'token-1')
    expect(waiting.text()).not.toContain('Throw the dice')
    expect(waiting.text()).toContain('Ada to play')
  })

  it('shows the buy prompt only to the seat standing on the space', () => {
    const r = room()
    r.monopoly!.state.pending = [{ step: 'buy', player: 0, space: 3 }]
    const lander = screenFor(r, 'token-0')
    expect(lander.text()).toContain('Buy for')
    expect(lander.text()).toContain('Send to auction')

    const other = screenFor(r, 'token-1')
    expect(other.text()).not.toContain('Buy for')
    expect(other.text()).toContain('is deciding whether to buy')
  })

  it('gives an auction its bid box to every seat still in, and not to one that dropped out', () => {
    const r = room()
    r.monopoly!.state.pending = [
      { step: 'auction', space: 3, high: 40, highBidder: 1, passed: [1, 2] },
    ]
    const bidding = screenFor(r, 'token-0')
    expect(bidding.find('input.bid').exists()).toBe(true)
    expect(bidding.text()).toContain('Standing bid $40B from Bo')

    // Seat 2 has passed under the standing bid, so it is out of this window.
    const out = screenFor(r, 'token-2')
    expect(out.find('input.bid').exists()).toBe(false)
    expect(out.text()).toContain('dropped out')
  })

  it('caps the bid box at the cash in hand', () => {
    const r = room()
    r.monopoly!.state.players[0].cash = 250
    r.monopoly!.state.pending = [
      { step: 'auction', space: 3, high: 40, highBidder: 1, passed: [] },
    ]

    const bidding = screenFor(r, 'token-0')
    const field = bidding.find('input.bid')
    // The engine refuses more than the bidder holds, so the field never offers
    // it: least that beats the standing bid, most that the seat can pay.
    expect(field.attributes('min')).toBe('41')
    expect(field.attributes('max')).toBe('250')
    expect(bidding.text()).toContain('to bid with')
  })

  it('offers a seat that cannot reach the standing bid its one remaining move', () => {
    const r = room()
    r.monopoly!.state.players[0].cash = 30
    r.monopoly!.state.pending = [
      { step: 'auction', space: 3, high: 40, highBidder: 1, passed: [] },
    ]

    // Still in the auction, but no legal bid exists for it — so it is given the
    // words for that and the drop-out, rather than a box it cannot use.
    const broke = screenFor(r, 'token-0')
    expect(broke.find('input.bid').exists()).toBe(false)
    expect(broke.text()).toContain('cannot cover')
    expect(broke.text()).toContain('Drop out')
  })

  it('tells the standing bidder they are winning, not that they are out', () => {
    const r = room()
    r.monopoly!.state.pending = [
      { step: 'auction', space: 3, high: 40, highBidder: 1, passed: [2] },
    ]

    // Seat 1 has nothing to do until somebody outbids it — the same empty hands
    // as a seat that walked away, and the opposite situation.
    const leading = screenFor(r, 'token-1')
    expect(leading.find('input.bid').exists()).toBe(false)
    expect(leading.text()).toContain('Your bid stands')
    expect(leading.text()).not.toContain('dropped out')
  })

  it('shows a trade’s terms to the two seats it is between, and not to the table', () => {
    const r = room()
    r.monopoly!.state.owners[1] = 0
    r.monopoly!.offerTrade(0, 1, { spaces: [1], cash: 0 }, { spaces: [], cash: 75 })

    const partner = screenFor(r, 'token-1')
    expect(partner.text()).toContain(SPACES[1].name)
    expect(partner.text()).toContain('75')
    expect(partner.text()).toContain('Accept')

    const bystander = screenFor(r, 'token-2')
    expect(bystander.text()).toContain('are talking terms')
    expect(bystander.text()).not.toContain('Accept')
  })

  it('lists your own property with the actions the engine allows on it', () => {
    const r = room()
    const spaces = groupSpaces('brown')
    r.monopoly!.state.owners[spaces[0]] = 0
    const partial = screenFor(r, 'token-0')
    expect(partial.text()).toContain(SPACES[spaces[0]].name)
    // One of the pair is not a whole sector, so there is nothing to expand yet.
    expect(partial.text()).not.toContain('Expand')
    expect(partial.text()).toContain('Mortgage')

    r.monopoly!.state.owners[spaces[1]] = 0
    expect(screenFor(r, 'token-0').text()).toContain('Expand')
    // The panel is the viewer's own, so it stays empty for a seat owning nothing.
    expect(screenFor(r, 'token-1').text()).toContain('You own nothing yet')
  })

  it('puts the antitrust choices in front of the seat under review only', () => {
    const r = room()
    r.monopoly!.state.players[0].jailed = true
    r.monopoly!.state.pending = [{ step: 'jail', player: 0 }]
    const jailed = screenFor(r, 'token-0')
    expect(jailed.text()).toContain('You are under antitrust review')
    expect(jailed.text()).toContain('Pay 50')
    // No card in hand, so that door stays shut.
    expect(jailed.find('button:disabled').exists()).toBe(true)
    expect(screenFor(r, 'token-1').text()).not.toContain('You are under antitrust review')
  })

  it('puts a debtor in front of their bill, and lets nobody else settle it', () => {
    const r = room()
    r.monopoly!.state.pending = [{ step: 'debt', player: 0, amount: 240, creditor: 1 }]
    const debtor = screenFor(r, 'token-0')
    expect(debtor.text()).toContain('You owe $240B')
    expect(debtor.text()).toContain('Declare bankruptcy')

    const other = screenFor(r, 'token-1')
    expect(other.text()).not.toContain('Declare bankruptcy')
    expect(other.text()).toContain('is raising the money')
    expect(other.text()).toContain('$240B')
  })

  it('writes every figure in the same money unit, legibly', () => {
    const r = room()
    const screen = screenFor(r, 'token-0')
    // The starting purse, and a price off the board — both formatted, neither
    // left as a bare ladder number that says nothing about a tech company.
    expect(screen.text()).toContain('$1,500B')
    expect(screen.text()).toContain(money(400))
    expect(screen.find('.space-price').exists()).toBe(true)
  })

  it('insets a space past its colour band, so nothing is printed on the stripe', () => {
    // The price used to be laid straight over the band, dark ink on a saturated
    // stripe, which is unreadable. Each run of the ring insets on its own side.
    const r = room()
    const cells = screenFor(r, 'token-0').findAll('.space')
    expect(cells[1].classes()).toContain('side-bottom')
    expect(cells[21].classes()).toContain('side-top')
    expect(cells[11].classes()).toContain('side-left')
    expect(cells[31].classes()).toContain('side-right')
  })

  it('marks who owns what and what is built on it', () => {
    const r = room()
    const spaces = groupSpaces('brown')
    r.monopoly!.state.owners[spaces[0]] = 1
    r.monopoly!.state.houses[spaces[0]] = 2
    r.monopoly!.state.mortgaged[spaces[1]] = true
    r.monopoly!.state.owners[spaces[1]] = 1
    const screen = screenFor(r, 'token-0')
    const cells = screen.findAll('.space')
    expect(cells[spaces[0]].classes()).toContain('owned')
    expect(cells[spaces[0]].findAll('.builds svg')).toHaveLength(2)
    expect(cells[spaces[1]].classes()).toContain('mortgaged')
  })

  it('gives every company a logo, and only the companies', () => {
    // Every street on the board has to have a logo, or a space renders bare next
    // to its neighbours; nothing else should, because the corners and the card
    // spaces carry a glyph instead.
    for (const [n, space] of SPACES.entries()) {
      const logo = companyLogo(space.name)
      if (space.kind === 'street') expect(logo, `${space.name} (${n})`).not.toBeNull()
      else expect(logo, `${space.name} (${n})`).toBeNull()
    }
    expect(Object.keys(COMPANY_LOGOS)).toHaveLength(22)
  })

  it('draws each logo in its own colours, not one shared ink', () => {
    const marks = new Set(Object.values(COMPANY_LOGOS).map((l) => l.svg))
    expect(marks.size).toBe(22)
    // A brand's own colour has to actually appear in its drawing, or the logo is
    // the right shape in the wrong paint.
    for (const [name, logo] of Object.entries(COMPANY_LOGOS)) {
      expect(logo.svg.toUpperCase(), name).toContain(logo.tint.toUpperCase())
    }
  })

  it('renders the logo as an element on the space, not as a background', () => {
    const r = room()
    const cells = screenFor(r, 'token-0').findAll('.space')
    // Apple at 39 is a company; the IPO at 0 is a corner.
    const logo = cells[39].find('svg.company-logo')
    expect(logo.exists()).toBe(true)
    expect(logo.attributes('aria-label')).toBe('Apple')
    // The mark is real markup, so it can be styled and read — not a data URI
    // baked into a background image.
    expect(logo.html()).toContain('path')
    expect(cells[39].attributes('style')).not.toContain('data:image/svg+xml')
    expect(cells[0].find('svg.company-logo').exists()).toBe(false)
  })

  it('gives the table a dice tray, and narrates both dice of a throw', () => {
    const r = room()
    // The dice themselves are an async component pulling in three.js, which
    // never resolves under jsdom — so this checks the tray they mount into and
    // the narration, which is where both faces of the pair actually surface.
    expect(screenFor(r, 'token-0').find('.dice').exists()).toBe(true)

    r.monopoly!.state.lastRoll = {
      player: 0,
      dice: [3, 5],
      from: 0,
      to: 8,
      passedGo: false,
      doubles: false,
    }
    expect(screenFor(r, 'token-0').text()).toContain('Ada threw 3 and 5')
  })

  it('has no dice tray once the game is over', () => {
    const r = room(2)
    r.monopoly!.state.phase = 'over'
    r.monopoly!.state.result = { winner: 0, standings: [0, 1], reason: 'test' }
    expect(screenFor(r, 'token-0').find('.dice').exists()).toBe(false)
  })

  it('shows what a property earns and what each action pays, not just its name', () => {
    const r = room()
    const [a, b, c] = groupSpaces('pink')
    r.monopoly!.state.owners[a] = 0
    const deed = screenFor(r, 'token-0').find('.deed')
    expect(deed.exists()).toBe(true)

    // The company's own logo, so the panel scans the way the board does.
    expect(deed.find('svg.company-logo').attributes('aria-label')).toBe(SPACES[a].name)
    expect(deed.text()).toContain(SPACES[a].name)
    // Its price, and what it charges as things stand — a bare company in a part
    // owned sector, so single rent rather than the doubled rate.
    expect(deed.text()).toContain(`$${priceOf(a)}B`)
    expect(deed.text()).toContain(`$${rentFor(r.monopoly!.state, a, 0)}B`)
    // And what mortgaging would actually pay, on the button itself.
    expect(deed.text()).toContain(`+$${mortgageValue(a)}B`)

    // One pip per space in the sector, filled for the ones held.
    expect(deed.findAll('.pip')).toHaveLength(3)
    expect(deed.findAll('.pip.on')).toHaveLength(1)

    // Completing the sector fills every pip and marks the card.
    r.monopoly!.state.owners[b] = 0
    r.monopoly!.state.owners[c] = 0
    const whole = screenFor(r, 'token-0').find('.deed')
    expect(whole.findAll('.pip.on')).toHaveLength(3)
    expect(whole.classes()).toContain('complete')
    // A bare company in a full sector charges double, which the panel must say.
    expect(whole.text()).toContain(`$${rentFor(r.monopoly!.state, a, 0)}B`)
  })

  it('explains an action rather than only naming it', () => {
    const r = room()
    r.monopoly!.state.owners[groupSpaces('pink')[0]] = 0
    const buttons = screenFor(r, 'token-0').findAll('.deed-actions button')
    expect(buttons.length).toBeGreaterThan(0)
    // Every action carries hover text saying what it does — "Mortgage" on its
    // own is a word a player is not required to already know.
    for (const button of buttons) {
      expect(button.attributes('title') ?? '').not.toBe('')
    }
    const mortgage = buttons.find((x) => x.text().includes('Mortgage'))!
    expect(mortgage.attributes('title')).toContain('earns no rent')
  })

  it('marks a mortgaged property and offers the way back', () => {
    const r = room()
    const space = groupSpaces('pink')[0]
    r.monopoly!.state.owners[space] = 0
    r.monopoly!.state.mortgaged[space] = true
    const deed = screenFor(r, 'token-0').find('.deed')
    expect(deed.classes()).toContain('mortgaged')
    expect(deed.text()).toContain('Mortgaged')
    // A mortgaged space charges nothing, so no rent figure is claimed for it.
    expect(deed.text()).not.toContain('Rent $')
    expect(deed.text()).toContain('Lift mortgage')
  })

  it('deals a drawn card onto the table, keyed so the animation replays', () => {
    const r = room()
    const mp = r.monopoly!
    mp.state.lastCard = { deck: 'chance', text: 'Your lock-up expires.', player: 0 }
    mp.state.cardCount = 1
    const first = screenFor(r, 'token-0')
    const card = first.find('.card-drawn')
    expect(card.exists()).toBe(true)
    expect(card.classes()).toContain('chance')
    expect(card.text()).toContain('Your lock-up expires.')
    // The card names whose draw it was, which is the whole point of showing it
    // to the table rather than only to the player who drew it.
    expect(card.text()).toContain('Ada')

    // The other deck is marked differently, so which was turned over reads
    // before the words do.
    mp.state.lastCard = { deck: 'chest', text: 'An acquihire pays out.', player: 1 }
    mp.state.cardCount = 2
    expect(screenFor(r, 'token-0').find('.card-drawn').classes()).toContain('chest')
  })

  it('shows no card before one has been turned over', () => {
    const r = room()
    expect(screenFor(r, 'token-0').find('.card-drawn').exists()).toBe(false)
  })

  it('never tells a bankrupt seat it is their turn', () => {
    const r = room()
    const mp = r.monopoly!
    mp.state.owners[1] = 1
    mp.state.owners[3] = 1
    mp.state.houses[3] = 5
    mp.state.players[0].cash = 5
    mp.state.players[0].pos = 0
    // Walk seat 0 into a rent it can never raise, on its own turn.
    for (let seed = 1; seed < 200_000; seed++) {
      const probe = JSON.parse(JSON.stringify(mp.state))
      probe.rngPosition = seed
      const g = Object.create(Object.getPrototypeOf(mp)) as typeof mp
      g.state = probe
      g.roll(0)
      if (g.state.lastRoll?.to === 3) {
        mp.state.rngPosition = seed
        break
      }
    }
    mp.roll(0)
    expect(mp.state.players[0].bankrupt).toBe(true)

    const bust = screenFor(r, 'token-0')
    expect(bust.text()).not.toContain('Your turn')
    expect(bust.text()).not.toContain('Throw the dice')
    // The table has moved on to a seat that can actually play.
    expect(view(r, 'token-0').current).not.toBe(0)
  })

  it('announces the winner and offers the host another game', () => {
    const r = room(2)
    r.monopoly!.state.phase = 'over'
    r.monopoly!.state.result = { winner: 1, standings: [1, 0], reason: 'test' }
    r.monopoly!.state.players[0].bankrupt = true
    const screen = screenFor(r, 'token-0')
    expect(screen.text()).toContain('Bo wins!')
    expect(screen.text()).toContain('Play again')
  })
})

/*
 * What the same table does with no room for three columns. Nothing here is a
 * second implementation: the panels are the same asides, the prompt is the same
 * chain of buttons carried across by a teleport, and the card a tap opens is the
 * one a hover opens on a desktop.
 */
describe('the table on a narrow screen', () => {
  it('keeps the three columns and no tab bar where there is width for them', () => {
    const r = room()
    const screen = screenFor(r, 'token-0')

    expect(screen.find('.tabs').exists()).toBe(false)
    expect(screen.find('.now').exists()).toBe(false)
    expect(screen.find('.side').classes()).not.toContain('sheet')
    // The prompt stays in the middle of the board.
    expect(screen.find('.centre-panel .prompt').exists()).toBe(true)
  })

  it('moves the prompt out from under the board, where a thumb can reach it', async () => {
    const r = room()
    widthOf(390)
    const screen = screenFor(r, 'token-0')
    await screen.vm.$nextTick()

    // The same buttons, in the bar below the board rather than inside it.
    expect(screen.find('.actions-slot .prompt').exists()).toBe(true)
    expect(screen.find('.centre-panel .prompt').exists()).toBe(false)
    expect(screen.find('.actions-slot').text()).toContain('Throw the dice')

    // The dice stay on the board, and give up some of their size for it.
    expect(screen.find('.centre-panel .dice').exists()).toBe(true)
  })

  it('carries every seat and its cash above the board', () => {
    const r = room()
    widthOf(390)
    const screen = screenFor(r, 'token-0')

    const seats = screen.findAll('.now-seat')
    expect(seats).toHaveLength(3)
    // Your own row says so rather than repeating your name back at you.
    expect(seats[0].text()).toContain('You')
    expect(seats[1].text()).toContain('Bo')
    expect(seats[0].text()).toContain(money(r.monopoly!.state.players[0].cash))
    // The seat on turn is marked, which is the fact the strip exists for.
    expect(seats[0].classes()).toContain('current')
    expect(seats[1].classes()).not.toContain('current')
  })

  it('keeps the side columns off the board until a tab asks for them', async () => {
    const r = room()
    widthOf(390)
    const screen = screenFor(r, 'token-0')

    const side = () => screen.find('.side')
    const manage = () => screen.find('.manage')
    expect(side().classes()).toContain('sheet')
    expect(side().classes()).not.toContain('open')
    expect(manage().classes()).not.toContain('open')
    expect(screen.find('.sheet-scrim').exists()).toBe(false)

    // Players, properties, the log and the chat.
    const tabs = screen.findAll('.tab')
    expect(tabs).toHaveLength(4)

    // Players, the log and the chat share one sheet and take turns in it.
    await tabs[0].trigger('click')
    expect(side().classes()).toContain('open')
    expect(side().classes()).toContain('only-players')
    expect(screen.find('.sheet-scrim').exists()).toBe(true)

    await tabs[2].trigger('click')
    expect(side().classes()).toContain('only-log')
    expect(side().text()).toContain('Play log')

    await tabs[3].trigger('click')
    expect(side().classes()).toContain('only-chat')
    expect(side().find('.chat .composer').exists()).toBe(true)

    // Properties is the other column, and only one is ever up.
    await tabs[1].trigger('click')
    expect(manage().classes()).toContain('open')
    expect(side().classes()).not.toContain('open')

    // Tapping beside the sheet puts it away.
    await screen.find('.sheet-scrim').trigger('click')
    expect(manage().classes()).not.toContain('open')
  })

  it('counts the log lines that go by behind a shut sheet, and clears them', async () => {
    const r = room()
    widthOf(390)
    const screen = screenFor(r, 'token-0')

    // What was already there when the table opened is not news.
    expect(screen.find('.tab-count.unread').exists()).toBe(false)

    // A broadcast moves both: the list itself is trimmed once it is full, so
    // `logCount` is what the badge counts against.
    const store = useGameStore()
    store.monopoly = {
      ...store.monopoly!,
      log: [...store.monopoly!.log, { turn: 1, player: 1, text: 'buys something.' }],
      logCount: store.monopoly!.logCount + 1,
    }
    await screen.vm.$nextTick()
    expect(screen.find('.tab-count.unread').text()).toBe('1')

    await screen.findAll('.tab')[2].trigger('click')
    expect(screen.find('.tab-count.unread').exists()).toBe(false)
  })

  it('goes on counting once the log is full and its length stops moving', async () => {
    const r = room()
    widthOf(390)
    const screen = screenFor(r, 'token-0')
    const store = useGameStore()

    // A long game: the log is at its cap, so the list can only ever shed a line
    // from the front as it takes one at the back.
    const full = Array.from({ length: LOG_KEEP }, (_, i) => ({
      turn: 1,
      player: 0,
      text: `line ${i}`,
    }))
    store.monopoly = { ...store.monopoly!, log: full, logCount: LOG_KEEP }
    await screen.vm.$nextTick()

    // Read it, then shut it again: that is the state the badge measures from.
    const logTab = () => screen.findAll('.tab')[2]
    await logTab().trigger('click')
    await logTab().trigger('click')
    expect(screen.find('.tab-count.unread').exists(), 'caught up').toBe(false)

    store.monopoly = {
      ...store.monopoly!,
      log: [...full.slice(1), { turn: 2, player: 1, text: 'and one more' }],
      logCount: LOG_KEEP + 1,
    }
    await screen.vm.$nextTick()
    // The length is identical either side of that; only the count moved.
    expect(screen.find('.tab-count.unread').text(), 'still counting').toBe('1')
  })

  it('opens a space card on a tap, since there is no hover to open it with', async () => {
    const r = room()
    widthOf(390)
    const screen = screenFor(r, 'token-0')

    expect(screen.find('.detail-sheet').exists()).toBe(false)
    // The third space is a company, so the card has a price and a rent ladder.
    await screen.findAll('.space')[3].trigger('click')

    const sheet = screen.find('.detail-sheet')
    expect(sheet.exists()).toBe(true)
    expect(sheet.text()).toContain(SPACES[3].name)
    expect(sheet.text()).toContain(money(priceOf(3)))

    await screen.find('.detail-scrim').trigger('click')
    expect(screen.find('.detail-sheet').exists()).toBe(false)
  })

  it('leaves the hover card to the screens that have a pointer', async () => {
    const r = room()
    widthOf(390)
    const screen = screenFor(r, 'token-0')

    // The same event a desktop opens the floating card with does nothing here;
    // the tap sheet above is what answers it.
    await screen.findAll('.space')[3].trigger('mouseenter')
    expect(document.querySelector('.detail-layer')).toBeNull()
  })
})

/**
 * Where the controls live, now that a turn ends itself and a trade belongs to
 * nobody's turn in particular.
 */
describe('the turn controls', () => {
  it('offers no way to end a turn by hand', () => {
    const r = room()
    widthOf(1400)
    const screen = screenFor(r, 'token-0')

    expect(screen.text()).not.toContain('End turn')
    expect(screen.find('.prompt .btn.big').text(), 'only the throw').toContain('Throw')
  })

  it('keeps the trade offer with the deeds, not with the dice', () => {
    const r = room()
    widthOf(1400)
    const screen = screenFor(r, 'token-0')

    // In the property panel, where the chat and the player list live.
    expect(screen.find('.manage .trade-open').exists()).toBe(true)
    expect(screen.find('.manage .trade-open').text()).toContain('Offer a trade')
    // And nowhere near the board's own prompt.
    expect(screen.find('.prompt .trade-open').exists()).toBe(false)
    expect(screen.find('.centre-panel .trade-open').exists()).toBe(false)
  })

  it('offers it to a seat that is not on turn as well', () => {
    const r = room()
    widthOf(1400)
    const waiting = screenFor(r, 'token-1')

    expect(waiting.find('.manage .trade-open').exists()).toBe(true)
    // That seat has no throw to make, and still nothing to end.
    expect(waiting.find('.prompt .btn.big').exists()).toBe(false)
    expect(waiting.text()).not.toContain('End turn')
  })

  it('takes the offer away while the table is waiting on a decision', () => {
    const r = room()
    r.monopoly!.state.pending = [{ step: 'buy', player: 0, space: 1 }]
    widthOf(1400)
    const screen = screenFor(r, 'token-0')

    expect(screen.find('.manage .trade-open').exists()).toBe(false)
  })

  it('reaches the trade through the property tab on a phone', async () => {
    const r = room()
    widthOf(390)
    const screen = screenFor(r, 'token-0')

    // It rides in the same sheet as the deeds, so it opens with that tab.
    const tabs = screen.findAll('.tab')
    await tabs[1].trigger('click')
    expect(screen.find('.manage.open').exists()).toBe(true)
    expect(screen.find('.manage .trade-open').exists()).toBe(true)
  })
})
