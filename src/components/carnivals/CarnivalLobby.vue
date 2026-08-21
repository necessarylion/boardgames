<script setup lang="ts">
import { computed, ref } from 'vue'
import CarnivalCard from './CarnivalCard.vue'
import CarnivalRulesDialog from './CarnivalRulesDialog.vue'
import LobbySplit from '../common/LobbySplit.vue'
import { MIN_PLAYERS, maxPlayersFor } from '@shared/types'
import { t } from '@/i18n'
import { useGameStore } from '@/stores/game'

const maxSeats = maxPlayersFor('carnivals')
const game = useGameStore()
const showRules = ref(false)

const seats = computed(() => game.carnivalPlayers)
const canStart = computed(() => game.isHost && seats.value.length >= MIN_PLAYERS)
</script>

<template>
  <LobbySplit
    kind="carnivals"
    :code="game.carnival?.code ?? ''"
    :host-id="game.carnival?.hostId"
    :seats="seats"
    :max-seats="maxSeats"
  >
    <h2>{{ t('carnival.lobby.how') }}</h2>
    <ol class="rules">
      <li>{{ t('carnival.rule.deal') }}</li>
      <li>{{ t('carnival.rule.see') }}</li>
      <li>{{ t('carnival.rule.bet') }}</li>
      <li>{{ t('carnival.rule.show') }}</li>
      <li>{{ t('carnival.rule.win') }}</li>
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

    <h2>
      {{ t('carnival.lobby.cards') }}
      <button class="btn ghost small" @click="showRules = true">
        {{ t('carnival.rules.open') }}
      </button>
    </h2>
    <div class="cards-demo">
      <div class="pair">
        <CarnivalCard colour="red" :value="8" />
        <CarnivalCard colour="blue" facedown="mine" />
        <span class="tiny muted lbl">{{ t('carnival.lobby.yours') }}</span>
      </div>
      <div class="pair">
        <CarnivalCard colour="red" facedown="theirs" />
        <CarnivalCard colour="blue" :value="4" />
        <span class="tiny muted lbl">{{ t('carnival.lobby.theirs') }}</span>
      </div>
    </div>

    <CarnivalRulesDialog v-if="showRules" @close="showRules = false" />
  </LobbySplit>
</template>

<style scoped>
.cards-demo {
  display: flex;
  gap: 2rem;
  flex-wrap: wrap;
  justify-content: center;
}

.pair {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex-wrap: wrap;
  justify-content: center;
}

.lbl {
  width: 100%;
  text-align: center;
  margin-top: 0.2rem;
}
</style>
