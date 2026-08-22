<script setup lang="ts">
import { computed } from 'vue'
import GameIcon from '../common/GameIcon.vue'
import LobbySplit from '../common/LobbySplit.vue'
import type { Power } from '@shared/ladders'
import { MIN_PLAYERS, maxPlayersFor } from '@shared/types'
import { t } from '@/i18n'
import { useGameStore } from '@/stores/game'

const maxSeats = maxPlayersFor('ladders')
const game = useGameStore()

const seats = computed(() => game.ldPlayers)
const POWER_LIST: Power[] = ['sprint', 'slip', 'again', 'skip', 'carry', 'swap']
const canStart = computed(() => game.isHost && seats.value.length >= MIN_PLAYERS)
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

    <button class="btn wide" :disabled="!canStart" @click="game.startGame()">
      {{ game.isHost ? t('lobby.start') : t('lobby.waitingHost') }}
    </button>
    <p v-if="game.isHost && seats.length < MIN_PLAYERS" class="tiny muted centre">
      {{ t('lobby.needTwo') }}
    </p>
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
