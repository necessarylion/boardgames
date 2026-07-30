<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { t } from '@/i18n'
import { useGameStore } from '@/stores/game'

const game = useGameStore()

/*
 * The server sends what is left of the period with every broadcast, and it only
 * broadcasts when something changes — so the seconds in between are counted
 * here, from the moment the last remainder arrived. Sending a remainder rather
 * than a deadline is what lets this read correctly on a device whose own clock
 * is wrong, and every broadcast quietly corrects any drift.
 */
const deadlineAt = ref<number | null>(null)
const now = ref(Date.now())

watch(
  () => game.state?.turnMsLeft ?? null,
  (left) => {
    now.value = Date.now()
    deadlineAt.value = left === null ? null : now.value + left
  },
  { immediate: true },
)

const ticker = setInterval(() => (now.value = Date.now()), 250)
onUnmounted(() => clearInterval(ticker))

const remaining = computed(() =>
  deadlineAt.value === null ? null : Math.max(0, deadlineAt.value - now.value),
)

/** Rounded up, so the clock only shows 0 when the time really is gone. */
const label = computed(() => {
  if (remaining.value === null) return null
  const seconds = Math.ceil(remaining.value / 1000)
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
})

const urgent = computed(() => remaining.value !== null && remaining.value <= 10_000)
</script>

<template>
  <span
    v-if="label !== null"
    class="clock"
    :class="{ urgent, mine: game.isMyTurn }"
    :title="t('game.timeLeft')"
    >{{ label }}</span
  >
</template>

<style scoped>
.clock {
  padding: 0.1rem 0.4rem;
  border-radius: 5px;
  border: 1px solid rgba(160, 137, 102, 0.4);
  color: var(--ink-soft);
  font-family: var(--font-display);
  font-size: 0.85rem;
  font-variant-numeric: tabular-nums;
  line-height: 1.4;
}

/* Only the player who is actually losing the turn gets the loud version. */
.clock.mine {
  color: var(--ink);
  border-color: rgba(122, 100, 70, 0.6);
}

.clock.urgent {
  border-color: var(--vermillion);
  color: var(--vermillion-dark);
  font-weight: 600;
}

.clock.urgent.mine {
  animation: clock-beat 1s ease-in-out infinite;
}

@keyframes clock-beat {
  0%,
  100% {
    background: transparent;
  }
  50% {
    background: rgba(178, 58, 44, 0.14);
  }
}

@media (prefers-reduced-motion: reduce) {
  .clock.urgent.mine {
    animation: none;
    background: rgba(178, 58, 44, 0.14);
  }
}
</style>
