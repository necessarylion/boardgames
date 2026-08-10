<script setup lang="ts">
import { computed } from 'vue'
import GameIcon from '../common/GameIcon.vue'
import { CASTES, type Caste } from '@shared/types'
import { castePiece, t } from '@/i18n'
import { CAPTURE_NOTICE_MS, useGameStore } from '@/stores/game'

const game = useGameStore()

/** Grouped so a turn that took two of a caste reads as one line with a count. */
const haul = computed(() => {
  const counts = new Map<Caste, number>()
  for (const caste of game.capturedNotice) counts.set(caste, (counts.get(caste) ?? 0) + 1)
  return CASTES.filter((c) => counts.has(c)).map((caste) => ({ caste, count: counts.get(caste)! }))
})

const headline = computed(() =>
  game.capturedNotice.length === 1
    ? t('capture.one', { piece: castePiece(game.capturedNotice[0]) })
    : t('capture.many', { count: game.capturedNotice.length }),
)
</script>

<template>
  <div v-if="game.capturedNotice.length" class="backdrop" @click.self="game.dismissCaptureNotice()">
    <div class="panel dialog" role="alertdialog" aria-live="polite">
      <p class="tiny muted eyebrow">{{ t('capture.eyebrow') }}</p>
      <h2>{{ headline }}</h2>

      <ul class="haul">
        <li v-for="row in haul" :key="row.caste">
          <GameIcon :name="row.caste" :size="34" />
          <span class="piece">{{ castePiece(row.caste) }}</span>
          <span v-if="row.count > 1" class="count">×{{ row.count }}</span>
        </li>
      </ul>

      <p class="tiny muted note">{{ t('capture.note') }}</p>

      <button class="btn" autofocus @click="game.dismissCaptureNotice()">
        {{ t('capture.ok') }}
      </button>

      <!-- The bar runs out as the notice times itself out, so the dialog closing
           on its own does not read as the table doing something unasked. -->
      <div class="timer" :style="{ animationDuration: `${CAPTURE_NOTICE_MS}ms` }" />
    </div>
  </div>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  background: rgba(38, 28, 18, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.25rem;
  z-index: 45;
  backdrop-filter: blur(2px);
}

.dialog {
  position: relative;
  overflow: hidden;
  width: min(24rem, 100%);
  padding: 1.4rem 1.5rem 1.5rem;
  text-align: center;
  box-shadow: var(--shadow-lg);
  animation: rise 220ms ease-out;
}

.eyebrow {
  text-transform: uppercase;
  letter-spacing: 0.14em;
  margin: 0;
}

h2 {
  font-size: 1.35rem;
  margin: 0.2rem 0 0.9rem;
}

.haul {
  display: flex;
  justify-content: center;
  gap: 0.6rem;
  flex-wrap: wrap;
  list-style: none;
  margin: 0 0 0.9rem;
  padding: 0;
}

.haul li {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.15rem;
  min-width: 4.6rem;
  padding: 0.6rem 0.5rem;
  border: 1px solid var(--gold-line);
  border-radius: var(--radius);
  background: var(--paper-2);
  color: var(--vermillion-dark);
}

.piece {
  font-family: var(--font-display);
  font-size: 0.85rem;
  color: var(--ink);
}

.count {
  font-size: 0.78rem;
  font-variant-numeric: tabular-nums;
  color: var(--ink-soft);
}

.note {
  margin: 0 0 1rem;
}

.timer {
  position: absolute;
  left: 0;
  bottom: 0;
  height: 3px;
  width: 100%;
  background: var(--vermillion);
  transform-origin: left;
  animation-name: drain;
  animation-timing-function: linear;
  animation-fill-mode: forwards;
}

@keyframes drain {
  from {
    transform: scaleX(1);
  }
  to {
    transform: scaleX(0);
  }
}

@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(0.6rem) scale(0.97);
  }
}

@media (prefers-reduced-motion: reduce) {
  .dialog,
  .timer {
    animation: none;
  }
}
</style>
