<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import { PLAYER_COLOURS } from '@shared/colours'
import { DIE_FACES, type Opening } from '@shared/opening'
import type { PlayerColour } from '@shared/types'
import { t } from '@/i18n'

/**
 * The opening roll-off, replayed round by round.
 *
 * Nothing here decides anything: the engine rolled the dice at the deal and the
 * result is already in `current`, so this is a replay of a settled fact. That is
 * what lets a player who reloads mid-ceremony miss it entirely without the game
 * being any different, and what keeps a late-joining spectator from voting on
 * who starts.
 *
 * It takes only what it needs from a seat rather than any one game's player
 * type, so all three tables can hand it their own.
 */
const props = defineProps<{
  opening: Opening
  players: readonly { id: number; name: string; colour: PlayerColour }[]
}>()
const emit = defineEmits<{ (e: 'done'): void }>()

/** Pip positions on a 3×3 grid, per face. */
const PIPS: Record<number, [number, number][]> = {
  1: [[2, 2]],
  2: [[1, 1], [3, 3]],
  3: [[1, 1], [2, 2], [3, 3]],
  4: [[1, 1], [1, 3], [3, 1], [3, 3]],
  5: [[1, 1], [1, 3], [2, 2], [3, 1], [3, 3]],
  6: [[1, 1], [1, 3], [2, 1], [2, 3], [3, 1], [3, 3]],
}

const ROLL_MS = 900
const ROUND_GAP_MS = 1100

const roundIndex = ref(0)
/** While true the faces tumble; the real numbers are shown once it clears. */
const tumbling = ref(true)
const tumble = ref(1)
const settled = ref(false)

const round = computed(() => props.opening.rounds[roundIndex.value] ?? [])
const isLastRound = computed(() => roundIndex.value >= props.opening.rounds.length - 1)
const nameOf = (id: number) => props.players.find((p) => p.id === id)?.name ?? ''
const colourOf = (id: number) => props.players.find((p) => p.id === id)?.colour ?? 'gold'

const timers: number[] = []
const later = (fn: () => void, ms: number) => timers.push(window.setTimeout(fn, ms))
const spinner = window.setInterval(() => {
  if (tumbling.value) tumble.value = Math.floor(Math.random() * DIE_FACES) + 1
}, 70)

function runRound() {
  tumbling.value = true
  later(() => {
    tumbling.value = false
    if (isLastRound.value) {
      settled.value = true
      // Long enough to read who won, then out of the way on its own.
      later(() => emit('done'), 2200)
    } else {
      later(() => {
        roundIndex.value++
        runRound()
      }, ROUND_GAP_MS)
    }
  }, ROLL_MS)
}

runRound()

onUnmounted(() => {
  timers.forEach(clearTimeout)
  clearInterval(spinner)
})

const faceOf = (roll: number) => (tumbling.value ? tumble.value : roll)
</script>

<template>
  <div class="veil" @click="emit('done')">
    <div class="sheet panel" role="dialog" aria-modal="true">
      <p class="tiny muted head">
        {{
          opening.rounds.length > 1
            ? t('dice.tieRound', { n: roundIndex + 1 })
            : t('dice.title')
        }}
      </p>

      <ul class="rolls">
        <li v-for="r in round" :key="r.player" class="roll" :class="{ won: settled && r.player === opening.winner }">
          <span class="die" :class="{ tumbling }">
            <span
              v-for="(pip, i) in PIPS[faceOf(r.roll)]"
              :key="i"
              class="pip"
              :style="{ gridRow: pip[0], gridColumn: pip[1] }"
            />
          </span>
          <span class="who">
            <span class="dot" :style="{ background: PLAYER_COLOURS[colourOf(r.player)].ink }" />
            {{ nameOf(r.player) }}
          </span>
        </li>
      </ul>

      <p v-if="settled" class="winner">
        {{ t('dice.winner', { name: nameOf(opening.winner) }) }}
      </p>
      <p v-else class="tiny muted">{{ t('dice.rolling') }}</p>

      <button class="btn ghost small" @click.stop="emit('done')">{{ t('dice.skip') }}</button>
    </div>
  </div>
</template>

<style scoped>
.veil {
  position: fixed;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 1rem;
  background: rgba(28, 22, 19, 0.5);
  z-index: 80;
}

.sheet {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  padding: 1.2rem 1.4rem;
  max-width: min(30rem, 100%);
  text-align: center;
}

.head {
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 0.09em;
}

.rolls {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.9rem;
}

.roll {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.35rem;
  padding: 0.4rem 0.5rem;
  border-radius: 10px;
  border: 1px solid transparent;
  transition: border-color 0.2s ease, background 0.2s ease;
}

.roll.won {
  border-color: var(--vermillion);
  background: rgba(178, 58, 44, 0.1);
}

.die {
  display: grid;
  grid-template: repeat(3, 1fr) / repeat(3, 1fr);
  gap: 0.1rem;
  width: 2.6rem;
  height: 2.6rem;
  padding: 0.3rem;
  border-radius: 8px;
  background: var(--paper);
  border: 1px solid var(--gold-line);
  box-shadow: var(--shadow);
}

.die.tumbling {
  animation: shake 0.28s linear infinite;
}

@keyframes shake {
  0%,
  100% {
    transform: rotate(-7deg) translateY(0);
  }
  50% {
    transform: rotate(7deg) translateY(-2px);
  }
}

.pip {
  align-self: center;
  justify-self: center;
  width: 0.42rem;
  height: 0.42rem;
  border-radius: 50%;
  background: var(--ink);
}

.who {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.8rem;
  color: var(--ink-soft);
}

.dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
}

.winner {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.15rem;
  color: var(--vermillion-dark);
}

/* A roll nobody can influence should not hold anyone up who has seen it. */
@media (prefers-reduced-motion: reduce) {
  .die.tumbling {
    animation: none;
  }
}
</style>
