<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import BoardGlyph from './BoardGlyph.vue'
import LobbySplit from '../common/LobbySplit.vue'
import TurnClockOptions from '../common/TurnClockOptions.vue'
import { DEFAULT_BOARD_SHAPE } from '@shared/board'
import { supplyPerCaste } from '@shared/setup'
import { teamArrangements } from '@shared/rules'
import { BOARD_SHAPES, MIN_PLAYERS, maxPlayersFor } from '@shared/types'
import type { BoardShape } from '@shared/types'
import { t, teamLabel } from '@/i18n'
import { useGameStore } from '@/stores/game'

const maxSeats = maxPlayersFor('samurai')
const game = useGameStore()

const seats = computed(() => game.players)

const teamsValue = computed(() => game.state?.options.teams ?? 0)
const teamsOn = computed(() => teamsValue.value >= 2)
/** The splits this many players can be arranged into, e.g. six gives 3v3, 2v2v2. */
const arrangements = computed(() => teamArrangements(seats.value.length))
/** The current split still divides the table evenly (players may have come or gone). */
const teamValid = computed(() => teamsValue.value === 0 || arrangements.value.includes(teamsValue.value))

/** "3 v 3", "2 v 2 v 2" — the size of each of `teams` equal sides. */
function splitLabel(teams: number) {
  return Array(teams).fill(seats.value.length / teams).join(' v ')
}

function setTeams(teams: number) {
  const options = game.state?.options
  if (!options || !game.isHost) return
  game.setOptions({ ...options, teams })
}

// The side the local player leads (if any) can be renamed here before the game.
const ledTeam = computed(() => game.myLedTeam)
const teamNameDraft = ref('')
watch(
  () => (ledTeam.value === null ? '' : game.teamNames[ledTeam.value] ?? ''),
  (name) => (teamNameDraft.value = name),
  { immediate: true },
)
function saveTeamName() {
  if (ledTeam.value === null) return
  game.renameTeam(ledTeam.value, teamNameDraft.value.trim())
}

const canStart = computed(
  () => game.isHost && seats.value.length >= MIN_PLAYERS && teamValid.value,
)

function toggle(key: 'randomHands' | 'openInformation' | 'diceStart' | 'shuffleMidgame') {
  const options = game.state?.options
  if (!options || !game.isHost) return
  game.setOptions({ ...options, [key]: !options[key] })
}

function setClock(turnSeconds: number) {
  const options = game.state?.options
  if (!options || !game.isHost) return
  game.setOptions({ ...options, turnSeconds })
}

const boardShape = computed(() => game.state?.options.boardShape ?? DEFAULT_BOARD_SHAPE)

function setBoard(shape: BoardShape) {
  const options = game.state?.options
  if (!options || !game.isHost) return
  game.setOptions({ ...options, boardShape: shape })
}
</script>

<template>
  <LobbySplit
    kind="samurai"
    :code="game.state?.code ?? ''"
    :host-id="game.state?.hostId"
    :seats="seats"
    :max-seats="maxSeats"
  >
    <template #seat-badges="{ seat }">
      <span
        v-if="teamsOn && teamValid"
        class="badge team"
        :class="`team-${game.teamOfPlayer(seat.id)}`"
      >
        {{ teamLabel(game.teamOfPlayer(seat.id), game.teamNames) }}
      </span>
    </template>

    <h2>{{ t('lobby.settings') }}</h2>
    <label class="check" :class="{ locked: !game.isHost }">
      <input
        type="checkbox"
        :checked="game.state?.options.randomHands"
        :disabled="!game.isHost"
        @change="toggle('randomHands')"
      />
      <span>{{ t('option.randomHands') }}</span>
    </label>
    <label class="check" :class="{ locked: !game.isHost }">
      <input
        type="checkbox"
        :checked="game.state?.options.openInformation"
        :disabled="!game.isHost"
        @change="toggle('openInformation')"
      />
      <span>{{ t('option.openInfo.long') }}</span>
    </label>
    <label class="check" :class="{ locked: !game.isHost }">
      <input
        type="checkbox"
        :checked="game.state?.options.shuffleMidgame"
        :disabled="!game.isHost"
        @change="toggle('shuffleMidgame')"
      />
      <span>{{ t('option.shuffleMidgame.long') }}</span>
    </label>
    <div class="team-pick" :class="{ locked: !game.isHost }">
      <span class="board-label tiny muted">{{ t('option.teams') }}</span>
      <div class="team-options">
        <button
          type="button"
          class="team-option"
          :class="{ chosen: teamsValue === 0 }"
          :disabled="!game.isHost"
          @click="setTeams(0)"
        >
          {{ t('lobby.teams.off') }}
        </button>
        <button
          v-for="a in arrangements"
          :key="a"
          type="button"
          class="team-option"
          :class="{ chosen: teamsValue === a }"
          :disabled="!game.isHost"
          @click="setTeams(a)"
        >
          {{ splitLabel(a) }}
        </button>
      </div>
      <p class="tiny muted team-hint">
        {{ arrangements.length ? t('option.teams.hint') : t('lobby.teams.need') }}
      </p>
      <label v-if="teamsOn && teamValid && ledTeam !== null" class="team-name-field">
        <span class="tiny muted">{{ t('lobby.teams.name') }}</span>
        <input
          v-model="teamNameDraft"
          class="team-name-input"
          :maxlength="20"
          :placeholder="teamLabel(ledTeam)"
          @keyup.enter="saveTeamName"
          @blur="saveTeamName"
        />
      </label>
    </div>
    <label class="check">
      <input
        type="checkbox"
        :checked="game.state?.options.diceStart ?? true"
        :disabled="!game.isHost"
        @change="toggle('diceStart')"
      />
      <span>
        {{ t('option.diceStart') }}
        <em class="tiny muted">{{ t('option.diceStart.hint') }}</em>
      </span>
    </label>

    <TurnClockOptions
      :seconds="game.state?.options.turnSeconds ?? 0"
      :locked="!game.isHost"
      @pick="setClock"
    />

    <div class="board-pick" :class="{ locked: !game.isHost }">
      <span class="board-label tiny muted">{{ t('home.board.title') }}</span>
      <div class="board-options">
        <button
          v-for="shape in BOARD_SHAPES"
          :key="shape"
          type="button"
          class="board-option"
          :class="{ chosen: boardShape === shape }"
          :disabled="!game.isHost"
          :title="t(`board.${shape}.hint`)"
          @click="setBoard(shape)"
        >
          <BoardGlyph :shape="shape" />
          <span>{{ t(`board.${shape}`) }}</span>
        </button>
      </div>
    </div>

    <p v-if="!game.isHost" class="tiny muted">{{ t('lobby.hostOnly') }}</p>

    <hr class="rule" />
    <p class="tiny muted">
      {{
        t('lobby.supply', {
          players: Math.max(seats.length, MIN_PLAYERS),
          pieces: supplyPerCaste(seats.length),
        })
      }}
    </p>

    <p v-if="teamsOn && teamValid" class="tiny muted centre">
      {{ t('lobby.teams.mode', { mode: splitLabel(teamsValue) }) }}
    </p>

    <button class="btn wide" :disabled="!canStart" @click="game.startGame()">
      {{ game.isHost ? t('lobby.start') : t('lobby.waitingHost') }}
    </button>
    <p v-if="game.isHost && seats.length < MIN_PLAYERS" class="tiny muted centre">
      {{ t('lobby.needTwo') }}
    </p>
    <p v-else-if="game.isHost && teamsOn && !teamValid" class="tiny muted centre">
      {{ t('lobby.teams.need') }}
    </p>
  </LobbySplit>
</template>

<style scoped>
label,
em,
.board-label {
  font-family: var(--font-body);
}

/* The two sides read at a glance: a warm badge for one, a cool one for the
   other, carried through to the score table at the end. */
.badge.team {
  margin-left: auto;
}

.badge.team-0 {
  background: rgba(78, 165, 194, 0.28);
  color: #a8d9ea;
}

.badge.team-1 {
  background: rgba(206, 96, 152, 0.28);
  color: #eebcd5;
}

.badge.team-2 {
  background: rgba(88, 171, 113, 0.28);
  color: #b4e2c3;
}

.team-pick {
  margin: 0.2rem 0 0.6rem;
}

.team-pick.locked {
  opacity: 0.7;
}

.team-options {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-top: 0.4rem;
}

.team-option {
  padding: 0.35rem 0.7rem;
  border: 1px solid rgba(160, 137, 102, 0.35);
  border-radius: var(--radius);
  background: transparent;
  color: var(--ink-soft);
  font-size: 0.82rem;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
  transition: background 0.12s ease, color 0.12s ease, border-color 0.12s ease;
}

.team-option:disabled {
  cursor: default;
}

.team-option:not(:disabled):hover {
  background: rgba(178, 58, 44, 0.07);
}

.team-option.chosen {
  border-color: var(--vermillion);
  background: rgba(178, 58, 44, 0.12);
  color: var(--vermillion-dark);
  font-weight: 600;
}

.team-hint {
  margin: 0.4rem 0 0;
}

.team-name-field {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  margin-top: 0.6rem;
}

.team-name-input {
  padding: 0.4rem 0.55rem;
  border: 1px solid rgba(160, 137, 102, 0.5);
  border-radius: 6px;
  background: rgba(255, 253, 246, 0.9);
  font: inherit;
  font-size: 0.9rem;
}

/* Same row of profiles the home screen hosts with, so the host can still change
   their mind once everyone is in the room. */
.board-pick {
  margin: 0.9rem 0 0.8rem;
}

.board-pick.locked {
  opacity: 0.7;
}

.board-label {
  display: block;
  margin-bottom: 0.4rem;
}

.board-options {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(5.2rem, 1fr));
  gap: 0.4rem;
}

.board-option {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  padding: 0.5rem 0.3rem 0.45rem;
  border: 1px solid rgba(160, 137, 102, 0.35);
  border-radius: var(--radius);
  background: transparent;
  color: var(--ink-soft);
  font-size: 0.78rem;
  line-height: 1.2;
  text-align: center;
  cursor: pointer;
  transition: background 0.12s ease, color 0.12s ease, border-color 0.12s ease;
}

.board-option:disabled {
  cursor: default;
}

.board-option:not(:disabled):hover {
  background: rgba(178, 58, 44, 0.07);
}

.board-option.chosen {
  border-color: var(--vermillion);
  background: rgba(178, 58, 44, 0.12);
  color: var(--vermillion-dark);
  font-weight: 600;
}
</style>
