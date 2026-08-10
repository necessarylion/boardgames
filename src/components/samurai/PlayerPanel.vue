<script setup lang="ts">
import { computed } from 'vue'
import GameIcon from '../common/GameIcon.vue'
import { CASTE_COLOURS, PLAYER_COLOURS } from '@shared/colours'
import { setAsideLimit } from '@shared/rules'
import { ref, watch } from 'vue'
import { CASTES, type Caste } from '@shared/types'
import { casteName, castePiece, t, teamLabel } from '@/i18n'
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

const setAsideMax = computed(() => setAsideLimit(game.state?.playerCount ?? 0))

/** Caste pieces still standing on the board. */
const remaining = computed(() => {
  const counts: Record<Caste, number> = { buddha: 0, rice: 0, castle: 0 }
  for (const list of Object.values(game.state?.pieces ?? {})) {
    for (const caste of list) counts[caste]++
  }
  return counts
})

const setAsideCounts = computed(() => {
  const counts: Record<Caste, number> = { buddha: 0, rice: 0, castle: 0 }
  for (const caste of game.state?.setAside ?? []) counts[caste]++
  return counts
})

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
      <h3>{{ t('panel.onBoard') }}</h3>
      <ul class="tally">
        <li v-for="caste in CASTES" :key="caste">
          <span
            class="caste-disc"
            :style="{
              background: CASTE_COLOURS[caste].fill,
              borderColor: CASTE_COLOURS[caste].ink,
            }"
          >
            <GameIcon :name="caste" :size="18" />
          </span>
          <span class="tally-name">{{ castePiece(caste) }}</span>
          <span class="tally-sub tiny muted">{{ casteName(caste) }}</span>
          <strong>{{ remaining[caste] }}</strong>
        </li>
      </ul>
      <p class="tiny muted note">{{ t('panel.endNote') }}</p>
    </section>

    <section class="block">
      <h3>
        {{ t('panel.setAside') }}
        <span class="tiny muted">
          {{ t('panel.setAsideCount', { count: game.state?.setAside.length ?? 0, max: setAsideMax }) }}
        </span>
      </h3>
      <p v-if="!game.state?.setAside.length" class="tiny muted">{{ t('panel.setAsideEmpty') }}</p>
      <ul v-else class="tally compact">
        <li v-for="caste in CASTES" :key="caste" v-show="setAsideCounts[caste] > 0">
          <GameIcon :name="caste" :size="16" />
          <span class="tally-name">{{ castePiece(caste) }}</span>
          <strong>{{ setAsideCounts[caste] }}</strong>
        </li>
      </ul>
    </section>

    <section class="block">
      <h3>{{ t('panel.players') }}</h3>
      <ul class="players">
        <li
          v-for="player in game.players"
          :key="player.id"
          class="player"
          :class="{ active: player.id === game.state?.current, offline: !player.connected }"
          :style="{ '--accent': PLAYER_COLOURS[player.colour].ink }"
        >
          <div class="player-head">
            <span
              class="swatch"
              :style="{
                background: PLAYER_COLOURS[player.colour].fill,
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
          <div class="player-stats tiny muted">
            {{
              t('panel.stats', {
                hand: player.handCount,
                stack: player.stackCount,
                captured: player.capturedCount,
              })
            }}
          </div>
          <ul v-if="capturedCounts(player.captured)" class="captured">
            <li v-for="caste in CASTES" :key="caste">
              <GameIcon :name="caste" :size="15" />
              <span>{{ capturedCounts(player.captured)![caste] }}</span>
            </li>
          </ul>
          <p v-else class="tiny muted hidden-note">{{ t('panel.hiddenCaptured') }}</p>
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
}

/* Ruled sections rather than stacked cards — see the note in GameScreen. */
.block {
  padding: 0.9rem 1rem;
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

.tally {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.tally li {
  display: grid;
  grid-template-columns: auto 1fr auto auto;
  align-items: center;
  gap: 0.45rem;
  font-size: 0.9rem;
}

.tally.compact li {
  grid-template-columns: auto 1fr auto;
}

/* Matches the disc a piece sits on over on the board, so the tally reads as the
   same three things. */
.caste-disc {
  display: grid;
  place-items: center;
  width: 1.6rem;
  height: 1.6rem;
  border-radius: 50%;
  border: 1px solid;
  flex: none;
}

.tally-name {
  font-weight: 600;
}

.tally strong {
  font-family: var(--font-display);
  font-size: 1.05rem;
  min-width: 1.4rem;
  text-align: right;
}

.note {
  margin: 0.55rem 0 0;
  line-height: 1.4;
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
.player {
  padding: 0.5rem 0.6rem;
  border-left: 4px solid var(--accent);
}

.player + .player {
  border-top: 1px solid rgba(160, 137, 102, 0.28);
}

.player.active {
  background: rgba(246, 223, 180, 0.55);
}

.player.offline {
  opacity: 0.6;
}

.player-head {
  display: flex;
  align-items: center;
  gap: 0.45rem;
}

.player-name {
  font-weight: 600;
}

.swatch {
  width: 0.85rem;
  height: 0.85rem;
  border-radius: 3px;
  border: 2px solid;
  flex: none;
}

.badge {
  font-size: 0.65rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  padding: 0.1rem 0.35rem;
  border-radius: 4px;
  background: rgba(178, 58, 44, 0.16);
  color: var(--vermillion-dark);
}

.badge.away {
  background: rgba(120, 120, 120, 0.2);
  color: var(--ink-soft);
}

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

.player-stats {
  margin-top: 0.15rem;
}

.captured {
  list-style: none;
  display: flex;
  gap: 0.7rem;
  margin: 0.35rem 0 0;
  padding: 0;
}

.captured li {
  display: flex;
  align-items: center;
  gap: 0.2rem;
  font-size: 0.85rem;
  font-weight: 600;
}

.hidden-note {
  margin: 0.3rem 0 0;
}

</style>
