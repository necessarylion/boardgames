<script setup lang="ts">
import { computed } from 'vue'
import TableMenu from './TableMenu.vue'
import TileGlyph from './TileGlyph.vue'
import TileReference from './TileReference.vue'
import { STARTING_HAND_SIZE, tileLabel } from '@shared/tiles'
import { useGameStore } from '@/stores/game'

const game = useGameStore()

const SIZE = 48
const picked = computed(() => new Set(game.draftPicks))
const done = computed(() => game.me?.ready ?? false)
const waitingOn = computed(() => game.players.filter((p) => !p.ready).map((p) => p.name))
</script>

<template>
  <div class="draft">
    <aside class="guide">
      <div class="guide-inner">
        <header class="head">
          <h1>Choose your opening hand</h1>
          <p class="muted">
            Pick {{ STARTING_HAND_SIZE }} of your 20 tiles. The other 15 are shuffled into your
            draw stack. Everyone chooses at the same time, and nobody sees your choice.
          </p>
        </header>

        <h2>What each tile does</h2>
        <TileReference />
      </div>
    </aside>

    <main class="picker">
      <div class="bar">
        <TableMenu />
      </div>

      <template v-if="!done">
        <div class="chooser">
          <div class="tiles">
            <button
              v-for="tile in game.draftPool"
              :key="tile.id"
              class="tile-btn"
              :class="{ picked: picked.has(tile.id) }"
              :title="tileLabel(tile)"
              @click="game.toggleDraftPick(tile.id)"
            >
              <svg
                :width="SIZE * 1.9"
                :height="SIZE * 2.15"
                :viewBox="`0 0 ${SIZE * 1.9} ${SIZE * 2.15}`"
              >
                <TileGlyph
                  :tile="tile"
                  :colour="game.me?.colour ?? 'gold'"
                  :size="SIZE"
                  :x="SIZE * 0.95"
                  :y="SIZE * 1.07"
                />
              </svg>
            </button>
          </div>

          <div class="actions">
            <span class="count">
              {{ game.draftPicks.length }} / {{ STARTING_HAND_SIZE }} chosen
            </span>
            <div class="buttons">
              <button class="btn ghost small" @click="game.randomiseDraft()">Choose for me</button>
              <button
                class="btn"
                :disabled="game.draftPicks.length !== STARTING_HAND_SIZE"
                @click="game.confirmDraft()"
              >
                Confirm hand
              </button>
            </div>
          </div>
        </div>
      </template>

      <div v-else class="waiting">
        <h2>Your hand is set</h2>
        <p class="muted">Waiting for {{ waitingOn.join(', ') }}.</p>
      </div>
    </main>
  </div>
</template>

<style scoped>
/* Same split as the home screen: full bleed, no cards, what you read on the
   left and what you act on the right, divided by a single rule. */
.draft {
  height: 100%;
  display: grid;
  grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr);
  min-height: 0;
}

.guide {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: clamp(1.5rem, 4vw, 3rem) clamp(1.25rem, 3.5vw, 3rem);
  overflow-y: auto;
  scrollbar-width: thin;
}

.guide-inner {
  width: 100%;
  max-width: 44rem;
}

.guide h2 {
  font-size: 1.05rem;
  margin-bottom: 0.75rem;
  color: var(--vermillion-dark);
}

.picker {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: clamp(1.5rem, 4vw, 3rem) clamp(1.25rem, 3.5vw, 3rem);
  border-left: 1px solid rgba(160, 137, 102, 0.35);
  min-height: 0;
}

.chooser {
  display: flex;
  flex-direction: column;
  min-height: 0;
  width: 100%;
}

/* Floats over the picker so it costs the tile grid no vertical room. */
.bar {
  position: absolute;
  top: 1rem;
  right: clamp(1.25rem, 3.5vw, 3rem);
  z-index: 1;
}

.head {
  flex: none;
  margin-bottom: 1.5rem;
}

h1 {
  font-size: 1.9rem;
  margin-bottom: 0.4rem;
}

.head p {
  max-width: 36rem;
  line-height: 1.5;
}

.tiles {
  /* Shrinks and scrolls if it has to, but does not stretch — the picks bar sits
     directly under the last row rather than at the far bottom of the column. */
  flex: 0 1 auto;
  min-height: 0;
  overflow-y: auto;
  scrollbar-width: thin;
  align-content: start;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(6.3rem, 1fr));
  gap: 0.5rem;
  justify-items: center;
  /* Room for the lift a hovered or picked tile gets, which the scroll box
     would otherwise clip off the top row. */
  padding: 0.5rem 0 1rem;
}

.tile-btn {
  border: 0;
  background: transparent;
  padding: 3px;
  border-radius: 9px;
  line-height: 0;
  transition: transform 0.12s ease, background 0.12s ease;
}

.tile-btn:hover {
  transform: translateY(-3px);
}

.tile-btn.picked {
  background: rgba(178, 58, 44, 0.16);
  box-shadow: inset 0 0 0 2px var(--vermillion);
  transform: translateY(-3px);
}

.actions {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-top: 0.75rem;
  padding: 0.9rem 0 0;
  border-top: 1px solid rgba(160, 137, 102, 0.35);
  flex-wrap: wrap;
}

.count {
  font-family: var(--font-display);
  font-size: 1.05rem;
}

.buttons {
  display: flex;
  gap: 0.5rem;
}

.waiting {
  text-align: center;
}

/* Short windows — a 720p laptop, or any browser with a lot of chrome. The
   heading and the outer padding are the cheapest things to give back, and
   spending them is what keeps both panes off a scrollbar. */
@media (max-height: 860px) {
  .draft {
    padding: 0.85rem 1.25rem 1rem;
  }

  .head {
    margin-bottom: 0.7rem;
  }

  h1 {
    font-size: 1.45rem;
  }

  .head p {
    font-size: 0.85rem;
  }
}
</style>
