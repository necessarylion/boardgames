<script setup lang="ts">
import CarnivalCard from './CarnivalCard.vue'
import { CARD_HIGH, CARD_LOW, MIN_RAISE, STARTING_CARNIVALS } from '@shared/carnivals'
import { t } from '@/i18n'

/**
 * The quick reference. The figures come straight from the engine constants, so
 * the sheet cannot drift from the ante, the raise minimum or the card range the
 * rules actually use.
 */
defineEmits<{ (e: 'close'): void }>()
</script>

<template>
  <div class="veil" @click.self="$emit('close')">
    <div class="sheet panel" role="dialog" aria-modal="true">
      <header class="head">
        <h2>{{ t('carnival.rules.title') }}</h2>
        <button class="btn ghost small" @click="$emit('close')">{{ t('carnival.rules.close') }}</button>
      </header>

      <div class="scroll body">
        <p class="lead">
          {{ t('carnival.rules.aim', { carnivals: STARTING_CARNIVALS, low: CARD_LOW, high: CARD_HIGH }) }}
        </p>

        <div class="demo">
          <div class="demo-cards">
            <CarnivalCard colour="red" :value="7" />
            <CarnivalCard colour="blue" facedown="mine" />
          </div>
          <p class="tiny muted">{{ t('carnival.rules.demo') }}</p>
        </div>

        <h3>{{ t('carnival.rules.visibility') }}</h3>
        <ul class="points">
          <li>{{ t('carnival.rules.vis.ownRed') }}</li>
          <li>{{ t('carnival.rules.vis.ownBlue') }}</li>
          <li>{{ t('carnival.rules.vis.theirBlue') }}</li>
          <li>{{ t('carnival.rules.vis.theirRed') }}</li>
        </ul>

        <h3>{{ t('carnival.rules.betting') }}</h3>
        <ul class="points">
          <li>{{ t('carnival.rules.bet.ante') }}</li>
          <li>{{ t('carnival.rules.bet.actions', { raise: MIN_RAISE }) }}</li>
          <li>{{ t('carnival.rules.bet.close') }}</li>
          <li>{{ t('carnival.rules.bet.stakes') }}</li>
        </ul>

        <h3>{{ t('carnival.rules.scoring') }}</h3>
        <ul class="points">
          <li>{{ t('carnival.rules.score.total') }}</li>
          <li>{{ t('carnival.rules.score.tie') }}</li>
          <li>{{ t('carnival.rules.score.out') }}</li>
          <li>{{ t('carnival.rules.score.win') }}</li>
        </ul>

        <p class="motto">“{{ t('carnival.rules.motto') }}”</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.veil {
  position: fixed;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 1rem;
  background: rgba(28, 22, 19, 0.5);
  z-index: 70;
}

.sheet {
  display: flex;
  flex-direction: column;
  width: min(40rem, 100%);
  max-height: min(88vh, 44rem);
  padding: 1rem 1.1rem 1.1rem;
}

.head {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 0.6rem;
}

.head h2 {
  font-size: 1.25rem;
}

.body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding-right: 0.2rem;
}

.lead {
  margin: 0 0 1rem;
  line-height: 1.55;
  color: var(--ink-soft);
}

.demo {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin: 0 0 0.5rem;
  padding: 0.8rem 1rem;
  border-radius: 10px;
  background: rgba(150, 128, 94, 0.1);
}

.demo-cards {
  display: flex;
  gap: 0.45rem;
}

h3 {
  margin: 1.1rem 0 0.5rem;
  font-size: 0.78rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--ink-faint);
}

.points {
  margin: 0;
  padding-left: 1.15rem;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  font-size: 0.9rem;
  line-height: 1.5;
  color: var(--ink-soft);
}

.motto {
  margin: 1.2rem 0 0;
  font-style: italic;
  text-align: center;
  color: var(--ink-faint);
}
</style>
