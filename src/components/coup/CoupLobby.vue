<script setup lang="ts">
import { computed, ref } from 'vue'
import CoupCard from './CoupCard.vue'
import CoupRulesDialog from './CoupRulesDialog.vue'
import TurnClockOptions from '../common/TurnClockOptions.vue'
import { PLAYER_COLOURS } from '@shared/colours'
import { CHARACTERS } from '@shared/coup'
import { MIN_PLAYERS, maxPlayersFor } from '@shared/types'
import { t } from '@/i18n'
import { useGameStore } from '@/stores/game'

const maxSeats = maxPlayersFor('coup')
const game = useGameStore()
const copied = ref(false)
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
const emptySeats = computed(() => maxSeats - seats.value.length)
const canStart = computed(() => game.isHost && seats.value.length >= MIN_PLAYERS)

const shareLink = computed(() => `${location.origin}${location.pathname}?room=${game.coup?.code}`)

async function copyLink() {
  try {
    await navigator.clipboard.writeText(shareLink.value)
    copied.value = true
    setTimeout(() => (copied.value = false), 2000)
  } catch {
    game.showError(t('lobby.copyFailed'))
  }
}
</script>

<template>
  <div class="lobby">
    <header class="head">
      <div>
        <p class="tiny muted">{{ t('lobby.roomCode') }}</p>
        <h1 class="code">{{ game.coup?.code }}</h1>
      </div>
      <div class="share">
        <button class="btn ghost small" @click="copyLink">
          {{ copied ? t('lobby.linkCopied') : t('lobby.copyLink') }}
        </button>
        <button class="btn ghost small" @click="game.leaveRoom()">{{ t('lobby.leave') }}</button>
      </div>
    </header>

    <div class="grid">
      <section class="panel block">
        <h2>
          {{ t('lobby.players') }}
          <span class="tiny muted">
            {{ t('lobby.seatCount', { seated: seats.length, max: maxSeats }) }}
          </span>
        </h2>
        <ul class="seats">
          <li v-for="seat in seats" :key="seat.id" class="seat">
            <span
              class="swatch"
              :style="{
                background: PLAYER_COLOURS[seat.colour].fill,
                borderColor: PLAYER_COLOURS[seat.colour].ink,
              }"
            />
            <span class="seat-name">{{ seat.name }}</span>
            <span v-if="seat.id === game.coup?.hostId" class="badge">{{ t('lobby.badge.host') }}</span>
            <span v-if="seat.id === game.you" class="badge you">{{ t('lobby.badge.you') }}</span>
            <span v-if="!seat.connected" class="badge away">{{ t('lobby.badge.away') }}</span>
          </li>
          <li v-for="n in emptySeats" :key="`empty${n}`" class="seat empty">
            <span class="swatch empty-swatch" />
            <span class="muted">{{ t('lobby.waitingForPlayer') }}</span>
          </li>
        </ul>
      </section>

      <section class="panel block">
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
      </section>

      <section class="panel block wide-panel">
        <h2>
          {{ t('coup.lobby.characters') }}
          <button class="btn ghost small" @click="showRules = true">
            {{ t('coup.rules.open') }}
          </button>
        </h2>
        <div class="characters">
          <CoupCard v-for="c in CHARACTERS" :key="c" :character="c" />
        </div>
      </section>
    </div>

    <CoupRulesDialog v-if="showRules" @close="showRules = false" />
  </div>
</template>

<style scoped>
.lobby {
  max-width: 52rem;
  margin: 0 auto;
  padding: 2.5rem 1.25rem;
}

.head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
  margin-bottom: 1.5rem;
}

.code {
  font-size: 3rem;
  letter-spacing: 0.3em;
  line-height: 1;
}

.share {
  display: flex;
  gap: 0.5rem;
}

.grid {
  display: grid;
  gap: 1.1rem;
  grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr));
}

.block {
  padding: 1.15rem;
}

h2 {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  font-size: 1.1rem;
  margin-bottom: 0.75rem;
}

.seats {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}

.seat {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.45rem 0.6rem;
  border-radius: 8px;
  background: rgba(255, 253, 246, 0.7);
  border: 1px solid rgba(150, 128, 94, 0.28);
}

.seat.empty {
  border-style: dashed;
  background: transparent;
}

.swatch {
  width: 1.1rem;
  height: 1.1rem;
  border-radius: 4px;
  border: 2px solid;
  flex: none;
}

.empty-swatch {
  border-color: rgba(150, 128, 94, 0.5);
  background: transparent;
}

.seat-name {
  font-weight: 600;
}

.badge {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  padding: 0.12rem 0.4rem;
  border-radius: 4px;
  background: rgba(150, 128, 94, 0.22);
  color: var(--ink-soft);
}

.badge.you {
  background: rgba(178, 58, 44, 0.16);
  color: var(--vermillion-dark);
}

.badge.away {
  background: rgba(120, 120, 120, 0.2);
}

.rules {
  margin: 0;
  padding-left: 1.2rem;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  color: var(--ink-soft);
  line-height: 1.45;
  font-size: 0.92rem;
}

.wide {
  width: 100%;
  margin-top: 0.5rem;
}

/* The five characters read as a row, so the panel spans the whole grid. */
.wide-panel {
  grid-column: 1 / -1;
}

.characters {
  display: flex;
  gap: 0.6rem;
  flex-wrap: wrap;
  justify-content: center;
}

.centre {
  text-align: center;
  margin: 0.4rem 0 0;
}
</style>
