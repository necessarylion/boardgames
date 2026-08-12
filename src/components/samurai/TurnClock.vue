<script setup lang="ts">
import { useCountdown } from '@/composables/useCountdown'
import { t } from '@/i18n'
import { useGameStore } from '@/stores/game'

const game = useGameStore()

// The counting itself is shared with Coup's clock; see the composable for why
// the server sends a remainder rather than a deadline.
const { label, urgent } = useCountdown(
  () => game.state?.turnMsLeft ?? null,
  () => game.isPaused,
)
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
