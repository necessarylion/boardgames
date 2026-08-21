<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import TableMenu from '../common/TableMenu.vue'
import { SNAKE_TICK_MS, type SnakeDir } from '@shared/snake'
import type { PlayerColour } from '@shared/types'
import { t } from '@/i18n'
import { useGameStore } from '@/stores/game'

/**
 * The board's own palette, not the shared dyed-cloth one: eight snakes moving
 * five times a second have to be told apart at a glance, so each seat gets a
 * saturated hue as far from its neighbours as the wheel allows, with a darker
 * head in the same hue.
 */
const SNAKE_COLOURS: Record<PlayerColour, { body: string; head: string; text: string }> = {
  gold: { body: '#F9A825', head: '#A26D18', text: '#3d2903' },
  red: { body: '#D32F2F', head: '#8E1F1F', text: '#fdeee8' },
  green: { body: '#388E3C', head: '#245C27', text: '#eff7ec' },
  purple: { body: '#7B1FA2', head: '#4F1468', text: '#f1ecfb' },
  teal: { body: '#00897B', head: '#005950', text: '#eaf4f8' },
  rose: { body: '#C2185B', head: '#7E0F3B', text: '#fceef5' },
  orange: { body: '#795548', head: '#4E372E', text: '#fdf0e6' },
  indigo: { body: '#1976D2', head: '#104E89', text: '#eceefb' },
}

const game = useGameStore()

const players = computed(() => game.snPlayers)
const w = computed(() => game.snake?.gridW ?? 1)
const h = computed(() => game.snake?.gridH ?? 1)
const isOver = computed(() => game.snake?.phase === 'over')

const countdownSeconds = computed(() => {
  const frames = game.snake?.countdown ?? 0
  return frames > 0 ? Math.ceil((frames * SNAKE_TICK_MS) / 1000) : 0
})

const topLabel = computed(() => {
  if (isOver.value) return t('game.over')
  if (game.isPaused) return t('game.paused.badge')
  if (countdownSeconds.value > 0) return t('snake.countdownHint')
  return t('snake.steer.hint')
})

const winner = computed(() => {
  const w = game.snake?.result?.winner
  if (w === null || w === undefined) return null
  return players.value.find((p) => p.id === w)?.name ?? null
})

// --- steering ---------------------------------------------------------------

const KEY_DIRS: Record<string, SnakeDir> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  w: 'up',
  s: 'down',
  a: 'left',
  d: 'right',
}

function onKey(event: KeyboardEvent) {
  const dir = KEY_DIRS[event.key] ?? KEY_DIRS[event.key.toLowerCase()]
  if (!dir) return
  // Arrows scroll the page; that must never happen while steering a snake.
  event.preventDefault()
  game.steer(dir)
}

/** Swipes on the board steer too, for anyone without keys. */
let swipeFrom: [number, number] | null = null
const SWIPE_MIN_PX = 24

function onPointerDown(event: PointerEvent) {
  swipeFrom = [event.clientX, event.clientY]
}

function onPointerUp(event: PointerEvent) {
  if (!swipeFrom) return
  const dx = event.clientX - swipeFrom[0]
  const dy = event.clientY - swipeFrom[1]
  swipeFrom = null
  if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_MIN_PX) return
  const dir: SnakeDir =
    Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up')
  game.steer(dir)
}

onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => window.removeEventListener('keydown', onKey))

// --- drawing ----------------------------------------------------------------

/** The two little eyes, offset towards where the head is going. */
function eyeOffsets(dir: SnakeDir): [number, number][] {
  if (dir === 'up') return [[0.3, 0.3], [0.7, 0.3]]
  if (dir === 'down') return [[0.3, 0.7], [0.7, 0.7]]
  if (dir === 'left') return [[0.3, 0.3], [0.3, 0.7]]
  return [[0.7, 0.3], [0.7, 0.7]]
}
</script>

<template>
  <div class="game">
    <header class="topbar">
      <div class="turn">
        <strong>{{ topLabel }}</strong>
        <span v-if="game.isPaused" class="paused-badge tiny">{{ t('game.paused.badge') }}</span>
      </div>
      <div class="top-actions">
        <span class="tiny muted code">{{ t('game.room', { code: game.snake?.code ?? '' }) }}</span>
        <button v-if="game.isSeated && !isOver" class="btn ghost small" @click="game.togglePause()">
          {{ game.isPaused ? t('game.resume') : t('game.pause') }}
        </button>
        <TableMenu />
      </div>
    </header>

    <main class="table">
      <div class="board-wrap">
        <svg
          class="board"
          :viewBox="`0 0 ${w} ${h}`"
          :style="{
            aspectRatio: `${w} / ${h}`,
            width: `min(100%, calc((100vh - 11rem) * ${(w / h).toFixed(4)}))`,
          }"
          @pointerdown="onPointerDown"
          @pointerup="onPointerUp"
        >
          <rect x="0" y="0" :width="w" :height="h" class="ground" />
          <!-- A faint grid, so distances can be judged at a glance. -->
          <g class="gridlines">
            <line v-for="n in w - 1" :key="`v${n}`" :x1="n" y1="0" :x2="n" :y2="h" />
            <line v-for="n in h - 1" :key="`h${n}`" x1="0" :y1="n" :x2="w" :y2="n" />
          </g>

          <g v-for="[fx, fy] in game.snake?.food ?? []" :key="`f${fx},${fy}`" class="apple">
            <circle :cx="fx + 0.5" :cy="fy + 0.55" r="0.32" />
            <line :x1="fx + 0.5" :y1="fy + 0.25" :x2="fx + 0.62" :y2="fy + 0.08" />
          </g>

          <g v-for="p in players" :key="p.id">
            <rect
              v-for="([x, y], i) in p.body"
              :key="`${p.id}:${i}`"
              :x="x + 0.06"
              :y="y + 0.06"
              width="0.88"
              height="0.88"
              rx="0.24"
              :fill="i === 0 ? SNAKE_COLOURS[p.colour].head : SNAKE_COLOURS[p.colour].body"
            />
            <template v-if="p.body.length">
              <circle
                v-for="([ex, ey], i) in eyeOffsets(p.dir)"
                :key="`eye${p.id}:${i}`"
                :cx="p.body[0][0] + ex"
                :cy="p.body[0][1] + ey"
                r="0.09"
                fill="#fff"
              />
            </template>
          </g>
        </svg>

        <div v-if="countdownSeconds > 0 && !game.isPaused" class="countdown" aria-live="polite">
          {{ countdownSeconds }}
        </div>

        <p v-if="!isOver && game.snYou && !game.snYou.alive" class="crashed-pill">
          {{ t('snake.you.crashed') }}
        </p>
      </div>

      <!-- The seat column, styled after Samurai's player panel: ruled rows on
           the layout's own edge rather than a floating card, with the seat's
           colour carried by the swatch — which doubles as the live length. -->
      <aside class="side">
        <ul class="players">
          <li
            v-for="p in players"
            :key="p.id"
            class="player"
            :class="{ dead: !p.alive, offline: !p.connected }"
          >
            <span
              class="swatch"
              :style="{
                background: SNAKE_COLOURS[p.colour].body,
                borderColor: SNAKE_COLOURS[p.colour].head,
                color: SNAKE_COLOURS[p.colour].text,
              }"
            >
              {{ p.alive ? p.length : '✕' }}
            </span>
            <div class="player-body">
              <div class="player-head">
                <span class="player-name">{{ p.name }}</span>
                <span v-if="p.id === game.you" class="badge">{{ t('lobby.badge.you') }}</span>
                <span v-if="!p.connected" class="badge away">{{ t('lobby.badge.away') }}</span>
              </div>
              <div class="player-stats tiny muted">
                <span>{{ t('snake.length', { n: p.length }) }}</span>
                <span>·</span>
                <span>{{ t('snake.apples', { n: p.apples }) }}</span>
                <span v-if="!p.alive" class="crashed-note">{{ t('snake.crashed') }}</span>
              </div>
            </div>
          </li>
        </ul>
      </aside>
    </main>

    <!-- On-screen steering, for touch screens without keys. -->
    <div class="dpad" aria-hidden="true">
      <button class="pad up" @click="game.steer('up')">▲</button>
      <button class="pad left" @click="game.steer('left')">◀</button>
      <button class="pad right" @click="game.steer('right')">▶</button>
      <button class="pad down" @click="game.steer('down')">▼</button>
    </div>

    <!-- Game over -->
    <div v-if="isOver" class="over-veil">
      <div class="over-card panel">
        <h2>{{ winner ? t('snake.winner', { name: winner }) : t('snake.draw') }}</h2>
        <p class="tiny muted">{{ game.snake?.result?.reason }}</p>
        <div class="over-actions">
          <button v-if="game.isHost" class="btn" @click="game.rematch()">{{ t('over.playAgain') }}</button>
          <!-- Back to the lobby with the table intact, so seats and colours are
               kept and the host can simply deal again later. Host only: it ends
               the game for everyone, and the server holds it to the host anyway. -->
          <button v-if="game.isHost" class="btn ghost" @click="game.abandonGame()">
            {{ t('over.backToLobby') }}
          </button>
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

/* The sidebar runs the full height on the layout's own edge, so the padding
   lives on the board half rather than on the row. */
.table {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  align-items: stretch;
}

.board-wrap {
  position: relative;
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: clamp(0.8rem, 2vw, 1.4rem);
}

/* The board is wider than tall, so it takes the row; its inline style caps the
   width by the height left under the chrome, keeping the box on the drawing. */
.board {
  display: block;
  /* The frame is a CSS border, not a stroke on the ground rect: a stroke is
     drawn square and the corner radius clips it, leaving the edge line broken
     around every curve. The border follows the radius. */
  border: 1px solid rgba(120, 100, 70, 0.5);
  border-radius: 10px;
  box-shadow: var(--shadow);
  /* Swiping steers; it must never scroll the page instead. */
  touch-action: none;
}

.ground {
  fill: rgba(255, 253, 246, 0.9);
}

.gridlines line {
  stroke: rgba(150, 128, 94, 0.14);
  stroke-width: 0.03;
}

.apple circle {
  fill: var(--vermillion, #b23a2c);
}

.apple line {
  stroke: #4a6b2a;
  stroke-width: 0.1;
  stroke-linecap: round;
}

.countdown {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  font-family: var(--font-display);
  font-size: clamp(4rem, 18vmin, 8rem);
  color: var(--vermillion-dark);
  text-shadow: 0 2px 12px rgba(255, 253, 246, 0.9);
  pointer-events: none;
}

.crashed-pill {
  position: absolute;
  top: 0.6rem;
  left: 50%;
  transform: translateX(-50%);
  margin: 0;
  padding: 0.35rem 0.9rem;
  border-radius: 999px;
  background: rgba(58, 43, 28, 0.85);
  color: #f7efe2;
  font-size: 0.85rem;
  pointer-events: none;
}

/* --- the seat column, after Samurai's player panel ------------------------ */
.side {
  flex: none;
  width: 13.5rem;
  min-height: 0;
  overflow-y: auto;
  border-left: 1px solid rgba(160, 137, 102, 0.35);
}

.players {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}

/* Ruled rows, not cards: the swatch beside the name is the seat, and it also
   carries the one number that matters live — the snake's length. */
.player {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  padding: 0.45rem 0.6rem;
}

.player + .player {
  border-top: 1px solid rgba(160, 137, 102, 0.28);
}

.player.dead,
.player.offline {
  opacity: 0.55;
}

.swatch {
  display: grid;
  place-items: center;
  width: 2.1rem;
  height: 2.1rem;
  flex: none;
  border-radius: 8px;
  border: 2px solid;
  font-family: var(--font-display);
  font-size: 0.92rem;
}

.player-body {
  flex: 1 1 auto;
  min-width: 0;
}

.player-head {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  min-width: 0;
}

.player-name {
  font-weight: 600;
  font-size: 0.82rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.badge {
  font-size: 0.6rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 0.05rem 0.28rem;
  border-radius: 4px;
  white-space: nowrap;
  background: rgba(178, 58, 44, 0.16);
  color: var(--vermillion-dark);
}

.badge.away {
  background: rgba(120, 120, 120, 0.2);
  color: var(--ink-soft);
}

/* The numbers read faster in the body face, as in the Samurai panel. */
.player-stats,
.badge {
  font-family: var(--font-body);
}

.player-stats {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  margin-top: 0.1rem;
  white-space: nowrap;
}

.crashed-note {
  margin-left: 0.25rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-size: 0.62rem;
  color: var(--vermillion-dark);
}

/* --- d-pad --------------------------------------------------------------- */
.dpad {
  position: fixed;
  right: 1rem;
  bottom: 1rem;
  z-index: 30;
  display: grid;
  grid-template-areas: '. up .' 'left . right' '. down .';
  gap: 0.3rem;
}

/* Keyboards steer better than buttons; the pad is for screens without one. */
@media (pointer: fine) {
  .dpad {
    display: none;
  }
}

.pad {
  width: 3rem;
  height: 3rem;
  border-radius: 10px;
  border: 1px solid rgba(160, 137, 102, 0.5);
  background: rgba(255, 253, 246, 0.85);
  color: var(--ink);
  font-size: 1.1rem;
  box-shadow: var(--shadow);
}

.pad:active {
  background: rgba(178, 58, 44, 0.16);
}

.pad.up {
  grid-area: up;
}

.pad.down {
  grid-area: down;
}

.pad.left {
  grid-area: left;
}

.pad.right {
  grid-area: right;
}

/* --- overlays ------------------------------------------------------------ */
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
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.6rem;
  margin-top: 0.4rem;
}

/* A label never breaks mid-phrase; a tight card wraps whole buttons instead. */
.over-actions .btn {
  white-space: nowrap;
}

/* Narrow: the seat column drops under the board and the whole table scrolls. */
@media (max-width: 46rem) {
  .table {
    flex-direction: column;
    overflow-y: auto;
  }

  .side {
    width: 100%;
    overflow: visible;
    border-left: 0;
    border-top: 1px solid rgba(160, 137, 102, 0.35);
  }
}
</style>
