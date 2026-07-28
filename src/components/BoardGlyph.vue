<script setup lang="ts">
import type { BoardShape } from '@shared/types'

/**
 * A thumbnail of a board's profile, so the shapes can be told apart at a glance
 * rather than by name. Each path traces the same centreline the map in
 * shared/board.ts is built from, drawn left to right across a 48x18 box.
 */
defineProps<{ shape: BoardShape }>()

const PATHS: Record<BoardShape, string> = {
  mountain: 'M2 15 L13 4 L24 14 L35 4 L46 15',
  valley: 'M2 4 L24 15 L46 4',
  bay: 'M2 3 C 12 17, 36 17, 46 3',
}
</script>

<template>
  <svg viewBox="0 0 48 18" width="48" height="18" aria-hidden="true">
    <path
      :d="PATHS[shape]"
      fill="none"
      stroke="currentColor"
      stroke-width="2.6"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
</template>
