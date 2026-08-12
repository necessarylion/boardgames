<script setup lang="ts">
import { computed } from 'vue'
import { PLAYER_COLOURS } from '@shared/colours'
import type { CoupCharacter } from '@shared/coup'
import type { PlayerColour } from '@shared/types'
import CoupCorners from './CoupCorners.vue'
import GameIcon from '@/components/common/GameIcon.vue'
import { COUP_PORTRAITS } from '@/game/icons'
import { t } from '@/i18n'

/**
 * One influence card: an emblem panel over a name banner, with the character's
 * power printed underneath at full size. A card with no `character` is face
 * down — that is how every hand but your own is drawn, and the component is
 * never handed a character it is not allowed to show, because the server strips
 * them before they reach the client at all.
 *
 * The artwork is the original silhouette set in `src/game/icons.ts`, tinted per
 * character. Colour is doing real work here rather than decoration: it is what
 * lets a spread of revealed cards be read across the table at a glance, so the
 * five stay distinct from one another and from the paper behind them.
 */
const props = withDefaults(
  defineProps<{
    character?: CoupCharacter | null
    /** Already given up: drawn spent, and always face up. */
    spent?: boolean
    selectable?: boolean
    selected?: boolean
    /**
     * Whose card this is, for a face-down back. Colouring the backs is what lets
     * a glance round the table say who still holds what, which a uniform back
     * cannot — and it gives away nothing, since the count is public anyway.
     */
    colour?: PlayerColour | null
    /**
     * `small` is a seat's face-down card, `medium` the pair in your own seat —
     * big enough to read at a glance without making your seat outgrow the rest —
     * and `normal` the full card used in the hand dialogs and the reference.
     */
    size?: 'small' | 'medium' | 'normal'
  }>(),
  {
    character: null,
    spent: false,
    selectable: false,
    selected: false,
    size: 'normal',
    colour: null,
  },
)

/** The back's livery, falling back to plain paper for a card with no owner. */
const back = computed(() => {
  const set = props.colour ? PLAYER_COLOURS[props.colour] : null
  return set ? { '--back-fill': set.fill, '--back-ink': set.ink } : {}
})

/** The gilt scales with the card, so a seat-sized back is not all ornament. */
const rose = computed(() => ({ small: 34, medium: 44, normal: 54 })[props.size])
const vine = computed(() => ({ small: 13, medium: 16, normal: 20 })[props.size])

const name = computed(() => (props.character ? t(`coup.character.${props.character}`) : ''))
const power = computed(() => (props.character ? t(`coup.character.${props.character}.power`) : ''))
/**
 * The card face, when there is artwork for this character. It carries its own
 * name and power, so it replaces the emblem and banner entirely rather than
 * sitting inside them.
 */
const portrait = computed(() => (props.character ? COUP_PORTRAITS[props.character] : undefined))
/** The power only fits, and is only worth reading, on a full-size drawn card. */
const showPower = computed(() => props.size === 'normal' && !!props.character)
</script>

<template>
  <component
    :is="selectable ? 'button' : 'div'"
    class="card"
    :class="[character ?? 'down', size, { spent, selectable, selected, 'has-face': !!portrait }]"
    :type="selectable ? 'button' : undefined"
  >
    <!-- Artwork carries the name and power itself, so it is the whole face. -->
    <img v-if="portrait" class="face" :src="portrait" :alt="name" />

    <template v-else-if="character">
      <span class="art">
        <GameIcon :name="`coup.${character}`" :size="size === 'normal' ? 44 : 22" />
      </span>
      <span class="label">
        <span class="name">{{ name }}</span>
        <span v-if="showPower" class="power">{{ power }}</span>
      </span>
    </template>

    <span v-else class="back" :style="back" aria-hidden="true">
      <CoupCorners name="coup.filigree" :size="vine" />
      <GameIcon class="rose" name="coup.rose" :size="rose" />
    </span>

    <!-- What this character can do, on hover. The card art prints its power at
         full size only, and on a seat it is far too small to read, so this is
         how a player checks an ability without opening the rules. -->
    <span v-if="character" class="tip" role="tooltip">
      <strong>{{ name }}</strong>
      <span>{{ power }}</span>
    </span>
  </component>
</template>

<style scoped>
/*
 * Every card gets the same box, whatever shape its artwork is.
 *
 * The five are not cut to one shape — three are about 0.72 wide to tall and two
 * nearer 0.95 — so letting each take its natural width made the wider pair look
 * half again as big as the rest. The box is a compromise between the two shapes
 * and the art is fitted inside it, which keeps the set uniform and, because the
 * fit is `contain`, still shows every card whole. Cropping to fill was the
 * earlier attempt and it sliced the first letter off the wider names.
 */
.card {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 7.4rem;
  height: 9.25rem;
  padding: 0;
  /* Visible, so the hover tip can escape the card. The face and the emblem
     panel round their own corners instead of being clipped by this one. */
  overflow: visible;
  border-radius: 10px;
  border: 1px solid var(--gold-line);
  background: var(--paper);
  box-shadow: var(--shadow);
  color: var(--ink);
  font: inherit;
  text-align: left;
}

/* The art carries its own frame, so the slot underneath stops drawing one. */
.card.has-face {
  border-color: transparent;
  background: transparent;
  box-shadow: none;
}

.card.small {
  width: 4.4rem;
  height: 5.5rem;
  border-radius: 7px;
}

.card.medium {
  width: 6.1rem;
  height: 7.6rem;
  border-radius: 8px;
}

/* Fitted inside the slot rather than filling it: the whole card is always on
   screen, so no name loses its first letter, and every card sits in a box of
   exactly the same size as every other. */
.face {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
  border-radius: inherit;
}

/* --- the emblem panel ----------------------------------------------------- */

.art {
  flex: 1 1 auto;
  display: grid;
  place-items: center;
  min-height: 0;
  border-radius: 9px 9px 0 0;
  /* Each character's own wash, set by the character classes below. */
  background: var(--wash);
  color: var(--emblem);
  box-shadow: inset 0 -1px 0 rgba(0, 0, 0, 0.14);
}

/* --- the name banner ------------------------------------------------------ */

.label {
  flex: none;
  display: flex;
  flex-direction: column;
  gap: 0.12rem;
  padding: 0.3rem 0.4rem 0.35rem;
  background: var(--paper);
  border-radius: 0 0 9px 9px;
}

.name {
  font-family: var(--font-display);
  font-size: 0.82rem;
  line-height: 1.15;
  letter-spacing: 0.02em;
  color: var(--ink);
}

.card.small .name,
.card.medium .name {
  font-size: 0.56rem;
  padding: 0;
  text-align: center;
}

.card.small .label,
.card.medium .label {
  padding: 0.16rem 0.15rem 0.2rem;
}

.power {
  font-size: 0.6rem;
  line-height: 1.3;
  color: var(--ink-soft);
}

/* --- face down ------------------------------------------------------------ */

/*
 * The owner's colour, framed in gilt and struck with a compass rose.
 *
 * The seat's two tones are run as a gradient so the field has depth rather than
 * reading as a flat swatch, and the gilt is laid on in three passes: the frame
 * itself, a hairline highlight just inside it, and an inner rule set off the
 * edge — which is what gives the border its raised, tooled look.
 */
.back {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  border-radius: inherit;
  background: linear-gradient(
    155deg,
    var(--back-fill, #d8cbb2) 0%,
    var(--back-ink, #8c7a5c) 100%
  );
  border: 2px solid var(--coup-gilt, #c9a227);
  color: var(--coup-gilt-soft, #e2c979);
  box-shadow:
    inset 0 0 0 1px rgba(255, 246, 214, 0.5),
    inset 0 0 0 5px rgba(0, 0, 0, 0.22),
    inset 0 0 0 6px var(--coup-gilt, #c9a227),
    inset 0 0 18px rgba(0, 0, 0, 0.35);
}

/* The medallion sits above the corner vines and catches a little more light. */
.back .rose {
  position: relative;
  z-index: 1;
  filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.45));
}

/* The vines tuck into the gilt rule rather than sitting on the very edge. */
.back :deep(.corners) {
  inset: 4px;
  color: var(--coup-gilt-soft, #e2c979);
  opacity: 0.85;
}

/* --- the hover tip -------------------------------------------------------- */

.tip {
  position: absolute;
  left: 50%;
  bottom: calc(100% + 0.4rem);
  transform: translateX(-50%);
  z-index: 30;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  width: max-content;
  max-width: 13rem;
  padding: 0.4rem 0.55rem;
  border-radius: 8px;
  background: #3a2b1c;
  color: #f7efe2;
  font-size: 0.72rem;
  line-height: 1.35;
  text-align: left;
  box-shadow: var(--shadow-lg);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.12s ease;
}

.tip strong {
  font-family: var(--font-display);
  font-size: 0.8rem;
}

.card:hover .tip,
.card:focus-visible .tip {
  opacity: 1;
}

/* Lift the hovered card over its neighbours, so the tip is never cut off by
   the seat or the card sitting next to it. */
.card:hover {
  z-index: 25;
}

/* --- per-character colour ------------------------------------------------- */

.duke {
  --wash: linear-gradient(155deg, #6b4b9c, #3d2c5e);
  --emblem: #f3e6c0;
}
.assassin {
  --wash: linear-gradient(155deg, #4a4b52, #22232a);
  --emblem: #e8e9ee;
}
.captain {
  --wash: linear-gradient(155deg, #1f6f78, #0f3d45);
  --emblem: #dff1f2;
}
.ambassador {
  --wash: linear-gradient(155deg, #d98a3d, #8a5a17);
  --emblem: #fff3dc;
}
.contessa {
  --wash: linear-gradient(155deg, #b23a2c, #6f1f18);
  --emblem: #ffe6de;
}

/* --- states --------------------------------------------------------------- */

.spent {
  opacity: 0.5;
  filter: grayscale(0.6);
}

.selectable {
  cursor: pointer;
  transition: transform 0.12s ease, box-shadow 0.12s ease, border-color 0.12s ease;
}

.selectable:hover {
  transform: translateY(-3px);
  box-shadow: var(--shadow-lg);
  border-color: var(--vermillion);
}

.selected {
  border-color: var(--vermillion);
  box-shadow: 0 0 0 2px rgba(178, 58, 44, 0.35), var(--shadow);
  transform: translateY(-3px);
}
</style>
