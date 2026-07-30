<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import GameIcon from './GameIcon.vue'
import { PLAYER_COLOURS } from '@shared/colours'
import { CASTES } from '@shared/types'
import { casteName, castePiece, t } from '@/i18n'
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

/** False for a spectator, whose seat is null and so never among the winners. */
const youWon = computed(
  () => game.you !== null && (result.value?.winners.includes(game.you) ?? false),
)

const headline = computed(() => {
  const winners = rows.value.filter((r) => r.won)
  const name = (row: (typeof winners)[number]) => row.player?.name ?? t('over.unknownPlayer')
  if (youWon.value) {
    const others = winners.filter((r) => r.entry.playerId !== game.you).map(name)
    if (!others.length) return t('over.youWin')
    return t('over.youShareWin', { names: others.join(t('over.and')) })
  }
  const names = winners.map(name)
  if (names.length === 1) return t('over.wins', { name: names[0] })
  return t('over.shared', { names: names.join(t('over.and')) })
})

const myColours = computed(() => (game.me ? PLAYER_COLOURS[game.me.colour] : null))

// --- fireworks -------------------------------------------------------------
/**
 * Sparks are plain elements animated by CSS, with their trajectory handed over
 * as custom properties in an inline style string — a canvas would need a frame
 * loop running behind a dialog nobody is looking at for long.
 */
interface Spark {
  style: string
}
interface Burst {
  id: number
  sparks: Spark[]
  style: string
}

const SPARKS_PER_BURST = 14
const BURSTS_PER_VOLLEY = 5
/** A few volleys and then quiet, rather than a page that animates for ever. */
const VOLLEYS = 4
const VOLLEY_MS = 2400

const bursts = ref<Burst[]>([])
let volleyTimer: ReturnType<typeof setInterval> | null = null
let nextBurstId = 0

const between = (min: number, max: number) => min + Math.random() * (max - min)

function volley(): Burst[] {
  const colours = myColours.value
  if (!colours) return []
  const tones = [colours.fill, colours.ink, 'var(--gold-line)']

  return Array.from({ length: BURSTS_PER_VOLLEY }, () => {
    const reach = between(4, 7.5)
    const delay = Math.round(between(0, 900))
    const sparks = Array.from({ length: SPARKS_PER_BURST }, (_, i) => {
      const angle = (i / SPARKS_PER_BURST) * Math.PI * 2 + between(-0.14, 0.14)
      const distance = reach * between(0.6, 1)
      const dx = (Math.cos(angle) * distance).toFixed(2)
      const dy = (Math.sin(angle) * distance).toFixed(2)
      return {
        style:
          `--dx:${dx}rem;--dy:${dy}rem;` +
          `background:${tones[i % tones.length]};` +
          `animation-delay:${delay + Math.round(between(0, 70))}ms`,
      }
    })
    return {
      id: nextBurstId++,
      sparks,
      style:
        `left:${between(10, 90).toFixed(1)}%;top:${between(8, 64).toFixed(1)}%;` +
        `--tone:${colours.fill};--delay:${delay}ms`,
    }
  })
}

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true

function stopVolleys() {
  if (volleyTimer) clearInterval(volleyTimer)
  volleyTimer = null
}

onMounted(() => {
  if (!youWon.value) return
  bursts.value = volley()
  // Reduced motion keeps the one volley, which CSS then draws as a still.
  if (prefersReducedMotion()) return
  let fired = 1
  volleyTimer = setInterval(() => {
    bursts.value = volley()
    if (++fired >= VOLLEYS) stopVolleys()
  }, VOLLEY_MS)
})

onUnmounted(stopVolleys)
</script>

<template>
  <div v-if="result" class="backdrop">
    <div class="panel dialog">
      <p class="tiny muted eyebrow">{{ youWon ? t('over.youEyebrow') : t('over.eyebrow') }}</p>
      <h1 :class="{ triumph: youWon }" :style="youWon && myColours ? { color: myColours.ink } : undefined">
        {{ headline }}
      </h1>
      <!-- The reason is worded by the shared engine, so it stays in English. -->
      <p class="reason">{{ result.reason }}</p>

      <table class="scores">
        <thead>
          <tr>
            <th>{{ t('over.player') }}</th>
            <th v-for="caste in CASTES" :key="caste" :title="casteName(caste)">
              <GameIcon :name="caste" :size="17" />
              <span class="sr">{{ castePiece(caste) }}</span>
            </th>
            <th>{{ t('over.leaderTokens') }}</th>
            <th>{{ t('over.total') }}</th>
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
              <span v-if="row.entry.leaderTokens.includes(caste)" class="token" :title="t('over.leader')">*</span>
            </td>
            <td class="num">{{ row.entry.leaderTokens.length }}</td>
            <td class="num total">{{ row.entry.totalPieces }}</td>
          </tr>
        </tbody>
      </table>

      <p v-if="result.unclaimed.length" class="tiny muted">
        {{ t('over.unclaimed', { castes: result.unclaimed.map(casteName).join(', ') }) }}
      </p>
      <p class="tiny muted">{{ t('over.starNote') }}</p>

      <div class="actions">
        <template v-if="game.isHost">
          <button class="btn" @click="game.rematch()">{{ t('over.playAgain') }}</button>
          <button class="btn ghost" @click="game.abandonGame()">{{ t('over.backToLobby') }}</button>
        </template>
        <p v-else class="tiny muted">{{ t('over.waitingHost') }}</p>
        <button class="btn ghost" @click="game.leaveRoom()">{{ t('over.leaveTable') }}</button>
      </div>
      <p v-if="game.isHost" class="tiny muted">{{ t('over.hostNote') }}</p>
    </div>

    <div v-if="bursts.length" class="fireworks" aria-hidden="true">
      <span v-for="burst in bursts" :key="burst.id" class="burst" :style="burst.style">
        <i v-for="(spark, i) in burst.sparks" :key="i" class="spark" :style="spark.style" />
      </span>
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

.triumph {
  font-size: 2.3rem;
  letter-spacing: 0.01em;
}

.reason {
  margin: 0 0 1rem;
  color: var(--ink-soft);
}

/* Above the dialog, and never in the way of the buttons under it. */
.fireworks {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  z-index: 1;
}

.burst {
  position: absolute;
  width: 0;
  height: 0;
}

.burst::before {
  content: '';
  position: absolute;
  width: 0.7rem;
  height: 0.7rem;
  margin: -0.35rem;
  border: 1px solid var(--tone);
  border-radius: 50%;
  opacity: 0;
  animation: flash 700ms ease-out var(--delay) forwards;
}

.spark {
  position: absolute;
  width: 0.34rem;
  height: 0.34rem;
  margin: -0.17rem;
  border-radius: 50%;
  opacity: 0;
  animation: spark 1500ms cubic-bezier(0.15, 0.6, 0.35, 1) forwards;
}

@keyframes flash {
  from {
    opacity: 0.9;
    transform: scale(0.2);
  }
  to {
    opacity: 0;
    transform: scale(3.4);
  }
}

@keyframes spark {
  0% {
    opacity: 0;
    transform: translate(0, 0) scale(0.9);
  }
  12% {
    opacity: 1;
  }
  70% {
    opacity: 0.85;
    transform: translate(var(--dx), var(--dy)) scale(0.7);
  }
  100% {
    opacity: 0;
    transform: translate(var(--dx), calc(var(--dy) + 1.1rem)) scale(0.4);
  }
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

/* The sparks hold where they burst, so the celebration reads as a still. */
@media (prefers-reduced-motion: reduce) {
  .spark {
    opacity: 0.7;
    transform: translate(var(--dx), var(--dy));
    animation: none;
  }

  .burst::before {
    opacity: 0.4;
    transform: scale(2.4);
    animation: none;
  }
}
</style>
