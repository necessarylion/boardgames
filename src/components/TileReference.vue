<script setup lang="ts">
import GameIcon from './GameIcon.vue'
import { TILE_SET } from '@shared/tiles'
import { CASTES, CASTE_LABEL, CASTE_PIECE_LABEL } from '@shared/types'
import type { Caste, TileDef } from '@shared/types'

/**
 * What each of the twenty tiles does. Shown both in the rules sheet and beside
 * the draft chooser, so it lives here rather than in either of them.
 *
 * The counts and values are read off TILE_SET rather than written out, so they
 * stay honest if the set is ever re-balanced.
 */
type TileEntry = {
  icon: string
  name: string
  matches: (tile: TileDef) => boolean
  text: string
}

const groups: { kind: string; entries: TileEntry[] }[] = [
  {
    kind: 'Caste',
    entries: CASTES.map((caste: Caste) => ({
      icon: caste,
      name: `${CASTE_PIECE_LABEL[caste]} tiles`,
      matches: (tile) => tile.kind === 'caste' && tile.caste === caste,
      text: `The ${CASTE_LABEL[caste].toLowerCase()} caste. Counts toward ${
        CASTE_PIECE_LABEL[caste]
      } pieces only, and nothing against the other two.`,
    })),
  },
  {
    kind: 'Wild',
    entries: [
      {
        icon: 'samurai',
        name: 'Samurai',
        matches: (tile) => tile.kind === 'samurai',
        text: 'Wild — counts toward every caste in an adjacent settlement. Your strongest all-purpose tiles.',
      },
      {
        icon: 'ronin',
        name: 'Ronin',
        matches: (tile) => tile.kind === 'ronin',
        text: 'Wild and fast. Low value, but free to drop alongside your real placement.',
      },
      {
        icon: 'ship',
        name: 'Ship',
        matches: (tile) => tile.kind === 'ship',
        text: 'Wild and fast, and the only tile for sea spaces. Sea never has to be filled, so a ship adds influence without hastening the capture.',
      },
    ],
  },
  {
    kind: 'Action',
    entries: [
      {
        icon: 'switch',
        name: 'Switch',
        matches: (tile) => tile.kind === 'switch',
        text: 'Fast, and never placed. Swaps any two caste pieces on the board — no settlement may end up holding two of a type — then leaves the game.',
      },
      {
        icon: 'move',
        name: 'Move',
        matches: (tile) => tile.kind === 'move',
        text: 'Uses your placement. Lifts one of your own earlier non-fast tiles onto any empty land space, and fills the space it left adding no influence.',
      },
    ],
  },
]

function describe(entry: TileEntry): string {
  const tiles = TILE_SET.filter(entry.matches)
  const values = [...new Set(tiles.map((tile) => tile.value))].sort((a, b) => a - b)
  const count = `${tiles.length}×`
  if (!values.some((value) => value > 0)) return `${count} · no influence`
  const range =
    values.length > 1 ? `values ${values[0]}–${values[values.length - 1]}` : `value ${values[0]}`
  return `${count} · ${range}`
}

function isFast(entry: TileEntry): boolean {
  return TILE_SET.filter(entry.matches).every((tile) => tile.fast)
}

/**
 * One flat list rather than three headed sections: a single grid packs the eight
 * cards without leaving a half-empty row at the end of each group, which is what
 * keeps the whole reference on screen. The grouping survives as the `kind` tag
 * on each card's meta line.
 */
const entries = groups.flatMap((group) =>
  group.entries.map((entry) => ({ ...entry, kind: group.kind })),
)

/** Big enough to read the piece art, which is the point of showing it here. */
const ICON_SIZE = 56
</script>

<template>
  <div class="reference">
    <dl class="tiles">
      <div v-for="entry in entries" :key="entry.name" class="tile-row">
        <GameIcon :name="entry.icon" :size="ICON_SIZE" />
        <dt>
          {{ entry.name }}
          <span v-if="isFast(entry)" class="fast-tag" title="Fast">速</span>
          <span class="tiny muted">{{ entry.kind }} · {{ describe(entry) }}</span>
        </dt>
        <dd>{{ entry.text }}</dd>
      </div>
    </dl>

    <p class="tiny muted footnote">
      <span class="fast-tag">速</span> marks a fast tile — it does not use up your one placement, so
      play as many as you like each turn.
    </p>
  </div>
</template>

<style scoped>
h4 {
  font-size: 0.82rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--ink-faint);
  margin: 0.9rem 0 0.4rem;
}

h4:first-child {
  margin-top: 0;
}

/* Cards flow into as many columns as the container can hold: one in the narrow
   rules sheet, two or more beside the draft chooser. That is what keeps the
   whole reference on screen without a scrollbar. */
.tiles {
  margin: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
  gap: 0.35rem 1.1rem;
}

.tile-row {
  display: grid;
  grid-template-columns: 3.5rem 1fr;
  column-gap: 0.75rem;
  align-items: start;
  padding: 0.45rem 0;
}

/* The art spans both text rows, so the description sits beside it rather than
   dropping below it and leaving a hole the height of the icon. */
.tile-row .icon {
  grid-row: 1 / span 2;
  margin-top: 0.1rem;
  color: var(--ink-soft);
}

.tile-row dt {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 0.45rem;
  font-weight: 600;
  font-size: 0.92rem;
}

.tile-row dd {
  grid-column: 2;
  margin: 0.1rem 0 0;
  line-height: 1.45;
  font-size: 0.88rem;
  color: var(--ink-soft);
}

/* The rulebook's red 速 seal, at label size. */
.fast-tag {
  display: inline-block;
  width: 1.15rem;
  height: 1.15rem;
  line-height: 1.15rem;
  text-align: center;
  border-radius: 3px;
  background: var(--vermillion);
  color: #fdf3e6;
  font-family: var(--font-display);
  font-size: 0.8rem;
}

.footnote {
  margin: 0.7rem 0 0;
  line-height: 1.45;
}

/* See the matching breakpoint in DraftScreen: tighten the cards rather than
   shrink the art, which is the one thing here worth the space. */
@media (max-height: 860px) {
  .tiles {
    gap: 0.15rem 1rem;
  }

  .tile-row {
    padding: 0.3rem 0;
  }
}
</style>
