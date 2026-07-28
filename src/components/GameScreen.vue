<script setup lang="ts">
import { computed, ref } from 'vue'
import BoardView from './BoardView.vue'
import GameOverDialog from './GameOverDialog.vue'
import HandBar from './HandBar.vue'
import LogPanel from './LogPanel.vue'
import PlayerPanel from './PlayerPanel.vue'
import RulesDialog from './RulesDialog.vue'
import TableMenu from './TableMenu.vue'
import { PLAYER_COLOURS } from '@shared/colours'
import { LOCALE_NAME, LOCALES, locale, setLocale, t } from '@/i18n'
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

/**
 * The table menu carries the full language row, but mid-game that is a click
 * away behind a dropdown. With only two languages a single button that names
 * the one you are not in is enough, and costs the bar almost nothing.
 */
const otherLocale = computed(() => LOCALES.find((code) => code !== locale.value) ?? LOCALES[0])

const accent = computed(() =>
  game.activePlayer ? PLAYER_COLOURS[game.activePlayer.colour].ink : 'var(--ink-soft)',
)
</script>

<template>
  <div class="game">
    <header class="topbar">
      <div class="turn">
        <span class="dot" :style="{ background: accent }" />
        <strong>{{ turnLabel }}</strong>
        <span class="tiny muted">{{ t('game.round', { turn: game.state?.turnNumber ?? 1 }) }}</span>
      </div>
      <div class="top-actions">
        <span class="tiny muted code">{{ t('game.room', { code: game.state?.code ?? '' }) }}</span>
        <button
          class="btn ghost small"
          :lang="otherLocale"
          :title="t('lang.label')"
          @click="setLocale(otherLocale)"
        >
          {{ LOCALE_NAME[otherLocale] }}
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
      </div>

      <div class="sidebar" :class="{ open: showSidebar }">
        <PlayerPanel />
        <LogPanel />
      </div>
    </main>

    <RulesDialog v-if="showRules" @close="showRules = false" />
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
