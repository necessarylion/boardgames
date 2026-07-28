<script setup lang="ts">
import { computed } from 'vue'
import GameIcon from './GameIcon.vue'
import { PLAYER_COLOURS } from '@shared/colours'
import { hexPolygon } from '@shared/hex'
import type { PlayerColour, Tile } from '@shared/types'

/**
 * A single player tile drawn as an SVG group, so the same markup serves the
 * board and the hand. Always render it inside an <svg>.
 */
const props = withDefaults(
  defineProps<{
    tile: Tile
    colour: PlayerColour
    /** Circumradius of the hexagon in SVG units. */
    size?: number
    x?: number
    y?: number
  }>(),
  { size: 26, x: 0, y: 0 },
)

const palette = computed(() => PLAYER_COLOURS[props.colour])
const centre = computed(() => ({ x: props.x, y: props.y }))
const points = computed(() => hexPolygon(centre.value, props.size * 0.97))

/** Which pictogram sits on the tile's left-hand side. */
const iconName = computed(() =>
  props.tile.kind === 'caste' ? props.tile.caste! : props.tile.kind,
)

const showsValue = computed(() => props.tile.kind !== 'switch' && props.tile.kind !== 'move')
</script>

<template>
  <g>
    <polygon
      :points="points"
      :fill="palette.fill"
      :stroke="palette.ink"
      :stroke-width="size * 0.09"
      stroke-linejoin="round"
    />
    <GameIcon
      inline
      :name="iconName"
      :size="size * (showsValue ? 0.8 : 1)"
      :x="centre.x - (showsValue ? size * 0.36 : 0)"
      :y="centre.y - (showsValue ? 0 : size * 0.04)"
      :style="{ color: palette.text }"
    />
    <text
      v-if="showsValue"
      :x="centre.x + size * 0.44"
      :y="centre.y + size * 0.32"
      :font-size="size * 0.9"
      :fill="palette.text"
      font-weight="700"
      text-anchor="middle"
      style="font-family: var(--font-display)"
    >
      {{ tile.value }}
    </text>
    <!-- 速 is the rulebook's own mark for a tile that does not consume the
         turn's single placement; it is printed as a red seal. -->
    <g v-if="tile.fast">
      <rect
        :x="centre.x - size * 0.21"
        :y="centre.y + size * 0.3"
        :width="size * 0.42"
        :height="size * 0.42"
        :rx="size * 0.07"
        fill="#b23a2c"
      />
      <text
        :x="centre.x"
        :y="centre.y + size * 0.645"
        :font-size="size * 0.33"
        fill="#fdf3e6"
        text-anchor="middle"
        style="font-family: var(--font-display)"
      >
        速
      </text>
    </g>
  </g>
</template>
