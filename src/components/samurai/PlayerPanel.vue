<script setup lang="ts">
import GameIcon from '../common/GameIcon.vue'
import { PLAYER_COLOURS } from '@shared/colours'
import { PLAYER_BACKGROUNDS } from '@/game/backgrounds'
import { ref, watch } from 'vue'
import { CASTES, type Caste } from '@shared/types'
import { t, teamLabel } from '@/i18n'
import { useGameStore } from '@/stores/game'

const game = useGameStore()

// --- renaming the side you lead -------------------------------------------
const editingTeam = ref(false)
const teamNameDraft = ref('')

function startTeamEdit() {
  if (game.myLedTeam === null) return
  teamNameDraft.value = game.teamNames[game.myLedTeam] ?? ''
  editingTeam.value = true
}

function saveTeamName() {
  if (!editingTeam.value || game.myLedTeam === null) return
  editingTeam.value = false
  game.renameTeam(game.myLedTeam, teamNameDraft.value.trim())
}

// A rename from elsewhere (or a fresh game) should not sit under an open editor.
watch(
  () => game.myLedTeam,
  () => (editingTeam.value = false),
)

function capturedCounts(captured: Caste[] | null): Record<Caste, number> | null {
  if (!captured) return null
  const counts: Record<Caste, number> = { buddha: 0, rice: 0, castle: 0 }
  for (const caste of captured) counts[caste]++
  return counts
}
</script>

<template>
  <aside class="side">
    <section v-if="game.isTeamGame && game.myLedTeam !== null" class="block team-edit">
      <h3>{{ t('panel.yourTeam') }}</h3>
      <div v-if="!editingTeam" class="team-current">
        <span class="badge team" :class="`team-${game.myLedTeam}`">
          {{ teamLabel(game.myLedTeam, game.teamNames) }}
        </span>
        <button class="btn ghost small" @click="startTeamEdit">{{ t('panel.rename') }}</button>
      </div>
      <div v-else class="team-form">
        <input
          v-model="teamNameDraft"
          class="team-input"
          :maxlength="20"
          :placeholder="teamLabel(game.myLedTeam)"
          @keyup.enter="saveTeamName"
          @keyup.esc="editingTeam = false"
        />
        <button class="btn small" @click="saveTeamName">{{ t('panel.save') }}</button>
      </div>
    </section>

    <section class="block">
      <h3>{{ t('panel.players') }}</h3>
      <ul class="players">
        <li
          v-for="player in game.players"
          :key="player.id"
          class="player"
          :class="{ active: player.id === game.state?.current, offline: !player.connected }"
          :style="{
            '--accent': PLAYER_COLOURS[player.colour].ink,
            '--cloth': `url(${PLAYER_BACKGROUNDS[player.colour]})`,
          }"
        >
          <div class="player-head">
            <span
              class="swatch"
              :style="{
                backgroundColor: PLAYER_COLOURS[player.colour].fill,
                borderColor: PLAYER_COLOURS[player.colour].ink,
              }"
            />
            <span class="player-name">{{ player.name }}</span>
            <span v-if="player.id === game.you" class="badge">{{ t('lobby.badge.you') }}</span>
            <span v-if="!player.connected" class="badge away">{{ t('lobby.badge.away') }}</span>
            <span
              v-if="game.isTeamGame"
              class="badge team"
              :class="`team-${game.teamOfPlayer(player.id)}`"
            >
              {{ teamLabel(game.teamOfPlayer(player.id), game.teamNames) }}
            </span>
          </div>
          <div
            class="player-stats tiny muted"
            :title="
              t('panel.stats', {
                hand: player.handCount,
                stack: player.stackCount,
                captured: player.capturedCount,
              })
            "
          >
            <span class="counts">{{ player.handCount }}/{{ player.stackCount }}</span>
            <ul v-if="capturedCounts(player.captured)" class="captured">
              <li v-for="caste in CASTES" :key="caste">
                <GameIcon :name="caste" :size="13" />
                <span>{{ capturedCounts(player.captured)![caste] }}</span>
              </li>
            </ul>
            <span v-else class="captured-hidden" :title="t('panel.hiddenCaptured')">
              {{ player.capturedCount }} ✦
            </span>
          </div>
        </li>
      </ul>
    </section>
  </aside>
</template>

<style scoped>
.side {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  min-width: 0;
  flex: none;
}

/* Ruled sections rather than stacked cards — see the note in GameScreen. */
.block {
  padding: 0.7rem 0.9rem;
  border-bottom: 1px solid rgba(160, 137, 102, 0.35);
}

h3 {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.5rem;
  font-size: 0.95rem;
  margin-bottom: 0.55rem;
}

.players {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}

/* Ruled rows, not cards. The seat colour stays as a stripe on the leading edge,
   which is the only border a row carries. */
/* The seat's cloth runs under the row, washed out far enough that the stats stay
   the thing you read. `--paper` is the wash, so the active row only has to
   retint it rather than replace the whole background. */
.player {
  --paper: rgba(253, 250, 242, 0.82);
  padding: 0.3rem 0.5rem;
  border-left: 4px solid var(--accent);
  background-image: linear-gradient(var(--paper), var(--paper)), var(--cloth);
  background-size: cover;
}

.player + .player {
  border-top: 1px solid rgba(160, 137, 102, 0.28);
}

.player.active {
  --paper: rgba(246, 223, 180, 0.72);
}

.player.offline {
  opacity: 0.6;
}

.player-head {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  min-width: 0;
}

.player-name {
  font-weight: 600;
  font-size: 0.9rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.swatch {
  width: 0.7rem;
  height: 0.7rem;
  border-radius: 3px;
  border: 2px solid;
  flex: none;
  background-image: var(--cloth);
  background-size: cover;
}

.badge {
  font-size: 0.6rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 0.05rem 0.28rem;
  border-radius: 4px;
  white-space: nowrap;
  background: rgba(178, 58, 44, 0.16);
  color: var(--vermillion-dark);
}

.badge.away {
  background: rgba(120, 120, 120, 0.2);
  color: var(--ink-soft);
}

.badge.team {
  margin-left: auto;
  overflow: hidden;
  text-overflow: ellipsis;
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

.team-current,
.team-form {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.team-current .badge.team {
  margin-left: 0;
}

.team-input {
  flex: 1 1 auto;
  min-width: 0;
  padding: 0.3rem 0.5rem;
  border: 1px solid rgba(160, 137, 102, 0.5);
  border-radius: 6px;
  background: rgba(255, 253, 246, 0.9);
  font: inherit;
  font-size: 0.9rem;
}

/* Same split as the log: the name keeps the display face, the numbers and
   badges beside it sit in the plain body face so they stay quick to read. */
.player-stats,
.badge {
  font-family: var(--font-body);
}

/* Hand/stack and captured share one line — the sentence they used to be lives on
   as the row's tooltip. */
.player-stats {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  margin-left: 1.05rem;
}

.counts {
  font-variant-numeric: tabular-nums;
}

.captured {
  list-style: none;
  display: flex;
  gap: 0.5rem;
  margin: 0;
  padding: 0;
}

.captured li {
  display: flex;
  align-items: center;
  gap: 0.15rem;
  font-size: 0.78rem;
  font-weight: 600;
}

</style>
