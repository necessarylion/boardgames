<script setup lang="ts">
import { computed, ref } from 'vue'
import mainBackground from '../../../assets/mainbg.png'
import BoardGlyph from '../samurai/BoardGlyph.vue'
import GameIcon from './GameIcon.vue'
import TurnClockOptions from './TurnClockOptions.vue'
import { DEFAULT_OPTIONS } from '@shared/engine'
import { BOARD_SHAPES } from '@shared/types'
import LanguageMenu from '@/i18n/LanguageMenu.vue'
import { t } from '@/i18n'
import { useGameStore } from '@/stores/game'

const game = useGameStore()

/** Which game the landing screen sent us here to host or join. */
const kind = computed(() => game.chosenGame ?? 'samurai')
const isSamurai = computed(() => kind.value === 'samurai')

/**
 * The masthead and the host panel are the only things on this screen that differ
 * by game. Samurai is the one with artwork and with settings to choose; the card
 * games each bring a title, a tagline and a line explaining there is nothing to
 * set up, so they are looked up rather than branched on one at a time.
 */
const MASTHEAD = {
  samurai: { title: 'landing.samurai.name', tagline: 'home.tagline', hint: '' },
  halligalli: { title: 'landing.halli.name', tagline: 'home.halli.tagline', hint: 'home.halli.hostHint' },
  coup: { title: 'landing.coup.name', tagline: 'home.coup.tagline', hint: 'home.coup.hostHint' },
  carnivals: { title: 'landing.carnivals.name', tagline: 'home.carnivals.tagline', hint: 'home.carnivals.hostHint' },
  cop: { title: 'landing.cop.name', tagline: 'home.cop.tagline', hint: 'home.cop.hostHint' },
} as const

const masthead = computed(() => MASTHEAD[kind.value])

const name = ref(game.myName)
const code = ref((new URLSearchParams(location.search).get('room') ?? '').toUpperCase())

/**
 * Arriving on an invite link, the two halves of this screen read as a choice
 * the guest does not have to make. So the link collapses it to the one action
 * that applies, with hosting still a click away for anyone who wants it.
 */
const invited = ref(code.value.length > 0)
const randomHands = ref(DEFAULT_OPTIONS.randomHands)
const openInformation = ref(DEFAULT_OPTIONS.openInformation)
const boardShape = ref(DEFAULT_OPTIONS.boardShape)
const turnSeconds = ref(DEFAULT_OPTIONS.turnSeconds)
const diceStart = ref(DEFAULT_OPTIONS.diceStart)

function create() {
  if (!name.value.trim()) return game.showError(t('home.error.name'))
  const carnivals = kind.value === 'carnivals'
  game.createRoom(name.value.trim(), {
    kind: kind.value,
    randomHands: randomHands.value,
    openInformation: openInformation.value,
    boardShape: boardShape.value,
    // Carnivals runs no shot clock and draws its dealer quietly.
    turnSeconds: carnivals ? 0 : turnSeconds.value,
    // Team play needs four or six seats, so it is chosen in the lobby, not here.
    teams: 0,
    diceStart: carnivals ? false : diceStart.value,
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
    <LanguageMenu class="lang-corner" />

    <aside
      class="art"
      :class="{ halli: kind === 'halligalli', coup: kind === 'coup', carnivals: kind === 'carnivals', cop: kind === 'cop' }"
    >
      <img v-if="isSamurai" class="art-image" :src="mainBackground" alt="" />
      <div class="art-wash"></div>
      <header class="masthead">
        <span
          class="seal"
          :class="{ fruits: kind === 'halligalli', crown: kind === 'coup', tent: kind === 'carnivals', siren: kind === 'cop' }"
        >
          <GameIcon v-if="kind === 'coup'" name="coup.duke" :size="22" />
          <template v-else-if="kind === 'carnivals'">🎪</template>
          <template v-else-if="kind === 'cop'">🚔</template>
          <template v-else>{{ isSamurai ? '侍' : '🔔' }}</template>
        </span>
        <h1>{{ t(masthead.title) }}</h1>
        <p class="tagline">{{ t(masthead.tagline) }}</p>
      </header>
    </aside>

    <main class="forms">
      <div class="forms-inner">
        <button type="button" class="linkish back" @click="game.clearChosenGame()">
          {{ t('home.backToGames') }}
        </button>

        <section>
          <h2>{{ t('home.name.title') }}</h2>
          <input
            v-model="name"
            class="field"
            maxlength="18"
            :placeholder="t('home.name.placeholder')"
            @change="game.rememberName(name.trim())"
          />
        </section>

        <hr class="rule" />

        <section v-if="invited">
          <h2>{{ t('home.invited.title') }}</h2>
          <p class="muted tiny join-hint">{{ t('home.invited.hint') }}</p>
          <input
            v-model="code"
            class="field code"
            maxlength="4"
            :placeholder="t('home.join.placeholder')"
            @input="code = code.toUpperCase()"
            @keyup.enter="join"
          />
          <button class="btn wide" @click="join">{{ t('home.join.action') }}</button>
          <button type="button" class="linkish" @click="invited = false">
            {{ t('home.invited.hostInstead') }}
          </button>
        </section>

        <template v-else>
          <section>
            <h2>{{ t('home.host.title') }}</h2>
            <template v-if="isSamurai">
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

              <TurnClockOptions :seconds="turnSeconds" @pick="turnSeconds = $event" />
            </template>
            <!-- Coup and COP have no board or hand settings, but they do run a
                 shot clock, so they get that one control and nothing else. -->
            <template v-else-if="kind === 'coup' || kind === 'cop'">
              <p v-if="masthead.hint" class="muted tiny host-hint">{{ t(masthead.hint) }}</p>
              <TurnClockOptions :seconds="turnSeconds" @pick="turnSeconds = $event" />
            </template>
            <p v-else-if="masthead.hint" class="muted tiny host-hint">{{ t(masthead.hint) }}</p>

            <!-- The opening roll is offered to every game but Carnivals, which
                 draws its dealer quietly and runs no clock. -->
            <label v-if="kind !== 'carnivals'" class="check">
              <input v-model="diceStart" type="checkbox" />
              <span>
                {{ t('option.diceStart') }}
                <em class="tiny muted">{{ t('option.diceStart.hint') }}</em>
              </span>
            </label>

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
        </template>

        <p class="tiny muted footnote">{{ t('home.footnote') }}</p>
      </div>
    </main>
  </div>
</template>

<style scoped>
.home {
  position: relative;
  height: 100%;
  overflow: hidden;
  display: grid;
  grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr);
}

/* Anchored to the screen rather than to the form column, so it holds its corner
   while the form scrolls under it. */
.lang-corner {
  position: absolute;
  top: clamp(1.1rem, 2.5vw, 1.9rem);
  right: clamp(1.25rem, 3vw, 2.5rem);
  z-index: 5;
}

/* --- left: the artwork --------------------------------------------------- */

.art {
  position: relative;
  overflow: hidden;
  background: #0e0c0b;
  min-height: 22rem;
}

/* The card games ship no artwork, so their column is a wash instead of a crop. */
.art.halli {
  background: linear-gradient(160deg, #b23a2c 0%, #d98a3d 60%, #e7c15c 100%);
}

.art.coup {
  background: linear-gradient(160deg, #2e2340 0%, #6b4b9c 55%, #b23a2c 100%);
}

.art.carnivals {
  background: linear-gradient(160deg, #a63a30 0%, #7a4a5e 50%, #2f5a86 100%);
}

.art.cop {
  background: linear-gradient(160deg, #1e3a5f 0%, #3f4e63 50%, #b23a2c 100%);
}

.back {
  margin: 0 0 1rem !important;
}

.host-hint {
  margin: 0 0 0.4rem;
  line-height: 1.5;
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

.seal.crown {
  background: #4a3a6b;
}

.seal.tent {
  background: linear-gradient(140deg, #a63a30, #2f5a86);
  font-size: 1.5rem;
}

.seal.siren {
  background: linear-gradient(140deg, #1e3a5f, #b23a2c);
  font-size: 1.5rem;
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
  justify-content: center;
  min-height: 0;
  overflow-y: auto;
  padding: clamp(2rem, 5vw, 3.5rem) clamp(1.25rem, 4vw, 3rem);
  border-left: 1px solid rgba(160, 137, 102, 0.35);
}

/* Auto margins rather than `align-items: center`, which centres the same way
   when there is room but hides the top of the column past the scroll origin
   once the form outgrows the viewport. */
.forms-inner {
  width: 100%;
  max-width: 24rem;
  margin: auto 0;
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

/* Offers the other half of the screen to a guest who followed an invite but
   wanted to host, without giving it the weight of a second button. */
.linkish {
  display: block;
  margin-top: 0.8rem;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--ink-soft);
  font: inherit;
  font-size: 0.85rem;
  text-decoration: underline;
  text-underline-offset: 3px;
  cursor: pointer;
}

.linkish:hover {
  color: var(--vermillion-dark);
}

.check {
  position: relative;
  display: flex;
  gap: 0.55rem;
  align-items: flex-start;
  margin-bottom: 0.6rem;
  line-height: 1.4;
  font-size: 0.92rem;
  cursor: pointer;
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
  /* Wraps rather than squeezing, so another map can be added without a redesign. */
  grid-template-columns: repeat(auto-fit, minmax(5.2rem, 1fr));
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
  /* Stacked, the artwork is a banner rather than a column, so the whole screen
     scrolls as one and the forms stop being their own scroll container. */
  .home {
    grid-template-columns: 1fr;
    overflow-y: auto;
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
    overflow-y: visible;
  }

  .forms-inner {
    margin: 0;
  }
}
</style>
