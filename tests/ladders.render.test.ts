// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'

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

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
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
})
