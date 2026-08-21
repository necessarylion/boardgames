<script setup lang="ts">
import { computed } from 'vue'
import CopToken from './CopToken.vue'
import LobbySplit from '../common/LobbySplit.vue'
import { RESOURCES } from '@shared/cop'
import { MIN_PLAYERS, maxPlayersFor } from '@shared/types'
import { t } from '@/i18n'
import { useGameStore } from '@/stores/game'

const maxSeats = maxPlayersFor('cop')
const game = useGameStore()

const seats = computed(() => game.copPlayers)
const canStart = computed(() => game.isHost && seats.value.length >= MIN_PLAYERS)
</script>

<template>
  <LobbySplit
    kind="cop"
    :code="game.cop?.code ?? ''"
    :host-id="game.cop?.hostId"
    :seats="seats"
    :max-seats="maxSeats"
  >
    <h2>{{ t('cop.lobby.how') }}</h2>
    <ol class="rules">
      <li>{{ t('cop.rule.roles') }}</li>
      <li>{{ t('cop.rule.hide') }}</li>
      <li>{{ t('cop.rule.search') }}</li>
      <li>{{ t('cop.rule.loot') }}</li>
      <li>{{ t('cop.rule.win') }}</li>
    </ol>

    <hr class="rule" />

    <p v-if="!game.isHost" class="tiny muted">{{ t('lobby.hostOnly') }}</p>

    <button class="btn wide" :disabled="!canStart" @click="game.startGame()">
      {{ game.isHost ? t('lobby.start') : t('lobby.waitingHost') }}
    </button>
    <p v-if="game.isHost && seats.length < MIN_PLAYERS" class="tiny muted centre">
      {{ t('lobby.needTwo') }}
    </p>

    <hr class="rule" />

    <h2>{{ t('cop.lobby.resources') }}</h2>
    <div class="tokens">
      <span v-for="r in RESOURCES" :key="r" class="legend">
        <CopToken :resource="r" />
        <span class="tiny muted">{{ t(`cop.resource.${r}`) }}</span>
      </span>
    </div>
    <p class="tiny muted note">{{ t('cop.lobby.start') }}</p>
  </LobbySplit>
</template>

<style scoped>
.tokens {
  display: flex;
  gap: 1.5rem;
  flex-wrap: wrap;
  justify-content: center;
}

.legend {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.3rem;
}

.note {
  text-align: center;
  margin: 0.8rem 0 0;
}
</style>
