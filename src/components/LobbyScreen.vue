<script setup lang="ts">
import { computed, ref } from 'vue'
import BoardGlyph from './BoardGlyph.vue'
import TurnClockOptions from './TurnClockOptions.vue'
import { PLAYER_COLOURS } from '@shared/colours'
import { DEFAULT_BOARD_SHAPE } from '@shared/board'
import { supplyPerCaste } from '@shared/setup'
import { teamArrangements } from '@shared/rules'
import { BOARD_SHAPES, MAX_PLAYERS, MIN_PLAYERS, type BoardShape } from '@shared/types'
import { t, teamName } from '@/i18n'
import { useGameStore } from '@/stores/game'

const game = useGameStore()
const copied = ref(false)

const seats = computed(() => game.players)
const emptySeats = computed(() => MAX_PLAYERS - seats.value.length)

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

const canStart = computed(
  () => game.isHost && seats.value.length >= MIN_PLAYERS && teamValid.value,
)

const shareLink = computed(() => `${location.origin}${location.pathname}?room=${game.state?.code}`)

async function copyLink() {
  try {
    await navigator.clipboard.writeText(shareLink.value)
    copied.value = true
    setTimeout(() => (copied.value = false), 2000)
  } catch {
    game.showError(t('lobby.copyFailed'))
  }
}

function toggle(key: 'randomHands' | 'openInformation') {
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
  <div class="lobby">
    <header class="head">
      <div>
        <p class="tiny muted">{{ t('lobby.roomCode') }}</p>
        <h1 class="code">{{ game.state?.code }}</h1>
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
            {{ t('lobby.seatCount', { seated: seats.length, max: MAX_PLAYERS }) }}
          </span>
        </h2>
        <ul class="seats">
          <li v-for="seat in seats" :key="seat.id" class="seat">
            <span class="swatch" :style="{ background: PLAYER_COLOURS[seat.colour].fill, borderColor: PLAYER_COLOURS[seat.colour].ink }" />
            <span class="seat-name">{{ seat.name }}</span>
            <span v-if="seat.id === game.state?.hostId" class="badge">{{ t('lobby.badge.host') }}</span>
            <span v-if="seat.id === game.you" class="badge you">{{ t('lobby.badge.you') }}</span>
            <span v-if="!seat.connected" class="badge away">{{ t('lobby.badge.away') }}</span>
            <span
              v-if="teamsOn && teamValid"
              class="badge team"
              :class="`team-${game.teamOfPlayer(seat.id)}`"
            >
              {{ teamName(game.teamOfPlayer(seat.id)) }}
            </span>
          </li>
          <li v-for="n in emptySeats" :key="`empty${n}`" class="seat empty">
            <span class="swatch empty-swatch" />
            <span class="muted">{{ t('lobby.waitingForPlayer') }}</span>
          </li>
        </ul>
      </section>

      <section class="panel block">
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
        </div>
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
      </section>
    </div>
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

/* The two sides read at a glance: a warm badge for one, a cool one for the
   other, carried through to the score table at the end. */
.badge.team {
  margin-left: auto;
}

.badge.team-0 {
  background: rgba(30, 111, 134, 0.18);
  color: #0f3f52;
}

.badge.team-1 {
  background: rgba(168, 51, 111, 0.18);
  color: #651a41;
}

.badge.team-2 {
  background: rgba(47, 122, 69, 0.18);
  color: #17482a;
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

.check {
  display: flex;
  gap: 0.55rem;
  align-items: flex-start;
  margin-bottom: 0.55rem;
  font-size: 0.92rem;
  line-height: 1.4;
}

.check.locked {
  opacity: 0.7;
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

.wide {
  width: 100%;
  margin-top: 0.5rem;
}

.centre {
  text-align: center;
  margin: 0.4rem 0 0;
}
</style>
