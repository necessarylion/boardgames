<script setup lang="ts">
import { computed, ref } from 'vue'
import CoupCard from './CoupCard.vue'
import CoupRulesDialog from './CoupRulesDialog.vue'
import LobbySplit from '../common/LobbySplit.vue'
import TurnClockOptions from '../common/TurnClockOptions.vue'
import { CHARACTERS } from '@shared/coup'
import { MIN_PLAYERS, maxPlayersFor } from '@shared/types'
import { t } from '@/i18n'
import { useGameStore } from '@/stores/game'

const maxSeats = maxPlayersFor('coup')
const game = useGameStore()
const showRules = ref(false)

/** Only the host may change these, and only before the deal. */
function setClock(turnSeconds: number) {
  const options = game.coup?.options
  if (!options || !game.isHost) return
  game.setOptions({ ...options, turnSeconds })
}

function setDice(diceStart: boolean) {
  const options = game.coup?.options
  if (!options || !game.isHost) return
  game.setOptions({ ...options, diceStart })
}

const seats = computed(() => game.coupPlayers)
const canStart = computed(() => game.isHost && seats.value.length >= MIN_PLAYERS)
</script>

<template>
  <LobbySplit
    kind="coup"
    :code="game.coup?.code ?? ''"
    :host-id="game.coup?.hostId"
    :seats="seats"
    :max-seats="maxSeats"
  >
    <h2>{{ t('coup.lobby.how') }}</h2>
    <ol class="rules">
      <li>{{ t('coup.rule.influence') }}</li>
      <li>{{ t('coup.rule.turn') }}</li>
      <li>{{ t('coup.rule.challenge') }}</li>
      <li>{{ t('coup.rule.block') }}</li>
      <li>{{ t('coup.rule.coup') }}</li>
      <li>{{ t('coup.rule.win') }}</li>
    </ol>

    <hr class="rule" />

    <!-- Set before the deal, because the clock is armed the moment play
         starts and changing it mid-game would move a live deadline. -->
    <TurnClockOptions
      :seconds="game.coup?.options.turnSeconds ?? 0"
      :locked="!game.isHost"
      @pick="setClock"
    />

    <label class="check">
      <input
        type="checkbox"
        :checked="game.coup?.options.diceStart ?? true"
        :disabled="!game.isHost"
        @change="setDice(($event.target as HTMLInputElement).checked)"
      />
      <span>
        {{ t('option.diceStart') }}
        <em class="tiny muted">{{ t('option.diceStart.hint') }}</em>
      </span>
    </label>

    <p v-if="!game.isHost" class="tiny muted">{{ t('lobby.hostOnly') }}</p>

    <button class="btn wide" :disabled="!canStart" @click="game.startGame()">
      {{ game.isHost ? t('lobby.start') : t('lobby.waitingHost') }}
    </button>
    <p v-if="game.isHost && seats.length < MIN_PLAYERS" class="tiny muted centre">
      {{ t('lobby.needTwo') }}
    </p>

    <hr class="rule" />

    <h2>
      {{ t('coup.lobby.characters') }}
      <button class="btn ghost small" @click="showRules = true">
        {{ t('coup.rules.open') }}
      </button>
    </h2>
    <div class="characters">
      <CoupCard v-for="c in CHARACTERS" :key="c" :character="c" />
    </div>

    <CoupRulesDialog v-if="showRules" @close="showRules = false" />
  </LobbySplit>
</template>

<style scoped>
.characters {
  display: flex;
  gap: 0.6rem;
  flex-wrap: wrap;
  justify-content: center;
}
</style>
