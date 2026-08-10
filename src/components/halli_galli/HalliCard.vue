<script setup lang="ts">
import { computed } from 'vue'
import type { Card, Fruit } from '@shared/halligalli'

const props = withDefaults(
  defineProps<{
    /** The card to show, or null for an empty slot. */
    card?: Card | null
    /** Render a face-down back instead of the card's face. */
    down?: boolean
    size?: 'sm' | 'md'
  }>(),
  { card: null, down: false, size: 'md' },
)

/**
 * Original fruit glyphs — the app ships no publisher artwork, and emoji are as
 * original as an inline SVG silhouette. Lime leans on the lemon glyph, the
 * nearest citrus every platform draws.
 */
const FRUIT_EMOJI: Record<Fruit, string> = {
  banana: '🍌',
  lime: '🍋',
  strawberry: '🍓',
  plum: '🍇',
}

const pips = computed(() => (props.card ? Array.from({ length: props.card.n }) : []))
const glyph = computed(() => (props.card ? FRUIT_EMOJI[props.card.fruit] : ''))
</script>

<template>
  <div
    class="card"
    :class="[size, { down, empty: !down && !card }]"
    :title="card ? `${card.n} ${card.fruit}` : ''"
  >
    <template v-if="down">
      <span class="back-mark">🔔</span>
    </template>
    <template v-else-if="card">
      <span class="count">{{ card.n }}</span>
      <span class="pips" :class="`pips-${card.n}`">
        <span v-for="(_, i) in pips" :key="i" class="pip">{{ glyph }}</span>
      </span>
    </template>
  </div>
</template>

<style scoped>
.card {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 4.2rem;
  height: 5.8rem;
  border-radius: 10px;
  background: #fffdf7;
  border: 1px solid var(--gold-line);
  box-shadow: var(--shadow);
  overflow: hidden;
  user-select: none;
}

.card.sm {
  width: 2.9rem;
  height: 4rem;
  border-radius: 7px;
}

.card.empty {
  background: transparent;
  border-style: dashed;
  border-color: rgba(150, 128, 94, 0.5);
  box-shadow: none;
}

.card.down {
  background: repeating-linear-gradient(
    45deg,
    #b23a2c,
    #b23a2c 6px,
    #9c3125 6px,
    #9c3125 12px
  );
  border-color: #7d2519;
}

.back-mark {
  font-size: 1.5rem;
  filter: grayscale(0.2) brightness(1.2);
  opacity: 0.9;
}

.count {
  position: absolute;
  top: 0.2rem;
  left: 0.34rem;
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 0.95rem;
  color: var(--ink);
}

.card.sm .count {
  font-size: 0.7rem;
  top: 0.1rem;
  left: 0.24rem;
}

.pips {
  display: grid;
  gap: 1px;
  place-items: center;
  padding: 0.5rem 0.2rem 0.2rem;
}

/* Lay the fruit out the way the physical cards do: a column for small counts,
   two columns once there are four or five. */
.pips-1,
.pips-2,
.pips-3 {
  grid-template-columns: 1fr;
}

.pips-4,
.pips-5 {
  grid-template-columns: 1fr 1fr;
}

.pip {
  font-size: 1.1rem;
  line-height: 1;
}

.card.sm .pip {
  font-size: 0.75rem;
}
</style>
