<script setup lang="ts">
import GameIcon from '../common/GameIcon.vue'
import { TILE_SET } from '@shared/tiles'
import { CASTES } from '@shared/types'
import type { Caste, TileDef } from '@shared/types'
import { casteNameLower, castePiece, t } from '@/i18n'
import type { MessageKey } from '@/i18n'

/**
 * What each of the twenty tiles does. Shown both in the rules sheet and beside
 * the draft chooser, so it lives here rather than in either of them.
 *
 * The counts and values are read off TILE_SET rather than written out, so they
 * stay honest if the set is ever re-balanced. The wording is looked up when the
 * row renders rather than built once, so switching language redraws it.
 */
type TileEntry = {
  icon: string
  name: () => string
  matches: (tile: TileDef) => boolean
  text: () => string
}

const groups: { kind: MessageKey; entries: TileEntry[] }[] = [
  {
    kind: 'tiles.kind.caste',
    entries: CASTES.map((caste: Caste) => ({
      icon: caste,
      name: () => t('tiles.caste.name', { piece: castePiece(caste) }),
      matches: (tile) => tile.kind === 'caste' && tile.caste === caste,
      text: () =>
        t('tiles.caste.text', { caste: casteNameLower(caste), piece: castePiece(caste) }),
    })),
  },
  {
    kind: 'tiles.kind.wild',
    entries: [
      {
        icon: 'samurai',
        name: () => t('tiles.samurai.name'),
        matches: (tile) => tile.kind === 'samurai',
        text: () => t('tiles.samurai.text'),
      },
      {
        icon: 'ronin',
        name: () => t('tiles.ronin.name'),
        matches: (tile) => tile.kind === 'ronin',
        text: () => t('tiles.ronin.text'),
      },
      {
        icon: 'ship',
        name: () => t('tiles.ship.name'),
        matches: (tile) => tile.kind === 'ship',
        text: () => t('tiles.ship.text'),
      },
    ],
  },
  {
    kind: 'tiles.kind.action',
    entries: [
      {
        icon: 'switch',
        name: () => t('tiles.switch.name'),
        matches: (tile) => tile.kind === 'switch',
        text: () => t('tiles.switch.text'),
      },
      {
        icon: 'move',
        name: () => t('tiles.move.name'),
        matches: (tile) => tile.kind === 'move',
        text: () => t('tiles.move.text'),
      },
    ],
  },
]

function describe(entry: TileEntry): string {
  const tiles = TILE_SET.filter(entry.matches)
  const values = [...new Set(tiles.map((tile) => tile.value))].sort((a, b) => a - b)
  const count = t('tiles.count', { count: tiles.length })
  if (!values.some((value) => value > 0)) return `${count} · ${t('tiles.noInfluence')}`
  const range =
    values.length > 1
      ? t('tiles.valueRange', { from: values[0], to: values[values.length - 1] })
      : t('tiles.value', { value: values[0] })
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
      <div v-for="entry in entries" :key="entry.icon" class="tile-row">
        <GameIcon :name="entry.icon" :size="ICON_SIZE" />
        <dt>
          {{ entry.name() }}
          <span v-if="isFast(entry)" class="fast-tag" :title="t('tiles.fast')">速</span>
          <span class="tiny muted">{{ t(entry.kind) }} · {{ describe(entry) }}</span>
        </dt>
        <dd>{{ entry.text() }}</dd>
      </div>
    </dl>

    <p class="tiny muted footnote">
      <span class="fast-tag">速</span> {{ t('tiles.footnote') }}
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
