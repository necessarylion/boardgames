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

      <button class="game-card carnivals" type="button" @click="pick('carnivals')">
        <span class="seal tent">🎪</span>
        <span class="game-name">{{ t('landing.carnivals.name') }}</span>
        <span class="game-blurb">{{ t('landing.carnivals.blurb') }}</span>
        <span class="meta tiny">{{ t('landing.carnivals.meta') }}</span>
        <span class="go">{{ t('landing.play') }}</span>
      </button>

      <button class="game-card snake" type="button" @click="pick('snake')">
        <span class="seal serpent">🐍</span>
        <span class="game-name">{{ t('landing.snake.name') }}</span>
        <span class="game-blurb">{{ t('landing.snake.blurb') }}</span>
        <span class="meta tiny">{{ t('landing.snake.meta') }}</span>
        <span class="go">{{ t('landing.play') }}</span>
      </button>

      <button class="game-card ladders" type="button" @click="pick('ladders')">
        <span class="seal die">🎲</span>
        <span class="game-name">{{ t('landing.ladders.name') }}</span>
        <span class="game-blurb">{{ t('landing.ladders.blurb') }}</span>
        <span class="meta tiny">{{ t('landing.ladders.meta') }}</span>
        <span class="go">{{ t('landing.play') }}</span>
      </button>

      <button class="game-card cop" type="button" @click="pick('cop')">
        <span class="seal siren">🚔</span>
        <span class="game-name">{{ t('landing.cop.name') }}</span>
        <span class="game-blurb">{{ t('landing.cop.blurb') }}</span>
        <span class="meta tiny">{{ t('landing.cop.meta') }}</span>
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
  gap: 0.8rem;
  width: 100%;
  max-width: 36rem;
}

/* One slim row per game: seal | name/meta/blurb | play. The seal carries each
   game's colour, so the card itself stays quiet paper. */
.game-card {
  display: grid;
  grid-template-columns: auto 1fr auto;
  grid-template-areas:
    'seal name go'
    'seal meta go'
    'seal blurb go';
  align-items: center;
  column-gap: 1rem;
  padding: 0.85rem 1.1rem;
  border-radius: 14px;
  border: 1px solid var(--gold-line);
  background: var(--paper);
  box-shadow: var(--shadow);
  cursor: pointer;
  color: var(--ink);
  text-align: left;
  transition: transform 0.14s ease, box-shadow 0.14s ease, border-color 0.14s ease;
}

.game-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-lg);
  border-color: var(--vermillion);
}

.seal {
  grid-area: seal;
  align-self: center;
  display: grid;
  place-items: center;
  width: 3.1rem;
  height: 3.1rem;
  border-radius: 10px;
  font-size: 1.6rem;
  font-family: var(--font-display);
  color: #f6ece0;
  background: #1c1613;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.18);
  transition: transform 0.14s ease;
}

.game-card:hover .seal {
  transform: rotate(-4deg);
}

.seal.fruits {
  font-size: 1.1rem;
  background: linear-gradient(140deg, #b23a2c, #d98a3d);
}

.seal.crown {
  background: linear-gradient(140deg, #4a3a6b, #6b4b9c);
}

.seal.tent {
  font-size: 1.5rem;
  background: linear-gradient(140deg, #a63a30, #2f5a86);
}

.seal.siren {
  font-size: 1.5rem;
  background: linear-gradient(140deg, #1e3a5f, #b23a2c);
}

.seal.serpent {
  font-size: 1.5rem;
  background: linear-gradient(140deg, #17482a, #2f7a45);
}

.seal.die {
  background: linear-gradient(140deg, #b23a2c, #d4a017);
}

.game-name {
  grid-area: name;
  font-family: var(--font-display);
  font-size: 1.1rem;
  letter-spacing: 0.02em;
}

.game-blurb {
  grid-area: blurb;
  color: var(--ink-soft);
  font-size: 0.88rem;
  line-height: 1.4;
  margin-top: 0.15rem;
}

.meta {
  grid-area: meta;
  color: var(--ink-faint);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.go {
  grid-area: go;
  padding: 0.35rem 1rem;
  border-radius: 999px;
  border: 1px solid var(--vermillion);
  color: var(--vermillion);
  font-weight: 600;
  font-size: 0.8rem;
  transition: background 0.14s ease, color 0.14s ease;
}

.game-card:hover .go {
  background: var(--vermillion);
  color: #fff;
}

@media (max-width: 26rem) {
  .go {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .game-card,
  .seal,
  .go {
    transition: none;
  }
  .game-card:hover {
    transform: none;
  }
  .game-card:hover .seal {
    transform: none;
  }
}

.footnote {
  max-width: 30rem;
  line-height: 1.5;
}
</style>
