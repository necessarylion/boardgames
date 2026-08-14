<script setup lang="ts">
import { computed } from 'vue'
import type { Resource } from '@shared/cop'
import { t } from '@/i18n'

/**
 * One resource, drawn as a small labelled chip. A bare glyph (no count) is used
 * for legends; give `count` to show a holding. The glyphs are plain emoji rather
 * than artwork, so nothing here is a published component.
 */
const props = withDefaults(
  defineProps<{ resource: Resource; count?: number | null; size?: 'small' | 'normal' }>(),
  { count: null, size: 'normal' },
)

const GLYPH: Record<Resource, string> = { key: '🔑', stamp: '✉️', card: '🃏' }
const glyph = computed(() => GLYPH[props.resource])
const label = computed(() => t(`cop.resource.${props.resource}`))
</script>

<template>
  <span class="token" :class="[resource, size]" :title="label">
    <span class="glyph" aria-hidden="true">{{ glyph }}</span>
    <span v-if="count !== null" class="count">{{ count }}</span>
    <span class="sr-only">{{ label }}</span>
  </span>
</template>

<style scoped>
/* The chips are opaque, so the count reads whether the token sits on light paper
   or on the dark interior of an opened door. */
.token {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  padding: 0.1rem 0.4rem;
  border-radius: 999px;
  background: #f4ece0;
  border: 1px solid rgba(150, 128, 94, 0.45);
  font-variant-numeric: tabular-nums;
  line-height: 1;
}

.token.key {
  background: #f6e8c4;
  border-color: rgba(212, 160, 23, 0.7);
}

.token.stamp {
  background: #dbe4f0;
  border-color: rgba(47, 90, 134, 0.6);
}

.token.card {
  background: #f4d7d1;
  border-color: rgba(178, 58, 44, 0.6);
}

.glyph {
  font-size: 1rem;
}

.small .glyph {
  font-size: 0.85rem;
}

.count {
  font-family: var(--font-display);
  font-size: 0.95rem;
  color: var(--ink);
}

.small .count {
  font-size: 0.8rem;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>
