<script setup lang="ts">
import { ref } from 'vue'
import mainBackground from '../../assets/mainbg.png'
import BoardGlyph from './BoardGlyph.vue'
import { DEFAULT_OPTIONS } from '@shared/engine'
import { BOARD_SHAPES } from '@shared/types'
import LanguageSwitcher from '@/i18n/LanguageSwitcher.vue'
import { t } from '@/i18n'
import { useGameStore } from '@/stores/game'

const game = useGameStore()

const name = ref(game.myName)
const code = ref(new URLSearchParams(location.search).get('room') ?? '')
const randomHands = ref(DEFAULT_OPTIONS.randomHands)
const openInformation = ref(DEFAULT_OPTIONS.openInformation)
const boardShape = ref(DEFAULT_OPTIONS.boardShape)

function create() {
  if (!name.value.trim()) return game.showError(t('home.error.name'))
  game.createRoom(name.value.trim(), {
    randomHands: randomHands.value,
    openInformation: openInformation.value,
    boardShape: boardShape.value,
  })
}

function join() {
  if (!name.value.trim()) return game.showError(t('home.error.name'))
  if (code.value.trim().length !== 4) return game.showError(t('home.error.code'))
  game.joinRoom(code.value, name.value.trim())
}
</script>

<template>
  <div class="home">
    <aside class="art">
      <img class="art-image" :src="mainBackground" alt="" />
      <div class="art-wash"></div>
      <header class="masthead">
        <span class="seal">侍</span>
        <h1>Samurai</h1>
        <p class="tagline">{{ t('home.tagline') }}</p>
      </header>
    </aside>

    <main class="forms">
      <div class="forms-inner">
        <section>
          <h2>{{ t('home.name.title') }}</h2>
          <input
            v-model="name"
            class="field"
            maxlength="18"
            :placeholder="t('home.name.placeholder')"
            @change="game.rememberName(name.trim())"
          />
          <LanguageSwitcher class="lang" />
        </section>

        <hr class="rule" />

        <section>
          <h2>{{ t('home.host.title') }}</h2>
          <label class="check">
            <input v-model="randomHands" type="checkbox" />
            <span>
              {{ t('option.randomHands') }}
              <em class="tiny muted">{{ t('option.randomHands.hint') }}</em>
            </span>
          </label>
          <label class="check">
            <input v-model="openInformation" type="checkbox" />
            <span>
              {{ t('option.openInfo') }}
              <em class="tiny muted">{{ t('option.openInfo.hint') }}</em>
            </span>
          </label>
          <div class="board-pick">
            <span class="board-label tiny muted">{{ t('home.board.title') }}</span>
            <div class="board-options">
              <button
                v-for="shape in BOARD_SHAPES"
                :key="shape"
                type="button"
                class="board-option"
                :class="{ chosen: boardShape === shape }"
                :title="t(`board.${shape}.hint`)"
                @click="boardShape = shape"
              >
                <BoardGlyph :shape="shape" />
                <span>{{ t(`board.${shape}`) }}</span>
              </button>
            </div>
          </div>

          <button class="btn wide" @click="create">{{ t('home.create') }}</button>
        </section>

        <hr class="rule" />

        <section>
          <h2>{{ t('home.join.title') }}</h2>
          <p class="muted tiny join-hint">{{ t('home.join.hint') }}</p>
          <input
            v-model="code"
            class="field code"
            maxlength="4"
            :placeholder="t('home.join.placeholder')"
            @input="code = code.toUpperCase()"
            @keyup.enter="join"
          />
          <button class="btn wide ghost" @click="join">{{ t('home.join.action') }}</button>
        </section>

        <p class="tiny muted footnote">{{ t('home.footnote') }}</p>
      </div>
    </main>
  </div>
</template>

<style scoped>
.home {
  min-height: 100%;
  display: grid;
  grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr);
}

/* --- left: the artwork --------------------------------------------------- */

.art {
  position: relative;
  overflow: hidden;
  background: #0e0c0b;
  min-height: 22rem;
}

/* The painting is a wide landscape dropped into a tall column, so it has to be
   cropped. Anchoring right of centre keeps the standing figure in frame at
   every width instead of letting him slide off the edge. */
.art-image {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: 72% 50%;
}

/* Keeps the masthead legible over the busy lower half of the artwork. */
.art-wash {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    to top,
    rgba(14, 12, 11, 0.92) 0%,
    rgba(14, 12, 11, 0.62) 28%,
    rgba(14, 12, 11, 0) 62%
  );
}

.masthead {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 2rem clamp(1.5rem, 4vw, 3rem);
}

.masthead .seal {
  margin-bottom: 0.9rem;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.25), 0 4px 14px rgba(0, 0, 0, 0.45);
}

h1 {
  font-size: clamp(2.6rem, 5.5vw, 4rem);
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: #f6ece0;
  margin-bottom: 0.5rem;
}

.tagline {
  margin: 0;
  max-width: 26rem;
  color: rgba(240, 228, 212, 0.78);
  line-height: 1.55;
}

/* --- right: the forms ---------------------------------------------------- */

.forms {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: clamp(2rem, 5vw, 3.5rem) clamp(1.25rem, 4vw, 3rem);
  border-left: 1px solid rgba(160, 137, 102, 0.35);
}

.forms-inner {
  width: 100%;
  max-width: 24rem;
}

.forms-inner .rule {
  margin: 1.35rem 0;
}

h2 {
  font-size: 1.15rem;
  margin-bottom: 0.6rem;
}

.field {
  width: 100%;
  padding: 0.6rem 0.75rem;
  border-radius: 8px;
  border: 1px solid rgba(140, 118, 84, 0.55);
  background: rgba(255, 253, 247, 0.9);
  font: inherit;
  color: var(--ink);
}

.field:focus {
  outline: 2px solid rgba(178, 58, 44, 0.45);
  outline-offset: 1px;
}

.code {
  letter-spacing: 0.4em;
  text-align: center;
  font-size: 1.5rem;
  font-family: var(--font-display);
  text-indent: 0.4em;
}

.join-hint {
  margin: -0.25rem 0 0.7rem;
}

/* Sits under the name field rather than in a section of its own, which would
   cost the column a rule and another heading's worth of height. */
.lang {
  margin-top: 0.6rem;
}

.check {
  display: flex;
  gap: 0.55rem;
  align-items: flex-start;
  margin-bottom: 0.6rem;
  line-height: 1.4;
  font-size: 0.92rem;
}

.check em {
  font-style: normal;
}

/* The board choice is a row of profiles rather than a select, because the shape
   is the whole point and a name alone does not convey it. */
.board-pick {
  margin: 0.85rem 0 0.9rem;
}

.board-label {
  display: block;
  margin-bottom: 0.4rem;
}

.board-options {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.4rem;
}

.board-option {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  padding: 0.5rem 0.3rem 0.45rem;
  border: 1px solid rgba(160, 137, 102, 0.35);
  border-radius: var(--radius);
  background: transparent;
  color: var(--ink-soft);
  font-size: 0.78rem;
  line-height: 1.2;
  text-align: center;
  cursor: pointer;
  transition: background 0.12s ease, color 0.12s ease, border-color 0.12s ease;
}

.board-option:hover {
  background: rgba(178, 58, 44, 0.07);
}

.board-option.chosen {
  border-color: var(--vermillion);
  background: rgba(178, 58, 44, 0.12);
  color: var(--vermillion-dark);
  font-weight: 600;
}

.wide {
  width: 100%;
  margin-top: 0.85rem;
}

.footnote {
  margin: 1.5rem 0 0;
  line-height: 1.5;
}

/* --- stacked on narrow screens ------------------------------------------- */

@media (max-width: 52rem) {
  .home {
    grid-template-columns: 1fr;
  }

  .art {
    min-height: 0;
    height: min(46vh, 22rem);
  }

  .masthead {
    padding: 1.5rem 1.25rem;
  }

  .forms {
    border-left: 0;
    align-items: flex-start;
  }
}
</style>
