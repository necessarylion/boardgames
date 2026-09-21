// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick, ref } from 'vue'

import { useCountdown } from '../src/composables/useCountdown'

/**
 * The shot clock's client half.
 *
 * The bug worth a test of its own: a fresh period reports the same remainder as
 * the one before it — 30 seconds left, then 30 seconds left again for the next
 * player — so a watcher keyed on that number never fires when a turn passes,
 * and the clock sticks at 0:00 for the rest of the game. It showed up in
 * Monopoly first, because its turns are short and the shot clock settles them
 * often, but every timed game shares this composable.
 */
type Clock = { turnMsLeft: number | null } | null

function harness(initial: Clock, paused = false) {
  const state = ref<Clock>(initial)
  const isPaused = ref(paused)
  const seen: { label: string | null; urgent: boolean } = { label: null, urgent: false }

  const Host = defineComponent({
    setup() {
      const { label, urgent } = useCountdown(
        () => state.value,
        () => isPaused.value,
      )
      return () => {
        seen.label = label.value
        seen.urgent = urgent.value
        return h('span', label.value ?? '-')
      }
    },
  })

  const wrapper = mount(Host)
  return { state, isPaused, seen, wrapper }
}

/** A broadcast is a *new* object every time, which is the whole point. */
const broadcast = (ms: number | null): Clock => ({ turnMsLeft: ms })

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('the countdown', () => {
  it('counts the period down between broadcasts', async () => {
    const { seen, wrapper } = harness(broadcast(30_000))
    expect(seen.label).toBe('0:30')

    vi.advanceTimersByTime(10_000)
    await nextTick()
    expect(seen.label).toBe('0:20')
    wrapper.unmount()
  })

  it('re-anchors when the next turn reports the very same remainder', async () => {
    const { state, seen, wrapper } = harness(broadcast(30_000))

    // The whole period goes by with nothing to broadcast, as it does when a
    // player has walked away from the table.
    vi.advanceTimersByTime(31_000)
    await nextTick()
    expect(seen.label, 'the period is spent').toBe('0:00')

    // The clock runs out, the turn passes, and the next player is handed a full
    // period — the same number as last time. The clock must start again.
    state.value = broadcast(30_000)
    await nextTick()
    expect(seen.label, 'a new turn is a new period').toBe('0:30')

    vi.advanceTimersByTime(5_000)
    await nextTick()
    expect(seen.label).toBe('0:25')
    wrapper.unmount()
  })

  it('keeps re-anchoring turn after turn', async () => {
    const { state, seen, wrapper } = harness(broadcast(30_000))
    for (let turn = 0; turn < 5; turn++) {
      vi.advanceTimersByTime(31_000)
      await nextTick()
      expect(seen.label).toBe('0:00')
      state.value = broadcast(30_000)
      await nextTick()
      expect(seen.label, `turn ${turn + 1}`).toBe('0:30')
    }
    wrapper.unmount()
  })

  it('hides itself when the table is untimed', async () => {
    const { state, seen, wrapper } = harness(broadcast(null))
    expect(seen.label).toBeNull()

    state.value = broadcast(45_000)
    await nextTick()
    expect(seen.label).toBe('0:45')

    state.value = broadcast(null)
    await nextTick()
    expect(seen.label).toBeNull()
    wrapper.unmount()
  })

  it('freezes while the table is paused rather than draining', async () => {
    const { isPaused, seen, wrapper } = harness(broadcast(30_000))
    isPaused.value = true
    await nextTick()

    vi.advanceTimersByTime(20_000)
    await nextTick()
    // Paused shows the server's frozen remainder, not the local ticker's.
    expect(seen.label).toBe('0:30')
    expect(seen.urgent, 'a frozen clock does not beat').toBe(false)
    wrapper.unmount()
  })

  it('turns urgent in the last ten seconds, and rounds up', async () => {
    const { seen, wrapper } = harness(broadcast(12_000))
    expect(seen.urgent).toBe(false)

    vi.advanceTimersByTime(3_000)
    await nextTick()
    expect(seen.label).toBe('0:09')
    expect(seen.urgent).toBe(true)
    wrapper.unmount()
  })

  it('survives a state that goes away entirely', async () => {
    const { state, seen, wrapper } = harness(broadcast(30_000))
    state.value = null
    await nextTick()
    expect(seen.label).toBeNull()
    wrapper.unmount()
  })
})
