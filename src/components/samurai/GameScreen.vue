<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import BoardView from './BoardView.vue'
import GameIcon from '../common/GameIcon.vue'
import CaptureDialog from './CaptureDialog.vue'
import GameOverDialog from './GameOverDialog.vue'
import HandBar from './HandBar.vue'
import LogPanel from './LogPanel.vue'
import PlayerPanel from './PlayerPanel.vue'
import RulesDialog from './RulesDialog.vue'
import TableMenu from '../common/TableMenu.vue'
import TurnClock from './TurnClock.vue'
import { CASTE_COLOURS, PLAYER_COLOURS } from '@shared/colours'
import { CASTES, type Caste } from '@shared/types'
import { casteName, castePiece, t } from '@/i18n'
import { flyGhost } from '@/composables/useFlight'
import { setAsideLimit } from '@shared/rules'
import { useGameStore } from '@/stores/game'

const game = useGameStore()
const showRules = ref(false)
/** Wide enough for the 20rem column to cost nothing, so it starts open there. */
const showSidebar = ref(window.innerWidth > 900)

/** Caste pieces still standing on the board. */
const remaining = computed(() => {
  const counts: Record<Caste, number> = { buddha: 0, rice: 0, castle: 0 }
  for (const list of Object.values(game.state?.pieces ?? {})) {
    for (const caste of list) counts[caste]++
  }
  return counts
})

/** Pieces lifted off the board undecided; the limit is one of the two endings. */
const setAsideCounts = computed(() => {
  const counts: Record<Caste, number> = { buddha: 0, rice: 0, castle: 0 }
  for (const caste of game.state?.setAside ?? []) counts[caste]++
  return counts
})

const setAsideMax = computed(() => setAsideLimit(game.state?.playerCount ?? 0))

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

/**
 * Captured pieces fly off the board to whoever took them, and a contested one to
 * the set-aside chip in the header, which is where it really goes. A turn that
 * surrounds a city can take three pieces at once, and nothing on screen said who
 * had them — the flight is the only thing that names the winner as it happens.
 *
 * Where in the seat's row depends on what that seat is allowed to show: an open
 * table counts each caste separately, a closed one keeps a single total. The
 * header tally is the last resort, for a table playing with the sidebar shut.
 *
 * Keyed on the same turn identity the capture notice uses: `lastCaptures` is
 * rewritten only at a turn end, so a re-broadcast mid-turn must not replay it,
 * and a client reconnecting into a game in progress takes its first state as a
 * baseline rather than flying a capture that happened before it arrived.
 *
 * `flush: 'post'` because both ends are read out of the DOM this state renders:
 * a set-aside chip is hidden until its first piece lands in it, and a seat's
 * caste count only appears once it has one.
 *
 * A piece disc is 0.68 of the hex's circumradius across and the hex itself is
 * √3 of it, so the piece covers a little under two fifths of a hex on screen —
 * whatever the board is zoomed to.
 */
const PIECE_OF_HEX = 0.39
const CAPTURE_STAGGER_MS = 110

/** Laid out, rather than merely present: the topbar tallies go on a narrow table. */
const shown = (el: Element | null) => (el?.getBoundingClientRect().width ? el : null)

watch(
  () => (game.state ? `${game.state.turnNumber}:${game.state.current}` : null),
  (key, previous) => {
    if (key === null || previous === null || previous === undefined) return
    const captures = game.state?.lastCaptures ?? []
    captures.forEach((capture, i) => {
      const pick = (selector: string) => shown(document.querySelector(selector))
      const disc = document.querySelector(`[data-caste="${capture.caste}"]`)
      const to =
        capture.winner === null
          ? pick(`[data-set-aside="${capture.caste}"]`)
          : pick(`[data-seat-caste="${capture.winner}:${capture.caste}"]`) ??
            pick(`[data-seat="${capture.winner}"] .captured-hidden`) ??
            pick(`[data-seat="${capture.winner}"]`)
      // A disc off the header if there is one, else whatever it is landing on.
      const node = shown(disc) ?? to
      if (!node) return
      flyGhost({
        node,
        from: document.querySelector(`[data-space="${capture.spaceId}"]`),
        to: to ?? disc,
        startFit: PIECE_OF_HEX,
        delay: i * CAPTURE_STAGGER_MS,
        pulse: true,
      })
    })
  },
  { flush: 'post' },
)

onUnmounted(() => {
  if (flashTimer) clearTimeout(flashTimer)
})
</script>

<template>
  <div class="samurai game">
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
      <div class="tallies">
        <ul class="tally" :title="t('panel.endNote')">
          <li
            v-for="caste in CASTES"
            :key="caste"
            :title="`${castePiece(caste)} — ${casteName(caste)}`"
            :aria-label="`${castePiece(caste)} — ${casteName(caste)}`"
          >
            <span
              class="caste-disc"
              :data-caste="caste"
              :style="{
                background: CASTE_COLOURS[caste].fill,
                borderColor: CASTE_COLOURS[caste].ink,
              }"
            >
              <GameIcon :name="caste" :size="13" />
            </span>
            <strong>{{ remaining[caste] }}</strong>
          </li>
        </ul>

        <!-- Bare icons rather than discs, so the two counts never read as one row. -->
        <div class="tally set-aside" :title="t('panel.setAside')">
          <span
            v-for="caste in CASTES"
            :key="caste"
            v-show="setAsideCounts[caste] > 0"
            class="chip"
            :data-set-aside="caste"
            :title="castePiece(caste)"
            :aria-label="castePiece(caste)"
          >
            <GameIcon :name="caste" :size="14" />
            <strong>{{ setAsideCounts[caste] }}</strong>
          </span>
          <span class="tiny muted">
            {{
              t('panel.setAsideCount', {
                count: game.state?.setAside.length ?? 0,
                max: setAsideMax,
              })
            }}
          </span>
        </div>
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
        <TableMenu />
      </div>
    </header>

    <main class="layout" :class="{ solo: !showSidebar }">
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

      <Transition name="fade">
        <div v-if="showSidebar" id="game-sidebar" class="sidebar">
          <PlayerPanel />
          <LogPanel />
        </div>
      </Transition>

      <!-- Sits on the rule beside the sidebar, and on the layout's own edge once
           the sidebar is gone, which is the only way back to it. -->
      <button
        class="sidebar-handle"
        :aria-expanded="showSidebar"
        aria-controls="game-sidebar"
        :aria-label="showSidebar ? t('game.hideInfo') : t('game.showInfo')"
        @click="showSidebar = !showSidebar"
      >
        <span class="chev" aria-hidden="true">◀</span>
      </button>
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
  --sidebar-ms: 180ms;
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

/* Three chips, no labels: the topbar has room for the count and the colour and
   nothing else. The naming is on each chip's title. */
.tallies {
  display: flex;
  align-items: center;
  gap: 0.55rem;
}

/* A rule, the same one every other division on this screen uses, so the two
   counts do not read as six numbers in a row. The class carries the padding
   past .tally's own reset below, and matches the gap so the rule sits centred
   between the groups rather than against one of them. */
.tally.set-aside {
  padding-left: 0.55rem;
  border-left: 1px solid rgba(160, 137, 102, 0.35);
}

.tally {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  list-style: none;
  margin: 0;
  padding: 0;
}

.tally li,
.tally .chip {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.tally strong {
  font-family: var(--font-display);
  font-size: 0.95rem;
}

/* Matches the disc a piece sits on over on the board. */
.caste-disc {
  display: grid;
  place-items: center;
  width: 1.15rem;
  height: 1.15rem;
  border-radius: 50%;
  border: 1px solid;
  flex: none;
}

.layout {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 20rem;
  transition: grid-template-columns var(--sidebar-ms) ease;
  min-height: 0;
  flex: 1 1 auto;
  /* The sidebar keeps its width and slides out past this edge. */
  overflow: hidden;
}

/* Collapsing the track to zero rather than dropping it: grid-template-columns
   only interpolates between the same number of tracks, so removing the second
   one makes the browser ignore the transition and snap the board to full width
   while the panel is still fading. */
.layout.solo {
  grid-template-columns: minmax(0, 1fr) 0rem;
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
  width: 20rem;
  min-height: 0;
  overflow: hidden;
  border-left: 1px solid rgba(160, 137, 102, 0.35);
}

/* Level with the head of the sidebar rather than adrift in the middle of the
   board's edge. */
.sidebar-handle {
  position: absolute;
  top: 1.5rem;
  right: 20rem;
  z-index: 5;
  display: grid;
  place-items: center;
  width: 0.95rem;
  height: 3rem;
  padding: 0;
  font-size: 0.6rem;
  color: var(--ink-soft);
  background: var(--paper);
  border: 1px solid rgba(160, 137, 102, 0.35);
  border-right: none;
  border-radius: 5px 0 0 5px;
  transition: right var(--sidebar-ms) ease;
}

.sidebar-handle:hover {
  color: var(--ink);
}

/* One glyph turned rather than two swapped, so the chevron eases with the panel. */
.chev {
  transition: transform var(--sidebar-ms) ease;
}

.sidebar-handle[aria-expanded='true'] .chev {
  transform: rotate(180deg);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity var(--sidebar-ms) ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .layout,
  .chev,
  .sidebar-handle,
  .fade-enter-active,
  .fade-leave-active {
    transition: none;
  }
}

.layout.solo .sidebar-handle {
  right: 0;
}

.spectating {
  padding: 0.7rem clamp(0.9rem, 2vw, 1.5rem);
  margin: 0;
  border-top: 1px solid rgba(160, 137, 102, 0.35);
}

@media (max-width: 900px) {
  /* One column, the panel stacking under the board. `.layout.solo` outranks this
     on specificity, so it has to be answered here rather than left to the
     desktop rule. */
  .layout,
  .layout.solo {
    grid-template-columns: minmax(0, 1fr);
  }

  /* Below the board rather than beside it, and never more than half the screen. */
  .sidebar {
    width: auto;
    max-height: 45vh;
  }

  /* Sooner than wrap the bar onto two lines. */
  .tallies {
    display: none;
  }

  /* No vertical rule to sit on down here, so it keeps to the layout's edge. */
  .sidebar-handle {
    right: 0;
  }
}
</style>
