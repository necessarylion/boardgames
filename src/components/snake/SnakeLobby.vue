<script setup lang="ts">
import { computed } from 'vue'
import LobbySplit from '../common/LobbySplit.vue'
import { MIN_PLAYERS, maxPlayersFor } from '@shared/types'
import { t } from '@/i18n'
import { useGameStore } from '@/stores/game'

const maxSeats = maxPlayersFor('snake')
const game = useGameStore()

const seats = computed(() => game.snPlayers)
const canStart = computed(() => game.isHost && seats.value.length >= MIN_PLAYERS)
</script>

<template>
  <LobbySplit
    kind="snake"
    :code="game.snake?.code ?? ''"
    :host-id="game.snake?.hostId"
    :seats="seats"
    :max-seats="maxSeats"
  >
    <h2>{{ t('snake.lobby.how') }}</h2>
    <ol class="rules">
      <li>{{ t('snake.rule.steer') }}</li>
      <li>{{ t('snake.rule.apple') }}</li>
      <li>{{ t('snake.rule.crash') }}</li>
      <li>{{ t('snake.rule.win') }}</li>
    </ol>

    <button class="btn wide" :disabled="!canStart" @click="game.startGame()">
      {{ game.isHost ? t('lobby.start') : t('lobby.waitingHost') }}
    </button>
    <p v-if="game.isHost && seats.length < MIN_PLAYERS" class="tiny muted centre">
      {{ t('lobby.needTwo') }}
    </p>
  </LobbySplit>
</template>
