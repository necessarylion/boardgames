<script setup lang="ts">
import { computed } from 'vue'
import type { CardColour } from '@shared/carnivals'
import { t } from '@/i18n'

/**
 * One Carnivals card: a red or a blue, printed with its number, or face down
 * when the number is not this viewer's to see. A red back is a card whose value
 * is hidden because it is not yours; a blue back is stranger — it is your own
 * blue, the one card the game never lets you look at, so it is drawn with a
 * question mark rather than a plain back to say so.
 *
 * The value is never guessed here: the server sends null for any card this
 * viewer may not see, and null is exactly what draws the back.
 */
const props = withDefaults(
  defineProps<{
    colour: CardColour
    /** The pip, or null when this viewer may not see it (draws a back). */
    value?: number | null
    /** `mine` marks the owner's own blind blue — a back with a question mark. */
    facedown?: 'theirs' | 'mine' | null
    size?: 'small' | 'normal'
    /** Dimmed, for a folded seat's cards at the showdown. */
    dim?: boolean
    /** Highlighted, for a card that won the pot. */
    win?: boolean
  }>(),
  { value: null, facedown: null, size: 'normal', dim: false, win: false },
)

const shown = computed(() => props.value !== null)
</script>

<template>
  <div
    class="card"
    :class="[colour, size, { down: !shown, dim, win }]"
    :title="shown ? t(`carnival.card.${colour}`, { n: value! }) : t(`carnival.card.${colour}.hidden`)"
  >
    <template v-if="shown">
      <span class="pip tl">{{ value }}</span>
      <span class="suit">{{ colour === 'red' ? '◆' : '◆' }}</span>
      <span class="pip br">{{ value }}</span>
    </template>
    <span v-else class="mystery" aria-hidden="true">{{ facedown === 'mine' ? '?' : '' }}</span>
  </div>
</template>

<style scoped>
.card {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  width: 3.4rem;
  height: 4.8rem;
  padding: 0.3rem 0.4rem;
  border-radius: 9px;
  border: 2px solid var(--edge);
  background: var(--face);
  color: var(--fg);
  box-shadow: var(--shadow);
  font-variant-numeric: tabular-nums;
  user-select: none;
}

.card.small {
  width: 2.5rem;
  height: 3.5rem;
  border-radius: 7px;
  padding: 0.2rem 0.28rem;
}

.red {
  --face: linear-gradient(160deg, #fff3f0, #f7d7cf);
  --edge: #a63a30;
  --fg: #7a221a;
}

.blue {
  --face: linear-gradient(160deg, #eef4fb, #cfe0f2);
  --edge: #2f5a86;
  --fg: #1f3f61;
}

/* A face-down card hides its number behind its own colour, tooled with a plain
   gilt rule so a fanned pile still reads as red or blue at a glance. */
.card.down {
  --face: repeating-linear-gradient(
    45deg,
    var(--back-a) 0,
    var(--back-a) 6px,
    var(--back-b) 6px,
    var(--back-b) 12px
  );
  display: grid;
  place-items: center;
  box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.35), var(--shadow);
}

.red.down {
  --back-a: #c86a5f;
  --back-b: #a63a30;
}

.blue.down {
  --back-a: #5b83ab;
  --back-b: #2f5a86;
}

.pip {
  font-family: var(--font-display);
  font-size: 1.05rem;
  line-height: 1;
}

.card.small .pip {
  font-size: 0.78rem;
}

.pip.br {
  align-self: flex-end;
  transform: rotate(180deg);
}

.suit {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  font-size: 1.3rem;
  opacity: 0.32;
}

.card.small .suit {
  font-size: 0.95rem;
}

.mystery {
  font-family: var(--font-display);
  font-size: 1.6rem;
  color: rgba(255, 255, 255, 0.85);
}

.card.small .mystery {
  font-size: 1.1rem;
}

.dim {
  opacity: 0.5;
  filter: grayscale(0.4);
}

.win {
  box-shadow: 0 0 0 3px rgba(212, 160, 23, 0.7), var(--shadow-lg);
  transform: translateY(-2px);
}
</style>
