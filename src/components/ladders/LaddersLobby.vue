<script setup lang="ts">
import { computed } from 'vue'
import GameIcon from '../common/GameIcon.vue'
import LobbySplit from '../common/LobbySplit.vue'
import TurnClockOptions from '../common/TurnClockOptions.vue'
import type { Power } from '@shared/ladders'
import { MIN_PLAYERS, maxPlayersFor } from '@shared/types'
import { t } from '@/i18n'
import { useGameStore } from '@/stores/game'

const maxSeats = maxPlayersFor('ladders')
const game = useGameStore()

/** Only the host may change these, and only before the deal. */
function setClock(turnSeconds: number) {
  const options = game.ladders?.options
  if (!options || !game.isHost) return
  game.setOptions({ ...options, turnSeconds })
}

/** Only the host may change this, and only before the deal. */
function setDice(diceStart: boolean) {
  const options = game.ladders?.options
  if (!options || !game.isHost) return
  game.setOptions({ ...options, diceStart })
}

const seats = computed(() => game.ldPlayers)
const POWER_LIST: Power[] = ['sprint', 'slip', 'again', 'skip', 'push', 'swap']
const canStart = computed(
  () =>
    game.isHost &&
    seats.value.length >= MIN_PLAYERS &&
    seats.value.length <= maxSeats &&
    // A colour or position still in the air: the answer decides whether the
    // table is legal, so the deal waits the round trip out.
    !game.seatBusy,
)
</script>

<template>
  <LobbySplit
    kind="ladders"
    :code="game.ladders?.code ?? ''"
    :host-id="game.ladders?.hostId"
    :seats="seats"
    :max-seats="maxSeats"
  >
    <h2>{{ t('ladders.lobby.how') }}</h2>
    <ol class="rules">
      <li>{{ t('ladders.rule.roll') }}</li>
      <li>{{ t('ladders.rule.ladder') }}</li>
      <li>{{ t('ladders.rule.snake') }}</li>
      <li>{{ t('ladders.rule.win') }}</li>
      <li>
        {{ t('ladders.rule.powers') }}
        <ul class="powers">
          <li v-for="p in POWER_LIST" :key="p">
            <GameIcon :name="`ladders.${p}`" :size="18" />
            <span>{{ t(`ladders.power.${p}`) }}</span>
          </li>
        </ul>
      </li>
    </ol>

    <hr class="rule" />

    <!-- Set before the deal, because the clock is armed the moment play starts
         and changing it mid-game would move a live deadline. -->
    <TurnClockOptions
      :seconds="game.ladders?.options.turnSeconds ?? 0"
      :locked="!game.isHost"
      hint="ladders.turnClock.hint"
      @pick="setClock"
    />

    <label class="check" :class="{ locked: !game.isHost }">
      <input
        type="checkbox"
        :checked="game.ladders?.options.diceStart ?? true"
        :disabled="!game.isHost"
        @change="setDice(($event.target as HTMLInputElement).checked)"
      />
      <span>
        {{ t('option.diceStart') }}
        <em class="tiny muted">{{ t('option.diceStart.hint') }}</em>
      </span>
    </label>

    <p v-if="!game.isHost" class="tiny muted">{{ t('lobby.hostOnly') }}</p>

    <template #actions>
      <button class="btn wide" :disabled="!canStart" @click="game.startGame()">
        {{ game.isHost ? t('lobby.start') : t('lobby.waitingHost') }}
      </button>
      <p v-if="game.isHost && seats.length < MIN_PLAYERS" class="tiny muted centre">
        {{ t('lobby.needTwo') }}
      </p>
    </template>
  </LobbySplit>
</template>

<style scoped>
.powers {
  list-style: none;
  margin: 0.35rem 0 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(12rem, 1fr));
  gap: 0.3rem 1rem;
}

.powers li {
  display: flex;
  align-items: center;
  gap: 0.45rem;
}
</style>
