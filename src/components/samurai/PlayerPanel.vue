<script setup lang="ts">
import GameIcon from '../common/GameIcon.vue'
import { CASTE_COLOURS, PLAYER_COLOURS } from '@shared/colours'
import { PLAYER_BACKGROUNDS } from '@/game/backgrounds'
import { ref, useId, watch } from 'vue'
import { hexRoundedPath } from '@shared/hex'
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

// The seat marker is a miniature of a player tile: same rounded hex, same cloth,
// same ink border and inner bevel. Drawn here rather than through TileGlyph,
// which needs a tile to put a pictogram and a value on.
const SWATCH = { r: 9.2, x: 8.66, y: 10 }
const swatchHex = hexRoundedPath(SWATCH, SWATCH.r * 0.97)
const swatchBevel = hexRoundedPath(SWATCH, SWATCH.r * 0.875)
// One pattern per seat: several rows share this component instance, so the id
// has to carry the colour as well.
const uid = useId()
const clothId = (colour: string) => `seat-cloth-${uid}-${colour}`

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

    <section class="block flush">
      <ul class="players">
        <li
          v-for="player in game.players"
          :key="player.id"
          :data-seat="player.id"
          class="player"
          :class="{ active: player.id === game.state?.current, offline: !player.connected }"
        >
          <svg class="swatch" viewBox="0 0 17.32 20" aria-hidden="true">
            <defs>
              <pattern
                :id="clothId(player.colour)"
                patternUnits="userSpaceOnUse"
                width="17.32"
                height="20"
              >
                <rect width="17.32" height="20" :fill="PLAYER_COLOURS[player.colour].fill" />
                <image
                  :href="PLAYER_BACKGROUNDS[player.colour]"
                  width="17.32"
                  height="20"
                  preserveAspectRatio="xMidYMid slice"
                />
              </pattern>
            </defs>
            <path
              :d="swatchHex"
              :fill="`url(#${clothId(player.colour)})`"
              :stroke="PLAYER_COLOURS[player.colour].ink"
              stroke-width="0.83"
              stroke-linejoin="round"
            />
            <path
              :d="swatchBevel"
              fill="none"
              stroke="#fffaf0"
              stroke-opacity="0.45"
              stroke-width="0.46"
              stroke-linejoin="round"
            />
            <text
              x="8.66"
              y="12.6"
              font-size="7"
              font-weight="700"
              text-anchor="middle"
              :fill="PLAYER_COLOURS[player.colour].text"
              style="font-family: var(--font-display)"
            >
              {{ player.stackCount }}
            </text>
          </svg>
          <div class="player-body">
            <div class="player-head">
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
              <ul v-if="capturedCounts(player.captured)" class="captured">
                <li v-for="caste in CASTES" :key="caste" :data-seat-caste="`${player.id}:${caste}`">
                  <span
                    class="caste-disc"
                    :style="{
                      background: CASTE_COLOURS[caste].fill,
                      borderColor: CASTE_COLOURS[caste].ink,
                    }"
                  >
                    <GameIcon :name="caste" :size="13" />
                  </span>
                  <strong>{{ capturedCounts(player.captured)![caste] }}</strong>
                </li>
              </ul>
              <span v-else class="captured-hidden" :title="t('panel.hiddenCaptured')">
                {{ player.capturedCount }} ✦
              </span>
            </div>
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

/* The seat rows are their own heading — they run to the panel's edges. */
.flush {
  padding: 0;
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

/* Ruled rows, not cards. The row carries no seat colour of its own — the tile
   beside the name is the seat, and a stripe and a cloth wash behind it only
   made the stats harder to read. */
.player {
  --swatch-w: 2.35rem;
  display: flex;
  align-items: center;
  gap: 0.55rem;
  padding: 0.3rem 0.5rem;
}

.player-body {
  flex: 1 1 auto;
  min-width: 0;
}

.player + .player {
  border-top: 1px solid rgba(160, 137, 102, 0.28);
}

.player.active {
  background: rgba(246, 223, 180, 0.6);
}

/* Only the seat on turn pulses — the row's wash alone is easy to miss on a
   crowded table. */
.player.active .swatch {
  animation: seat-glow 1.6s ease-in-out infinite;
}

@keyframes seat-glow {
  0%,
  100% {
    filter: drop-shadow(0 0 1px rgba(178, 58, 44, 0.25));
  }
  50% {
    filter: drop-shadow(0 0 5px rgba(178, 58, 44, 0.9));
  }
}

@media (prefers-reduced-motion: reduce) {
  .player.active .swatch {
    animation: none;
    filter: drop-shadow(0 0 3px rgba(178, 58, 44, 0.7));
  }
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
  font-size: 0.82rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.swatch {
  width: var(--swatch-w);
  aspect-ratio: 17.32 / 20;
  flex: none;
  overflow: visible;
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
  margin-top: 0.1rem;
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
  gap: 0.25rem;
}

/* The same disc and display-face count the header tallies use. */
.caste-disc {
  display: grid;
  place-items: center;
  width: 1.15rem;
  height: 1.15rem;
  border-radius: 50%;
  border: 1px solid;
  flex: none;
}

.captured strong {
  font-family: var(--font-display);
  font-size: 0.8rem;
}
</style>
