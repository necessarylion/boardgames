<script setup lang="ts">
import { computed } from 'vue'
import LobbySplit from '../common/LobbySplit.vue'
import { MIN_PLAYERS, maxPlayersFor } from '@shared/types'
import { t } from '@/i18n'
import { useGameStore } from '@/stores/game'

const maxSeats = maxPlayersFor('halligalli')
const game = useGameStore()

/** Host only, and only before the deal — the seat is drawn when cards are dealt. */
function setDice(diceStart: boolean) {
  const options = game.halli?.options
  if (!options || !game.isHost) return
  game.setOptions({ ...options, diceStart })
}

const seats = computed(() => game.hgPlayers)
const canStart = computed(() => game.isHost && seats.value.length >= MIN_PLAYERS)
</script>

<template>
  <LobbySplit
    kind="halligalli"
    :code="game.halli?.code ?? ''"
    :host-id="game.halli?.hostId"
    :seats="seats"
    :max-seats="maxSeats"
  >
    <h2>{{ t('halli.lobby.how') }}</h2>
    <ol class="rules">
      <li>{{ t('halli.rule.flip') }}</li>
      <li>{{ t('halli.rule.ring') }}</li>
      <li>{{ t('halli.rule.win') }}</li>
      <li>{{ t('halli.rule.false') }}</li>
      <li>{{ t('halli.rule.out') }}</li>
    </ol>

    <hr class="rule" />

    <label class="check">
      <input
        type="checkbox"
        :checked="game.halli?.options.diceStart ?? true"
        :disabled="!game.isHost"
        @change="setDice(($event.target as HTMLInputElement).checked)"
      />
      <span>
        {{ t('option.diceStart') }}
        <em class="tiny muted">{{ t('option.diceStart.hint') }}</em>
      </span>
    </label>

    <button class="btn wide" :disabled="!canStart" @click="game.startGame()">
      {{ game.isHost ? t('lobby.start') : t('lobby.waitingHost') }}
    </button>
    <p v-if="game.isHost && seats.length < MIN_PLAYERS" class="tiny muted centre">
      {{ t('lobby.needTwo') }}
    </p>
  </LobbySplit>
</template>
