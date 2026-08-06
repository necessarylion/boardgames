<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import BoardView from './BoardView.vue'
import CaptureDialog from './CaptureDialog.vue'
import GameOverDialog from './GameOverDialog.vue'
import HandBar from './HandBar.vue'
import LogPanel from './LogPanel.vue'
import PlayerPanel from './PlayerPanel.vue'
import RulesDialog from './RulesDialog.vue'
import TableMenu from './TableMenu.vue'
import TurnClock from './TurnClock.vue'
import { PLAYER_COLOURS } from '@shared/colours'
import { t } from '@/i18n'
import { useGameStore } from '@/stores/game'

const game = useGameStore()
const showRules = ref(false)
const showSidebar = ref(false)

const turnLabel = computed(() => {
  if (game.phase === 'over') return t('game.over')
  if (game.isMyTurn) return t('game.yourTurn')
  return game.activePlayer
    ? t('game.playerTurn', { name: game.activePlayer.name })
    : t('game.noTurn')
})

const accent = computed(() =>
  game.activePlayer ? PLAYER_COLOURS[game.activePlayer.colour].ink : 'var(--ink-soft)',
)

/**
 * A round only ticks over once play wraps back to the first seat, so the counter
 * in the corner can sit unchanged for several turns and then move while the eye
 * is on the board. Flash it when it does.
 *
 * The first number seen is a baseline rather than a change: arriving at a table
 * or reconnecting into round five would otherwise flash a round that started
 * long ago. Remounting the span on each round keeps the animation restarting
 * from the top even if two rounds land close together.
 */
const ROUND_FLASH_MS = 1600
const round = computed(() => game.state?.turnNumber ?? 1)
const roundChanged = ref(false)
let flashTimer: ReturnType<typeof setTimeout> | null = null
let lastRound: number | null = null

watch(
  () => (game.state ? game.state.turnNumber : null),
  (next) => {
    const previous = lastRound
    lastRound = next
    if (next === null || previous === null || next <= previous) return
    if (flashTimer) clearTimeout(flashTimer)
    roundChanged.value = true
    flashTimer = setTimeout(() => (roundChanged.value = false), ROUND_FLASH_MS)
  },
  { immediate: true },
)

onUnmounted(() => {
  if (flashTimer) clearTimeout(flashTimer)
})
</script>

<template>
  <div class="game">
    <header class="topbar">
      <div class="turn">
        <span class="dot" :style="{ background: accent }" />
        <strong>{{ turnLabel }}</strong>
        <span
          :key="round"
          class="round tiny muted"
          :class="{ changed: roundChanged }"
          aria-live="polite"
        >
          {{ t('game.round', { turn: round }) }}
        </span>
        <span v-if="game.isPaused" class="paused-badge tiny">{{ t('game.paused.badge') }}</span>
        <TurnClock />
      </div>
      <div class="top-actions">
        <span class="tiny muted code">{{ t('game.room', { code: game.state?.code ?? '' }) }}</span>
        <button
          v-if="game.isSeated && game.phase === 'play'"
          class="btn ghost small"
          @click="game.togglePause()"
        >
          {{ game.isPaused ? t('game.resume') : t('game.pause') }}
        </button>
        <button class="btn ghost small" @click="showRules = true">{{ t('game.rules') }}</button>
        <button class="btn ghost small sidebar-toggle" @click="showSidebar = !showSidebar">
          {{ showSidebar ? t('game.hideInfo') : t('game.showInfo') }}
        </button>
        <TableMenu />
      </div>
    </header>

    <main class="layout">
      <div class="board-column">
        <BoardView />
        <HandBar v-if="game.isSeated" />
        <p v-else class="spectating tiny muted">{{ t('game.spectating') }}</p>

        <!-- Suspends the board for everyone; its own control is the way back. -->
        <div v-if="game.isPaused" class="pause-veil">
          <div class="pause-card">
            <strong>{{ t('game.paused.title') }}</strong>
            <p class="tiny muted">{{ t('game.paused.body') }}</p>
            <button v-if="game.isSeated" class="btn" @click="game.togglePause()">
              {{ t('game.resume') }}
            </button>
          </div>
        </div>
      </div>

      <div class="sidebar" :class="{ open: showSidebar }">
        <PlayerPanel />
        <LogPanel />
      </div>
    </main>

    <RulesDialog v-if="showRules" @close="showRules = false" />
    <CaptureDialog />
    <GameOverDialog v-if="game.phase === 'over'" />
  </div>
</template>

<style scoped>
/* Full bleed and ruled rather than a tray of floating cards, the same way the
   home and draft screens are put together. Every division on this screen is a
   1px rule in the same ink. */
.game {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.6rem clamp(0.9rem, 2vw, 1.5rem);
  border-bottom: 1px solid rgba(160, 137, 102, 0.35);
  flex: none;
}

.turn {
  display: flex;
  align-items: baseline;
  gap: 0.55rem;
}

.turn strong {
  font-family: var(--font-display);
  font-size: 1.1rem;
}

.round {
  padding: 0.1rem 0.4rem;
  border-radius: 999px;
  /* The pill only exists while it is flashing; at rest this is plain text. */
  background: transparent;
}

.round.changed {
  animation: round-turn 1.6s ease-out;
}

/* A struck seal that fades back into the rule of the topbar. Declarations inside
   a running animation outrank .muted, so the ink can take over and hand back. */
@keyframes round-turn {
  0% {
    background: rgba(178, 58, 44, 0.3);
    color: var(--vermillion-dark);
    transform: scale(1);
  }
  18% {
    transform: scale(1.16);
  }
  100% {
    background: rgba(178, 58, 44, 0);
    color: var(--ink-soft);
    transform: scale(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .round.changed {
    animation: round-turn-still 1.6s ease-out;
  }

  @keyframes round-turn-still {
    0% {
      background: rgba(178, 58, 44, 0.3);
      color: var(--vermillion-dark);
    }
    100% {
      background: rgba(178, 58, 44, 0);
      color: var(--ink-soft);
    }
  }
}

.dot {
  width: 0.7rem;
  height: 0.7rem;
  border-radius: 50%;
  align-self: center;
  box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.6);
}

.top-actions {
  display: flex;
  align-items: center;
  gap: 0.45rem;
}

.code {
  letter-spacing: 0.12em;
}

.layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 20rem;
  min-height: 0;
  flex: 1 1 auto;
}

.board-column {
  display: flex;
  flex-direction: column;
  min-height: 0;
  /* Anchors the pause veil, which covers the board and hand together. */
  position: relative;
}

.paused-badge {
  align-self: center;
  padding: 0.1rem 0.45rem;
  border-radius: 999px;
  background: rgba(178, 58, 44, 0.16);
  color: var(--vermillion-dark);
  letter-spacing: 0.04em;
  text-transform: uppercase;
  font-weight: 600;
}

/* A wash of the paper tone over the whole board, so it reads as held rather
   than hidden. It swallows every click beneath it, which is the visible half of
   the freeze the server also enforces. */
.pause-veil {
  position: absolute;
  inset: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background: rgba(247, 243, 233, 0.72);
  backdrop-filter: blur(1.5px);
}

.pause-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  max-width: 22rem;
  padding: 1.3rem 1.6rem;
  text-align: center;
  border-radius: 12px;
  border: 1px solid rgba(160, 137, 102, 0.4);
  background: var(--paper);
  box-shadow: var(--shadow-lg);
}

.pause-card strong {
  font-family: var(--font-display);
  font-size: 1.15rem;
}

.pause-card p {
  margin: 0;
}

.sidebar {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow-y: auto;
  border-left: 1px solid rgba(160, 137, 102, 0.35);
}

.sidebar-toggle {
  display: none;
}

.spectating {
  padding: 0.7rem clamp(0.9rem, 2vw, 1.5rem);
  margin: 0;
  border-top: 1px solid rgba(160, 137, 102, 0.35);
}

@media (max-width: 900px) {
  .layout {
    grid-template-columns: minmax(0, 1fr);
  }

  .sidebar {
    display: none;
  }

  .sidebar.open {
    display: flex;
    max-height: 45vh;
  }

  .sidebar-toggle {
    display: inline-flex;
  }
}
</style>
