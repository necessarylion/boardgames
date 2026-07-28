<script setup lang="ts">
import { computed, ref } from 'vue'
import GameIcon from './GameIcon.vue'
import TileGlyph from './TileGlyph.vue'
import { usePanZoom, type Bounds } from '@/composables/usePanZoom'
import { CASTE_COLOURS } from '@shared/colours'
import { hexCentre, hexPolygon, type Point } from '@shared/hex'
import type { PieceRef } from '@shared/rules'
import { SETTLEMENT_CAPACITY, type PlayerColour, type Space } from '@shared/types'
import { t } from '@/i18n'
import { useGameStore } from '@/stores/game'

const game = useGameStore()

const HEX = 34 // circumradius in SVG units
const PAD = HEX * 1.2

interface Cell {
  space: Space
  centre: Point
  points: string
}

const cells = computed<Cell[]>(() =>
  game.board.order.map((id) => {
    const space = game.board.spaces[id]
    const centre = hexCentre(space.q, space.r, HEX)
    return { space, centre, points: hexPolygon(centre, HEX * 0.985) }
  }),
)

/** The full extent of the board, in SVG units. */
const bounds = computed<Bounds>(() => {
  if (!cells.value.length) return { x: 0, y: 0, width: 100, height: 100 }
  const xs = cells.value.map((c) => c.centre.x)
  const ys = cells.value.map((c) => c.centre.y)
  const x = Math.min(...xs) - PAD
  const y = Math.min(...ys) - PAD
  return { x, y, width: Math.max(...xs) + PAD - x, height: Math.max(...ys) + PAD - y }
})

const frame = ref<HTMLElement | null>(null)
const { viewBox, zoom, dragging, canZoomIn, canZoomOut, reset, zoomIn, zoomOut, handlers, onClickCapture } =
  usePanZoom(frame, bounds)

const pieces = computed(() => game.state?.pieces ?? {})
const placed = computed(() => game.state?.placed ?? {})

const highlighted = computed(() => new Set(game.highlightedSpaces))
const selectable = computed(
  () => new Set(game.selectablePieces.map((p: PieceRef) => `${p.spaceId}:${p.index}`)),
)
const chosenFirst = computed(() =>
  game.interaction.mode === 'switch-second'
    ? `${game.interaction.first.spaceId}:${game.interaction.first.index}`
    : null,
)
const justPlaced = computed(() => new Set(game.state?.placedThisTurn ?? []))

/** Offsets for laying out a settlement's caste pieces inside its hex. */
function pieceSlots(count: number): Point[] {
  if (count <= 1) return [{ x: 0, y: 2 }]
  if (count === 2) {
    return [
      { x: -HEX * 0.4, y: 2 },
      { x: HEX * 0.4, y: 2 },
    ]
  }
  return [
    { x: -HEX * 0.44, y: -HEX * 0.16 },
    { x: HEX * 0.44, y: -HEX * 0.16 },
    { x: 0, y: HEX * 0.44 },
  ]
}

/** Small roof marks showing how many buildings a settlement has. */
function buildingSlots(count: number): Point[] {
  const step = HEX * 0.36
  const start = -((count - 1) / 2) * step
  return Array.from({ length: count }, (_, i) => ({ x: start + i * step, y: -HEX * 0.55 }))
}

function ownerColour(spaceId: string): PlayerColour {
  const tile = placed.value[spaceId]
  return game.players.find((p) => p.id === tile?.owner)?.colour ?? 'gold'
}

function isSurroundedNow(space: Space): boolean {
  return (
    space.kind === 'settlement' &&
    space.landNeighbours.length > 0 &&
    space.landNeighbours.every((id) => id in placed.value)
  )
}
</script>

<template>
  <div ref="frame" class="board-wrap">
    <svg
      class="board"
      :class="{ dragging }"
      :viewBox="viewBox"
      role="img"
      :aria-label="t('board.label')"
      v-bind="handlers"
      @click.capture="onClickCapture"
    >
      <defs>
        <filter id="tile-drop" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="1.2" stdDeviation="1.4" flood-color="#3a2a18" flood-opacity="0.35" />
        </filter>
      </defs>

      <g v-for="cell in cells" :key="cell.space.id">
        <!-- terrain -->
        <polygon
          :points="cell.points"
          :class="[
            'hex',
            `hex-${cell.space.kind}`,
            {
              'hex-target': highlighted.has(cell.space.id),
              'hex-surrounded': isSurroundedNow(cell.space),
            },
          ]"
          @click="game.clickSpace(cell.space.id)"
        />

        <!-- settlement furniture -->
        <template v-if="cell.space.kind === 'settlement'">
          <GameIcon
            v-for="(slot, i) in buildingSlots(SETTLEMENT_CAPACITY[cell.space.settlement!])"
            :key="`b${i}`"
            inline
            name="building"
            :size="HEX * 0.34"
            :x="cell.centre.x + slot.x"
            :y="cell.centre.y + slot.y"
            class="building"
            :class="{ 'building-edo': cell.space.settlement === 'edo' }"
          />

          <g
            v-for="(caste, index) in pieces[cell.space.id] ?? []"
            :key="`p${index}`"
            :class="[
              'piece',
              {
                'piece-selectable': selectable.has(`${cell.space.id}:${index}`),
                'piece-chosen': chosenFirst === `${cell.space.id}:${index}`,
              },
            ]"
            @click="game.clickPiece({ spaceId: cell.space.id, index })"
          >
            <circle
              :cx="cell.centre.x + pieceSlots((pieces[cell.space.id] ?? []).length)[index].x"
              :cy="cell.centre.y + pieceSlots((pieces[cell.space.id] ?? []).length)[index].y"
              :r="HEX * 0.34"
              class="piece-disc"
              :style="{
                '--disc-fill': CASTE_COLOURS[caste].fill,
                '--disc-ink': CASTE_COLOURS[caste].ink,
              }"
            />
            <GameIcon
              inline
              :name="caste"
              :size="HEX * 0.63"
              :x="cell.centre.x + pieceSlots((pieces[cell.space.id] ?? []).length)[index].x"
              :y="cell.centre.y + pieceSlots((pieces[cell.space.id] ?? []).length)[index].y"
            />
          </g>
        </template>

        <!-- placed tile -->
        <g
          v-if="placed[cell.space.id]"
          filter="url(#tile-drop)"
          :class="['tile', { 'tile-fresh': justPlaced.has(cell.space.id) }]"
        >
          <TileGlyph
            :tile="game.tiles[placed[cell.space.id].tileId]"
            :colour="ownerColour(cell.space.id)"
            :size="HEX * 0.83"
            :x="cell.centre.x"
            :y="cell.centre.y"
          />
        </g>
      </g>
    </svg>

    <div class="zoom-controls">
      <button
        class="zoom-btn"
        :disabled="!canZoomIn"
        :title="t('board.zoomIn')"
        :aria-label="t('board.zoomIn')"
        @click="zoomIn"
      >
        +
      </button>
      <button
        class="zoom-btn"
        :disabled="!canZoomOut"
        :title="t('board.zoomOut')"
        :aria-label="t('board.zoomOut')"
        @click="zoomOut"
      >
        &minus;
      </button>
      <button
        class="zoom-btn reset"
        :disabled="!canZoomOut"
        :title="t('board.fit')"
        :aria-label="t('board.fit')"
        @click="reset"
      >
        {{ t('board.fitShort') }}
      </button>
    </div>
    <p v-if="zoom > 1.02" class="zoom-badge tiny">{{ Math.round(zoom * 100) }}%</p>
  </div>
</template>

<style scoped>
.board-wrap {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 0;
  height: 100%;
  padding: 0.5rem;
  overflow: hidden;
}

.board {
  width: 100%;
  height: 100%;
  max-height: 100%;
  cursor: grab;
  /* Own every gesture on the board: the page must not scroll or pinch under it. */
  touch-action: none;
}

.board.dragging {
  cursor: grabbing;
}

.zoom-controls {
  position: absolute;
  right: 0.7rem;
  bottom: 0.7rem;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.zoom-btn {
  width: 2rem;
  height: 2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 7px;
  border: 1px solid rgba(140, 118, 84, 0.5);
  background: rgba(255, 252, 245, 0.92);
  color: var(--ink);
  font-size: 1.1rem;
  font-weight: 600;
  line-height: 1;
  box-shadow: var(--shadow);
  transition: background 0.12s ease;
}

.zoom-btn.reset {
  font-size: 0.72rem;
  font-family: var(--font-display);
  letter-spacing: 0.04em;
}

.zoom-btn:hover:not(:disabled) {
  background: #fff;
}

.zoom-btn:disabled {
  opacity: 0.4;
}

.zoom-badge {
  position: absolute;
  left: 0.7rem;
  bottom: 0.7rem;
  margin: 0;
  padding: 0.15rem 0.45rem;
  border-radius: 5px;
  background: rgba(255, 252, 245, 0.85);
  border: 1px solid rgba(140, 118, 84, 0.35);
  color: var(--ink-soft);
  font-variant-numeric: tabular-nums;
}

.hex {
  stroke: rgba(122, 100, 70, 0.45);
  stroke-width: 1.2;
  transition: fill 0.15s ease;
}

.hex-sea {
  fill: var(--sea);
}

.hex-land {
  fill: var(--land);
}

.hex-settlement {
  fill: var(--settlement);
  stroke: rgba(110, 86, 54, 0.85);
  stroke-width: 2.4;
}

.hex-surrounded {
  fill: #f6dfb4;
}

.hex-target {
  fill: #cbe6b8;
  stroke: #4d7a35;
  stroke-width: 2.6;
  cursor: pointer;
  animation: pulse 1.6s ease-in-out infinite;
}

.hex-target:hover {
  fill: #b7dea0;
}

@keyframes pulse {
  0%,
  100% {
    stroke-opacity: 0.55;
  }
  50% {
    stroke-opacity: 1;
  }
}

/*
 * Only the hex itself and the caste pieces answer to a click. Everything drawn
 * over a hex is decoration and has to let the click through to the hex beneath
 * — a placed tile covers almost the whole space, so without this the only part
 * of an occupied hex that could be clicked was the thin ring around its edge,
 * and picking up a tile with a move tile was all but impossible.
 */
.tile,
.building {
  pointer-events: none;
}

.building {
  color: rgba(104, 80, 48, 0.9);
}

.building-edo {
  color: var(--vermillion);
}

/* The caste colour is the only thing separating the three pieces at this size,
   so every state below changes the ring and leaves the fill alone. */
.piece-disc {
  fill: var(--disc-fill);
  stroke: var(--disc-ink);
  stroke-width: 1.1;
}

.piece-selectable {
  cursor: pointer;
}

.piece-selectable .piece-disc {
  stroke: #2f6b34;
  stroke-width: 2.6;
}

.piece-selectable:hover .piece-disc {
  stroke-width: 3.4;
}

.piece-chosen .piece-disc {
  stroke: var(--vermillion);
  stroke-width: 3;
}

.tile-fresh {
  animation: drop-in 0.28s ease-out;
}

@keyframes drop-in {
  from {
    opacity: 0;
    transform: translateY(-6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
