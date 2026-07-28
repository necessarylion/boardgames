<script setup lang="ts">
import { computed } from 'vue'
import TileGlyph from './TileGlyph.vue'
import { t, tileTitle } from '@/i18n'
import { useGameStore } from '@/stores/game'

const game = useGameStore()

const SIZE = 30
const playable = computed(() => new Set(game.playableTileIds))
const selectedId = computed(() =>
  'tileId' in game.interaction ? game.interaction.tileId : null,
)

const prompt = computed(() => {
  if (!game.isMyTurn) {
    return game.activePlayer
      ? t('hand.waitingFor', { name: game.activePlayer.name })
      : t('hand.waiting')
  }
  switch (game.interaction.mode) {
    case 'place':
      return t('hand.prompt.place')
    case 'switch-first':
      return t('hand.prompt.switchFirst')
    case 'switch-second':
      return t('hand.prompt.switchSecond')
    case 'move-pick':
      return t('hand.prompt.movePick')
    case 'move-destination':
      return t('hand.prompt.moveDestination')
    default:
      if (game.mustPlace) return t('hand.prompt.mustPlace')
      return t('hand.prompt.done')
  }
})
</script>

<template>
  <div class="hand">
    <div class="hand-head">
      <div>
        <span class="hand-title">{{ t('hand.title') }}</span>
        <span class="tiny muted"> {{ t('hand.stackLeft', { count: game.me?.stackCount ?? 0 }) }}</span>
      </div>
      <p class="prompt tiny">{{ prompt }}</p>
    </div>

    <div class="tiles">
      <button
        v-for="tile in game.hand"
        :key="tile.id"
        class="tile-btn"
        :class="{
          selected: selectedId === tile.id,
          unplayable: !playable.has(tile.id),
        }"
        :disabled="!playable.has(tile.id)"
        :title="tileTitle(tile)"
        @click="game.selectTile(tile.id)"
      >
        <svg :width="SIZE * 1.9" :height="SIZE * 2.1" :viewBox="`0 0 ${SIZE * 1.9} ${SIZE * 2.1}`">
          <TileGlyph
            :tile="tile"
            :colour="game.me?.colour ?? 'gold'"
            :size="SIZE"
            :x="SIZE * 0.95"
            :y="SIZE * 1.05"
          />
        </svg>
      </button>
      <p v-if="!game.hand.length" class="muted tiny empty">{{ t('hand.empty') }}</p>
    </div>

    <div class="hand-actions">
      <button
        v-if="game.interaction.mode !== 'idle'"
        class="btn ghost small"
        @click="game.cancelInteraction()"
      >
        {{ t('hand.cancel') }}
      </button>
      <button
        v-if="game.canUndo"
        class="btn ghost small"
        :title="t('hand.undo.hint')"
        @click="game.undoPlacement()"
      >
        {{ t('hand.undo') }}
      </button>
      <button class="btn" :disabled="!game.canEndTurn" @click="game.endTurn()">
        {{ t('hand.endTurn') }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.hand {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.7rem clamp(0.9rem, 2vw, 1.5rem);
  border-top: 1px solid rgba(160, 137, 102, 0.35);
  flex-wrap: wrap;
}

.hand-head {
  min-width: 12rem;
  flex: 1 1 12rem;
}

.hand-title {
  font-family: var(--font-display);
  font-size: 1.05rem;
  font-weight: 600;
}

.prompt {
  margin: 0.15rem 0 0;
  color: var(--ink-soft);
}

.tiles {
  display: flex;
  gap: 0.3rem;
  align-items: center;
  flex-wrap: wrap;
}

.tile-btn {
  border: 0;
  background: transparent;
  padding: 2px;
  border-radius: 8px;
  line-height: 0;
  transition: transform 0.12s ease, background 0.12s ease;
}

.tile-btn:hover:not(:disabled) {
  transform: translateY(-3px);
}

.tile-btn.selected {
  background: rgba(178, 58, 44, 0.18);
  box-shadow: inset 0 0 0 2px var(--vermillion);
  transform: translateY(-3px);
}

.tile-btn.unplayable {
  opacity: 0.35;
  filter: grayscale(0.6);
}

.hand-actions {
  display: flex;
  gap: 0.5rem;
  margin-left: auto;
}

.empty {
  margin: 0 0.5rem;
}
</style>
