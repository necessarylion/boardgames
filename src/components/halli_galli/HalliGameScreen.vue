<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import HalliCard from './HalliCard.vue'
import TableMenu from '../common/TableMenu.vue'
import { PLAYER_COLOURS } from '@shared/colours'
import { t } from '@/i18n'
import { useGameStore } from '@/stores/game'

const game = useGameStore()

const players = computed(() => game.hgPlayers)
const nameOf = (id: number) => players.value.find((p) => p.id === id)?.name ?? ''

const isOver = computed(() => game.halli?.phase === 'over')

const turnLabel = computed(() => {
  if (isOver.value) return t('game.over')
  if (game.isPaused) return t('game.paused.badge')
  if (game.canFlip) return t('halli.yourFlip')
  const active = game.hgActivePlayer
  return active ? t('halli.playerFlip', { name: active.name }) : t('game.noTurn')
})

/** The latest ring, shown until the next flip clears it. Flips are left silent. */
const event = computed(() => {
  const e = game.halli?.lastEvent ?? null
  return e && e.kind === 'ring' ? e : null
})

const eventText = computed(() => {
  const e = event.value
  if (!e || e.kind !== 'ring') return ''
  const name = nameOf(e.player)
  return e.correct
    ? t('halli.event.correct', { name, fruit: t(`halli.fruit.${e.fruit}`), n: e.taken })
    : t('halli.event.false', { name, n: e.penalty })
})

const winner = computed(() => {
  const w = game.halli?.result?.winner
  return w === null || w === undefined ? null : nameOf(w)
})

// Keyboard: space flips your card, enter is the bell. F stays as an alias for flip.
/**
 * A control that owns the key itself — a button, link, menu item, or any input.
 * The listener is on the window, so a key pressed while one of these has focus
 * reaches here too; bailing lets Enter/Space activate the control (pause, the
 * menu, the flip and bell buttons) instead of firing a stray flip or slap.
 */
function isInteractiveTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el) return false
  if (el.isContentEditable) return true
  return !!el.closest(
    'button, a, input, textarea, select, [role="button"], [role="menuitem"]',
  )
}

function onKey(e: KeyboardEvent) {
  if (e.repeat) return
  if (isInteractiveTarget(e.target)) return
  if (e.code === 'Space' || e.key === 'f' || e.key === 'F') {
    e.preventDefault()
    game.flipCard()
  } else if (e.code === 'Enter') {
    e.preventDefault()
    game.slapBell()
  }
}

// --- deal animation ---------------------------------------------------------
// A flourish at match start: cards fly out from the centre to each seat, one by
// one. Purely visual — the real piles already sit underneath, full.
type Flyer = { key: number; sx: number; sy: number; tx: number; ty: number; delay: number }

const dealing = ref(false)
const armed = ref(false)
const flyers = ref<Flyer[]>([])
const centreEl = ref<HTMLElement | null>(null)
const pileEls = new Map<number, HTMLElement>()

function setPileRef(id: number, el: Element | null) {
  if (el) pileEls.set(id, el as HTMLElement)
  else pileEls.delete(id)
}

function flyerStyle(f: Flyer) {
  const [x, y] = armed.value ? [f.tx, f.ty] : [f.sx, f.sy]
  return {
    transform: `translate(${x}px, ${y}px) translate(-50%, -50%)`,
    transitionDelay: `${f.delay}ms`,
  }
}

const DEAL_ROUNDS = 2
const DEAL_STEP = 110
const DEAL_DUR = 380

/** A freshly dealt table: play has begun, nothing flipped, no bell rung yet. */
const isFreshStart = computed(
  () =>
    game.halli?.phase === 'play' &&
    game.halli.turnNumber === 1 &&
    !game.halli.lastEvent &&
    game.halli.players.every((p) => p.faceUp.length === 0),
)

async function runDeal() {
  if (dealing.value) return
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
  dealing.value = true
  armed.value = false
  flyers.value = []
  await nextTick()

  const centre = centreEl.value?.getBoundingClientRect()
  if (!centre) {
    dealing.value = false
    return
  }
  const cx = centre.left + centre.width / 2
  const cy = centre.top + centre.height / 2

  const ids = players.value.map((p) => p.id)
  const list: Flyer[] = []
  let key = 0
  for (let round = 0; round < DEAL_ROUNDS; round++) {
    ids.forEach((id, i) => {
      const el = pileEls.get(id)
      if (!el) return
      const rect = el.getBoundingClientRect()
      list.push({
        key: key++,
        sx: cx,
        sy: cy,
        tx: rect.left + rect.width / 2,
        ty: rect.top + rect.height / 2,
        delay: (round * ids.length + i) * DEAL_STEP,
      })
    })
  }
  flyers.value = list

  // Let the flyers paint at the centre, then arm the transition so each one
  // leaves after its own delay — that is the one-by-one deal.
  await nextTick()
  requestAnimationFrame(() => requestAnimationFrame(() => (armed.value = true)))

  const total = DEAL_ROUNDS * ids.length * DEAL_STEP + DEAL_DUR + 120
  window.setTimeout(() => {
    dealing.value = false
    armed.value = false
    flyers.value = []
  }, total)
}

watch(isFreshStart, (fresh, was) => {
  if (fresh && !was) runDeal()
})

onMounted(() => {
  window.addEventListener('keydown', onKey)
  if (isFreshStart.value) runDeal()
})
onUnmounted(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="game">
    <header class="topbar">
      <div class="turn">
        <strong>{{ turnLabel }}</strong>
        <span v-if="game.isPaused" class="paused-badge tiny">{{ t('game.paused.badge') }}</span>
      </div>
      <div class="top-actions">
        <span class="tiny muted code">{{ t('game.room', { code: game.halli?.code ?? '' }) }}</span>
        <button v-if="game.isSeated && !isOver" class="btn ghost small" @click="game.togglePause()">
          {{ game.isPaused ? t('game.resume') : t('game.pause') }}
        </button>
        <TableMenu />
      </div>
    </header>

    <main class="table">
      <div class="players">
        <div
          v-for="p in players"
          :key="p.id"
          class="player"
          :class="{ active: p.id === game.halli?.current && !isOver, out: p.out, me: p.id === game.you }"
          :style="{ '--seat': PLAYER_COLOURS[p.colour].ink }"
        >
          <div class="player-head">
            <span class="dot" :style="{ background: PLAYER_COLOURS[p.colour].ink }" />
            <span class="pname">{{ p.name }}</span>
            <span v-if="p.id === game.you" class="tag">{{ t('lobby.badge.you') }}</span>
            <span v-if="p.out" class="tag out-tag">{{ t('halli.out') }}</span>
          </div>

          <div class="piles">
            <div class="pile" :ref="(el) => setPileRef(p.id, el as Element | null)">
              <HalliCard :down="p.stackCount > 0" :card="null" size="sm" />
              <span class="count tiny">{{ t('halli.stack', { n: p.stackCount }) }}</span>
            </div>
            <div class="pile">
              <HalliCard :card="p.faceUp[p.faceUp.length - 1] ?? null" />
              <span class="count tiny">{{ t('halli.faceUp', { n: p.faceUp.length }) }}</span>
            </div>
          </div>
        </div>
      </div>

      <div ref="centreEl" class="centre">
        <Transition name="flash">
          <p v-if="eventText" :key="eventText" class="event" :class="{ good: event?.correct }">
            {{ eventText }}
          </p>
        </Transition>

        <button
          class="bell"
          :disabled="!game.canSlap"
          :title="t('halli.bell.hint')"
          @click="game.slapBell()"
        >
          🔔
        </button>

        <button class="btn flip" :disabled="!game.canFlip" @click="game.flipCard()">
          {{ t('halli.flip') }}
        </button>
        <p class="tiny muted hint">{{ t('halli.keys') }}</p>
      </div>
    </main>

    <!-- Deal flourish: face-down cards fly from the centre to each seat. -->
    <div v-if="dealing" class="deal-overlay" aria-hidden="true">
      <div v-for="f in flyers" :key="f.key" class="flyer" :style="flyerStyle(f)">
        <HalliCard :down="true" size="sm" />
      </div>
    </div>

    <!-- Game over -->
    <div v-if="isOver" class="over-veil">
      <div class="over-card panel">
        <h2>{{ winner ? t('halli.winner', { name: winner }) : t('halli.draw') }}</h2>
        <p class="tiny muted">{{ game.halli?.result?.reason }}</p>
        <div class="over-actions">
          <button v-if="game.isHost" class="btn" @click="game.rematch()">{{ t('over.playAgain') }}</button>
          <button class="btn ghost" @click="game.leaveRoom()">{{ t('lobby.leave') }}</button>
        </div>
      </div>
    </div>

    <div v-if="game.isPaused && !isOver" class="over-veil">
      <div class="over-card panel">
        <strong>{{ t('game.paused.title') }}</strong>
        <p class="tiny muted">{{ t('game.paused.body') }}</p>
        <button v-if="game.isSeated" class="btn" @click="game.togglePause()">
          {{ t('game.resume') }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.game {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.6rem clamp(0.9rem, 2vw, 1.5rem);
  border-bottom: 1px solid rgba(160, 137, 102, 0.35);
  flex: none;
}

.turn {
  display: flex;
  align-items: baseline;
  gap: 0.55rem;
}

.turn strong {
  font-family: var(--font-display);
  font-size: 1.15rem;
}

.paused-badge {
  padding: 0.1rem 0.45rem;
  border-radius: 999px;
  background: rgba(178, 58, 44, 0.16);
  color: var(--vermillion-dark);
  text-transform: uppercase;
  font-weight: 600;
}

.top-actions {
  display: flex;
  align-items: center;
  gap: 0.45rem;
}

.code {
  letter-spacing: 0.12em;
}

.table {
  flex: 1 1 auto;
  min-height: 0;
  display: grid;
  grid-template-rows: 1fr auto;
  gap: 1rem;
  padding: clamp(1rem, 3vw, 2rem);
  align-items: center;
}

.players {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(9.5rem, 1fr));
  gap: 0.9rem;
  align-content: start;
}

.player {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  padding: 0.8rem;
  border-radius: 12px;
  border: 1px solid rgba(160, 137, 102, 0.35);
  background: rgba(255, 253, 246, 0.6);
  transition: border-color 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease;
}

.player.active {
  border-color: var(--seat, var(--vermillion));
  box-shadow: 0 0 0 2px var(--seat, var(--vermillion));
  transform: translateY(-2px);
}

.player.out {
  opacity: 0.5;
}

.player-head {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.dot {
  width: 0.7rem;
  height: 0.7rem;
  border-radius: 50%;
  flex: none;
}

.pname {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tag {
  font-size: 0.62rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 0.08rem 0.32rem;
  border-radius: 4px;
  background: rgba(178, 58, 44, 0.14);
  color: var(--vermillion-dark);
}

.out-tag {
  background: rgba(120, 120, 120, 0.22);
  color: var(--ink-soft);
}

.piles {
  display: flex;
  gap: 0.7rem;
}

.pile {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
}

.count {
  color: var(--ink-soft);
}

/* --- centre: the bell --------------------------------------------------- */
.centre {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.7rem;
  justify-self: center;
}

.event {
  margin: 0;
  padding: 0.4rem 1rem;
  border-radius: 999px;
  font-weight: 600;
  background: rgba(120, 120, 120, 0.16);
  color: var(--ink-soft);
}

.event.good {
  background: rgba(47, 122, 69, 0.18);
  color: #17482a;
}

.bell {
  width: clamp(6rem, 18vw, 9rem);
  height: clamp(6rem, 18vw, 9rem);
  border-radius: 50%;
  border: 4px solid var(--gold-line);
  background: radial-gradient(circle at 40% 35%, #ffe9a8, #d9a441 70%, #b9822f);
  font-size: clamp(2.6rem, 8vw, 4rem);
  cursor: pointer;
  box-shadow: var(--shadow-lg);
  transition: transform 0.06s ease, filter 0.1s ease;
}

.bell:hover:not(:disabled) {
  filter: brightness(1.05);
}

.bell:active:not(:disabled) {
  transform: scale(0.94);
}

.bell:disabled {
  filter: grayscale(0.6) brightness(0.95);
  cursor: not-allowed;
  opacity: 0.75;
}

.flip {
  min-width: 8rem;
}

.hint {
  margin: 0;
}

/* --- overlays ----------------------------------------------------------- */
.over-veil {
  position: fixed;
  inset: 0;
  z-index: 40;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background: rgba(20, 16, 12, 0.55);
}

.over-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.6rem;
  max-width: 24rem;
  padding: 1.6rem 1.8rem;
  text-align: center;
  box-shadow: var(--shadow-lg);
}

.over-card h2,
.over-card strong {
  font-family: var(--font-display);
  font-size: 1.35rem;
}

.over-card p {
  margin: 0;
}

.over-actions {
  display: flex;
  gap: 0.6rem;
  margin-top: 0.4rem;
}

.flash-enter-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.flash-enter-from {
  opacity: 0;
  transform: translateY(6px);
}

/* --- deal animation ----------------------------------------------------- */
.deal-overlay {
  position: fixed;
  inset: 0;
  z-index: 45;
  pointer-events: none;
}

.flyer {
  position: fixed;
  top: 0;
  left: 0;
  will-change: transform;
  transition: transform 0.38s cubic-bezier(0.4, 0.05, 0.2, 1);
  filter: drop-shadow(0 4px 6px rgba(20, 16, 12, 0.35));
}
</style>
