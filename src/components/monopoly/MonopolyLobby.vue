<script setup lang="ts">
import { computed } from 'vue'
import LobbySplit from '../common/LobbySplit.vue'
import TurnClockOptions from '../common/TurnClockOptions.vue'
import { BID_SECONDS_CHOICES } from '@shared/engine'
import { GO_SALARY, JAIL_FINE } from '@shared/monopoly'
import { MIN_PLAYERS, maxPlayersFor } from '@shared/types'
import { t } from '@/i18n'
import { useGameStore } from '@/stores/game'

const maxSeats = maxPlayersFor('monopoly')
const game = useGameStore()

/** Only the host may change these, and only before the deal. */
function setClock(turnSeconds: number) {
  const options = game.monopoly?.options
  if (!options || !game.isHost) return
  game.setOptions({ ...options, turnSeconds })
}

function setBidClock(bidSeconds: number) {
  const options = game.monopoly?.options
  if (!options || !game.isHost) return
  game.setOptions({ ...options, bidSeconds })
}

/** Only the host may change this, and only before the deal. */
function setDice(diceStart: boolean) {
  const options = game.monopoly?.options
  if (!options || !game.isHost) return
  game.setOptions({ ...options, diceStart })
}

const seats = computed(() => game.mpPlayers)
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
    kind="monopoly"
    :code="game.monopoly?.code ?? ''"
    :host-id="game.monopoly?.hostId"
    :seats="seats"
    :max-seats="maxSeats"
  >
    <h2>{{ t('monopoly.lobby.how') }}</h2>
    <ol class="rules">
      <li>{{ t('monopoly.rule.roll', { salary: GO_SALARY }) }}</li>
      <li>{{ t('monopoly.rule.buy') }}</li>
      <li>{{ t('monopoly.rule.rent') }}</li>
      <li>{{ t('monopoly.rule.build') }}</li>
      <li>{{ t('monopoly.rule.jail', { fine: JAIL_FINE }) }}</li>
      <li>{{ t('monopoly.rule.money') }}</li>
      <li>{{ t('monopoly.rule.win') }}</li>
    </ol>

    <hr class="rule" />

    <!-- Set before the deal, because the clock is armed the moment play starts
         and changing it mid-game would move a live deadline. Monopoly runs its
         period on whatever the table is waiting for rather than on the turn —
         an auction, a trade, a debt — so a short clock is survivable here in a
         way it would not be if it covered a whole turn's building and trading. -->
    <TurnClockOptions
      :seconds="game.monopoly?.options.turnSeconds ?? 0"
      :locked="!game.isHost"
      hint="monopoly.turnClock.hint"
      @pick="setClock"
    />

    <!-- An auction has the whole table waiting on one seat for a single word,
         so it usually wants a shorter window than a turn — and it restarts from
         each bid rather than running once for the whole auction. -->
    <TurnClockOptions
      :seconds="game.monopoly?.options.bidSeconds ?? 0"
      :periods="BID_SECONDS_CHOICES"
      :locked="!game.isHost"
      label="monopoly.bidClock"
      hint="monopoly.bidClock.hint"
      zero-label="monopoly.bidClock.same"
      @pick="setBidClock"
    />

    <label class="check" :class="{ locked: !game.isHost }">
      <input
        type="checkbox"
        :checked="game.monopoly?.options.diceStart ?? true"
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
