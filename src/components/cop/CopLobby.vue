<script setup lang="ts">
import { computed } from 'vue'
import CopToken from './CopToken.vue'
import LobbySplit from '../common/LobbySplit.vue'
import TurnClockOptions from '../common/TurnClockOptions.vue'
import { RESOURCES } from '@shared/cop'
import { MIN_PLAYERS, maxPlayersFor } from '@shared/types'
import { t } from '@/i18n'
import { useGameStore } from '@/stores/game'

const maxSeats = maxPlayersFor('cop')
const game = useGameStore()

/** Only the host may change these, and only before the deal. */
function setClock(turnSeconds: number) {
  const options = game.cop?.options
  if (!options || !game.isHost) return
  game.setOptions({ ...options, turnSeconds })
}

/** Only the host may change this, and only before the deal. */
function setDice(diceStart: boolean) {
  const options = game.cop?.options
  if (!options || !game.isHost) return
  game.setOptions({ ...options, diceStart })
}

const seats = computed(() => game.copPlayers)
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

    <!-- Set before the deal, because the clock is armed the moment play starts
         and changing it mid-game would move a live deadline. -->
    <TurnClockOptions
      :seconds="game.cop?.options.turnSeconds ?? 0"
      :locked="!game.isHost"
      hint="cop.turnClock.hint"
      @pick="setClock"
    />

    <label class="check" :class="{ locked: !game.isHost }">
      <input
        type="checkbox"
        :checked="game.cop?.options.diceStart ?? true"
        :disabled="!game.isHost"
        @change="setDice(($event.target as HTMLInputElement).checked)"
      />
      <span>
        {{ t('option.diceStart') }}
        <em class="tiny muted">{{ t('option.diceStart.hint') }}</em>
      </span>
    </label>

    <p v-if="!game.isHost" class="tiny muted">{{ t('lobby.hostOnly') }}</p>

    <hr class="rule" />

    <h2>{{ t('cop.lobby.resources') }}</h2>
    <div class="tokens">
      <span v-for="r in RESOURCES" :key="r" class="legend">
        <CopToken :resource="r" />
        <span class="tiny muted">{{ t(`cop.resource.${r}`) }}</span>
      </span>
    </div>
    <p class="tiny muted note">{{ t('cop.lobby.start') }}</p>

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
