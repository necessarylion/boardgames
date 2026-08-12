<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import CoupCard from './CoupCard.vue'
import CoupCorners from './CoupCorners.vue'
import CoupRulesDialog from './CoupRulesDialog.vue'
import GameIcon from '../common/GameIcon.vue'
import TableMenu from '../common/TableMenu.vue'
import { PLAYER_COLOURS } from '@shared/colours'
import { COUP_ACTIONS, type CoupActionKind } from '@shared/coup'
import { useCountdown } from '@/composables/useCountdown'
import { t } from '@/i18n'
import { useGameStore } from '@/stores/game'

const game = useGameStore()
const showRules = ref(false)
const showLog = ref(true)
/**
 * The controls float over the table rather than reserving a strip of it, so on a
 * crowded ring they can end up over a seat. Rather than move everyone's chairs
 * to suit the buttons, the panel folds away to its header on request and comes
 * straight back — the table stays where it is either way.
 */
const controlsOpen = ref(true)

const players = computed(() => game.coupPlayers)
const nameOf = (id: number | null) =>
  id === null ? '' : (players.value.find((p) => p.id === id)?.name ?? '')

const isOver = computed(() => game.coup?.phase === 'over')
const pending = computed(() => game.coupPending)
const can = computed(() => game.coupCan)

const actionLabel = (action: CoupActionKind) => t(`coup.action.${action}`)

const turnLabel = computed(() => {
  if (isOver.value) return t('game.over')
  if (game.isPaused) return t('game.paused.badge')
  if (game.coupIsMyTurn) return t('coup.yourTurn')
  const active = game.coupActivePlayer
  return active ? t('coup.playerTurn', { name: active.name }) : t('game.noTurn')
})

/**
 * Who the table is still waiting on. Worked out here rather than sent, because
 * it is a caption rather than a permission — the buttons themselves come from
 * the server's `can`, so a disagreement here costs nothing.
 */
const waitingOn = computed(() => {
  const p = pending.value
  if (!p) return []
  if (p.step === 'block') return p.passed.includes(p.actor) ? [] : [p.actor]
  if (p.step !== 'action') return []
  const eligible = p.challengeable
    ? players.value.filter((x) => !x.out && x.id !== p.actor).map((x) => x.id)
    : p.blockers
  return eligible.filter((id) => !p.passed.includes(id))
})

const pendingText = computed(() => {
  const p = pending.value
  if (!p) return ''
  switch (p.step) {
    case 'action':
      return p.target === null
        ? t('coup.pending.action', { name: nameOf(p.actor), action: actionLabel(p.action) })
        : t('coup.pending.actionOn', {
            name: nameOf(p.actor),
            action: actionLabel(p.action),
            target: nameOf(p.target),
          })
    case 'block':
      return t('coup.pending.block', {
        name: nameOf(p.blocker),
        character: t(`coup.character.${p.character}`),
      })
    case 'lose':
      return t('coup.pending.lose', { name: nameOf(p.player) })
    case 'exchange':
      return t('coup.pending.exchange', { name: nameOf(p.player) })
  }
})

/** The last thing that happened, narrated for the whole table. */
const eventText = computed(() => {
  const e = game.coup?.lastEvent ?? null
  if (!e) return ''
  switch (e.kind) {
    case 'action':
      return t('coup.event.action', { name: nameOf(e.actor), action: actionLabel(e.action) })
    case 'block':
      return t('coup.event.block', {
        name: nameOf(e.blocker),
        character: t(`coup.character.${e.character}`),
      })
    case 'challenge':
      return t(e.won ? 'coup.event.challengeWon' : 'coup.event.challengeLost', {
        name: nameOf(e.challenger),
        target: nameOf(e.claimant),
        character: t(`coup.character.${e.character}`),
      })
    case 'lose':
      return t('coup.event.lose', {
        name: nameOf(e.player),
        character: t(`coup.character.${e.character}`),
      })
    case 'out':
      return t('coup.event.out', { name: nameOf(e.player) })
  }
})

const winner = computed(() => {
  const w = game.coup?.result?.winner
  return w === null || w === undefined ? null : nameOf(w)
})

const coins = (n: number) => (n === 1 ? t('coup.coins.one') : t('coup.coins', { n }))

// The clock counts the decision in front of the table, which for most of a turn
// is a response owed by somebody other than the player whose turn it is.
const { label: clockLabel, urgent: clockUrgent } = useCountdown(
  () => game.coup?.turnMsLeft ?? null,
  () => game.isPaused,
)

/** Whether the clock is running on this viewer, so it can be shown loudly. */
const onClock = computed(() => {
  const c = can.value
  if (!c) return false
  return c.pass || c.lose || c.exchange !== null || c.challenge || c.actions.length > 0
})

/**
 * The play log, newest last, with seat tokens swapped for the names at the
 * table. The engine writes `#2` rather than a name because the rules layer has
 * no idea what anyone is called; this is the other half of that arrangement.
 */
const logLines = computed(() =>
  (game.coup?.log ?? []).map((entry, i) => ({
    key: `${i}:${entry.turn}`,
    who: entry.player === null ? null : nameOf(entry.player),
    colour: players.value.find((p) => p.id === entry.player)?.colour ?? null,
    text: entry.text.replace(/#(\d+)/g, (whole, id: string) => nameOf(Number(id)) || whole),
  })),
)

/** Newest line last, so the log has to be kept scrolled to its foot. */
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

/** Everything the viewer can answer with right now, for the bar by their hand. */
const hasResponse = computed(
  () => !!can.value && (can.value.challenge || can.value.blocks.length > 0 || can.value.pass),
)

/**
 * Seats in play order, rotated so the local player sits at the bottom of the
 * ring. Turn order is unchanged — only where each seat is drawn — which is what
 * makes the table read the same way to everyone sitting at it.
 */
const seatOrder = computed(() => {
  const list = players.value
  const me = game.you
  if (me === null) return list
  const i = list.findIndex((p) => p.id === me)
  return i < 0 ? list : [...list.slice(i), ...list.slice(0, i)]
})

/*
 * The ring measures itself rather than working in percentages.
 *
 * Percentages cannot know how big a seat is, so on a short window the bottom
 * seat used to hang past the edge and over the controls, while on a wide one the
 * seats drifted into the corners. Measuring means the radius is always "half the
 * box, less half a seat, less a margin" — which is the thing that actually has
 * to be true — and it lets the layout fall back to a plain stack the moment the
 * box is too small for a ring to fit in at all.
 */
// Reserved seat box. Sized for the largest seat — your own, which shows two real
// cards at their full width where every other seat shows narrow face-down ones —
// so the clearance works out for every seat rather than only the small ones.
const SEAT_W = 236
const SEAT_H = 206
const EDGE = 8


const ringEl = ref<HTMLElement | null>(null)
const ringW = ref(0)
const ringH = ref(0)

let observer: ResizeObserver | null = null
watch(ringEl, (el) => {
  observer?.disconnect()
  if (!el || typeof ResizeObserver === 'undefined') return
  // Seed from the element before observing, not after: an observer that reports
  // straight away would otherwise have its measurement overwritten by this read.
  ringW.value = el.clientWidth
  ringH.value = el.clientHeight
  observer = new ResizeObserver(([entry]) => {
    ringW.value = entry.contentRect.width
    ringH.value = entry.contentRect.height
  })
  observer.observe(el)
})
onUnmounted(() => observer?.disconnect())

/** Whether the controls are on screen at all. */
const showControls = computed(() => game.isSeated && !isOver.value)

/**
 * Whether there is room to arrange seats in a ring at all. Measured against the
 * whole box: the seats own the table, and the panels floating over its corners
 * give way to them rather than the other way round. Below this the seats would
 * overlap each other and the court, so they stack instead — which is also what
 * happens before the first measurement lands.
 */
const isRing = computed(
  () => ringW.value >= SEAT_W * 2.6 && ringH.value >= SEAT_H * 2.2 && seatOrder.value.length > 1,
)

/**
 * Place a seat on the ring. Angles start at the bottom and run clockwise, so
 * play moves the way it would round a real table.
 *
 * The two radii are worked out separately because the ring fills the window: a
 * seat is far wider than it is tall, so it needs more clearance from the side
 * edges than from the top and bottom. On a wide screen that reads as a long
 * table, which is the right shape for one.
 */
function seatStyle(index: number, count: number) {
  if (!isRing.value) return {}
  const angle = Math.PI / 2 + (index * 2 * Math.PI) / count
  const rx = Math.max(0, ringW.value / 2 - SEAT_W / 2 - EDGE)
  const ry = Math.max(0, ringH.value / 2 - SEAT_H / 2 - EDGE)
  // Rounded: whole pixels keep the seats off half-pixel boundaries, where the
  // border and the text either side of it blur.
  return {
    left: `${Math.round(ringW.value / 2 + rx * Math.cos(angle))}px`,
    top: `${Math.round(ringH.value / 2 + ry * Math.sin(angle))}px`,
  }
}

/** Every influence given up so far, kept in the middle where the table shares it. */
const court = computed(() =>
  players.value.flatMap((p) =>
    p.revealed.map((character) => ({ character, owner: p.id, colour: p.colour })),
  ),
)

/** A seat is clickable exactly while an action is waiting to be aimed at one. */
const aiming = computed(() => game.coupAiming)
const isTargetable = (id: number) => aiming.value !== null && (can.value?.targets ?? []).includes(id)

function chooseAction(action: CoupActionKind) {
  if (COUP_ACTIONS[action].needsTarget) game.coupAim(action)
  else game.coupAct(action)
}

function chooseTarget(id: number) {
  const action = aiming.value
  if (action && isTargetable(id)) game.coupAct(action, id)
}
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
        <span class="tiny muted">{{ t('game.round', { turn: game.coup?.turnNumber ?? 0 }) }}</span>
      </div>
      <div class="top-actions">
        <span class="tiny muted code">{{ t('game.room', { code: game.coup?.code ?? '' }) }}</span>
        <span class="tiny muted">{{ t('coup.deck', { n: game.coup?.deckCount ?? 0 }) }}</span>
        <button class="btn ghost small" @click="showLog = !showLog">{{ t('coup.log.title') }}</button>
        <button class="btn ghost small" @click="showRules = true">{{ t('coup.rules.open') }}</button>
        <button v-if="game.isSeated && !isOver" class="btn ghost small" @click="game.togglePause()">
          {{ game.isPaused ? t('game.resume') : t('game.pause') }}
        </button>
        <TableMenu />
      </div>
    </header>

    <main class="table">
      <!-- The table: seats round the ring, everything lost in the middle. -->
      <div ref="ringEl" class="ring" :class="{ stacked: !isRing }">
        <component
          :is="isTargetable(p.id) ? 'button' : 'div'"
          v-for="(p, i) in seatOrder"
          :key="p.id"
          class="player"
          :class="{
            active: p.id === game.coup?.current && !isOver && !pending,
            out: p.out,
            me: p.id === game.you,
            targetable: isTargetable(p.id),
          }"
          :type="isTargetable(p.id) ? 'button' : undefined"
          :style="{ '--seat': PLAYER_COLOURS[p.colour].ink, ...seatStyle(i, seatOrder.length) }"
          @click="chooseTarget(p.id)"
        >
          <CoupCorners />
          <div class="player-head">
            <span class="dot" :style="{ background: PLAYER_COLOURS[p.colour].ink }" />
            <span class="pname">{{ p.name }}</span>
            <span v-if="p.id === game.you" class="tag">{{ t('lobby.badge.you') }}</span>
            <span v-if="p.out" class="tag out-tag">{{ t('coup.out') }}</span>
            <span v-if="waitingOn.includes(p.id)" class="tag waiting">…</span>
          </div>

          <p class="coins">
            <GameIcon name="coup.coin" :size="14" />
            <span>{{ coins(p.coins) }}</span>
          </p>

          <div class="cards">
            <!-- Your own seat is the one place your influence is shown; every
                 other seat is a count, because the cards themselves never
                 arrive from the server in the first place. -->
            <template v-if="p.id === game.you && game.coupHand.length">
              <CoupCard
                v-for="(c, i) in game.coupHand"
                :key="`mine${i}`"
                :character="c"
                size="medium"
              />
            </template>
            <template v-else>
              <CoupCard
                v-for="n in p.influence"
                :key="`down${n}`"
                size="small"
                :colour="p.colour"
              />
            </template>
          </div>
        </component>

        <div class="court">
          <CoupCorners :size="17" />
          <p class="court-title">
            <GameIcon name="coup.flourish" :size="26" />
            <span>{{ t('coup.court.title') }}</span>
            <GameIcon class="mirror" name="coup.flourish" :size="26" />
          </p>
          <div v-if="court.length" class="court-cards">
            <span
              v-for="(c, i) in court"
              :key="`court${i}`"
              class="court-card"
              :title="t('coup.court.owner', { name: nameOf(c.owner) })"
            >
              <CoupCard :character="c.character" spent size="small" />
              <span class="owner-dot" :style="{ background: PLAYER_COLOURS[c.colour].ink }" />
            </span>
          </div>
          <p v-else class="tiny muted">{{ t('coup.court.empty') }}</p>
        </div>
      </div>

      <!-- Everything anyone has done, oldest first. Lifted out of the flow like
           the controls, so opening it never moves the table underneath. -->
      <aside v-if="showLog" class="log panel">
        <CoupCorners />
        <p class="log-head">
          <GameIcon name="coup.quill" :size="20" />
          <span>{{ t('coup.log.title') }}</span>
        </p>
        <ol ref="logEl" class="log-lines scroll">
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

      <!-- The controls float in the corner rather than sitting across the foot
           of the table: in the flow they shortened the ring, which pushed the
           bottom seat up and away from the edge it belongs against. -->
      <section v-if="showControls" class="controls panel" :class="{ folded: !controlsOpen }">
        <CoupCorners />
        <button
          class="fold"
          type="button"
          :title="controlsOpen ? t('coup.controls.hide') : t('coup.controls.show')"
          @click="controlsOpen = !controlsOpen"
        >
          <span class="tiny muted">{{ t('coup.controls.title') }}</span>
          <span aria-hidden="true">{{ controlsOpen ? '▾' : '▴' }}</span>
        </button>

        <template v-if="controlsOpen">
        <Transition name="flash">
          <p v-if="eventText" :key="eventText" class="event tiny">{{ eventText }}</p>
        </Transition>

        <p v-if="pendingText" class="pending">
          {{ pendingText }}
          <span v-if="pending && waitingOn.length" class="tiny muted">
            · {{ t('coup.pending.waiting', { n: waitingOn.length }) }}
          </span>
        </p>

        <!-- Answering someone else's claim. -->
        <div v-if="hasResponse" class="buttons">
          <button v-if="can?.challenge" class="btn" @click="game.coupChallenge()">
            {{ t('coup.challenge') }}
          </button>
          <button v-for="c in can?.blocks ?? []" :key="c" class="btn" @click="game.coupBlock(c)">
            {{ t('coup.block', { character: t(`coup.character.${c}`) }) }}
          </button>
          <button v-if="can?.pass" class="btn ghost" @click="game.coupPass()">
            {{ t('coup.pass') }}
          </button>
        </div>

        <!-- Your turn: choose an action, then a seat if it needs one. -->
        <div v-else-if="can?.actions.length" class="buttons">
          <button
            v-for="a in can.actions"
            :key="a"
            class="btn"
            :class="{ ghost: aiming !== null && aiming !== a }"
            :title="t(`coup.action.${a}.hint`)"
            @click="chooseAction(a)"
          >
            {{ actionLabel(a) }}
          </button>
        </div>

        <p v-if="aiming" class="tiny aim">
          {{ t('coup.pickTarget', { action: actionLabel(aiming) }) }}
          <button class="btn ghost small" @click="game.coupAim(aiming)">
            {{ t('coup.cancel') }}
          </button>
        </p>
        </template>
      </section>
    </main>

    <CoupRulesDialog v-if="showRules" @close="showRules = false" />

    <!-- You owe an influence and must say which. -->
    <div v-if="can?.lose" class="over-veil">
      <div class="over-card panel">
        <h2>{{ t('coup.yourLoss.title') }}</h2>
        <p class="tiny muted">
          {{ pending?.step === 'lose' ? t(`coup.yourLoss.${pending.reason}`) : '' }}
        </p>
        <div class="choose">
          <CoupCard
            v-for="(c, i) in game.coupHand"
            :key="`lose${i}`"
            :character="c"
            selectable
            @click="game.coupLose(c)"
          />
        </div>
      </div>
    </div>

    <!-- An exchange: keep as many as you had, return the rest. -->
    <div v-else-if="can?.exchange !== null && can?.exchange !== undefined" class="over-veil">
      <div class="over-card panel">
        <h2>{{ t('coup.exchange.title', { n: can.exchange }) }}</h2>
        <p class="tiny muted">{{ t('coup.exchange.hint') }}</p>
        <div class="choose">
          <CoupCard
            v-for="(c, i) in game.coupExchangePool"
            :key="`ex${i}`"
            :character="c"
            selectable
            :selected="game.coupKeeping.includes(i)"
            @click="game.coupToggleKeep(i)"
          />
        </div>
        <button
          class="btn"
          :disabled="game.coupKeeping.length !== can.exchange"
          @click="game.coupConfirmExchange()"
        >
          {{ t('coup.exchange.confirm') }}
        </button>
      </div>
    </div>

    <!-- Game over -->
    <div v-if="isOver" class="over-veil">
      <div class="over-card panel">
        <h2>{{ winner ? t('coup.winner', { name: winner }) : t('coup.draw') }}</h2>
        <p class="tiny muted">{{ game.coup?.result?.reason }}</p>
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
/*
 * Coup dresses itself as a gilded parchment table rather than borrowing the
 * paper-and-ink chrome the other two games share. The palette is scoped to this
 * component so nothing here leaks into Samurai's board or Halli Galli's.
 */
.game {
  --coup-gilt: #c9a227;
  --coup-gilt-soft: #e2c979;
  --coup-parchment: #f6e7c1;
  --coup-parchment-deep: #ecd7a8;
  --coup-ink: #4a3413;

  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  color: var(--coup-ink);
  /* Two soft washes over a warm ground: enough grain that the parchment is not
     a flat fill, without a texture file to ship. */
  background:
    radial-gradient(120% 90% at 50% 0%, rgba(255, 252, 240, 0.9), transparent 60%),
    radial-gradient(90% 70% at 15% 100%, rgba(201, 162, 39, 0.14), transparent 65%),
    linear-gradient(160deg, var(--coup-parchment), var(--coup-parchment-deep));
}

.topbar {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
  padding: 0.6rem 1rem;
  border-bottom: 2px solid var(--coup-gilt);
  background: linear-gradient(180deg, rgba(255, 250, 236, 0.95), rgba(246, 231, 193, 0.9));
  box-shadow: 0 1px 0 var(--coup-gilt-soft);
}

.topbar :deep(.btn) {
  border-color: var(--coup-gilt-soft);
}

.turn {
  display: flex;
  align-items: baseline;
  gap: 0.6rem;
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
  line-height: 1.4;
}

/* Only the player the table is actually waiting on gets the loud version. */
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

/* The table takes the whole window under the topbar: the ring grows into
   whatever the controls and the hand leave behind, so a bigger screen is a
   bigger table rather than the same table with margins either side. */
/* The gilt rule that frames the whole table, drawn on the container so it sits
   behind the seats rather than clipping them. */
.table {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 0.75rem 1rem 1rem;
  width: 100%;
}

.table::before {
  content: '';
  position: absolute;
  inset: 0.5rem;
  border: 2px solid var(--coup-gilt);
  border-radius: 6px;
  box-shadow: inset 0 0 0 3px rgba(255, 250, 236, 0.6),
    inset 0 0 0 4px var(--coup-gilt-soft);
  pointer-events: none;
}

/* Your own seat carries real cards, so it stands a little taller than the rest
   and is given the width to lay them out side by side. */
.player.me .cards {
  gap: 0.35rem;
}

/* --- the table ------------------------------------------------------------ */

/* Seats are laid round an ellipse by the inline left/top the script computes;
   the ring only has to give them a box with a middle to sit around. */
.ring {
  position: relative;
  flex: 1 1 auto;
  width: 100%;
  min-height: 0;
}

/* Too small for a ring: seats become an ordinary wrapped row, and the court
   leads, since what the table has lost is the thing worth seeing first. */
.ring.stacked {
  display: flex;
  flex-wrap: wrap;
  align-content: flex-start;
  justify-content: center;
  gap: 0.5rem;
  overflow-y: auto;
}

.ring.stacked .player,
.ring.stacked .court {
  position: static;
  transform: none;
  width: auto;
  min-width: 10rem;
  flex: 1 1 10rem;
  max-width: 16rem;
}

.ring.stacked .court {
  order: -1;
  flex-basis: 100%;
  max-width: none;
}

.player {
  position: absolute;
  transform: translate(-50%, -50%);
  /* Matches SEAT_W in the script: wide enough for two cards at their full width
     side by side, which is what stops them wrapping into a column. */
  width: 14.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding: 0.7rem 0.8rem;
  border-radius: 10px;
  /* The seat's own colour rules the frame, with gilt inside it. */
  border: 2px solid var(--seat);
  background: linear-gradient(170deg, rgba(255, 252, 242, 0.96), rgba(246, 231, 193, 0.92));
  box-shadow: inset 0 0 0 1px var(--coup-gilt-soft), var(--shadow);
  color: var(--coup-ink);
  font: inherit;
  text-align: left;
}

/* --- the middle: everything the table has lost ---------------------------- */

/* Centred on the band the seats use, not on the box, so the panels either side
   do not push it off the middle of the table. */
.court {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.4rem;
  width: min(32rem, 48%);
  padding: 1rem 1.2rem;
  border-radius: 14px;
  border: 2px solid var(--coup-gilt);
  background: linear-gradient(170deg, rgba(255, 252, 242, 0.97), rgba(246, 231, 193, 0.94));
  box-shadow: inset 0 0 0 1px var(--coup-gilt-soft), var(--shadow);
  text-align: center;
}

/* The heading is set between two gilt rules, the way a chapter head would be. */
.court-title {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.05rem;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--coup-ink);
}

.court-title :deep(.icon) {
  color: var(--coup-gilt);
}

.court-title :deep(.mirror) {
  transform: scaleX(-1);
}

.court-cards {
  display: flex;
  gap: 0.35rem;
  flex-wrap: wrap;
  justify-content: center;
}

/* A dot in the corner says whose influence this was. */
.court-card {
  position: relative;
  display: block;
}

.owner-dot {
  position: absolute;
  top: -0.2rem;
  right: -0.2rem;
  width: 0.66rem;
  height: 0.66rem;
  border-radius: 50%;
  border: 1px solid var(--paper);
}

.player.active {
  box-shadow: inset 0 0 0 1px var(--coup-gilt), 0 0 0 3px rgba(201, 162, 39, 0.4), var(--shadow-lg);
}

.player.out {
  opacity: 0.5;
}

.player.me {
  background: var(--paper-2);
}

.player.targetable {
  cursor: pointer;
  border-color: var(--vermillion);
  box-shadow: 0 0 0 2px rgba(178, 58, 44, 0.3), var(--shadow);
}

.player.targetable:hover {
  transform: translateY(-2px);
}

.player-head {
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
  font-size: 0.66rem;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  padding: 0.08rem 0.35rem;
  border-radius: 4px;
  background: rgba(150, 128, 94, 0.22);
  color: var(--ink-soft);
}

.tag.out-tag {
  background: rgba(120, 120, 120, 0.22);
}

.tag.waiting {
  background: rgba(178, 58, 44, 0.18);
  color: var(--vermillion-dark);
}

.coins {
  display: flex;
  align-items: center;
  gap: 0.28rem;
  margin: 0;
  font-size: 0.85rem;
  color: var(--ink-soft);
  font-variant-numeric: tabular-nums;
}

.coins :deep(.icon) {
  color: var(--gold-line);
}

/* A hand is read side by side, never stacked: the seat is sized to hold both. */
.cards {
  display: flex;
  justify-content: center;
  gap: 0.35rem;
  flex-wrap: nowrap;
}

/* --- the corner controls --------------------------------------------------- */

/* Floated over the bottom-right corner. Out of the flow deliberately: as a flex
   sibling it stole height from the ring, and the ring pays for that at the
   bottom, which is exactly where the player's own seat sits. */
.controls {
  position: absolute;
  right: 1rem;
  bottom: 1rem;
  z-index: 20;
  /* Sized to what it holds rather than to a fixed strip, so it takes no more of
     the table than the buttons actually need. */
  width: max-content;
  max-width: min(22rem, calc(100% - 2rem));
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  padding: 0.7rem 0.8rem;
  border: 2px solid var(--coup-gilt);
  border-radius: 10px;
  background: linear-gradient(170deg, rgba(255, 252, 242, 0.96), rgba(246, 231, 193, 0.92));
  box-shadow: inset 0 0 0 1px var(--coup-gilt-soft), var(--shadow);
  text-align: left;
}

/* Folded away to its header, for when it sits over a seat. */
.controls.folded {
  padding: 0.3rem 0.5rem;
}

.fold {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
  width: 100%;
  padding: 0;
  border: 0;
  background: none;
  color: var(--ink-soft);
  font: inherit;
  cursor: pointer;
}

.fold span:first-child {
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

/* --- the play log ---------------------------------------------------------- */

.log {
  position: absolute;
  left: 1rem;
  bottom: 1rem;
  z-index: 20;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  width: min(18rem, calc(100% - 2rem));
  max-height: min(40%, 15rem);
  padding: 0.7rem 0.8rem;
  border: 2px solid var(--coup-gilt);
  border-radius: 10px;
  background: linear-gradient(170deg, rgba(255, 252, 242, 0.96), rgba(246, 231, 193, 0.92));
  box-shadow: inset 0 0 0 1px var(--coup-gilt-soft), var(--shadow);
}

.log-head {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin: 0;
  font-family: var(--font-display);
  font-size: 1rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--coup-ink);
}

.log-head :deep(.icon) {
  color: var(--coup-gilt);
}

.log-lines {
  margin: 0;
  padding: 0;
  list-style: none;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.76rem;
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

.log-text {
  min-width: 0;
}

.event {
  margin: 0;
  color: var(--ink-soft);
}

.pending {
  margin: 0;
  font-weight: 600;
}

/* Two to a row: the labels are short enough to pair up, and a fixed grid keeps
   the block reading the same shape as actions come and go with the coin count. */
.buttons {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.45rem;
}

.buttons .btn {
  width: 100%;
  padding-inline: 0.5rem;
}

.aim {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0;
  color: var(--vermillion-dark);
}

/* Narrow: there are no corners to speak of, so both panels go back into the
   flow and stack under the table rather than floating over it. */
@media (max-width: 46rem) {
  .table {
    gap: 0.6rem;
  }

  .controls,
  .log {
    position: static;
    width: auto;
    max-height: 11rem;
  }

  .log {
    order: 2;
  }
}

.over-veil {
  position: fixed;
  inset: 0;
  display: grid;
  place-items: center;
  background: rgba(28, 22, 19, 0.45);
  z-index: 50;
  padding: 1rem;
}

.over-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.7rem;
  padding: 1.4rem 1.6rem;
  /* Wide enough to lay an exchange's four cards out in a single row. */
  max-width: 36rem;
  text-align: center;
}

.choose {
  display: flex;
  gap: 0.6rem;
  flex-wrap: wrap;
  justify-content: center;
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

/* The ring/stack switch is decided by measuring the box, not by a media query:
   what matters is whether the seats fit, which the viewport alone cannot say. */
</style>
