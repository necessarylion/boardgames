<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { PLAYER_COLOURS } from '@shared/colours'
import { t } from '@/i18n'
import { useGameStore } from '@/stores/game'

const game = useGameStore()
const list = ref<HTMLElement | null>(null)

const entries = computed(() => game.state?.log ?? [])

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
          {{ ' ' }}{{ entry.text }}
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
  max-height: 16rem;
}

.system {
  color: var(--ink-soft);
  font-style: italic;
}
</style>
