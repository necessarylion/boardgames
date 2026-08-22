<script setup lang="ts">
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import GameIcon from '../common/GameIcon.vue'
import LogPanel from '../common/LogPanel.vue'
import TableMenu from '../common/TableMenu.vue'
import { PLAYER_COLOURS } from '@shared/colours'
import { hexRoundedPath } from '@shared/hex'
import { COLOUR_ORDER } from '@shared/colours'
import { PLAYER_BACKGROUNDS } from '@/game/backgrounds'
import { BOARD_SIDE, JUMPS, LAST_SQUARE, isSnake, squareAt, type LastRoll, type Power } from '@shared/ladders'
import { useCountdown } from '@/composables/useCountdown'
import { t } from '@/i18n'
import { useGameStore } from '@/stores/game'

// three.js and the physics only load with this table, not with the app.
const Die3D = defineAsyncComponent(() => import('../common/Die3D.vue'))

const game = useGameStore()

const players = computed(() => game.ldPlayers)
const isOver = computed(() => game.ladders?.phase === 'over')
const last = computed(() => game.ladders?.lastRoll ?? null)
const nameOf = (id: number) => players.value.find((p) => p.id === id)?.name ?? ''

const { label: clockLabel, urgent: clockUrgent } = useCountdown(
  () => game.ladders?.turnMsLeft ?? null,
  () => game.isPaused,
)

const turnLabel = computed(() => {
  if (isOver.value) return t('game.over')
  if (game.isPaused) return t('game.paused.badge')
  if (game.ldIsMyTurn) return last.value?.again && last.value.player === game.you ? t('ladders.again') : t('ladders.turn.yours')
  return t('ladders.turn.other', { name: nameOf(game.ladders?.current ?? 0) })
})

const lastLabel = computed(() => {
  const l = last.value
  if (!l || rolling.value) return ''
  const params = { name: nameOf(l.player), roll: l.roll, to: l.to }
  const rest = l.via[0] ?? l.to
  let text: string
  if (l.from + l.roll > LAST_SQUARE) text = t('ladders.last.bounce', { ...params, to: l.landed })
  else if (rest > l.landed) text = t('ladders.last.ladder', { ...params, to: rest })
  else if (rest < l.landed) text = t('ladders.last.snake', { ...params, to: rest })
  else text = t('ladders.last.moved', { ...params, to: l.landed })
  if (l.power) text += ` · ${t(`ladders.power.${l.power}` as 'ladders.power.sprint')}`
  return text
})

const powerSquares = computed(() =>
  Object.entries(game.ladders?.powers ?? {}).map(([n, power]) => ({ n: Number(n), power })),
)

/** Each power glows its own colour, so a square can be read from across the board. */
const POWER_GLOW: Record<Power, string> = {
  sprint: '#2fa84f', // green — forward
  slip: '#d9432f', // red — back
  again: '#e0a81c', // gold — a gift
  skip: '#6e6e6e', // grey — a turn lost
  carry: '#2f7fd3', // blue — together
  swap: '#8e44ad', // purple — a trade
}

/**
 * Play runs right on even rows and left on odd ones, so the sprint and slip
 * arrows are mirrored there to keep pointing along (or against) the track.
 */
function markTransform(n: number, power: string): string | undefined {
  if ((power !== 'sprint' && power !== 'slip') || squareAt(n).row % 2 === 0) return undefined
  const cx = centre(n)[0] + 0.18
  return `translate(${2 * cx} 0) scale(-1 1)`
}

/** A custom tooltip over a power mark, placed in the board wrap's own coordinates. */
const boardWrap = ref<HTMLElement | null>(null)
const tip = ref<{ x: number; y: number; text: string } | null>(null)
function showTip(event: Event, power: Power) {
  const mark = (event.currentTarget as SVGGElement).getBoundingClientRect()
  const wrap = boardWrap.value?.getBoundingClientRect()
  if (!wrap) return
  tip.value = {
    x: mark.left + mark.width / 2 - wrap.left,
    y: mark.top - wrap.top,
    text: t(`ladders.power.${power}`),
  }
}
const hideTip = () => (tip.value = null)

const winner = computed(() => {
  const w = game.ladders?.result?.winner
  return w === null || w === undefined ? null : nameOf(w)
})

const MEDALS = ['🥇', '🥈', '🥉']
const placeLabel = (n: number) => (n <= 3 ? t(`ladders.place.${n}` as 'ladders.place.1') : t('ladders.place.n', { n }))

// --- geometry ---------------------------------------------------------------

/** Start lane width, left of square 1, where tokens wait before their first throw. */
const LANE = 0.55

/** Centre of square `n` in board units; 0 is the start lane beside square 1. */
function centre(n: number): [number, number] {
  if (n === 0) return [-LANE / 2, BOARD_SIDE - 0.5]
  const { col, row } = squareAt(n)
  return [col + 0.5, BOARD_SIDE - 1 - row + 0.5]
}

const SQUARES = Array.from({ length: LAST_SQUARE }, (_, i) => i + 1)
/** Pastel board tiles — light enough that the dyed-cloth tokens stand off them. */
const TILES = [
  { fill: '#f6c8c2', ink: '#1c1613' }, // red
  { fill: '#fffaf0', ink: '#1c1613' }, // paper
  { fill: '#c9e8c6', ink: '#1c1613' }, // green
  { fill: '#fbeeb0', ink: '#1c1613' }, // yellow
  { fill: '#c6dcf5', ink: '#1c1613' }, // blue
]
const tileOf = (n: number) => TILES[(n + 2 * squareAt(n).row) % TILES.length]

const SNAKE_INKS = ['#5b3a8a', '#2f6b2f', '#a35a1d', '#8a2f6b', '#1f6f86']

interface Snake { from: number; to: number; d: string; head: [number, number]; ink: string }
interface Ladder { from: number; to: number; rails: [string, string]; rungs: string[] }

/** An S-curve from the head down to the tail, bowing out either side of the line. */
const snakes = computed<Snake[]>(() =>
  Object.entries(JUMPS)
    .map(([f, to]) => [Number(f), to] as const)
    .filter(([f]) => isSnake(f))
    .map(([from, to], i) => {
      const [x0, y0] = centre(from)
      const [x1, y1] = centre(to)
      const dx = x1 - x0
      const dy = y1 - y0
      const len = Math.hypot(dx, dy) || 1
      const px = (-dy / len) * 0.8
      const py = (dx / len) * 0.8
      const d = `M ${x0} ${y0} C ${x0 + dx / 3 + px} ${y0 + dy / 3 + py}, ${x0 + (2 * dx) / 3 - px} ${y0 + (2 * dy) / 3 - py}, ${x1} ${y1}`
      return { from, to, d, head: [x0, y0], ink: SNAKE_INKS[i % SNAKE_INKS.length] }
    }),
)

/** Two rails a little apart, with a rung every half square. */
const ladders = computed<Ladder[]>(() =>
  Object.entries(JUMPS)
    .map(([f, to]) => [Number(f), to] as const)
    .filter(([f]) => !isSnake(f))
    .map(([from, to]) => {
      const [x0, y0] = centre(from)
      const [x1, y1] = centre(to)
      const dx = x1 - x0
      const dy = y1 - y0
      const len = Math.hypot(dx, dy) || 1
      const px = (-dy / len) * 0.17
      const py = (dx / len) * 0.17
      const rails: [string, string] = [
        `M ${x0 + px} ${y0 + py} L ${x1 + px} ${y1 + py}`,
        `M ${x0 - px} ${y0 - py} L ${x1 - px} ${y1 - py}`,
      ]
      const rungs: string[] = []
      for (let s = 0.3; s < len - 0.2; s += 0.45) {
        const cx = x0 + (dx * s) / len
        const cy = y0 + (dy * s) / len
        rungs.push(`M ${cx + px} ${cy + py} L ${cx - px} ${cy - py}`)
      }
      return { from, to, rails, rungs }
    }),
)

// --- the throw, replayed --------------------------------------------------

/** How long the die tumbles before it shows the throw. */
const ROLL_MS = 2000
/** Pause between one square and the next as a token walks. */
const STEP_MS = 450

const rolling = ref(false)

/** The face the 3D die shows, and a counter that asks it to throw. */
const dieFace = ref(last.value?.roll ?? 1)
const rollKey = ref(0)
/** Where tokens are drawn while a throw is replayed, by seat; empty between throws. */
const held = ref<Record<number, number>>({})
/** Tokens riding a snake, ladder or power, so their move is drawn slower. */
const jumping = ref(new Set<number>())
const animating = computed(() => rolling.value || Object.keys(held.value).length > 0)

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
/** Bumped per throw, so a newer throw cancels an older replay mid-way. */
let replay = 0

/**
 * The server settles a throw at once; the table replays it: the die tumbles,
 * the token walks one square at a time to where the throw landed, and only then
 * slides or climbs if a snake or ladder starts there.
 */
async function animate(l: LastRoll) {
  const mine = ++replay
  const live = () => mine === replay
  rolling.value = true
  jumping.value = new Set()
  const hold: Record<number, number> = { [l.player]: l.from }
  for (const o of l.others) hold[o.player] = o.from
  held.value = hold
  dieFace.value = l.roll
  rollKey.value++
  await sleep(ROLL_MS)
  if (!live()) return
  rolling.value = false
  // Up to where the throw counts — the top, if it overshoots — then back down.
  const peak = Math.min(LAST_SQUARE, l.from + l.roll)
  const walk: number[] = []
  for (let pos = l.from + 1; pos <= peak; pos++) walk.push(pos)
  for (let pos = peak - 1; pos >= l.landed; pos--) walk.push(pos)
  for (const pos of walk) {
    await sleep(STEP_MS)
    if (!live()) return
    held.value = { ...held.value, [l.player]: pos }
  }
  // Then the snake, ladder or power, one hop per stop.
  const stops = [...l.via, l.to].filter((p, i, all) => p !== (i === 0 ? l.landed : all[i - 1]))
  for (const stop of stops) {
    await sleep(450)
    if (!live()) return
    jumping.value = new Set([l.player])
    held.value = { ...held.value, [l.player]: stop }
    await sleep(800)
  }
  // Friends carried along, or the player swapped with, move last and together.
  if (l.others.length) {
    await sleep(200)
    if (!live()) return
    jumping.value = new Set(l.others.map((o) => o.player))
    const moved = { ...held.value }
    for (const o of l.others) moved[o.player] = o.to
    held.value = moved
    await sleep(800)
  }
  await sleep(STEP_MS)
  if (!live()) return
  held.value = {}
  jumping.value = new Set()
}

// Keyed on the roll count, not the roll itself: every broadcast rebuilds the
// state object, and only a new throw should set the die tumbling. A table
// joined mid-game shows its last throw settled rather than replaying it.
watch(
  () => game.ladders?.turnNumber,
  (n, old) => {
    const l = last.value
    if (!l || n === undefined || old === undefined || n <= old) {
      replay++
      rolling.value = false
      held.value = {}
      dieFace.value = l?.roll ?? 1
      return
    }
    animate(l)
  },
)

// --- tokens -----------------------------------------------------------------

/** Tokens are drawn on a ~0.3 radius; scaled down so eight can share a square. */
const TOKEN_SCALE = 0.66

/** Up to eight tokens share a square, so each seat sits at its own clock position. */
function tokenAt(id: number, pos: number): { transform: string } {
  const shown = held.value[id] ?? pos
  const [cx, cy] = centre(shown)
  const n = players.value.length
  const angle = (id / Math.max(n, 1)) * Math.PI * 2 - Math.PI / 2
  const r = n > 1 ? 0.2 : 0
  // Waiting tokens stack up the start lane, one above the other.
  const x = shown === 0 ? cx : cx + Math.cos(angle) * r
  const y = shown === 0 ? cy - id * 0.55 : cy + Math.sin(angle) * r
  return { transform: `translate(${x}px, ${y}px) scale(${TOKEN_SCALE})` }
}

/**
 * A token is a miniature Samurai player tile: the same rounded hex, the same
 * photographed cloth, the same ink border and pale bevel — so a seat looks the
 * same at every table in the app.
 */
const TOKEN_R = 0.3
const TOKEN_HEX = hexRoundedPath({ x: 0, y: 0 }, TOKEN_R)
const TOKEN_BEVEL = hexRoundedPath({ x: 0, y: 0 }, TOKEN_R * 0.84)
const clothId = (colour: string) => `ladders-cloth-${colour}`

/** The sidebar's seat marker: Samurai's miniature tile, the same path and cloth at panel scale. */
const SWATCH = { r: 9.2, x: 8.66, y: 10 }
const swatchHex = hexRoundedPath(SWATCH, SWATCH.r * 0.97)
const swatchBevel = hexRoundedPath(SWATCH, SWATCH.r * 0.875)
const seatClothId = (colour: string) => `ladders-seat-cloth-${colour}`

</script>

<template>
  <div class="game">
    <header class="topbar">
      <div class="turn">
        <strong>{{ turnLabel }}</strong>
        <span
          v-if="clockLabel !== null && !isOver"
          class="clock"
          :class="{ urgent: clockUrgent, mine: game.ldIsMyTurn }"
          >{{ clockLabel }}</span
        >
      </div>
      <div class="top-actions">
        <span class="tiny muted code">{{ t('game.room', { code: game.ladders?.code ?? '' }) }}</span>
        <button v-if="game.isSeated && !isOver" class="btn ghost small" @click="game.togglePause()">
          {{ game.isPaused ? t('game.resume') : t('game.pause') }}
        </button>
        <TableMenu />
      </div>
    </header>

    <main class="table">
      <aside class="side">
        <ul class="players">
          <li
            v-for="p in players"
            :key="p.id"
            class="player"
            :class="{ current: p.id === game.ladders?.current && !isOver, offline: !p.connected, done: !!p.place }"
            :style="{ '--seat': PLAYER_COLOURS[p.colour].ink }"
          >
            <svg class="swatch" viewBox="0 0 17.32 20" aria-hidden="true">
              <defs>
                <pattern :id="seatClothId(p.colour)" patternUnits="userSpaceOnUse" width="17.32" height="20">
                  <rect width="17.32" height="20" :fill="PLAYER_COLOURS[p.colour].fill" />
                  <image :href="PLAYER_BACKGROUNDS[p.colour]" width="17.32" height="20" preserveAspectRatio="xMidYMid slice" />
                </pattern>
              </defs>
              <path
                :d="swatchHex"
                :fill="`url(#${seatClothId(p.colour)})`"
                :stroke="PLAYER_COLOURS[p.colour].ink"
                stroke-width="0.83"
                stroke-linejoin="round"
              />
              <path :d="swatchBevel" fill="none" stroke="#fffaf0" stroke-opacity="0.45" stroke-width="0.46" stroke-linejoin="round" />
              <text
                x="8.66"
                y="12.6"
                :font-size="p.place ? 8 : 7"
                font-weight="700"
                text-anchor="middle"
                :fill="PLAYER_COLOURS[p.colour].text"
                style="font-family: var(--font-display)"
              >
                {{ p.place ? MEDALS[p.place - 1] ?? p.place : p.pos }}
              </text>
            </svg>
            <div class="player-body">
              <div class="player-head">
                <span class="player-name">{{ p.name }}</span>
                <span v-if="p.skip" class="badge">{{ t('ladders.skipping') }}</span>
                <span v-if="p.id === game.you" class="badge">{{ t('lobby.badge.you') }}</span>
                <span v-if="!p.connected" class="badge away">{{ t('lobby.badge.away') }}</span>
              </div>
              <div class="player-stats tiny muted">
                <span v-if="p.place" class="place">{{ placeLabel(p.place) }}</span>
                <span v-else>{{ p.pos === 0 ? t('ladders.start') : t('ladders.square', { n: p.pos }) }}</span>
                <span>·</span>
                <span>{{ t('ladders.rolls', { n: p.rolls }) }}</span>
              </div>
            </div>
          </li>
        </ul>
        <LogPanel
          class="log"
          :entries="game.ladders?.log ?? []"
          :players="players"
          :mark-of="(n: number) => t('ladders.logMark', { n })"
        />
      </aside>

      <div ref="boardWrap" class="board-wrap">
        <svg class="board" :viewBox="`${-LANE} 0 ${BOARD_SIDE + LANE} ${BOARD_SIDE}`">
          <defs>
            <!-- One cloth per colour, the photograph Samurai's tiles wear, under
                 a flat fill so a tile still has its colour before the image loads. -->
            <pattern
              v-for="c in COLOUR_ORDER"
              :id="clothId(c)"
              :key="c"
              patternUnits="userSpaceOnUse"
              :width="TOKEN_R * 2"
              :height="TOKEN_R * 2"
            >
              <rect :width="TOKEN_R * 2" :height="TOKEN_R * 2" :fill="PLAYER_COLOURS[c].fill" />
              <image
                :href="PLAYER_BACKGROUNDS[c]"
                :width="TOKEN_R * 2"
                :height="TOKEN_R * 2"
                preserveAspectRatio="xMidYMid slice"
              />
            </pattern>
          </defs>
          <!-- The start lane: a paper margin left of square 1, not a dark gap. -->
          <rect :x="-LANE" y="0" :width="LANE" :height="BOARD_SIDE" class="lane" />

          <!-- The track -->
          <g v-for="n in SQUARES" :key="n">
            <rect
              :x="centre(n)[0] - 0.5"
              :y="centre(n)[1] - 0.5"
              width="1"
              height="1"
              :fill="n === LAST_SQUARE ? '#f6c8c2' : tileOf(n).fill"
              stroke="#1c1613"
              stroke-width="0.03"
            />
            <text
              :x="centre(n)[0] - 0.42"
              :y="centre(n)[1] - 0.24"
              :fill="tileOf(n).ink"
              class="num"
            >
              {{ n }}
            </text>
            <!-- The finish flies the chequered flag. -->
            <text v-if="n === LAST_SQUARE" :x="centre(n)[0] + 0.08" :y="centre(n)[1] + 0.2" class="flag">🏁</text>
          </g>

          <!-- Power squares carry their mark on a small paper disc. -->
          <g
            v-for="q in powerSquares"
            :key="`p${q.n}`"
            class="power"
            :style="{ '--glow': POWER_GLOW[q.power] }"
            @pointerenter="showTip($event, q.power)"
            @pointerleave="hideTip"
            @click="showTip($event, q.power)"
          >
            <!-- A soft pulsing halo, so the squares read as charged. -->
            <circle class="halo" :cx="centre(q.n)[0] + 0.18" :cy="centre(q.n)[1] + 0.2" r="0.3" />
            <circle class="disc" :cx="centre(q.n)[0] + 0.18" :cy="centre(q.n)[1] + 0.2" r="0.19" />
            <g :transform="markTransform(q.n, q.power)">
              <GameIcon inline :name="`ladders.${q.power}`" :x="centre(q.n)[0] + 0.18" :y="centre(q.n)[1] + 0.2" :size="0.27" />
            </g>
          </g>

          <!-- Ladders -->
          <g v-for="l in ladders" :key="`l${l.from}`" class="ladder">
            <path v-for="(r, i) in l.rails" :key="i" :d="r" class="rail" />
            <path v-for="(r, i) in l.rungs" :key="`r${i}`" :d="r" class="rung" />
          </g>

          <!-- Snakes -->
          <g v-for="s in snakes" :key="`s${s.from}`" class="snake">
            <path :d="s.d" :stroke="s.ink" class="body" />
            <path :d="s.d" class="pattern" />
            <circle :cx="s.head[0]" :cy="s.head[1]" r="0.18" :fill="s.ink" />
            <circle :cx="s.head[0] - 0.07" :cy="s.head[1] - 0.06" r="0.04" fill="#fff" />
            <circle :cx="s.head[0] + 0.07" :cy="s.head[1] - 0.06" r="0.04" fill="#fff" />
          </g>

          <!-- Tokens -->
          <g
            v-for="p in players"
            :key="p.id"
            class="token"
            :class="{ current: p.id === game.ladders?.current && !isOver, jumping: jumping.has(p.id) }"
            :style="tokenAt(p.id, p.pos)"
          >
            <!-- A tile with some depth: a contact shadow, a darker extruded
                 base, then the cloth face with its ink border and pale bevel. -->
            <ellipse class="shadow" cx="0.03" cy="0.14" rx="0.32" ry="0.14" />
            <path :d="TOKEN_HEX" :fill="PLAYER_COLOURS[p.colour].ink" transform="translate(0 0.09)" />
            <path
              class="face"
              :d="TOKEN_HEX"
              :fill="`url(#${clothId(p.colour)})`"
              :stroke="PLAYER_COLOURS[p.colour].ink"
            />
            <path :d="TOKEN_BEVEL" fill="none" stroke="#fffaf0" stroke-opacity="0.45" stroke-width="0.02" />
          </g>
        </svg>
        <div v-if="tip" class="tip" :style="{ left: `${tip.x}px`, top: `${tip.y}px` }">{{ tip.text }}</div>
      </div>

      <aside class="tray-side">
        <!-- The dice tray -->
        <div class="tray">
          <Die3D :face="dieFace" :roll-key="rollKey" :duration-ms="ROLL_MS" :size="170" />
          <!-- Held while a throw replays, so the next one is not thrown over it. -->
          <button class="btn wide roll" :disabled="!game.canRoll || animating" @click="game.rollDie()">
            {{ t('ladders.roll') }}
          </button>
          <p class="last-roll tiny muted">{{ lastLabel }}</p>
        </div>
      </aside>
    </main>

    <div v-if="isOver" class="over-veil">
      <div class="over-card panel">
        <h2>{{ t('ladders.winner', { name: winner ?? '' }) }}</h2>
        <ol class="standings">
          <li v-for="(id, i) in game.ladders?.result?.standings ?? []" :key="id">
            <span class="medal">{{ MEDALS[i] ?? `${i + 1}.` }}</span>
            <span>{{ nameOf(id) }}</span>
            <span class="tiny muted">{{ placeLabel(i + 1) }}</span>
          </li>
        </ol>
        <div class="over-actions">
          <button v-if="game.isHost" class="btn" @click="game.rematch()">{{ t('over.playAgain') }}</button>
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
  align-items: center;
  gap: 0.55rem;
}

.turn strong {
  font-family: var(--font-display);
  font-size: 1.15rem;
}

.clock {
  padding: 0.1rem 0.4rem;
  border-radius: 5px;
  border: 1px solid rgba(160, 137, 102, 0.4);
  font-variant-numeric: tabular-nums;
  font-size: 0.85rem;
}

.clock.mine {
  border-color: var(--vermillion);
  color: var(--vermillion-dark);
}

.clock.urgent.mine {
  background: rgba(178, 58, 44, 0.16);
  font-weight: 700;
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
  display: flex;
  align-items: stretch;
}

.board-wrap {
  position: relative;
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.5rem;
}

/* The board takes the whole height under the top bar; its width follows from
   the viewBox, and on a narrow screen the width clamps it instead. */
.board {
  display: block;
  height: 100%;
  max-width: 100%;
  border: 2px solid #1c1613;
  border-radius: 6px;
  background: #1c1613;
  box-shadow: var(--shadow);
}

.lane {
  fill: #efe6d4;
}

.num {
  font-family: var(--font-display);
  font-size: 0.22px;
  font-weight: 400;
  opacity: 0.85;
}

.flag {
  font-size: 0.5px;
  text-anchor: middle;
  dominant-baseline: central;
}

.power {
  color: #1c1613;
  cursor: help;
}

.power .disc {
  fill: rgba(255, 250, 240, 0.92);
  stroke: var(--glow);
  stroke-width: 0.035;
  filter: drop-shadow(0 0 0.03px var(--glow));
}

.power .halo {
  fill: var(--glow);
  transform-box: fill-box;
  transform-origin: center;
  animation: glow 1.8s ease-in-out infinite;
}

@keyframes glow {
  0%,
  100% {
    opacity: 0.08;
    transform: scale(0.9);
  }
  50% {
    opacity: 0.26;
    transform: scale(1.05);
  }
}

@media (prefers-reduced-motion: reduce) {
  .power .halo {
    animation: none;
    opacity: 0.18;
  }
}

.ladder .rail {
  stroke: #2b2118;
  stroke-width: 0.08;
  stroke-linecap: round;
  fill: none;
}

.ladder .rung {
  stroke: #2b2118;
  stroke-width: 0.06;
  stroke-linecap: round;
  fill: none;
}

.snake .body {
  fill: none;
  stroke-width: 0.17;
  stroke-linecap: round;
}

.snake .pattern {
  fill: none;
  stroke: rgba(255, 255, 255, 0.55);
  stroke-width: 0.05;
  stroke-dasharray: 0.14 0.14;
  stroke-linecap: round;
}

.token {
  transition: transform 0.32s ease;
}

.token.jumping {
  transition: transform 0.75s ease-in-out;
}

.token path {
  stroke-width: 0.035;
  stroke-linejoin: round;
}

.token .shadow {
  fill: rgba(0, 0, 0, 0.35);
  filter: blur(0.04px);
}

/* The same tile as the sidebar's seat marker: ink border, pale bevel, and the
   seat on turn pulsing the same warm glow. */
.token .face {
  stroke-width: 0.035;
}

.token.current {
  animation: token-glow 1.6s ease-in-out infinite;
}

@keyframes token-glow {
  0%,
  100% {
    filter: drop-shadow(0 0 0.02px rgba(178, 58, 44, 0.25));
  }
  50% {
    filter: drop-shadow(0 0 0.14px rgba(178, 58, 44, 0.95));
  }
}

@media (prefers-reduced-motion: reduce) {
  .token.current {
    animation: none;
    filter: drop-shadow(0 0 0.08px rgba(178, 58, 44, 0.8));
  }
}

/* --- the dice tray, in its own column on the right ----------------------- */
.tray-side {
  flex: none;
  width: 13rem;
  min-height: 0;
  border-left: 1px solid rgba(160, 137, 102, 0.35);
}

.tray {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.6rem;
  padding: 1.2rem 0.9rem 0.8rem;
}

/* The power tooltip: a dark pill just above the mark, arrow and all. */
.tip {
  position: absolute;
  z-index: 5;
  transform: translate(-50%, calc(-100% - 8px));
  padding: 0.35rem 0.65rem;
  border-radius: 7px;
  background: #3a2b1c;
  color: #f7efe2;
  font-size: 0.8rem;
  white-space: nowrap;
  pointer-events: none;
  box-shadow: var(--shadow-lg);
}

.tip::after {
  content: '';
  position: absolute;
  left: 50%;
  top: 100%;
  transform: translateX(-50%);
  border: 6px solid transparent;
  border-top-color: #3a2b1c;
}

.last-roll {
  margin: 0;
  min-height: 1.2em;
  text-align: center;
  line-height: 1.4;
}

.roll {
  font-family: var(--font-display);
}

/* --- the left column: dice, seats, log ----------------------------------- */
.side {
  flex: none;
  width: 15rem;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border-right: 1px solid rgba(160, 137, 102, 0.35);
}

.players {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  flex: none;
}

/* Ruled rows after Samurai's player panel: the tile beside the name is the
   seat, the row itself carries no colour; the seat on turn gets a wash and a
   pulsing tile. */
.player {
  --swatch-w: 2.35rem;
  display: flex;
  align-items: center;
  gap: 0.55rem;
  padding: 0.3rem 0.5rem;
}

.player + .player {
  border-top: 1px solid rgba(160, 137, 102, 0.28);
}

.player.current {
  background: rgba(246, 223, 180, 0.6);
}

.player.current .swatch {
  animation: seat-glow 1.6s ease-in-out infinite;
}

@keyframes seat-glow {
  0%,
  100% {
    filter: drop-shadow(0 0 1px rgba(178, 58, 44, 0.25));
  }
  50% {
    filter: drop-shadow(0 0 5px rgba(178, 58, 44, 0.9));
  }
}

.player.offline {
  opacity: 0.55;
}

.swatch {
  width: var(--swatch-w);
  aspect-ratio: 17.32 / 20;
  flex: none;
  overflow: visible;
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

.log {
  flex: 1 1 auto;
  min-height: 0;
  border-top: 1px solid rgba(160, 137, 102, 0.35);
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

.standings {
  list-style: none;
  margin: 0.2rem 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  min-width: 14rem;
  text-align: left;
}

.standings li {
  display: grid;
  grid-template-columns: 1.6rem 1fr auto;
  align-items: center;
  gap: 0.5rem;
}

.medal {
  text-align: center;
}

.place {
  color: var(--vermillion-dark);
  font-weight: 600;
}

.over-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.6rem;
  margin-top: 0.4rem;
}

.over-actions .btn {
  white-space: nowrap;
}

/* Narrow: the board comes first at full width, and the column drops under it. */
@media (max-width: 46rem) {
  .table {
    flex-direction: column;
    overflow-y: auto;
  }

  .board-wrap {
    order: -1;
    flex: none;
  }

  .board {
    width: 100%;
    height: auto;
  }

  .side,
  .tray-side {
    width: 100%;
    border-right: 0;
    border-left: 0;
    border-top: 1px solid rgba(160, 137, 102, 0.35);
  }

  /* Board, then the die, then the seats. */
  .tray-side {
    order: 0;
  }

  .side {
    order: 1;
  }

  .log {
    max-height: 16rem;
  }
}
</style>
