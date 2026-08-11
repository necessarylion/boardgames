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
 * Shared by Samurai's clock and Coup's, which differ only in which state they
 * read the remainder off and in how they draw it.
 */
export function useCountdown(msLeft: () => number | null, paused: Ref<boolean> | (() => boolean)) {
  const isPaused = typeof paused === 'function' ? computed(paused) : paused
  const deadlineAt = ref<number | null>(null)
  const now = ref(Date.now())

  watch(
    msLeft,
    (left) => {
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
