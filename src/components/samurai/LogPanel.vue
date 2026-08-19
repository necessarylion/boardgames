<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { PLAYER_COLOURS } from '@shared/colours'
import type { LogEntry } from '@shared/types'
import { t } from '@/i18n'
import { useGameStore } from '@/stores/game'

const game = useGameStore()
const list = ref<HTMLElement | null>(null)

const entries = computed(() => game.state?.log ?? [])

/**
 * The log with a rule dropped in wherever the round changes. Built here rather
 * than in the engine: it is a reading aid, not something the table has to agree
 * on.
 */
const rows = computed(() => {
  const out: ({ mark: number } | { entry: LogEntry })[] = []
  let round = 0
  for (const entry of entries.value) {
    if (entry.turn !== round) {
      round = entry.turn
      if (round > 0) out.push({ mark: round })
    }
    out.push({ entry })
  }
  return out
})

/** The two tiles that rearrange what is already on the board — worth spotting in
    a scrolling log, so they are marked in red. The engine words these lines
    (`shared/engine.ts`); this matches its wording rather than widening
    `LogEntry`, which every game and every stored snapshot shares. */
function isRearrange(text: string) {
  return text.includes('the switch tile') || text.includes('the move tile')
}

function nameOf(id: number | null) {
  if (id === null) return null
  return game.players.find((p) => p.id === id) ?? null
}

watch(
  () => entries.value.length,
  async () => {
    await nextTick()
    if (list.value) list.value.scrollTop = list.value.scrollHeight
  },
)
</script>

<template>
  <section class="log">
    <h3>{{ t('log.title') }}</h3>
    <ol ref="list" class="entries scroll">
      <!-- Entry text is built by the shared engine and arrives already worded,
           so it is the one string on screen that stays in English. -->
      <template v-for="(row, i) in rows" :key="i">
        <li v-if="'mark' in row" class="round-mark">
          <span>{{ t('game.round', { turn: row.mark }) }}</span>
        </li>
        <li
          v-else-if="nameOf(row.entry.player)"
          class="entry"
          :style="{ '--seat': PLAYER_COLOURS[nameOf(row.entry.player)!.colour].ink }"
        >
          <strong>{{ nameOf(row.entry.player)!.name }}</strong>
          {{ ' ' }}<span class="what" :class="{ rearrange: isRearrange(row.entry.text) }">{{
            row.entry.text
          }}</span>
        </li>
        <li v-else class="entry system-row">
          <span class="system">{{ row.entry.text }}</span>
        </li>
      </template>
      <li v-if="!entries.length" class="muted tiny">{{ t('log.empty') }}</li>
    </ol>
  </section>
</template>

<style scoped>
.log {
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 0.9rem 1rem;
  flex: 1 1 auto;
}

h3 {
  font-size: 0.95rem;
  margin-bottom: 0.5rem;
}

.entries {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.28rem;
  font-size: 0.85rem;
  line-height: 1.4;
  min-height: 6rem;
  /* Fills whatever the compact player list leaves, scrolling on its own rather
     than pushing the sidebar into one long scroll. */
  flex: 1 1 auto;
  overflow-y: auto;
}

/* Each line hangs off a rule in its seat's ink, so a glance down the margin
   reads as who did what — the names alone were a stack of similar-length words. */
.entry {
  border-left: 2px solid var(--seat, rgba(160, 137, 102, 0.45));
  padding: 0.12rem 0.35rem 0.12rem 0.5rem;
  border-radius: 0 5px 5px 0;
}

.entry:hover {
  background: rgba(160, 137, 102, 0.1);
}

/* A hairline with the round on it, wherever the round turns over. */
.round-mark {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0.35rem 0 0.1rem;
  font-size: 0.62rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--ink-soft);
  opacity: 0.75;
}

.round-mark::before,
.round-mark::after {
  content: '';
  flex: 1 1 auto;
  border-top: 1px solid rgba(160, 137, 102, 0.35);
}

.round-mark span {
  flex: none;
}

/* Audiowide has one weight, so the bold is the browser's; it runs large for its
   point size too, hence the step down to sit level with the body face. */
.entries strong {
  font-weight: 700;
  font-size: 0.85em;
  color: var(--seat);
}

/* The name carries the row; what they did sits back a step, in the plain body
   face — Audiowide is a display font and a wall of it is hard to read fast. */
.what,
.system {
  font-family: var(--font-body);
  font-size: 0.8em;
}

.what {
  color: var(--ink-soft);
}

.what.rearrange {
  color: var(--vermillion);
  font-weight: 600;
}

.system {
  color: var(--ink-soft);
  font-style: italic;
}

.system-row {
  border-left-style: dashed;
}
</style>
