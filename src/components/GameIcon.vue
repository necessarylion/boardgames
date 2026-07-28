<script setup lang="ts">
import { computed } from 'vue'
import { ICON_IMAGES, ICONS } from '@/game/icons'

const props = withDefaults(
  defineProps<{
    name: string
    size?: number
    /** Render as a bare <g> for use inside an existing SVG, positioned at x/y. */
    inline?: boolean
    x?: number
    y?: number
  }>(),
  { size: 20, inline: false, x: 0, y: 0 },
)

/** Artwork wins over the drawn set; see ICON_IMAGES. */
const image = computed(() => ICON_IMAGES[props.name])
const markup = computed(() => ICONS[props.name] ?? '')
/** The icons are drawn on a 24-unit grid; scale and centre them on x/y. */
const transform = computed(() => {
  const scale = props.size / 24
  return `translate(${props.x - props.size / 2} ${props.y - props.size / 2}) scale(${scale})`
})
</script>

<template>
  <!-- Raster icon. The source images are not square, so let them letterbox
       inside the size box rather than stretching to fill it. -->
  <image
    v-if="image && inline"
    :href="image"
    :x="x - size / 2"
    :y="y - size / 2"
    :width="size"
    :height="size"
    preserveAspectRatio="xMidYMid meet"
  />
  <img v-else-if="image" class="icon raster" :src="image" :width="size" :height="size" alt="" />

  <!-- fill must be set here too: an inline <g> has no <svg> of its own to inherit from. -->
  <g v-else-if="inline" :transform="transform" fill="currentColor" v-html="markup" />
  <svg
    v-else
    class="icon"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
    v-html="markup"
  />
</template>

<style scoped>
.icon {
  display: block;
  flex: none;
}

.raster {
  object-fit: contain;
}
</style>
