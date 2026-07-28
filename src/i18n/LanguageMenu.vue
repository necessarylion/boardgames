<script setup lang="ts">
import { ref } from 'vue'
import type { Locale } from '@/i18n'
import { LOCALE_NAME, LOCALES, locale, setLocale, t } from '@/i18n'

/**
 * The home screen has no top bar to hang the language row on, so the choice
 * sits in the corner instead: a trigger naming the current language, and the
 * alternatives only once asked for. The form is what the page is for.
 */
const open = ref(false)

function choose(code: Locale) {
  setLocale(code)
  open.value = false
}
</script>

<template>
  <div class="lang-menu">
    <button
      class="trigger"
      :lang="locale"
      :aria-expanded="open"
      :title="t('lang.label')"
      @click="open = !open"
    >
      {{ LOCALE_NAME[locale] }}
      <span class="caret" aria-hidden="true">{{ open ? '▴' : '▾' }}</span>
    </button>

    <div v-if="open" class="backdrop" @click="open = false" />

    <div v-if="open" class="menu panel">
      <button
        v-for="code in LOCALES"
        :key="code"
        class="item"
        :class="{ chosen: code === locale }"
        :lang="code"
        :aria-pressed="code === locale"
        @click="choose(code)"
      >
        {{ LOCALE_NAME[code] }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.lang-menu {
  position: relative;
}

/* Reads as a quiet control over the artwork as well as over the paper, so it
   carries its own translucent ground rather than the usual button fill. */
.trigger {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.3rem 0.6rem;
  border: 1px solid rgba(160, 137, 102, 0.5);
  border-radius: var(--radius);
  background: rgba(255, 253, 247, 0.86);
  color: var(--ink);
  font: inherit;
  font-size: 0.85rem;
  cursor: pointer;
  backdrop-filter: blur(3px);
  transition: background 0.12s ease, border-color 0.12s ease;
}

.trigger:hover {
  background: rgba(255, 253, 247, 1);
  border-color: var(--vermillion);
}

.caret {
  font-size: 0.7em;
  color: var(--ink-soft);
}

.backdrop {
  position: fixed;
  inset: 0;
  z-index: 20;
}

.menu {
  position: absolute;
  right: 0;
  top: calc(100% + 0.35rem);
  z-index: 21;
  min-width: 8.5rem;
  padding: 0.3rem;
  box-shadow: var(--shadow-lg);
}

.item {
  display: block;
  width: 100%;
  padding: 0.4rem 0.55rem;
  border: 0;
  border-radius: 6px;
  background: transparent;
  text-align: left;
  font: inherit;
  font-size: 0.9rem;
  color: var(--ink);
  cursor: pointer;
}

.item:hover {
  background: rgba(178, 58, 44, 0.12);
}

.item.chosen {
  background: rgba(178, 58, 44, 0.14);
  color: var(--vermillion-dark);
  font-weight: 600;
}
</style>
