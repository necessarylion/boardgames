<script setup lang="ts">
import { LOCALE_NAME, LOCALES, locale, setLocale, t } from '@/i18n'

/**
 * One row, label and buttons, so it drops into the home column and into the
 * table menu unchanged. The active language is the solid button and the others
 * are ghosts — the same pair the rest of the app uses for a chosen action.
 */
</script>

<template>
  <div class="lang">
    <span class="tiny muted lang-label">{{ t('lang.label') }}</span>
    <div class="lang-options">
      <button
        v-for="code in LOCALES"
        :key="code"
        class="btn small"
        :class="{ ghost: code !== locale }"
        :lang="code"
        :aria-pressed="code === locale"
        @click="setLocale(code)"
      >
        {{ LOCALE_NAME[code] }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.lang {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
  flex-wrap: wrap;
}

.lang-label {
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.lang-options {
  display: flex;
  gap: 0.35rem;
}
</style>
