<script setup lang="ts">
import CoupCard from './CoupCard.vue'
import GameIcon from '../common/GameIcon.vue'
import {
  ACTION_KINDS,
  ASSASSINATE_COST,
  CHARACTERS,
  COUP_ACTIONS,
  COUP_COST,
  FORCED_COUP_AT,
  STARTING_COINS,
  STARTING_INFLUENCE,
} from '@shared/coup'
import { t } from '@/i18n'

/**
 * The quick reference: what each action costs, what it claims, and what can be
 * said against it. The table is generated from `COUP_ACTIONS` rather than
 * written out, so it cannot drift from the rules the engine actually enforces —
 * an action that changes what blocks it changes this page in the same commit.
 */
defineEmits<{ (e: 'close'): void }>()

const claimOf = (action: (typeof ACTION_KINDS)[number]) => {
  const claim = COUP_ACTIONS[action].claim
  return claim ? t(`coup.character.${claim}`) : t('coup.rules.anyone')
}

const blockedBy = (action: (typeof ACTION_KINDS)[number]) => {
  const blockers = COUP_ACTIONS[action].blockedBy
  if (!blockers.length) return t('coup.rules.nothing')
  return blockers.map((c) => t(`coup.character.${c}`)).join(', ')
}

const costOf = (action: (typeof ACTION_KINDS)[number]) => COUP_ACTIONS[action].cost
</script>

<template>
  <div class="veil" @click.self="$emit('close')">
    <div class="sheet panel" role="dialog" aria-modal="true">
      <header class="head">
        <h2>{{ t('coup.rules.title') }}</h2>
        <button class="btn ghost small" @click="$emit('close')">{{ t('coup.rules.close') }}</button>
      </header>

      <div class="scroll body">
        <p class="lead">
          {{
            t('coup.rules.aim', {
              influence: STARTING_INFLUENCE,
              coins: STARTING_COINS,
            })
          }}
        </p>

        <h3>{{ t('coup.rules.actions') }}</h3>
        <div class="table-wrap">
          <table class="actions">
            <thead>
              <tr>
                <th>{{ t('coup.rules.col.action') }}</th>
                <th>{{ t('coup.rules.col.cost') }}</th>
                <th>{{ t('coup.rules.col.claims') }}</th>
                <th>{{ t('coup.rules.col.blockedBy') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="action in ACTION_KINDS" :key="action">
                <td>
                  <strong>{{ t(`coup.action.${action}`) }}</strong>
                  <em class="tiny muted">{{ t(`coup.action.${action}.hint`) }}</em>
                </td>
                <td class="num">
                  <span v-if="costOf(action)" class="cost">
                    <GameIcon name="coup.coin" :size="13" />{{ costOf(action) }}
                  </span>
                  <span v-else class="muted">—</span>
                </td>
                <td>{{ claimOf(action) }}</td>
                <td>{{ blockedBy(action) }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <h3>{{ t('coup.rules.challenges') }}</h3>
        <ul class="points">
          <li>{{ t('coup.rules.challenge.who') }}</li>
          <li>{{ t('coup.rules.challenge.right') }}</li>
          <li>{{ t('coup.rules.challenge.wrong') }}</li>
          <li>{{ t('coup.rules.challenge.block') }}</li>
          <li>{{ t('coup.rules.challenge.cost') }}</li>
        </ul>

        <h3>{{ t('coup.rules.money') }}</h3>
        <ul class="points">
          <li>{{ t('coup.rules.money.coup', { cost: COUP_COST }) }}</li>
          <li>{{ t('coup.rules.money.forced', { at: FORCED_COUP_AT }) }}</li>
          <li>{{ t('coup.rules.money.assassin', { cost: ASSASSINATE_COST }) }}</li>
        </ul>

        <h3>{{ t('coup.lobby.characters') }}</h3>
        <div class="characters">
          <CoupCard v-for="c in CHARACTERS" :key="c" :character="c" />
        </div>
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
  width: min(46rem, 100%);
  max-height: min(88vh, 46rem);
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

h3 {
  margin: 1.1rem 0 0.5rem;
  font-size: 0.78rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--ink-faint);
}

h3:first-of-type {
  margin-top: 0;
}

/* Four columns is more than a phone has room for, so the table scrolls in its
   own box rather than forcing the whole sheet sideways. */
.table-wrap {
  overflow-x: auto;
}

.actions {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.86rem;
}

.actions th {
  text-align: left;
  font-size: 0.68rem;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: var(--ink-faint);
  padding: 0 0.5rem 0.35rem 0;
  white-space: nowrap;
}

.actions td {
  padding: 0.45rem 0.5rem 0.45rem 0;
  border-top: 1px solid rgba(150, 128, 94, 0.25);
  vertical-align: top;
}

.actions td em {
  display: block;
  font-style: normal;
  line-height: 1.35;
  margin-top: 0.1rem;
}

.num {
  white-space: nowrap;
}

.cost {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  color: var(--vermillion-dark);
  font-variant-numeric: tabular-nums;
}

.points {
  margin: 0;
  padding-left: 1.15rem;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  font-size: 0.88rem;
  line-height: 1.5;
  color: var(--ink-soft);
}

.characters {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}
</style>
