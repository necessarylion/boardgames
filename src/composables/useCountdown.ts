import { computed, onUnmounted, ref, watch, type Ref } from 'vue'

/**
 * Count a shot clock down between broadcasts.
 *
 * The server sends what is *left* of the period rather than a deadline, and it
 * only broadcasts when something changes — so the seconds in between are counted
 * here, from the moment the last remainder arrived. Sending a remainder is what
 * lets this read correctly on a device whose own clock is wrong, and every
 * broadcast quietly corrects any drift that has crept in.
 *
 * Shared by every timed game, which differ only in which state they read the
 * remainder off and in how they draw it.
 *
 * It takes the whole state rather than the number for one specific reason: a
 * fresh period reports the *same* remainder as the last one. Watching
 * `turnMsLeft` alone meant that when a turn passed — 30000 left, then 30000
 * left again for the next player — the value had not changed, Vue did not fire,
 * and the local anchor stayed on the previous player's turn. The clock then
 * read 0:00 for the rest of the game. Watching the state object re-anchors on
 * every broadcast, because the server sends a new one each time, and the
 * remainder it carries is only true at the moment it was built.
 */
export function useCountdown(
  source: () => { turnMsLeft: number | null } | null | undefined,
  paused: Ref<boolean> | (() => boolean),
) {
  const msLeft = () => source()?.turnMsLeft ?? null
  const isPaused = typeof paused === 'function' ? computed(paused) : paused
  const deadlineAt = ref<number | null>(null)
  const now = ref(Date.now())

  watch(
    source,
    () => {
      const left = msLeft()
      now.value = Date.now()
      deadlineAt.value = left === null ? null : now.value + left
    },
    { immediate: true },
  )

  const ticker = setInterval(() => (now.value = Date.now()), 250)
  onUnmounted(() => clearInterval(ticker))

  const remaining = computed(() => {
    // Paused: the server freezes the remainder, so show that rather than letting
    // the local ticker keep draining it between broadcasts.
    if (isPaused.value) return msLeft()
    return deadlineAt.value === null ? null : Math.max(0, deadlineAt.value - now.value)
  })

  /** Rounded up, so the clock only shows 0 when the time really is gone. */
  const label = computed(() => {
    if (remaining.value === null) return null
    const seconds = Math.ceil(remaining.value / 1000)
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
  })

  /** A frozen clock should not beat or flash, however little is left on it. */
  const urgent = computed(
    () => !isPaused.value && remaining.value !== null && remaining.value <= 10_000,
  )

  return { remaining, label, urgent }
}
