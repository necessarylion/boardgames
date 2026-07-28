<script setup lang="ts">
import GameIcon from './GameIcon.vue'
import TileReference from './TileReference.vue'
import { TILES_PER_PLAYER } from '@shared/tiles'
import { CASTES } from '@shared/types'
import { casteName, castePiece, t } from '@/i18n'

defineEmits<{ close: [] }>()
</script>

<template>
  <div class="backdrop" @click.self="$emit('close')">
    <div class="panel sheet">
      <header class="head">
        <h2>{{ t('rules.title') }}</h2>
        <button class="btn ghost small" @click="$emit('close')">{{ t('rules.close') }}</button>
      </header>

      <div class="body">
        <div class="rules">
          <section>
            <h3>{{ t('rules.goal.title') }}</h3>
            <p>{{ t('rules.goal.text') }}</p>
            <ul class="castes">
              <li v-for="caste in CASTES" :key="caste">
                <GameIcon :name="caste" :size="20" />
                <span><strong>{{ castePiece(caste) }}</strong> — {{ casteName(caste) }}</span>
              </li>
            </ul>
          </section>

          <section>
            <h3>{{ t('rules.turn.title') }}</h3>
            <!-- The emphasis inside these sentences is part of the sentence, so
                 the whole line is one message rather than three fragments. -->
            <ol>
              <li v-html="t('rules.turn.place')" />
              <li>{{ t('rules.turn.capture') }}</li>
              <li>{{ t('rules.turn.draw') }}</li>
            </ol>
          </section>

          <section>
            <h3>{{ t('rules.capturing.title') }}</h3>
            <p>{{ t('rules.capturing.text') }}</p>
          </section>

          <section>
            <h3>{{ t('rules.ending.title') }}</h3>
            <p>{{ t('rules.ending.text') }}</p>
            <p v-html="t('rules.ending.tiebreak')" />
          </section>
        </div>

        <section class="tiles">
          <h3>{{ t('rules.tiles.title', { count: TILES_PER_PLAYER }) }}</h3>
          <p class="lede">{{ t('rules.tiles.lede') }}</p>

          <TileReference />
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  background: rgba(38, 28, 18, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.25rem;
  z-index: 30;
  backdrop-filter: blur(2px);
}

/* The one place a card survives — it floats over the board, so it keeps the
   lift. Inside it is ruled like every other screen. The header is a fixed row
   and only the body scrolls, so the Close button never leaves the top. */
.sheet {
  width: min(90vw, 100%);
  max-height: 92vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: var(--shadow-lg);
}

.head {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.85rem clamp(1rem, 2.4vw, 1.9rem);
  border-bottom: 1px solid rgba(160, 137, 102, 0.35);
}

.body {
  min-height: 0;
  overflow-y: auto;
  scrollbar-width: thin;
  padding: 1.1rem clamp(1rem, 2.4vw, 1.9rem) 1.45rem;
}

/* The prose is set as a broadsheet rather than one 200-character-wide column:
   the browser fits as many 24rem columns as the sheet can hold, balances their
   heights and draws the divider itself, so no section needs a box around it.
   Column width, not column count, is what keeps the measure readable at every
   size — three columns on a wide monitor, two on a laptop. */
.rules {
  column-width: 24rem;
  column-gap: 2.75rem;
  column-rule: 1px solid rgba(160, 137, 102, 0.35);
}

/* Sections are the unit the columns break on, so a heading is never stranded
   at the foot of one column with its text in the next. */
.rules section {
  break-inside: avoid;
  padding-bottom: 1.15rem;
}

/* Spacing between stacked sections comes from that padding rather than a
   margin, which a column break would otherwise leave hanging at the top of the
   next column. */
.rules section:last-child {
  padding-bottom: 0;
}

/* The tile reference wants the full width: it flows into four columns there and
   stands two rows tall, where in a narrow column it would run to eight. */
.tiles {
  margin-top: 1.3rem;
  padding-top: 1.3rem;
  border-top: 1px solid rgba(160, 137, 102, 0.35);
}

.lede {
  max-width: 34rem;
}

h2 {
  font-size: 1.35rem;
}

h3 {
  font-size: 1.02rem;
  margin: 0 0 0.35rem;
  color: var(--vermillion-dark);
}

p,
li {
  line-height: 1.5;
  font-size: 0.88rem;
}

p {
  margin: 0 0 0.5rem;
}

p:last-child {
  margin-bottom: 0;
}

ol {
  margin: 0;
  padding-left: 1.2rem;
}

ol li {
  margin-bottom: 0.3rem;
}

.castes {
  list-style: none;
  margin: 0.5rem 0 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem 0.9rem;
}

.castes li {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}

/* Short windows — a 720p laptop, or a browser carrying a lot of chrome. Give
   back the padding and a little leading first; that is usually the difference
   between the sheet fitting and the body taking a scrollbar. */
@media (max-height: 900px) {
  .backdrop {
    padding: 0.75rem;
  }

  .head {
    padding-top: 0.6rem;
    padding-bottom: 0.6rem;
  }

  .body {
    padding-top: 0.85rem;
    padding-bottom: 1rem;
  }

  .tiles {
    margin-top: 0.95rem;
    padding-top: 0.95rem;
  }

  p,
  li {
    line-height: 1.45;
  }
}

/* One column below ~900px, capped at a readable measure — the sheet is wide
   enough there to run a single line past 100 characters otherwise. */
@media (max-width: 56.25rem) {
  .rules {
    column-width: auto;
    column-count: 1;
    column-rule: 0;
    max-width: 34rem;
  }
}
</style>
