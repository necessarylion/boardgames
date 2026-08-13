<script setup lang="ts">
/**
 * A single Carnival — the game's coin. An original mark, not drawn from any
 * published component: a struck gold token with a carnival star at its centre.
 * The radial-gradient id has to be unique per instance, or several coins on the
 * page would all reference the first one's `<defs>`.
 */
withDefaults(defineProps<{ size?: number }>(), { size: 22 })

let seq = 0
const gid = `carnival-coin-${(seq = (seq + 1) % 1e9)}-${Math.random().toString(36).slice(2, 7)}`
</script>

<template>
  <svg
    class="coin"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    aria-hidden="true"
    focusable="false"
  >
    <defs>
      <radialGradient :id="gid" cx="38%" cy="32%" r="78%">
        <stop offset="0%" stop-color="#ffefb8" />
        <stop offset="52%" stop-color="#e6b93f" />
        <stop offset="100%" stop-color="#b07a2a" />
      </radialGradient>
    </defs>
    <circle cx="12" cy="12" r="11" :fill="`url(#${gid})`" stroke="#805213" stroke-width="1" />
    <circle cx="12" cy="12" r="8.4" fill="none" stroke="#fff4d6" stroke-width="0.8" opacity="0.65" />
    <path
      d="M12 6.1l1.55 4.02 4.3.2-3.38 2.66 1.16 4.15L12 14.75l-3.63 2.38 1.16-4.15L6.15 10.32l4.3-.2z"
      fill="#fff6de"
      stroke="#805213"
      stroke-width="0.4"
      stroke-linejoin="round"
    />
  </svg>
</template>

<style scoped>
.coin {
  display: block;
  filter: drop-shadow(0 1px 1px rgba(60, 40, 8, 0.35));
}
</style>
