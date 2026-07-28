<script setup lang="ts">
import { computed } from 'vue'
import GameIcon from './GameIcon.vue'
import { PLAYER_COLOURS } from '@shared/colours'
import { CASTES, CASTE_LABEL, CASTE_PIECE_LABEL } from '@shared/types'
import { useGameStore } from '@/stores/game'

const game = useGameStore()

const result = computed(() => game.state?.result ?? null)
const rows = computed(() =>
  (result.value?.breakdown ?? []).map((entry) => ({
    entry,
    player: game.players.find((p) => p.id === entry.playerId)!,
    won: result.value!.winners.includes(entry.playerId),
  })),
)
const headline = computed(() => {
  const winners = rows.value.filter((r) => r.won).map((r) => r.player?.name ?? 'Unknown')
  if (winners.length === 1) return `${winners[0]} wins`
  return `${winners.join(' and ')} share the victory`
})
</script>

<template>
  <div v-if="result" class="backdrop">
    <div class="panel dialog">
      <p class="tiny muted eyebrow">The game has ended</p>
      <h1>{{ headline }}</h1>
      <p class="reason">{{ result.reason }}</p>

      <table class="scores">
        <thead>
          <tr>
            <th>Player</th>
            <th v-for="caste in CASTES" :key="caste" :title="CASTE_LABEL[caste]">
              <GameIcon :name="caste" :size="17" />
              <span class="sr">{{ CASTE_PIECE_LABEL[caste] }}</span>
            </th>
            <th>Leader tokens</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.entry.playerId" :class="{ winner: row.won }">
            <td class="who">
              <span
                class="swatch"
                :style="{
                  background: PLAYER_COLOURS[row.player.colour].fill,
                  borderColor: PLAYER_COLOURS[row.player.colour].ink,
                }"
              />
              {{ row.player.name }}
            </td>
            <td v-for="caste in CASTES" :key="caste" class="num">
              {{ row.entry.counts[caste] }}
              <span v-if="row.entry.leaderTokens.includes(caste)" class="token" title="Leader">*</span>
            </td>
            <td class="num">{{ row.entry.leaderTokens.length }}</td>
            <td class="num total">{{ row.entry.totalPieces }}</td>
          </tr>
        </tbody>
      </table>

      <p v-if="result.unclaimed.length" class="tiny muted">
        Unclaimed leader tokens:
        {{ result.unclaimed.map((c) => CASTE_LABEL[c]).join(', ') }} — tied, so nobody leads.
      </p>
      <p class="tiny muted">* marks a caste this player leads.</p>

      <div class="actions">
        <template v-if="game.isHost">
          <button class="btn" @click="game.rematch()">Play again</button>
          <button class="btn ghost" @click="game.abandonGame()">Back to lobby</button>
        </template>
        <p v-else class="tiny muted">Waiting for the host to deal another game.</p>
        <button class="btn ghost" @click="game.leaveRoom()">Leave table</button>
      </div>
      <p v-if="game.isHost" class="tiny muted">
        “Play again” deals a fresh game to the same players; “Back to lobby” lets you change the
        table settings first. Players who have left are dropped either way.
      </p>
    </div>
  </div>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  background: rgba(38, 28, 18, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.25rem;
  z-index: 40;
  backdrop-filter: blur(3px);
}

.dialog {
  width: min(38rem, 100%);
  max-height: 90vh;
  overflow-y: auto;
  padding: 1.5rem;
  box-shadow: var(--shadow-lg);
}

.eyebrow {
  text-transform: uppercase;
  letter-spacing: 0.14em;
  margin: 0;
}

h1 {
  font-size: 1.9rem;
  margin: 0.2rem 0 0.35rem;
}

.reason {
  margin: 0 0 1rem;
  color: var(--ink-soft);
}

.scores {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 0.85rem;
  font-size: 0.92rem;
}

.scores th,
.scores td {
  padding: 0.4rem 0.5rem;
  border-bottom: 1px solid rgba(150, 128, 94, 0.3);
  text-align: left;
}

.scores th {
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 0.85rem;
  color: var(--ink-soft);
}

.scores th :deep(svg) {
  display: inline-block;
  vertical-align: middle;
}

.num {
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.total {
  font-weight: 700;
}

.winner {
  background: rgba(246, 223, 180, 0.6);
}

.who {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  font-weight: 600;
}

.swatch {
  width: 0.8rem;
  height: 0.8rem;
  border-radius: 3px;
  border: 2px solid;
  flex: none;
}

.token {
  color: var(--vermillion);
  font-weight: 700;
}

.actions {
  display: flex;
  gap: 0.6rem;
  align-items: center;
  margin-top: 1rem;
  margin-bottom: 0.6rem;
  flex-wrap: wrap;
}

.sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}
</style>
