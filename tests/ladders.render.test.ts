// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'

import LaddersGameScreen from '../src/components/ladders/LaddersGameScreen.vue'
import { DEFAULT_OPTIONS } from '../shared/engine'
import { JUMPS, LAST_SQUARE } from '../shared/ladders'
import type { LaddersClientState } from '../shared/protocol'
import { Room } from '../server/rooms'
import { useGameStore } from '../src/stores/game'

function room(): Room {
  const r = new Room('TEST')
  r.options = { ...DEFAULT_OPTIONS, kind: 'ladders', diceStart: false }
  r.addSeat('token-a', 'Ada')
  r.addSeat('token-b', 'Bo')
  r.start()
  r.ladders!.state.current = 0
  return r
}

const view = (r: Room, token: string) => r['stateFor'](token) as LaddersClientState

/**
 * The die is a fixed-size canvas, so it is the one thing on this table that has
 * to be told the width rather than left to CSS. jsdom windows are reused
 * between files, so each case sets the size it means to test.
 */
function sizeTo(w: number, h: number) {
  window.innerWidth = w
  window.innerHeight = h
  window.dispatchEvent(new Event('resize'))
}

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
  sizeTo(1280, 900)
})

describe('the Snakes & Ladders table', () => {
  it('draws every square, every jump and a token per seat, and offers the roll to the roller', () => {
    const r = room()
    const game = useGameStore()
    game.ladders = view(r, 'token-a')
    const wrapper = mount(LaddersGameScreen)
    expect(wrapper.findAll('.board rect').length).toBeGreaterThanOrEqual(LAST_SQUARE)
    expect(wrapper.findAll('.snake').length + wrapper.findAll('.ladder').length).toBe(
      Object.keys(JUMPS).length,
    )
    expect(wrapper.findAll('.token')).toHaveLength(2)
    expect(wrapper.text()).toContain('Your turn')
    expect((wrapper.find('.roll').element as HTMLButtonElement).disabled).toBe(false)
  })

  it('disables the roll for the seat waiting, and narrates the last throw', () => {
    const r = room()
    r.ladders!.roll(0)
    const game = useGameStore()
    game.ladders = view(r, 'token-b')
    const wrapper = mount(LaddersGameScreen)
    const l = r.ladders!.state.lastRoll!
    expect(wrapper.text()).toContain(`Ada rolled ${l.roll}`)
    expect((wrapper.find('.roll').element as HTMLButtonElement).disabled).toBe(l.again)
  })

  it('shrinks the die to the screen it is thrown on', async () => {
    const r = room()
    const game = useGameStore()
    game.ladders = view(r, 'token-a')

    // The 3D die loads asynchronously, so what is asserted here is the size the
    // table asks for rather than the canvas it eventually gets.
    const wrapper = mount(LaddersGameScreen)
    const size = () => (wrapper.vm as unknown as { dieSize: number }).dieSize

    expect(size(), 'a desktop gets the full-sized die').toBe(170)

    sizeTo(320, 568)
    await nextTick()
    expect(size(), 'the narrowest phone gets the smallest die').toBeLessThanOrEqual(110)
    expect(size(), 'but never one too small to read').toBeGreaterThanOrEqual(80)

    sizeTo(390, 844)
    await nextTick()
    expect(size()).toBeGreaterThan(110)

    // A phone on its side has height to spare nowhere, so the die gives way.
    sizeTo(844, 390)
    await nextTick()
    expect(size(), 'held sideways, height is what is scarce').toBeLessThanOrEqual(96)
  })

  it('keeps the roll dead for the seat that is not on turn', () => {
    const r = room()
    const game = useGameStore()
    game.ladders = view(r, 'token-b')
    const wrapper = mount(LaddersGameScreen)

    expect(wrapper.text()).toContain('Ada')
    expect((wrapper.find('.roll').element as HTMLButtonElement).disabled).toBe(true)
  })
})
