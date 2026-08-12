<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import CarnivalCard from './CarnivalCard.vue'
import CarnivalRulesDialog from './CarnivalRulesDialog.vue'
import TableMenu from '../common/TableMenu.vue'
import { HAND_CARDS } from '@shared/carnivals'
import { PLAYER_COLOURS } from '@shared/colours'
import { useCountdown } from '@/composables/useCountdown'
import { t } from '@/i18n'
import { useGameStore } from '@/stores/game'

const game = useGameStore()
const showRules = ref(false)
/** The play log, floated bottom-left; folds down to its header on request. */
const logOpen = ref(true)

const players = computed(() => game.carnivalPlayers)
const nameOf = (id: number | null) =>
  id === null ? '' : (players.value.find((p) => p.id === id)?.name ?? '')

const isOver = computed(() => game.carnival?.phase === 'over')
const step = computed(() => game.carnivalStep)
const can = computed(() => game.carnivalCan)
const pot = computed(() => game.carnivalPot)
const currentBet = computed(() => game.carnival?.currentBet ?? 0)
const result = computed(() => game.carnivalResult)

const money = (n: number) => t('carnival.money', { n })

const resolved = computed(() => result.value !== null)

const turnLabel = computed(() => {
  if (isOver.value) return t('game.over')
  if (game.isPaused) return t('game.paused.badge')
  if (step.value === 'selecting') return t('carnival.selecting')
  if (step.value === 'showdown') return resolved.value ? t('carnival.showdown.title') : t('carnival.revealing')
  if (game.carnivalIsMyTurn) return t('carnival.yourTurn')
  const active = game.carnivalActivePlayer
  return active ? t('carnival.playerTurn', { name: active.name }) : t('game.noTurn')
})

/** Whether the clock is running on this viewer, so it can be shown loudly. */
const onClock = computed(() => {
  const c = can.value
  if (!c) return false
  return c.select || c.check || c.call || c.fold || c.reveal || c.nextHand
})

/** Face-down positions to pick from in the selecting step — a full suit each. */
const handSlots = Array.from({ length: HAND_CARDS }, (_, i) => i)
const canConfirmSelect = computed(
  () => game.carnivalPickRed !== null && game.carnivalPickBlue !== null,
)

const { label: clockLabel, urgent: clockUrgent } = useCountdown(
  () => game.carnival?.turnMsLeft ?? null,
  () => game.isPaused,
)

/** The last thing that happened, narrated for the whole table. */
const eventText = computed(() => {
  const e = game.carnival?.lastEvent ?? null
  if (!e) return ''
  switch (e.kind) {
    case 'deal':
      return t('carnival.event.deal', { hand: e.hand })
    case 'select':
      return t('carnival.event.select', { name: nameOf(e.player) })
    case 'reveal':
      return t('carnival.event.reveal', { name: nameOf(e.player) })
    case 'check':
      return t('carnival.event.check', { name: nameOf(e.player) })
    case 'call':
      return t('carnival.event.call', { name: nameOf(e.player), amount: e.amount })
    case 'raise':
      return t('carnival.event.raise', { name: nameOf(e.player), to: e.to })
    case 'allIn':
      return t('carnival.event.allIn', { name: nameOf(e.player), amount: e.amount })
    case 'fold':
      return t('carnival.event.fold', { name: nameOf(e.player) })
    case 'showdown':
      return t('carnival.event.showdown', { pot: e.pot })
    case 'out':
      return t('carnival.event.out', { name: nameOf(e.player) })
  }
  return ''
})

/** The winner of the whole game, once it is over. */
const winner = computed(() => {
  const w = game.carnival?.result?.winner
  return w === null || w === undefined ? null : nameOf(w)
})

/**
 * The two cards for one seat, as the server has redacted them. A null value is a
 * card this viewer may not see; whether it is the seat's own blind blue or an
 * opponent's private red decides how the back is drawn.
 */
function cardsFor(p: (typeof players.value)[number]) {
  const isYou = p.id === game.you
  return {
    red: { value: p.red, facedown: isYou ? null : ('theirs' as const) },
    blue: { value: p.blue, facedown: isYou ? ('mine' as const) : ('theirs' as const) },
  }
}

const winnerIds = computed(() => new Set(result.value?.winners ?? []))

// --- the ring ----------------------------------------------------------------
/**
 * Seats in play order, rotated so the local player sits at the bottom of the
 * ring. Only where each seat is drawn changes — turn order is untouched — which
 * is what makes the table read the same way to everyone sitting at it.
 */
const seatOrder = computed(() => {
  const list = players.value
  const me = game.you
  if (me === null) return list
  const i = list.findIndex((p) => p.id === me)
  return i < 0 ? list : [...list.slice(i), ...list.slice(0, i)]
})

// Reserved seat box, sized for the largest seat, so the clearance works for all.
const SEAT_W = 208
const SEAT_H = 176
const EDGE = 10

const ringEl = ref<HTMLElement | null>(null)
const ringW = ref(0)
const ringH = ref(0)

let observer: ResizeObserver | null = null
watch(ringEl, (el) => {
  observer?.disconnect()
  if (!el || typeof ResizeObserver === 'undefined') return
  ringW.value = el.clientWidth
  ringH.value = el.clientHeight
  observer = new ResizeObserver(([entry]) => {
    ringW.value = entry.contentRect.width
    ringH.value = entry.contentRect.height
  })
  observer.observe(el)
})
onUnmounted(() => observer?.disconnect())

/** Whether there is room to lay the seats round a ring at all, else they stack. */
const isRing = computed(
  () => ringW.value >= SEAT_W * 2.4 && ringH.value >= SEAT_H * 2.1 && seatOrder.value.length > 1,
)

/**
 * Place a seat on the ring. Angles start at the bottom and run clockwise, so the
 * local player sits at the foot of the table and play moves round it. The two
 * radii differ because a seat is wider than it is tall, so it needs more room
 * from the side edges than from the top and bottom.
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

// --- the raise control -------------------------------------------------------
const raiseTo = computed({
  get: () => game.carnivalRaiseTo,
  set: (v: number) => (game.carnivalRaiseTo = v),
})

/** Log, newest last, with seat tokens swapped for names. */
const logLines = computed(() =>
  (game.carnival?.log ?? []).map((entry, i) => ({
    key: `${i}:${entry.turn}`,
    who: entry.player === null ? null : nameOf(entry.player),
    colour: players.value.find((p) => p.id === entry.player)?.colour ?? null,
    text: entry.text.replace(/#(\d+)/g, (whole, id: string) => nameOf(Number(id)) || whole),
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
</script>

<template>
  <div class="game">
    <header class="topbar">
      <div class="turn">
        <strong>{{ turnLabel }}</strong>
        <span
          v-if="clockLabel !== null && !isOver"
          class="clock"
          :class="{ urgent: clockUrgent, mine: onClock }"
          :title="t('game.timeLeft')"
          >{{ clockLabel }}</span
        >
        <span v-if="game.isPaused" class="paused-badge tiny">{{ t('game.paused.badge') }}</span>
        <span class="tiny muted">{{ t('carnival.handNo', { hand: game.carnival?.turnNumber ?? 0 }) }}</span>
      </div>
      <div class="top-actions">
        <span class="tiny muted code">{{ t('game.room', { code: game.carnival?.code ?? '' }) }}</span>
        <button class="btn ghost small" @click="showRules = true">{{ t('carnival.rules.open') }}</button>
        <button v-if="game.isSeated && !isOver" class="btn ghost small" @click="game.togglePause()">
          {{ game.isPaused ? t('game.resume') : t('game.pause') }}
        </button>
        <TableMenu />
      </div>
    </header>

    <main class="table">
      <div ref="ringEl" class="ring" :class="{ stacked: !isRing }">
        <!-- The pot, in the middle of the table. -->
        <div class="pot">
          <span class="pot-label tiny">{{ t('carnival.pot') }}</span>
          <span class="pot-amount">{{ money(pot) }}</span>
          <span v-if="currentBet > 0" class="tiny muted">{{ t('carnival.currentBet', { n: currentBet }) }}</span>
        </div>

        <div
          v-for="(p, i) in seatOrder"
          :key="p.id"
          class="seat"
          :class="{
            active: p.id === game.carnival?.current && step === 'betting' && !isOver,
            me: p.id === game.you,
            folded: p.folded,
            out: p.out,
            won: step === 'showdown' && winnerIds.has(p.id),
          }"
          :style="{ '--seat': PLAYER_COLOURS[p.colour].ink, ...seatStyle(i, seatOrder.length) }"
        >
          <div class="seat-head">
            <span class="dot" :style="{ background: PLAYER_COLOURS[p.colour].ink }" />
            <span class="pname">{{ p.name }}</span>
            <span v-if="p.id === game.you" class="tag you">{{ t('lobby.badge.you') }}</span>
            <span v-if="p.out" class="tag out-tag">{{ t('carnival.out') }}</span>
            <span v-else-if="p.folded" class="tag">{{ t('carnival.folded') }}</span>
            <span v-else-if="step === 'selecting'" class="tag" :class="{ waiting: !p.selected }">
              {{ p.selected ? t('carnival.ready') : t('carnival.picking') }}
            </span>
            <span
              v-else-if="step === 'showdown' && !resolved"
              class="tag"
              :class="{ waiting: !p.revealed }"
            >
              {{ p.revealed ? t('carnival.shown') : t('carnival.hidden') }}
            </span>
            <span
              v-if="!p.out && !p.folded && p.carnivals === 0 && step !== 'selecting'"
              class="tag allin-tag"
            >
              {{ t('carnival.allInTag') }}
            </span>
          </div>

          <div class="cards">
            <CarnivalCard
              colour="red"
              :value="cardsFor(p).red.value"
              :facedown="cardsFor(p).red.facedown"
              :dim="p.folded"
              :win="step === 'showdown' && winnerIds.has(p.id)"
              size="small"
            />
            <CarnivalCard
              colour="blue"
              :value="cardsFor(p).blue.value"
              :facedown="cardsFor(p).blue.facedown"
              :dim="p.folded"
              :win="step === 'showdown' && winnerIds.has(p.id)"
              size="small"
            />
          </div>

          <div class="money-row">
            <span class="bank">{{ money(p.carnivals) }}</span>
            <span v-if="p.committed > 0 && step === 'betting'" class="bet tiny">
              {{ t('carnival.inPot', { n: p.committed }) }}
            </span>
          </div>
        </div>
      </div>

      <!-- The play log, floated in the bottom-left corner and folded away to its
           header on request, so it never sits on top of a seat for long. -->
      <aside class="log panel" :class="{ folded: !logOpen }">
        <button class="log-head" type="button" @click="logOpen = !logOpen">
          <span>{{ t('carnival.log.title') }}</span>
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

    <!-- The controls: betting when it is your turn, and dealing on between hands. -->
    <footer v-if="game.isSeated && !isOver" class="controls">
      <Transition name="flash">
        <p v-if="eventText" :key="eventText" class="event tiny">{{ eventText }}</p>
      </Transition>

      <div v-if="step === 'betting' && game.carnivalIsMyTurn && can" class="bet-controls">
        <button v-if="can.check" class="btn" @click="game.carnivalCheck()">
          {{ t('carnival.check') }}
        </button>
        <button v-if="can.call" class="btn" @click="game.carnivalCall()">
          {{ t('carnival.call', { n: can.callAmount }) }}
        </button>
        <button v-if="can.allIn" class="btn allin-btn" @click="game.carnivalAllIn()">
          {{ t('carnival.allIn', { n: can.allInAmount }) }}
        </button>
        <button class="btn ghost" @click="game.carnivalFold()">{{ t('carnival.fold') }}</button>

        <div v-if="can.raise" class="raise">
          <input
            v-model.number="raiseTo"
            class="slider"
            type="range"
            :min="can.minRaiseTo"
            :max="can.maxRaiseTo"
            :step="game.carnival?.minRaise || 1"
          />
          <button class="btn" @click="game.carnivalRaise()">
            {{ t('carnival.raiseTo', { n: raiseTo }) }}
          </button>
        </div>
      </div>

      <!-- Showdown: turn your own hand over, or wait for those still to show. -->
      <div v-else-if="step === 'showdown' && !resolved" class="between">
        <button v-if="can?.reveal" class="btn" @click="game.carnivalReveal()">
          {{ t('carnival.reveal') }}
        </button>
        <p v-else class="tiny muted">{{ t('carnival.reveal.waiting') }}</p>
      </div>

      <div v-else-if="step === 'showdown' && resolved" class="between">
        <p class="tiny muted">{{ t('carnival.showdown.done') }}</p>
        <button v-if="can?.nextHand" class="btn" @click="game.carnivalNext()">
          {{ t('carnival.nextHand') }}
        </button>
      </div>

      <p v-else-if="step === 'selecting'" class="tiny muted waiting">
        {{ can?.select ? t('carnival.pickPrompt') : t('carnival.pickWaiting') }}
      </p>

      <p v-else class="tiny muted waiting">
        {{ t('carnival.waitingOn', { name: game.carnivalActivePlayer?.name ?? '' }) }}
      </p>
    </footer>

    <CarnivalRulesDialog v-if="showRules" @close="showRules = false" />

    <!-- Pick your two cards, blind: choose one of each colour, then confirm. -->
    <div v-if="can?.select" class="over-veil">
      <div class="over-card panel wide-card">
        <h2>{{ t('carnival.pick.title') }}</h2>
        <p class="tiny muted">{{ t('carnival.pick.hint') }}</p>

        <div class="pick-row">
          <span class="pick-label tiny">{{ t('carnival.pick.red') }}</span>
          <div class="pick-cards">
            <button
              v-for="i in handSlots"
              :key="`r${i}`"
              type="button"
              class="pick-card"
              :class="{ chosen: game.carnivalPickRed === i }"
              @click="game.carnivalPick('red', i)"
            >
              <CarnivalCard colour="red" facedown="theirs" size="small" />
            </button>
          </div>
        </div>

        <div class="pick-row">
          <span class="pick-label tiny">{{ t('carnival.pick.blue') }}</span>
          <div class="pick-cards">
            <button
              v-for="i in handSlots"
              :key="`b${i}`"
              type="button"
              class="pick-card"
              :class="{ chosen: game.carnivalPickBlue === i }"
              @click="game.carnivalPick('blue', i)"
            >
              <CarnivalCard colour="blue" facedown="theirs" size="small" />
            </button>
          </div>
        </div>

        <button class="btn" :disabled="!canConfirmSelect" @click="game.carnivalConfirmSelect()">
          {{ t('carnival.pick.confirm') }}
        </button>
      </div>
    </div>

    <!-- The showdown result, over the table. -->
    <div v-if="resolved && result" class="over-veil soft">
      <div class="over-card panel">
        <h2>{{ t('carnival.showdown.title') }}</h2>
        <p class="tiny muted">
          {{
            result.winners.length === 0
              ? t('carnival.showdown.checked')
              : result.byFold
                ? t('carnival.showdown.fold', { name: nameOf(result.winners[0]), pot: result.pot })
                : result.winners.length > 1
                  ? t('carnival.showdown.split', {
                      names: result.winners.map((id) => nameOf(id)).join(', '),
                      pot: result.pot,
                    })
                  : t('carnival.showdown.won', { name: nameOf(result.winners[0]), pot: result.pot })
          }}
        </p>
        <ul v-if="result.reveals.length" class="reveals">
          <li
            v-for="r in result.reveals"
            :key="r.player"
            class="reveal"
            :class="{ win: winnerIds.has(r.player) }"
          >
            <span class="rname">{{ nameOf(r.player) }}</span>
            <span class="rcards">
              <CarnivalCard colour="red" :value="r.red" size="small" />
              <CarnivalCard colour="blue" :value="r.blue" size="small" />
            </span>
            <span class="rtotal">
              {{ r.total }}
              <span v-if="result.shares[r.player]" class="won tiny">
                +{{ result.shares[r.player] }}
              </span>
            </span>
          </li>
        </ul>
        <button v-if="can?.nextHand" class="btn" @click="game.carnivalNext()">
          {{ t('carnival.nextHand') }}
        </button>
      </div>
    </div>

    <!-- Game over -->
    <div v-if="isOver" class="over-veil">
      <div class="over-card panel">
        <h2>{{ winner ? t('carnival.winner', { name: winner }) : t('carnival.draw') }}</h2>
        <p class="tiny muted">{{ game.carnival?.result?.reason }}</p>
        <div class="over-actions">
          <button v-if="game.isHost" class="btn" @click="game.rematch()">
            {{ t('over.playAgain') }}
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
  min-height: 0;
  background:
    radial-gradient(120% 90% at 50% 0%, rgba(255, 252, 245, 0.9), transparent 55%),
    linear-gradient(160deg, #f3e2c8, #e6cfa6);
  color: var(--ink);
}

.topbar {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
  padding: 0.6rem 1rem;
  border-bottom: 2px solid var(--gold-line);
  background: linear-gradient(180deg, rgba(255, 250, 240, 0.95), rgba(243, 226, 200, 0.9));
}

.turn {
  display: flex;
  align-items: baseline;
  gap: 0.6rem;
  flex-wrap: wrap;
}

.paused-badge {
  padding: 0.1rem 0.4rem;
  border-radius: 4px;
  background: rgba(150, 128, 94, 0.22);
  color: var(--ink-soft);
}

.clock {
  padding: 0.1rem 0.4rem;
  border-radius: 5px;
  border: 1px solid rgba(160, 137, 102, 0.4);
  color: var(--ink-soft);
  font-family: var(--font-display);
  font-size: 0.85rem;
  font-variant-numeric: tabular-nums;
}

.clock.mine {
  color: var(--ink);
  border-color: rgba(122, 100, 70, 0.6);
}

.clock.urgent.mine {
  color: var(--vermillion-dark);
  border-color: var(--vermillion);
  background: rgba(178, 58, 44, 0.1);
}

.top-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.code {
  letter-spacing: 0.16em;
}

/* The table fills the window under the topbar and above the controls; the ring
   grows into whatever is left, so a bigger screen is a bigger table. */
.table {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 0.75rem 1rem;
  width: 100%;
}

/* Seats are laid round an ellipse by the inline left/top the script computes;
   the ring only has to give them a box with a middle to sit around. */
.ring {
  position: relative;
  flex: 1 1 auto;
  width: 100%;
  min-height: 0;
}

/* Too small for a ring: seats become a wrapped row and the pot leads. */
.ring.stacked {
  display: flex;
  flex-wrap: wrap;
  align-content: flex-start;
  justify-content: center;
  gap: 0.6rem;
  overflow-y: auto;
}

.ring.stacked .seat,
.ring.stacked .pot {
  position: static;
  transform: none;
}

.ring.stacked .pot {
  order: -1;
  flex-basis: 100%;
  width: max-content;
  margin: 0 auto 0.3rem;
}

.ring.stacked .seat {
  width: 11rem;
}

/* Centred on the table, with the seats arranged around it. */
.pot {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.15rem;
  padding: 0.8rem 1.9rem;
  border-radius: 16px;
  border: 2px solid var(--gold-line);
  background: linear-gradient(170deg, rgba(255, 252, 242, 0.97), rgba(246, 231, 193, 0.94));
  box-shadow: var(--shadow-lg);
}

.pot-label {
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--ink-faint);
}

.pot-amount {
  font-family: var(--font-display);
  font-size: 1.9rem;
  line-height: 1;
  color: var(--vermillion-dark);
  font-variant-numeric: tabular-nums;
}

.seat {
  position: absolute;
  transform: translate(-50%, -50%);
  z-index: 2;
  /* Matches SEAT_W in the script, less its clearance — wide enough for the two
     cards and the name without crowding the middle. */
  width: 11.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  padding: 0.6rem 0.7rem;
  border-radius: 12px;
  border: 2px solid var(--seat);
  background: linear-gradient(170deg, rgba(255, 252, 242, 0.96), rgba(246, 231, 193, 0.9));
  box-shadow: var(--shadow);
}

.seat.active {
  box-shadow: 0 0 0 3px rgba(212, 160, 23, 0.45), var(--shadow-lg);
}

.seat.me {
  background: var(--paper-2, rgba(255, 253, 247, 0.98));
}

.seat.folded {
  opacity: 0.6;
}

.seat.out {
  opacity: 0.4;
}

.seat.won {
  border-color: var(--gold-line);
  box-shadow: 0 0 0 3px rgba(212, 160, 23, 0.6), var(--shadow-lg);
}

.seat-head {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex-wrap: wrap;
}

.dot {
  width: 0.7rem;
  height: 0.7rem;
  border-radius: 50%;
  flex: none;
}

.pname {
  font-weight: 600;
}

.tag {
  font-size: 0.62rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 0.06rem 0.32rem;
  border-radius: 4px;
  background: rgba(150, 128, 94, 0.22);
  color: var(--ink-soft);
}

.tag.you {
  background: rgba(178, 58, 44, 0.16);
  color: var(--vermillion-dark);
}

.tag.out-tag {
  background: rgba(120, 120, 120, 0.22);
}

.tag.allin-tag {
  background: rgba(178, 58, 44, 0.2);
  color: var(--vermillion-dark);
  font-weight: 600;
}

.allin-btn {
  background: var(--vermillion-dark);
}

.cards {
  display: flex;
  gap: 0.4rem;
  justify-content: center;
}

.money-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.4rem;
}

.bank {
  font-family: var(--font-display);
  font-size: 1rem;
  font-variant-numeric: tabular-nums;
}

.bet {
  color: var(--vermillion-dark);
}

/* --- log ------------------------------------------------------------------ */

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
  border: 2px solid var(--gold-line);
  border-radius: 10px;
  background: linear-gradient(170deg, rgba(255, 252, 242, 0.96), rgba(246, 231, 193, 0.92));
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

/* --- controls ------------------------------------------------------------ */

.controls {
  flex: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding: 0.7rem 1rem 0.9rem;
  border-top: 2px solid var(--gold-line);
  background: linear-gradient(0deg, rgba(255, 250, 240, 0.96), rgba(243, 226, 200, 0.9));
}

.event {
  margin: 0;
  color: var(--ink-soft);
}

.bet-controls {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  flex-wrap: wrap;
  justify-content: center;
}

.raise {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.slider {
  width: clamp(6rem, 24vw, 12rem);
  accent-color: var(--vermillion);
}

.between {
  display: flex;
  align-items: center;
  gap: 0.8rem;
}

.waiting {
  margin: 0;
}

/* Narrow: the seats stack (decided by measurement in the script), so the log
   drops back into the flow beneath them rather than floating over the corner. */
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

/* --- overlays ------------------------------------------------------------ */

.over-veil {
  position: fixed;
  inset: 0;
  display: grid;
  place-items: center;
  background: rgba(28, 22, 19, 0.45);
  z-index: 50;
  padding: 1rem;
}

/* The showdown is a reveal, not a wall — let the table show through behind it. */
.over-veil.soft {
  background: rgba(28, 22, 19, 0.28);
}

.over-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.7rem;
  padding: 1.4rem 1.6rem;
  max-width: 34rem;
  text-align: center;
}

.over-card.wide-card {
  max-width: 40rem;
}

.pick-row {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.35rem;
  width: 100%;
}

.pick-label {
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--ink-faint);
}

.pick-cards {
  display: flex;
  gap: 0.3rem;
  flex-wrap: wrap;
  justify-content: center;
}

.pick-card {
  padding: 2px;
  border: 2px solid transparent;
  border-radius: 9px;
  background: none;
  cursor: pointer;
  transition: transform 0.1s ease, border-color 0.1s ease;
}

.pick-card:hover {
  transform: translateY(-3px);
}

.pick-card.chosen {
  border-color: var(--vermillion);
  transform: translateY(-4px);
}

.reveals {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  width: 100%;
}

.reveal {
  display: grid;
  grid-template-columns: 1fr auto 2.5rem;
  align-items: center;
  gap: 0.6rem;
  padding: 0.35rem 0.6rem;
  border-radius: 8px;
  background: rgba(150, 128, 94, 0.1);
}

.reveal.win {
  background: rgba(212, 160, 23, 0.18);
}

.reveal.folded {
  opacity: 0.65;
}

.rname {
  text-align: left;
  font-weight: 600;
}

.rcards {
  display: flex;
  gap: 0.3rem;
}

.rtotal {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  font-family: var(--font-display);
  font-size: 1.1rem;
  font-variant-numeric: tabular-nums;
}

.won {
  color: var(--vermillion-dark);
  font-family: var(--font-body, inherit);
}

.over-actions {
  display: flex;
  gap: 0.5rem;
}

.flash-enter-active {
  transition: opacity 0.2s ease;
}

.flash-enter-from {
  opacity: 0;
}
</style>
