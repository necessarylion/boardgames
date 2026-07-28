<script setup lang="ts">
import { computed, useId } from 'vue'
import GameIcon from './GameIcon.vue'
import { CASTE_COLOURS, PLAYER_COLOURS } from '@shared/colours'
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
/** A rule just inside the border, which is what makes the tile read as a card. */
const bevel = computed(() => hexPolygon(centre.value, props.size * 0.875))

/**
 * Every glyph carries its own copy of its weave pattern. Several svg roots host
 * tiles (board, hand, draft), and a pattern shared between them would break the
 * moment the svg that defined it unmounted — hence the per-instance id.
 */
const weaveId = `tile-weave-${useId()}`
/** Thread spacing. Fine enough to read as cloth rather than as a grid. */
const pitch = computed(() => props.size * 0.15)

/** Which pictogram sits on the tile's left-hand side. */
const iconName = computed(() =>
  props.tile.kind === 'caste' ? props.tile.caste! : props.tile.kind,
)

const showsValue = computed(() => props.tile.kind !== 'switch' && props.tile.kind !== 'move')

/** Plain paper, for a wild tile: it counts toward all three castes, so no colour. */
const WILD_DISC = { fill: '#f2e9d5', ink: '#6b543a' }

/**
 * A caste tile carries the colour of the caste it counts toward, so what a tile
 * does reads at a glance. The disc doubles as the ground the pictogram needs to
 * stay legible on a deeply dyed tile, which is why the wild tiles get one too, in
 * plain paper. The action tiles, drawn as pale silhouettes straight on the cloth,
 * get neither.
 */
const disc = computed(() =>
  props.tile.kind === 'caste'
    ? CASTE_COLOURS[props.tile.caste!]
    : showsValue.value
      ? WILD_DISC
      : null,
)

/** The pictogram, and the disc behind it, sit left of the value. */
const iconCentre = computed(() => ({
  x: props.x - (showsValue.value ? props.size * 0.31 : 0),
  y: props.y - (showsValue.value ? 0 : props.size * 0.04),
}))
</script>

<template>
  <g>
    <!-- Warp and weft, crossing at 45° so the tile reads as cloth. Where the two
         threads overlap the ink doubles up, which is what gives the weave. -->
    <defs>
      <pattern
        :id="weaveId"
        patternUnits="userSpaceOnUse"
        :width="pitch"
        :height="pitch"
        patternTransform="rotate(45)"
      >
        <rect :width="pitch" :height="pitch" :fill="palette.fill" />
        <rect :width="pitch" :height="pitch * 0.34" :fill="palette.ink" opacity="0.15" />
        <rect :width="pitch * 0.34" :height="pitch" :fill="palette.ink" opacity="0.15" />
      </pattern>
    </defs>
    <polygon
      :points="points"
      :fill="`url(#${weaveId})`"
      :stroke="palette.ink"
      :stroke-width="size * 0.09"
      stroke-linejoin="round"
    />
    <polygon
      :points="bevel"
      fill="none"
      stroke="#fffaf0"
      stroke-opacity="0.45"
      :stroke-width="size * 0.05"
      stroke-linejoin="round"
    />
    <circle
      v-if="disc"
      :cx="iconCentre.x"
      :cy="iconCentre.y"
      :r="size * 0.35"
      :fill="disc.fill"
      :stroke="disc.ink"
      :stroke-width="size * 0.04"
    />
    <GameIcon
      inline
      :name="iconName"
      :size="size * (disc ? 0.65 : showsValue ? 0.8 : 1)"
      :x="iconCentre.x"
      :y="iconCentre.y"
      :style="{ color: disc ? disc.ink : palette.text }"
    />
    <text
      v-if="showsValue"
      :x="centre.x + size * 0.44"
      :y="centre.y + size * 0.27"
      :font-size="size * 0.74"
      :fill="palette.text"
      font-weight="700"
      text-anchor="middle"
      style="font-family: var(--font-display)"
    >
      {{ tile.value }}
    </text>
    <!-- 速 is the rulebook's own mark for a tile that does not consume the
         turn's single placement; it is printed as a red seal. The pale outline is
         what keeps it visible on the red seat's own tiles. -->
    <g v-if="tile.fast">
      <rect
        :x="centre.x - size * 0.21"
        :y="centre.y + size * 0.3"
        :width="size * 0.42"
        :height="size * 0.42"
        :rx="size * 0.07"
        fill="#b23a2c"
        stroke="#fdf3e6"
        stroke-opacity="0.8"
        :stroke-width="size * 0.035"
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
