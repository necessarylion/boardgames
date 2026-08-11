// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'

import CoupCard from '../src/components/coup/CoupCard.vue'
import CoupGameScreen from '../src/components/coup/CoupGameScreen.vue'
import { CHARACTERS } from '../shared/coup'
import { DEFAULT_OPTIONS } from '../shared/engine'
import type { CoupClientState } from '../shared/protocol'
import { Room } from '../server/rooms'
import { useGameStore } from '../src/stores/game'

/**
 * A started four-player Coup room, to render a real table against, with seat 0
 * put on turn — the opening seat is drawn at random, and these tests are about
 * what is on screen rather than who won the roll.
 */
function room(): Room {
  const r = new Room('TEST')
  r.options = { ...DEFAULT_OPTIONS, kind: 'coup' }
  r.addSeat('token-a', 'Ada')
  r.addSeat('token-b', 'Bo')
  r.addSeat('token-c', 'Cy')
  r.addSeat('token-d', 'Di')
  r.start()
  r.coup!.state.current = 0
  return r
}

const view = (r: Room, token: string) => r['stateFor'](token) as CoupClientState

/** Seat box the ring reserves; kept in step with the component's constants. */
const SEAT_W = 168
const SEAT_H = 168

/**
 * jsdom lays nothing out — every element measures zero and there is no
 * ResizeObserver — so the ring has nothing to size itself against and falls back
 * to stacking. Standing one in that reports a fixed box is what lets the ring
 * arithmetic be tested at a chosen size.
 */
function stubResizeObserver(width: number, height: number) {
  class Stub {
    constructor(private cb: ResizeObserverCallback) {}
    observe() {
      this.cb([{ contentRect: { width, height } } as ResizeObserverEntry], this as never)
    }
    unobserve() {}
    disconnect() {}
  }
  ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver = Stub
}

/**
 * Mount the table and let it settle. Two ticks, not one: the first runs the
 * watcher that attaches the observer and records the box, the second re-renders
 * the seats now that there is a box to place them in.
 */
async function mountTable() {
  const wrapper = mount(CoupGameScreen)
  await nextTick()
  await nextTick()
  return wrapper
}

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
})

afterEach(() => {
  delete (globalThis as { ResizeObserver?: unknown }).ResizeObserver
})

/**
 * The influence card is the one place a hidden card could be spilled onto the
 * page, so these check the two halves of that: a named card prints its character
 * and power, and a face-down one prints nothing that could identify it.
 */
describe('an influence card', () => {
  it('shows the card artwork as the whole face', () => {
    const card = mount(CoupCard, { props: { character: 'duke' } })
    const face = card.find('img.face')
    expect(face.exists()).toBe(true)
    // The art carries its own name and power, so it replaces the drawn banner.
    expect(face.attributes('alt')).toBe('Duke')
    expect(card.find('.label').exists()).toBe(false)
  })

  it('carries the character’s ability in a hover tip', () => {
    const card = mount(CoupCard, { props: { character: 'captain', size: 'small' } })
    const tip = card.find('.tip')
    // Present in the markup and revealed by :hover, so it works on a seat-sized
    // card where the printed power is far too small to read.
    expect(tip.exists()).toBe(true)
    expect(tip.text()).toContain('Captain')
    expect(tip.text()).toContain('Steal')
    expect(tip.attributes('role')).toBe('tooltip')
  })

  it('gives every character a face, at either size', () => {
    for (const character of CHARACTERS) {
      for (const size of ['small', 'normal'] as const) {
        const card = mount(CoupCard, { props: { character, size } })
        expect(card.find('img.face').attributes('src')).toBeTruthy()
      }
    }
  })

  it('falls back to the drawn emblem and banner when a character has no art', () => {
    // COUP_PORTRAITS is keyed by character, so a card for one that is missing
    // from it takes the silhouette route instead — the graceful-degradation
    // path the icon registry is built around.
    const card = mount(CoupCard, { props: { character: 'nobody' as never } })
    expect(card.find('img.face').exists()).toBe(false)
    expect(card.find('svg').exists()).toBe(true)
    expect(card.find('.label').exists()).toBe(true)
  })

  it('says nothing at all when face down', () => {
    const card = mount(CoupCard, { props: { character: null } })
    expect(card.text()).toBe('')
    for (const character of CHARACTERS) {
      expect(card.html().toLowerCase()).not.toContain(character)
    }
    // No tip either: a hover must not reveal what the back is hiding.
    expect(card.find('.tip').exists()).toBe(false)
  })

  it('is a button only when it can be picked', () => {
    const plain = mount(CoupCard, { props: { character: 'contessa' } })
    expect(plain.element.tagName).toBe('DIV')

    const pick = mount(CoupCard, { props: { character: 'contessa', selectable: true } })
    expect(pick.element.tagName).toBe('BUTTON')
  })
})

describe('the table', () => {
  it('seats every player and puts the viewer at the head of the ring', () => {
    const r = room()
    const game = useGameStore()
    // Cy is seat 2, so an unrotated ring would draw Ada first.
    game.coup = view(r, 'token-c')

    const wrapper = mount(CoupGameScreen)
    const seats = wrapper.findAll('.player')
    expect(seats).toHaveLength(4)
    // The viewer is drawn first, and the rest follow in play order round to them.
    expect(seats.map((s) => s.find('.pname').text())).toEqual(['Cy', 'Di', 'Ada', 'Bo'])
  })

  it('lays the seats round a ring once the box is big enough', async () => {
    stubResizeObserver(900, 520)
    const r = room()
    const game = useGameStore()
    game.coup = view(r, 'token-a')

    const wrapper = await mountTable()

    expect(wrapper.find('.ring').classes()).not.toContain('stacked')
    const at = wrapper.findAll('.player').map((s) => s.attributes('style') ?? '')
    // Four seats, four distinct places, the viewer's at the bottom centre:
    // half the width across, and half the height plus the vertical radius down.
    // Half the height, plus a radius of (520/2 - 168/2 - 8) = 168.
    expect(new Set(at).size).toBe(4)
    expect(at[0]).toContain('left: 450px')
    expect(at[0]).toContain('top: 428px')
    // The seat opposite is the same distance the other way.
    expect(at[2]).toContain('top: 92px')
  })

  it('keeps every seat inside the box as it shrinks', async () => {
    // The tightest box that still counts as a ring rather than a stack.
    stubResizeObserver(560, 400)
    const r = room()
    const game = useGameStore()
    game.coup = view(r, 'token-a')

    const wrapper = await mountTable()

    // The radius is half the box less half a seat, so no seat can hang outside
    // it however tight the box gets — which is what used to overlap the buttons.
    for (const seat of wrapper.findAll('.player')) {
      const style = seat.attributes('style') ?? ''
      const left = Number(/left:\s*(-?[\d.]+)px/.exec(style)?.[1])
      const top = Number(/top:\s*(-?[\d.]+)px/.exec(style)?.[1])
      expect(left - SEAT_W / 2).toBeGreaterThanOrEqual(0)
      expect(left + SEAT_W / 2).toBeLessThanOrEqual(560)
      expect(top - SEAT_H / 2).toBeGreaterThanOrEqual(0)
      expect(top + SEAT_H / 2).toBeLessThanOrEqual(400)
    }
  })

  it('stacks instead of ringing when the box is too small to hold a ring', async () => {
    stubResizeObserver(320, 240)
    const r = room()
    const game = useGameStore()
    game.coup = view(r, 'token-a')

    const wrapper = await mountTable()

    expect(wrapper.find('.ring').classes()).toContain('stacked')
    // Stacked seats carry no positioning at all; the flex layout places them.
    for (const seat of wrapper.findAll('.player')) {
      expect(seat.attributes('style') ?? '').not.toContain('left:')
    }
  })

  it('gathers every lost influence into the middle, not onto its old seat', async () => {
    const r = room()
    // Ada gives up a Duke and Bo a Contessa. Cy, the viewer, holds neither, so
    // the assertions below cannot be satisfied by Cy's own face-up hand.
    r.coup!.state.players[0].hand = ['captain']
    r.coup!.state.players[0].revealed = ['duke']
    r.coup!.state.players[1].hand = ['assassin']
    r.coup!.state.players[1].revealed = ['contessa']
    r.coup!.state.players[2].hand = ['captain', 'captain']

    const game = useGameStore()
    game.coup = view(r, 'token-c')
    const wrapper = await mountTable()

    const court = wrapper.find('.court')
    expect(court.exists()).toBe(true)
    expect(court.findAll('.court-card')).toHaveLength(2)
    expect(court.findAll('img.face').map((c) => c.attributes('alt')).sort()).toEqual([
      'Contessa',
      'Duke',
    ])
    // The spent cards live only in the middle — no seat shows one.
    expect(wrapper.findAll('.player .cards .card.duke')).toHaveLength(0)
    expect(wrapper.findAll('.player .cards .card.contessa')).toHaveLength(0)
    expect(wrapper.findAll('.player .cards .card.spent')).toHaveLength(0)
  })

  it('shows your influence in your own seat and nobody else’s', async () => {
    const r = room()
    r.coup!.state.players[2].hand = ['captain', 'duke']

    const game = useGameStore()
    game.coup = view(r, 'token-c')
    const wrapper = await mountTable()

    // Cy is the viewer, so Cy's seat is the one place cards are face up.
    const seats = wrapper.findAll('.player')
    const mine = seats.find((s) => s.classes().includes('me'))!
    expect(mine.findAll('img.face').map((c) => c.attributes('alt'))).toEqual(['Captain', 'Duke'])

    for (const seat of seats) {
      if (seat.classes().includes('me')) continue
      expect(seat.findAll('img.face')).toHaveLength(0)
      expect(seat.findAll('.card.down')).toHaveLength(2)
    }
  })

  it('logs what everyone did, with seat tokens swapped for real names', async () => {
    const r = room()
    r.coup!.declare(0, 'steal', 1)
    r.coup!.pass(1)
    r.coup!.pass(2)
    r.coup!.pass(3)

    const game = useGameStore()
    game.coup = view(r, 'token-a')
    const wrapper = await mountTable()

    const log = wrapper.find('.log')
    expect(log.exists()).toBe(true)
    const text = log.text()
    expect(text).toContain('Ada')
    expect(text).toContain('Bo')
    // The engine writes `#1` because the rules layer has no idea who Bo is.
    expect(text).not.toContain('#1')
  })

  it('keeps the log and the controls out of the ring’s flow', async () => {
    stubResizeObserver(900, 520)
    const r = room()
    const game = useGameStore()
    game.coup = view(r, 'token-a')
    const wrapper = await mountTable()

    // Both are children of the table, but neither is a flex sibling competing
    // with the ring for height — that is what pushed the bottom seat upwards.
    const table = wrapper.find('.table')
    expect(table.find('.log').exists()).toBe(true)
    expect(table.find('.controls').exists()).toBe(true)
    // The bottom seat still reaches the foot of the full-height ring.
    const at = wrapper.findAll('.player').map((s) => s.attributes('style') ?? '')
    expect(at[0]).toContain('top: 428px')
  })

  it('lays the controls out two buttons to a row, in the corner', async () => {
    const r = room()
    // Three coins puts every action but a coup within reach: six buttons.
    r.coup!.state.players[0].coins = 3
    const game = useGameStore()
    game.coup = view(r, 'token-a')
    const wrapper = await mountTable()

    const controls = wrapper.find('.controls')
    expect(controls.exists()).toBe(true)
    expect(controls.findAll('.buttons .btn')).toHaveLength(6)
  })

  it('says so plainly while nothing has been lost yet', () => {
    const r = room()
    const game = useGameStore()
    game.coup = view(r, 'token-a')

    const court = mount(CoupGameScreen).find('.court')
    expect(court.text()).toContain('Nobody has lost an influence yet')
    expect(court.findAll('.court-card')).toHaveLength(0)
  })
})
