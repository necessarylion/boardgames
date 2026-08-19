<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { PLAYER_COLOURS } from '@shared/colours'
import { t } from '@/i18n'
import { useGameStore } from '@/stores/game'

const game = useGameStore()
const list = ref<HTMLElement | null>(null)

const entries = computed(() => game.state?.log ?? [])

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
      <li v-for="(entry, i) in entries" :key="i">
        <template v-if="nameOf(entry.player)">
          <strong :style="{ color: PLAYER_COLOURS[nameOf(entry.player)!.colour].ink }">
            {{ nameOf(entry.player)!.name }}
          </strong>
          {{ ' ' }}<span class="what" :class="{ rearrange: isRearrange(entry.text) }">{{
            entry.text
          }}</span>
        </template>
        <span v-else class="system">{{ entry.text }}</span>
      </li>
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

/* Audiowide has one weight, so the bold is the browser's; it runs large for its
   point size too, hence the step down to sit level with the body face. */
.entries strong {
  font-weight: 700;
  font-size: 0.85em;
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
</style>
