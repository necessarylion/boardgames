<script setup lang="ts">
import type { GameKind } from '@shared/types'
import GameIcon from '@/components/common/GameIcon.vue'
import LanguageMenu from '@/i18n/LanguageMenu.vue'
import { t } from '@/i18n'
import { useGameStore } from '@/stores/game'

const game = useGameStore()

function pick(kind: GameKind) {
  game.chooseGame(kind)
}
</script>

<template>
  <div class="landing">
    <LanguageMenu class="lang-corner" />

    <header class="masthead">
      <h1>{{ t('landing.title') }}</h1>
      <p class="tagline">{{ t('landing.tagline') }}</p>
    </header>

    <div class="cards">
      <button class="game-card samurai" type="button" @click="pick('samurai')">
        <span class="seal">侍</span>
        <span class="game-name">{{ t('landing.samurai.name') }}</span>
        <span class="game-blurb">{{ t('landing.samurai.blurb') }}</span>
        <span class="meta tiny">{{ t('landing.samurai.meta') }}</span>
        <span class="go">{{ t('landing.play') }}</span>
      </button>

      <button class="game-card halli" type="button" @click="pick('halligalli')">
        <span class="seal fruits">🍓🔔</span>
        <span class="game-name">{{ t('landing.halli.name') }}</span>
        <span class="game-blurb">{{ t('landing.halli.blurb') }}</span>
        <span class="meta tiny">{{ t('landing.halli.meta') }}</span>
        <span class="go">{{ t('landing.play') }}</span>
      </button>

      <button class="game-card coup" type="button" @click="pick('coup')">
        <span class="seal crown">
          <GameIcon name="coup.duke" :size="30" />
        </span>
        <span class="game-name">{{ t('landing.coup.name') }}</span>
        <span class="game-blurb">{{ t('landing.coup.blurb') }}</span>
        <span class="meta tiny">{{ t('landing.coup.meta') }}</span>
        <span class="go">{{ t('landing.play') }}</span>
      </button>
    </div>

    <p class="tiny muted footnote">{{ t('landing.footnote') }}</p>
  </div>
</template>

<style scoped>
.landing {
  position: relative;
  min-height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2rem;
  padding: clamp(2rem, 6vw, 4rem) 1.25rem;
  text-align: center;
}

.lang-corner {
  position: absolute;
  top: clamp(1.1rem, 2.5vw, 1.9rem);
  right: clamp(1.25rem, 3vw, 2.5rem);
}

.masthead h1 {
  font-size: clamp(2.4rem, 6vw, 3.6rem);
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.tagline {
  margin: 0.6rem auto 0;
  max-width: 34rem;
  color: var(--ink-soft);
  line-height: 1.55;
}

.cards {
  display: grid;
  gap: 1.25rem;
  grid-template-columns: repeat(auto-fit, minmax(15rem, 20rem));
  width: 100%;
  max-width: 44rem;
}

.game-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.6rem;
  padding: 2rem 1.5rem 1.6rem;
  border-radius: 16px;
  border: 1px solid var(--gold-line);
  background: var(--paper);
  box-shadow: var(--shadow);
  cursor: pointer;
  color: var(--ink);
  transition: transform 0.14s ease, box-shadow 0.14s ease, border-color 0.14s ease;
}

.game-card:hover {
  transform: translateY(-4px);
  box-shadow: var(--shadow-lg);
  border-color: var(--vermillion);
}

.seal {
  display: grid;
  place-items: center;
  width: 4rem;
  height: 4rem;
  border-radius: 12px;
  font-size: 2.1rem;
  font-family: var(--font-display);
  color: #f6ece0;
  background: #1c1613;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.18);
}

.seal.fruits {
  font-size: 1.5rem;
  background: linear-gradient(140deg, #b23a2c, #d98a3d);
}

.seal.crown {
  background: linear-gradient(140deg, #4a3a6b, #6b4b9c);
}

.game-name {
  font-family: var(--font-display);
  font-size: 1.6rem;
  letter-spacing: 0.02em;
}

.game-blurb {
  color: var(--ink-soft);
  line-height: 1.5;
  min-height: 3rem;
}

.meta {
  color: var(--ink-faint);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.go {
  margin-top: 0.6rem;
  padding: 0.45rem 1.4rem;
  border-radius: 999px;
  background: var(--vermillion);
  color: #fff;
  font-weight: 600;
  font-size: 0.95rem;
}

.game-card:hover .go {
  background: var(--vermillion-dark);
}

.footnote {
  max-width: 30rem;
  line-height: 1.5;
}
</style>
