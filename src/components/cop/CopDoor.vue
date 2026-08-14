<script setup lang="ts">
import { computed } from 'vue'
import CopToken from './CopToken.vue'
import { RESOURCES, type Loot } from '@shared/cop'
import { PLAYER_COLOURS } from '@shared/colours'
import type { PlayerColour } from '@shared/types'
import { t } from '@/i18n'

/** One occupant revealed inside a room. */
export interface DoorOccupant {
  id: number
  name: string
  colour: PlayerColour
  caught: boolean
  /** The viewer themselves, marked so they can spot their own seat. */
  you?: boolean
  /** Whether the viewer is allowed to see this occupant's loot from the room. */
  takeSeen?: boolean
  /** What they carried off from this room, once the round is resolved. */
  gained?: Loot | null
}

/**
 * A single door. The room number and the loot are posted on the door face and
 * always public; who is inside stays behind it until the leaf swings open — for
 * your own room the moment you enter it, and for every door once the round is
 * resolved. The Cop marks a door to open by clicking it while it is still shut.
 */
const props = withDefaults(
  defineProps<{
    room: number
    loot: Loot
    selectable?: boolean
    /** The viewer's pending pick, before it is committed. */
    picked?: boolean
    /** The viewer is hidden in this room this round. */
    chosen?: boolean
    /** The Cop has marked this door to open. */
    marked?: boolean
    /** The round resolved: this door was opened by the Cop. */
    opened?: boolean
    /** The round resolved and the doors are all being shown. */
    resolved?: boolean
    /** The leaf stands open — this room is one the viewer is allowed to see into. */
    open?: boolean
    occupants?: DoorOccupant[]
  }>(),
  {
    selectable: false,
    picked: false,
    chosen: false,
    marked: false,
    opened: false,
    resolved: false,
    open: false,
    occupants: () => [],
  },
)

const emit = defineEmits<{ (e: 'pick'): void }>()

const label = computed(() => t('cop.room', { n: props.room + 1 }))
const nonZero = computed(() => RESOURCES.filter((r) => props.loot[r] > 0))
const gainedOf = (l: Loot | null | undefined) => (l ? RESOURCES.filter((r) => l[r] > 0) : [])
/** The parent decides which doors this viewer may see into. */
const ajar = computed(() => props.open)
</script>

<template>
  <component
    :is="selectable ? 'button' : 'div'"
    type="button"
    class="door"
    :class="{
      selectable,
      picked,
      marked,
      open: ajar,
      opened: resolved && opened,
      shut: resolved && !opened,
    }"
    @click="selectable && emit('pick')"
  >
    <!-- Behind the door: who is inside, shown once the leaf swings away. -->
    <div class="interior">
      <span class="interior-room tiny">{{ label }}</span>
      <div class="occupants">
        <div
          v-for="o in occupants"
          :key="o.id"
          class="occ-row"
          :class="{ caught: o.caught, me: o.you }"
        >
          <span class="occ" :style="{ '--occ': PLAYER_COLOURS[o.colour].ink }">
            <span class="occ-dot" />
            {{ o.name }}
            <span v-if="o.caught" aria-hidden="true">🚨</span>
          </span>
          <!-- Once resolved: a caught thief plainly took nothing; a safe thief you
               shared the room with shows their share; a safe thief elsewhere is
               shown as escaped, their loot kept private. -->
          <span v-if="resolved && o.caught" class="took none">{{ t('cop.took.none') }}</span>
          <span v-else-if="resolved && !o.takeSeen" class="took escaped">{{ t('cop.escaped') }}</span>
          <span v-else-if="resolved && gainedOf(o.gained).length" class="took">
            <CopToken v-for="r in gainedOf(o.gained)" :key="r" :resource="r" :count="o.gained![r]" size="small" />
          </span>
          <span v-else-if="resolved" class="took none">{{ t('cop.took.zero') }}</span>
        </div>
        <span v-if="occupants.length === 0" class="tiny muted">{{ t('cop.nobody') }}</span>
      </div>
    </div>

    <!-- The door face: room number, the loot posted on it, and a handle. -->
    <div class="leaf">
      <div class="leaf-inner">
        <div class="door-head">
          <span class="room-no">{{ label }}</span>
          <span v-if="chosen" class="here tiny">{{ t('cop.here') }}</span>
          <span v-else-if="marked" class="mark" aria-hidden="true">🔍</span>
        </div>
        <div class="loot">
          <CopToken v-for="r in nonZero" :key="r" :resource="r" :count="loot[r]" size="small" />
          <span v-if="nonZero.length === 0" class="tiny muted">{{ t('cop.empty') }}</span>
        </div>
      </div>
      <span class="knob" aria-hidden="true" />
    </div>
  </component>
</template>

<style scoped>
/* The interior and the leaf are stacked in one grid cell, so the door grows to
   fit whichever is taller — a room with several occupants no longer clips. */
.door {
  position: relative;
  display: grid;
  min-height: 6.6rem;
  border-radius: 12px;
  border: 2px solid var(--gold-line);
  background: linear-gradient(160deg, #3a2b1c, #241a12);
  box-shadow: var(--shadow);
  padding: 0;
  text-align: left;
  color: var(--ink);
  font: inherit;
  overflow: hidden;
  perspective: 900px;
}

.door.selectable {
  cursor: pointer;
}

.door.opened {
  border-color: #b23a2c;
}

/* --- behind the door (the room interior) --------------------------------- */

.interior {
  grid-area: 1 / 1;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding: 0.55rem 0.6rem;
  background:
    radial-gradient(120% 90% at 20% 0%, rgba(255, 244, 222, 0.12), transparent 60%),
    linear-gradient(165deg, #2c2115, #191009);
  color: #f2e6d2;
}

.interior-room {
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: rgba(240, 228, 210, 0.5);
}

.occupants {
  display: flex;
  flex-direction: column;
  align-content: flex-start;
  gap: 0.2rem;
  flex: 1 1 auto;
}

.occ-row {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  flex-wrap: wrap;
}

.occ {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  font-size: 0.75rem;
  padding: 0.05rem 0.4rem;
  border-radius: 999px;
  background: rgba(255, 253, 246, 0.92);
  color: var(--ink);
  border: 1px solid var(--occ);
}

.occ-row.me .occ {
  box-shadow: 0 0 0 2px rgba(178, 58, 44, 0.4);
}

.occ-row.caught .occ {
  background: rgba(178, 58, 44, 0.9);
  color: #fdeee8;
  border-color: #6b1d17;
}

.occ-dot {
  width: 0.55rem;
  height: 0.55rem;
  border-radius: 50%;
  background: var(--occ);
  flex: none;
}

.occ-row.caught .occ-dot {
  background: #fdeee8;
}

.took {
  display: inline-flex;
  align-items: center;
  gap: 0.15rem;
}

.took.none {
  font-size: 0.68rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: rgba(240, 228, 210, 0.6);
}

.took.escaped {
  font-size: 0.68rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #8fd0a0;
}

/* --- the door leaf that swings open --------------------------------------- */

.leaf {
  grid-area: 1 / 1;
  display: flex;
  align-items: stretch;
  border-radius: 10px;
  background: linear-gradient(170deg, rgba(255, 252, 242, 0.98), rgba(244, 227, 194, 0.96));
  /* Two recessed panels, so the face reads as a door rather than a card. */
  box-shadow:
    inset 0 0 0 1px rgba(150, 128, 94, 0.35),
    inset 0 0 0 6px rgba(255, 255, 255, 0.25),
    inset 0 0 0 7px rgba(150, 128, 94, 0.2);
  transform-origin: left center;
  transition: transform 0.55s cubic-bezier(0.5, 0.05, 0.3, 1), box-shadow 0.4s ease;
  backface-visibility: hidden;
}

.door.selectable:hover .leaf {
  background: linear-gradient(170deg, rgba(255, 250, 238, 1), rgba(248, 231, 198, 1));
}

.door.picked .leaf {
  box-shadow:
    inset 0 0 0 2px var(--vermillion),
    inset 0 0 0 7px rgba(178, 58, 44, 0.15);
}

.door.marked .leaf {
  box-shadow:
    inset 0 0 0 2px #2f5a86,
    inset 0 0 0 7px rgba(47, 90, 134, 0.16);
}

/* Swing the leaf away on its left hinge to reveal the room behind it. */
.door.open .leaf {
  transform: rotateY(-108deg);
  box-shadow: 10px 0 22px rgba(0, 0, 0, 0.35);
}

.leaf-inner {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding: 0.55rem 0.6rem;
}

.door-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.4rem;
}

.room-no {
  font-family: var(--font-display);
  font-size: 1rem;
  letter-spacing: 0.04em;
}

.here {
  padding: 0.05rem 0.35rem;
  border-radius: 4px;
  background: rgba(178, 58, 44, 0.18);
  color: var(--vermillion-dark);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.loot {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}

/* The handle, on the swinging edge. */
.knob {
  align-self: center;
  width: 0.55rem;
  height: 0.55rem;
  margin-right: 0.4rem;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 35%, #f6e6bf, #a9861f);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.35);
  flex: none;
}

@media (prefers-reduced-motion: reduce) {
  .leaf {
    transition: none;
  }
}
</style>
