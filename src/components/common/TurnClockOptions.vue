<script setup lang="ts">
import { TURN_SECONDS_CHOICES } from '@shared/engine'
import { t } from '@/i18n'

defineProps<{ seconds: number; locked?: boolean }>()
const emit = defineEmits<{ (e: 'pick', seconds: number): void }>()

/** Minutes read better than 60s and 120s once the period passes a minute. */
function label(value: number): string {
  if (!value) return t('option.turnClock.off')
  return value % 60 === 0
    ? t('option.turnClock.minutes', { n: value / 60 })
    : t('option.turnClock.seconds', { n: value })
}
</script>

<template>
  <div class="clock-pick">
    <span class="clock-label tiny muted">{{ t('option.turnClock') }}</span>
    <div class="clock-options">
      <button
        v-for="value in TURN_SECONDS_CHOICES"
        :key="value"
        type="button"
        class="clock-option"
        :class="{ chosen: seconds === value }"
        :disabled="locked"
        @click="emit('pick', value)"
      >
        {{ label(value) }}
      </button>
    </div>
    <em v-if="seconds" class="tiny muted hint">{{ t('option.turnClock.hint') }}</em>
  </div>
</template>

<style scoped>
/* Deliberately the same row-of-buttons idiom as the board picker, so the two
   settings under the checkboxes read as one group rather than two controls. */
.clock-pick {
  margin: 0.85rem 0 0.9rem;
}

.clock-label {
  display: block;
  margin-bottom: 0.4rem;
}

.clock-options {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 0.4rem;
}

.clock-option {
  padding: 0.45rem 0.2rem;
  border: 1px solid rgba(160, 137, 102, 0.35);
  border-radius: var(--radius);
  background: transparent;
  color: var(--ink-soft);
  font-size: 0.78rem;
  line-height: 1.2;
  text-align: center;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
  transition: background 0.12s ease, color 0.12s ease, border-color 0.12s ease;
}

.clock-option:hover:not(:disabled) {
  background: rgba(178, 58, 44, 0.07);
}

.clock-option.chosen {
  border-color: var(--vermillion);
  background: rgba(178, 58, 44, 0.12);
  color: var(--vermillion-dark);
  font-weight: 600;
}

.clock-option:disabled {
  cursor: default;
  opacity: 0.55;
}

.hint {
  display: block;
  margin-top: 0.4rem;
  font-style: normal;
  line-height: 1.4;
}
</style>
