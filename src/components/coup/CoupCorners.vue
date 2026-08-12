<script setup lang="ts">
import GameIcon from '../common/GameIcon.vue'

/**
 * The gilt corner pieces on a framed panel.
 *
 * Four elements rather than a pair of pseudo-elements, because a rule can only
 * carry two of those and a frame needs four; and four rotations of one drawn
 * corner rather than four drawings, so the set can never fall out of step with
 * itself. Purely decorative, so it is hidden from the accessibility tree.
 */
withDefaults(defineProps<{ size?: number; name?: string }>(), {
  size: 15,
  name: 'coup.corner',
})
</script>

<template>
  <span class="corners" aria-hidden="true">
    <GameIcon v-for="n in 4" :key="n" :class="`c${n}`" :name="name" :size="size" />
  </span>
</template>

<style scoped>
.corners {
  position: absolute;
  inset: 0;
  pointer-events: none;
  color: var(--coup-gilt, #b99a5c);
}

.corners :deep(svg) {
  position: absolute;
}

.corners :deep(.c1) {
  top: 3px;
  left: 3px;
}

.corners :deep(.c2) {
  top: 3px;
  right: 3px;
  transform: scaleX(-1);
}

.corners :deep(.c3) {
  bottom: 3px;
  right: 3px;
  transform: scale(-1);
}

.corners :deep(.c4) {
  bottom: 3px;
  left: 3px;
  transform: scaleY(-1);
}
</style>
