<script setup lang="ts">
import type { GameKind } from '@shared/types'
import { maxPlayersFor } from '@shared/types'
import { GAME_LIST, seatsFit } from '@/game/catalogue'
import { t } from '@/i18n'

/**
 * The shelf of games, offered inside the lobby rather than before it: a room is
 * hosted first and dressed afterwards, so the host can change their mind with
 * the table already sitting there.
 *
 * A game the room has outgrown is offered disabled rather than hidden — a host
 * looking for Samurai should be told it seats six, not left wondering where it
 * went.
 */
const props = defineProps<{
  /** The kind the room is currently set to play. */
  chosen: GameKind
  /** Seats taken, which is what decides whether a game still fits. */
  players: number
  /** Non-hosts see the shelf, but read-only. */
  locked?: boolean
}>()

const emit = defineEmits<{ (e: 'pick', kind: GameKind): void }>()

/*
 * The game already chosen is still live: picking it is how you close the shelf
 * without changing anything, which is what a host who opened it to look does.
 */
function choose(kind: GameKind) {
  if (props.locked || !seatsFit(kind, props.players)) return
  emit('pick', kind)
}
</script>

<template>
  <div class="picker" role="radiogroup" :aria-label="t('lobby.game.pick')">
    <button
      v-for="card in GAME_LIST"
      :key="card.kind"
      type="button"
      class="game-option"
      role="radio"
      :aria-checked="card.kind === chosen"
      :class="{ chosen: card.kind === chosen, locked }"
      :disabled="locked || !seatsFit(card.kind, players)"
      :title="
        seatsFit(card.kind, players)
          ? t(card.blurb)
          : t('lobby.game.tooMany', { max: maxPlayersFor(card.kind) })
      "
      @click="choose(card.kind)"
    >
      <span class="seal" :class="card.seal">{{ card.glyph }}</span>
      <span class="option-name">{{ t(card.name) }}</span>
      <span class="option-meta tiny">
        {{
          seatsFit(card.kind, players)
            ? t(card.meta)
            : t('lobby.game.tooMany', { max: maxPlayersFor(card.kind) })
        }}
      </span>
      <span v-if="card.kind === chosen" class="tick" aria-hidden="true">✓</span>
    </button>
  </div>
</template>

<style scoped>
.picker {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(11rem, 100%), 1fr));
  gap: 0.5rem;
}

/* Tall enough for a thumb on its own, before the coarse-pointer rules in
   main.css raise buttons — this is not a `.btn`, so it sets its own floor. */
.game-option {
  position: relative;
  display: grid;
  grid-template-columns: auto 1fr;
  grid-template-areas:
    'seal name'
    'seal meta';
  align-items: center;
  column-gap: 0.6rem;
  min-height: 3.25rem;
  padding: 0.5rem 0.6rem;
  border-radius: 10px;
  border: 1px solid var(--gold-line);
  background: var(--paper);
  color: var(--ink);
  text-align: left;
  cursor: pointer;
  font: inherit;
  transition: border-color 0.14s ease, background 0.14s ease, transform 0.14s ease;
}

.game-option:hover:not(:disabled) {
  border-color: var(--vermillion);
  transform: translateY(-1px);
}

.game-option.chosen {
  border-color: var(--vermillion);
  background: rgba(178, 58, 44, 0.08);
  box-shadow: inset 0 0 0 1px var(--vermillion);
}

/* A game the table has outgrown, and — for a guest — the whole shelf. Both are
   shown rather than hidden, so the room's choice stays legible to everyone. */
.game-option:disabled {
  cursor: default;
  opacity: 0.45;
}

.game-option.chosen:disabled {
  opacity: 1;
}

.seal {
  grid-area: seal;
  display: grid;
  place-items: center;
  width: 2.2rem;
  height: 2.2rem;
  border-radius: 8px;
  font-size: 1.1rem;
  font-family: var(--font-display);
  color: #f6ece0;
  background: #1c1613;
}

.seal.fruits {
  background: linear-gradient(140deg, #b23a2c, #d98a3d);
}

.seal.crown {
  background: linear-gradient(140deg, #4a3a6b, #6b4b9c);
}

.seal.tent {
  background: linear-gradient(140deg, #a63a30, #2f5a86);
}

.seal.siren {
  background: linear-gradient(140deg, #1e3a5f, #b23a2c);
}

.seal.serpent {
  background: linear-gradient(140deg, #17482a, #2f7a45);
}

.seal.die {
  background: linear-gradient(140deg, #b23a2c, #d4a017);
}

.seal.terrace {
  background: linear-gradient(140deg, #8a6f52, #2c241c);
}

.option-name {
  grid-area: name;
  font-family: var(--font-display);
  font-size: 0.92rem;
  line-height: 1.2;
}

.option-meta {
  grid-area: meta;
  color: var(--ink-faint);
  font-family: var(--font-body);
  line-height: 1.3;
}

.tick {
  position: absolute;
  top: 0.35rem;
  right: 0.45rem;
  color: var(--vermillion);
  font-size: 0.8rem;
}

@media (prefers-reduced-motion: reduce) {
  .game-option {
    transition: none;
  }
  .game-option:hover:not(:disabled) {
    transform: none;
  }
}
</style>
