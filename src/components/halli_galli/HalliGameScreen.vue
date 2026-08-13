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

/** The latest ring. Flips are left silent; the log keeps the full history. */
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

/**
 * The ring pill is a toast: it pops up on a fresh ring and clears itself after a
 * second, so it never lingers over the seat behind it. Keying the watch on the
 * text means a re-sent state does not restart the timer.
 */
const toastVisible = ref(false)
let toastTimer: ReturnType<typeof setTimeout> | null = null
watch(eventText, (text) => {
  if (toastTimer) clearTimeout(toastTimer)
  toastVisible.value = !!text
  toastTimer = text
    ? setTimeout(() => {
        toastVisible.value = false
        toastTimer = null
      }, 1000)
    : null
})

const winner = computed(() => {
  const w = game.halli?.result?.winner
  return w === null || w === undefined ? null : nameOf(w)
})

// --- the log -----------------------------------------------------------------
/** The play log, floated bottom-left; folds down to its header on request. */
const logOpen = ref(true)

/** Every entry, oldest first, tagged with its player's name and colour. */
const logLines = computed(() =>
  (game.halli?.log ?? []).map((entry, i) => ({
    key: `${i}:${entry.turn}`,
    who: entry.player === null ? null : nameOf(entry.player),
    colour: players.value.find((p) => p.id === entry.player)?.colour ?? null,
    text: entry.text,
  })),
)

const logEl = ref<HTMLElement | null>(null)
watch(
  () => logLines.value.length,
  async () => {
    await nextTick()
    const el = logEl.value
    if (el) el.scrollTop = el.scrollHeight
  },
  { flush: 'post' },
)

// --- the ring ----------------------------------------------------------------
/**
 * Seats in play order, rotated so the local player sits at the bottom of the
 * ring. Only where a seat is drawn changes — the turn order is untouched — so
 * the table reads the same way to everyone sitting at it.
 */
const seatOrder = computed(() => {
  const list = players.value
  const me = game.you
  if (me === null) return list
  const i = list.findIndex((p) => p.id === me)
  return i < 0 ? list : [...list.slice(i), ...list.slice(0, i)]
})

// Reserved seat box, sized for the widest seat, so the clearance holds for all.
const SEAT_W = 200
const SEAT_H = 176
const EDGE = 10

const ringEl = ref<HTMLElement | null>(null)
const ringW = ref(0)
const ringH = ref(0)

let ringObserver: ResizeObserver | null = null
watch(ringEl, (el) => {
  ringObserver?.disconnect()
  if (!el || typeof ResizeObserver === 'undefined') return
  ringW.value = el.clientWidth
  ringH.value = el.clientHeight
  ringObserver = new ResizeObserver(([entry]) => {
    ringW.value = entry.contentRect.width
    ringH.value = entry.contentRect.height
  })
  ringObserver.observe(el)
})

/**
 * Whether there is room to lay the seats round a ring without them running into
 * the bell in the middle, else they stack into a wrapped row. The height needs
 * a good deal of slack because the top and bottom seats sit straight above and
 * below the bell.
 */
const isRing = computed(
  () => ringW.value >= SEAT_W * 2.6 && ringH.value >= SEAT_H * 2.8 && seatOrder.value.length > 1,
)

/**
 * Place a seat on the ring. Angles start at the bottom and run clockwise, so the
 * local player sits at the foot of the table and play moves round it. The radii
 * differ because a seat is wider than it is tall, so it needs more room from the
 * side edges than from the top and bottom.
 */
function seatStyle(index: number, count: number) {
  if (!isRing.value) return {}
  const angle = Math.PI / 2 + (index * 2 * Math.PI) / count
  const rx = Math.max(0, ringW.value / 2 - SEAT_W / 2 - EDGE)
  const ry = Math.max(0, ringH.value / 2 - SEAT_H / 2 - EDGE)
  return {
    left: `${Math.round(ringW.value / 2 + rx * Math.cos(angle))}px`,
    top: `${Math.round(ringH.value / 2 + ry * Math.sin(angle))}px`,
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
  if (isFreshStart.value) runDeal()
})
onUnmounted(() => {
  ringObserver?.disconnect()
  if (toastTimer) clearTimeout(toastTimer)
})
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
      <div ref="ringEl" class="ring" :class="{ stacked: !isRing }">
        <!-- The ring announcement, floated over the middle of the table. -->
        <Transition name="flash">
          <p
            v-if="toastVisible"
            :key="eventText"
            class="event"
            :class="{ good: event?.correct }"
            role="status"
            aria-live="polite"
          >
            {{ eventText }}
          </p>
        </Transition>

        <!-- The bell, in the middle of the table, with the seats around it. -->
        <div ref="centreEl" class="centre">
          <button
            class="bell"
            :disabled="!game.canSlap"
            :title="t('halli.bell.hint')"
            :aria-label="t('halli.bell.hint')"
            @click="game.slapBell()"
          >
            🔔
          </button>
        </div>

        <div
          v-for="(p, i) in seatOrder"
          :key="p.id"
          class="player"
          :class="{ active: p.id === game.halli?.current && !isOver, out: p.out, me: p.id === game.you }"
          :style="{ '--seat': PLAYER_COLOURS[p.colour].ink, ...seatStyle(i, seatOrder.length) }"
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

      <!-- The play log, floated in the bottom-left corner and folded away to its
           header on request, so it never sits on top of a seat for long. -->
      <aside class="log panel" :class="{ folded: !logOpen }">
        <button class="log-head" type="button" :aria-expanded="logOpen" @click="logOpen = !logOpen">
          <span>{{ t('halli.log.title') }}</span>
          <span aria-hidden="true">{{ logOpen ? '▾' : '▴' }}</span>
        </button>
        <ol v-if="logOpen" ref="logEl" class="log-lines scroll">
          <li v-for="line in logLines" :key="line.key">
            <span
              v-if="line.colour"
              class="log-dot"
              :style="{ background: PLAYER_COLOURS[line.colour].ink }"
            />
            <span v-if="line.who" class="log-who">{{ line.who }}</span>
            <span class="log-text">{{ line.text }}</span>
          </li>
        </ol>
      </aside>
    </main>

    <!-- The flip control sits below the table, well clear of the bell. -->
    <footer v-if="!isOver" class="controls">
      <button class="btn flip" :disabled="!game.canFlip" @click="game.flipCard()">
        {{ t('halli.flip') }}
      </button>
    </footer>

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

/* The table fills the space under the topbar and above the flip control; the
   ring grows into whatever is left, so a bigger screen is a bigger table. */
.table {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: clamp(0.8rem, 2vw, 1.4rem);
}

/* Seats are laid round an ellipse by the inline left/top the script computes;
   the ring only has to give them a box with a middle for the bell to sit in. */
.ring {
  position: relative;
  flex: 1 1 auto;
  width: 100%;
  min-height: 0;
}

/* Too small for a ring: seats become a wrapped row and the bell leads. */
.ring.stacked {
  display: flex;
  flex-wrap: wrap;
  align-content: flex-start;
  justify-content: center;
  gap: 0.9rem;
  overflow-y: auto;
}

.ring.stacked .player,
.ring.stacked .centre,
.ring.stacked .event {
  position: static;
  transform: none;
}

.ring.stacked .event {
  order: -2;
  flex-basis: 100%;
  margin: 0 auto 0.2rem;
}

.ring.stacked .centre {
  order: -1;
  flex-basis: 100%;
  margin: 0 auto 0.4rem;
}

.player {
  position: absolute;
  transform: translate(-50%, -50%);
  z-index: 2;
  width: 11.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  padding: 0.7rem 0.8rem;
  border-radius: 12px;
  border: 1px solid rgba(160, 137, 102, 0.35);
  background: rgba(255, 253, 246, 0.85);
  box-shadow: var(--shadow);
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.player.active {
  border-color: var(--seat, var(--vermillion));
  box-shadow: 0 0 0 2px var(--seat, var(--vermillion));
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

/* --- log ---------------------------------------------------------------- */
/* Floated in the bottom-left corner, over the ring. Collapses to its header so
   it can get out of the way of a seat when the table is crowded. */
.log {
  position: absolute;
  left: 1rem;
  bottom: 1rem;
  z-index: 20;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  width: min(17rem, calc(100% - 2rem));
  max-height: min(45%, 14rem);
  padding: 0.5rem 0.7rem;
  border: 1px solid rgba(160, 137, 102, 0.4);
  border-radius: 10px;
  background: rgba(255, 253, 246, 0.94);
  box-shadow: var(--shadow);
}

.log.folded {
  max-height: none;
}

.log-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
  width: 100%;
  margin: 0;
  padding: 0;
  border: 0;
  background: none;
  font-family: var(--font-display);
  font-size: 0.9rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--ink-soft);
  cursor: pointer;
}

.log-lines {
  margin: 0;
  padding: 0;
  list-style: none;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.78rem;
  line-height: 1.35;
  color: var(--ink-soft);
}

.log-lines li {
  display: flex;
  align-items: baseline;
  gap: 0.3rem;
}

.log-dot {
  flex: none;
  width: 0.45rem;
  height: 0.45rem;
  border-radius: 50%;
  transform: translateY(-0.05rem);
}

.log-who {
  flex: none;
  font-weight: 600;
  color: var(--ink);
}

/* Narrow: the seats stack, so the log drops into the flow beneath them rather
   than floating over the corner. */
@media (max-width: 46rem) {
  .table {
    overflow-y: auto;
  }

  .log {
    position: static;
    width: auto;
    max-height: 11rem;
    margin-top: 0.6rem;
  }
}

/* --- centre: the bell --------------------------------------------------- */
.centre {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  /* Above the seats (z-index 2): the bell is the primary action and must stay
     clickable even if a tall seat box happens to overlap the middle. */
  z-index: 3;
  display: flex;
  flex-direction: column;
  align-items: center;
}

/* Floated near the top of the ring so it never lands on the bell or a seat. A
   long, user-supplied name is allowed to wrap rather than overflow the ring. */
.event {
  position: absolute;
  top: 0.4rem;
  left: 50%;
  transform: translateX(-50%);
  z-index: 6;
  margin: 0;
  padding: 0.4rem 1rem;
  max-width: min(22rem, calc(100% - 1.5rem));
  border-radius: 12px;
  font-weight: 600;
  text-align: center;
  background: rgba(120, 120, 120, 0.16);
  color: var(--ink-soft);
  box-shadow: var(--shadow);
}

.event.good {
  background: rgba(47, 122, 69, 0.22);
  color: #17482a;
}

.bell {
  width: clamp(4.5rem, 12vw, 7rem);
  height: clamp(4.5rem, 12vw, 7rem);
  border-radius: 50%;
  border: 4px solid var(--gold-line);
  background: radial-gradient(circle at 40% 35%, #ffe9a8, #d9a441 70%, #b9822f);
  font-size: clamp(2.1rem, 6vw, 3.2rem);
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

/* --- controls: the flip button, kept clear of the bell ------------------ */
.controls {
  flex: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.35rem;
  padding: 0.7rem 1rem 0.9rem;
  border-top: 1px solid rgba(160, 137, 102, 0.35);
  background: rgba(255, 250, 240, 0.6);
}

.flip {
  min-width: 9rem;
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

.flash-leave-active {
  transition: opacity 0.25s ease;
}

.flash-leave-to {
  opacity: 0;
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
