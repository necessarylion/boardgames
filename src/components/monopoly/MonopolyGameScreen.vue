<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, onUnmounted, ref, watch } from 'vue'
import GameIcon from '../common/GameIcon.vue'
import LogPanel from '../common/LogPanel.vue'
import SeatToken from '../common/SeatToken.vue'
import TableMenu from '../common/TableMenu.vue'
import CompanyLogo from './CompanyLogo.vue'
import SpaceDetail from './SpaceDetail.vue'
import MonopolyChat from './MonopolyChat.vue'
import MonopolyTradeDialog from './MonopolyTradeDialog.vue'
import { PLAYER_COLOURS } from '@shared/colours'
import {
  BOARD_SIZE,
  GO_SALARY,
  HOTEL,
  UTILITY_MULTIPLIER,
  countKind,
  mortgageValue,
  rentFor,
  unmortgageCost,
  JAIL_FINE,
  SPACES,
  groupSpaces,
  priceOf,
  type Group,
} from '@shared/monopoly'
import { companyLogo } from '@/game/companies'
import { money } from '@shared/money'
import { useCountdown } from '@/composables/useCountdown'
import { t } from '@/i18n'
import { useGameStore } from '@/stores/game'

// three.js and the physics only load with this table, not with the app — the
// same deal Snakes & Ladders makes for the one die it throws.
const Die3D = defineAsyncComponent(() => import('../common/Die3D.vue'))

const game = useGameStore()

const players = computed(() => game.mpPlayers)
const state = computed(() => game.monopoly)
const isOver = computed(() => state.value?.phase === 'over')
const pending = computed(() => game.mpPending)
const nameOf = (id: number) => players.value.find((p) => p.id === id)?.name ?? ''

const { label: clockLabel, urgent: clockUrgent } = useCountdown(
  () => state.value,
  () => game.isPaused,
)

const turnLabel = computed(() => {
  if (animating.value && last.value) return t('monopoly.turn.moving', { name: nameOf(last.value.player) })
  if (isOver.value) return t('game.over')
  if (game.isPaused) return t('game.paused.badge')
  if (game.mpIsMyTurn) return t('monopoly.turn.yours')
  return t('monopoly.turn.other', { name: nameOf(state.value?.current ?? 0) })
})

const lastRollLabel = computed(() => {
  const r = last.value
  if (!r || rolling.value) return ''
  return t('monopoly.rolled', { name: nameOf(r.player), a: r.dice[0], b: r.dice[1] })
})

// --- the throw, replayed ----------------------------------------------------

/** How long the dice tumble before they show the throw. */
const ROLL_MS = 2000
/** Pause between one space and the next as a token walks the board. */
const STEP_MS = 130

const last = computed(() => state.value?.lastRoll ?? null)
const rolling = ref(false)
/** The faces the two dice show, and a counter that asks them to throw. */
const diceFaces = ref<[number, number]>(last.value?.dice ?? [1, 1])
const rollKey = ref(0)
/** Where a token is drawn while a throw is replayed; empty between throws. */
const held = ref<Record<number, number>>({})
const animating = computed(() => rolling.value || Object.keys(held.value).length > 0)

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
/** Bumped per throw, so a newer throw cancels an older replay mid-way. */
let replay = 0

/**
 * The server settles a throw at once; the table replays it. The dice tumble,
 * and only then does the token walk round the board one space at a time to
 * where the throw put it — which is also why the walk is drawn from `from`
 * forwards rather than jumping, so passing Departures is something you watch.
 */
async function animate(r: NonNullable<typeof last.value>) {
  const mine = ++replay
  const live = () => mine === replay
  rolling.value = true
  held.value = { [r.player]: r.from }
  diceFaces.value = [r.dice[0], r.dice[1]]
  rollKey.value++
  await sleep(ROLL_MS)
  if (!live()) return
  rolling.value = false
  // A card or the gaol can put a token somewhere the dice do not reach, so the
  // walk runs to wherever it actually ended up rather than `from` + the throw.
  const steps = (r.to - r.from + BOARD_SIZE) % BOARD_SIZE
  for (let n = 1; n <= steps; n++) {
    await sleep(STEP_MS)
    if (!live()) return
    held.value = { ...held.value, [r.player]: (r.from + n) % BOARD_SIZE }
  }
  await sleep(STEP_MS * 2)
  if (!live()) return
  held.value = {}
}

/**
 * Keyed on the throw count, not on `lastRoll` itself: every broadcast rebuilds
 * the state object, and only a new throw should set the dice tumbling. A table
 * joined mid-game shows the last throw settled rather than replaying it. It is
 * also why the engine counts throws at all — doubles give one seat two throws
 * inside a single turn, so the turn number cannot tell them apart.
 */
watch(
  () => state.value?.rollCount,
  (n, old) => {
    const r = last.value
    if (!r || n === undefined || old === undefined || n <= old) {
      replay++
      rolling.value = false
      held.value = {}
      diceFaces.value = r?.dice ?? [1, 1]
      return
    }
    animate(r)
  },
)

// --- narrow screens ----------------------------------------------------------

/**
 * Below this the three columns stop fitting and the table reorganises around
 * the board, which is the game: the two side columns become sheets summoned
 * from a tab bar, and the prompt that lives in the middle of the board moves
 * out from under it, where a button is big enough to hit with a thumb.
 *
 * Kept in step with the `60rem` media queries in the stylesheet, which do the
 * laying out; this side only decides what is open and where the prompt goes.
 */
const COMPACT_PX = 960
const compact = ref(window.innerWidth <= COMPACT_PX)

/** Which side panel is up, or null. Only ever one of them at a time. */
type Panel = 'players' | 'properties' | 'log' | 'chat'
const panel = ref<Panel | null>(null)

/**
 * Where the prompt goes once the board has no room for it. A `Teleport` rather
 * than a second copy of it: the prompt is the whole of what the table is
 * waiting on — a purchase, an auction, a debt, a throw — and two of them would
 * be two chances to drift apart.
 */
const actionsSlot = ref<HTMLElement | null>(null)

function onResize() {
  compact.value = window.innerWidth <= COMPACT_PX
  // Widening puts the panels back in their columns, so nothing is left open
  // over a layout that no longer has anything to cover.
  if (!compact.value) panel.value = null
}

onMounted(() => window.addEventListener('resize', onResize))
onUnmounted(() => window.removeEventListener('resize', onResize))

function togglePanel(which: Panel) {
  panel.value = panel.value === which ? null : which
  if (panel.value === 'log') seenLog.value = logCount.value
}

/**
 * How much of the log has gone by behind a shut sheet. On a wide screen the log
 * is always on show, so there is never anything unread; the first count seen is
 * a baseline, or arriving at a game in progress would announce forty lines
 * nobody has missed.
 */
/*
 * Counted against the lines ever written, not against how many are kept: the
 * engine trims the log from the front, so once it is full its length stops
 * moving and a badge keyed on that would go quiet for the rest of the game.
 */
const logCount = computed(() => state.value?.logCount ?? 0)
const seenLog = ref<number | null>(null)

watch(
  logCount,
  (n) => {
    if (seenLog.value === null || !compact.value || panel.value === 'log') seenLog.value = n
  },
  { immediate: true },
)

const unreadLog = computed(() => Math.max(0, logCount.value - (seenLog.value ?? logCount.value)))

/**
 * On a wide screen the log and the chat take turns in the space under the
 * seats, because both want the height and neither is worth half of it. On a
 * narrow one the tab bar already decides, so this is ignored.
 */
const sideView = ref<'log' | 'chat'>('log')
const showLogHere = computed(() => compact.value || sideView.value === 'log')
const showChatHere = computed(() => compact.value || sideView.value === 'chat')

/** Whether the chat is actually on screen, whichever layout is in force. */
const chatOpen = computed(() =>
  compact.value ? panel.value === 'chat' : sideView.value === 'chat',
)

/*
 * Unread chat, counted the same way as the log: the first count seen is a
 * baseline, so arriving at a game in progress does not announce a conversation
 * nobody missed, and anything that arrives while the chat is on screen is read
 * by definition.
 */
/* The same trap, and the same answer: chat ids only ever go up, while the list
   itself is capped at a hundred. */
const chatCount = computed(() => (game.mpChat.at(-1)?.id ?? -1) + 1)
const seenChat = ref<number | null>(null)

watch(
  [chatCount, chatOpen],
  ([n, open]) => {
    if (seenChat.value === null || open) seenChat.value = n
  },
  { immediate: true },
)

const unreadChat = computed(() => Math.max(0, chatCount.value - (seenChat.value ?? chatCount.value)))

/** The one panel the side columns share, so each knows what to head itself. */
const sideTitle = computed(() => {
  if (panel.value === 'log') return t('log.title')
  if (panel.value === 'chat') return t('chat.title')
  return t('lobby.players')
})

/** The dice give up a little on a small board; below this they read as pips. */
const dieSize = computed(() => (compact.value ? 60 : 86))

// --- the board ---------------------------------------------------------------

/**
 * Each group's band along the edge of its streets. These are the board's own
 * palette, deliberately separate from `PLAYER_COLOURS`: a seat's colour marks
 * who owns a space, and the two must never be confused for one another.
 */
const GROUP_COLOUR: Record<Group, string> = {
  brown: '#7a5230',
  cyan: '#7fb7cc',
  pink: '#c2568f',
  orange: '#d2762c',
  red: '#b23a2c',
  yellow: '#d9b13c',
  green: '#2f7a45',
  blue: '#2f4d9c',
}

/**
 * Where space `n` sits on the 11×11 ring. Go is the bottom-right corner and
 * play runs clockwise: along the bottom to the gaol, up the left side, across
 * the top, and down the right back to Go.
 */
function cellOf(n: number): { col: number; row: number } {
  if (n <= 10) return { col: 11 - n, row: 11 }
  if (n < 20) return { col: 1, row: 21 - n }
  if (n <= 30) return { col: n - 19, row: 1 }
  return { col: 11, row: n - 29 }
}

/** A corner reads better upright; the four sides each get their own band edge. */
const sideOf = (n: number): string =>
  n % 10 === 0 ? 'corner' : n < 10 ? 'bottom' : n < 20 ? 'left' : n < 30 ? 'top' : 'right'

/** Where a token is drawn: mid-replay that is the held square, else the real one. */
function shownPos(id: number): number {
  const at = held.value[id]
  return at === undefined ? (players.value.find((p) => p.id === id)?.pos ?? 0) : at
}

const cells = computed(() =>
  SPACES.map((space, n) => {
    const s = state.value
    const owner = s?.owners[n] ?? null
    const houses = s?.houses[n] ?? 0
    return {
      n,
      space,
      side: sideOf(n),
      ...cellOf(n),
      band: space.kind === 'street' ? GROUP_COLOUR[space.group] : null,
      owner,
      ownerColour: owner === null ? null : PLAYER_COLOURS[players.value.find((p) => p.id === owner)?.colour ?? 'gold'].fill,
      houses,
      mortgaged: s?.mortgaged[n] ?? false,
      logo: space.kind === 'street' ? companyLogo(space.name) : null,
      tokens: players.value.filter((p) => !p.bankrupt && shownPos(p.id) === n),
    }
  }),
)

/** A space's tooltip: what it is, what it costs and who has it. */
function spaceTitle(n: number): string {
  const space = SPACES[n]
  const parts = [space.name]
  if (priceOf(n)) parts.push(t('monopoly.space.price', { price: money(priceOf(n)) }))
  const owner = state.value?.owners[n] ?? null
  parts.push(owner === null ? t('monopoly.space.bank') : t('monopoly.space.owner', { name: nameOf(owner) }))
  const houses = state.value?.houses[n] ?? 0
  if (houses === HOTEL) parts.push(t('monopoly.space.hotel'))
  else if (houses === 1) parts.push(t('monopoly.space.house'))
  else if (houses > 1) parts.push(t('monopoly.space.houses', { n: houses }))
  if (state.value?.mortgaged[n]) parts.push(t('monopoly.manage.mortgaged'))
  return parts.join(' · ')
}

// --- what the table is waiting on --------------------------------------------

const auction = computed(() => (pending.value?.step === 'auction' ? pending.value : null))
const bidAmount = ref(0)
// A fresh window starts at the least that would beat the standing bid, so the
// commonest move is one click rather than a number typed from scratch.
watch(
  () => [auction.value?.space, game.mpMinBid] as const,
  () => (bidAmount.value = game.mpMinBid),
  { immediate: true },
)

/*
 * A bid is capped by the cash in hand. The engine refuses anything above it, so
 * the table's job is to never send one: the field carries the ceiling, the
 * button will not fire over it, and a seat that cannot even reach the standing
 * bid is offered the one move it has left rather than a box it cannot use.
 */
const overCash = computed(() => bidAmount.value > game.mpMaxBid)
const canCoverBid = computed(() => game.mpMaxBid >= game.mpMinBid)
const bidIsLegal = computed(() => bidAmount.value >= game.mpMinBid && !overCash.value)

const buyingElsewhere = computed(() =>
  pending.value?.step === 'buy' && pending.value.player !== game.you ? pending.value : null,
)
const tradeElsewhere = computed(() =>
  pending.value?.step === 'trade' && pending.value.from !== game.you && pending.value.to !== game.you
    ? pending.value
    : null,
)
const myOfferOut = computed(() =>
  pending.value?.step === 'trade' && pending.value.from === game.you ? pending.value : null,
)
const offerToMe = computed(() =>
  pending.value?.step === 'trade' && pending.value.to === game.you ? pending.value : null,
)
const debtElsewhere = computed(() =>
  pending.value?.step === 'debt' && pending.value.player !== game.you ? pending.value : null,
)

const showTrade = ref(false)

/**
 * Your own holdings, with everything a decision about them needs: what the
 * space earns right now, how far off its set is, and what each action would
 * pay or cost. Rent comes from the engine's own `rentFor`, called on the wire
 * state — the three fields it reads are public, so the table can work it out
 * rather than keeping a second copy of the rent rules beside the real one.
 */
function holdingsOf(seat: number) {
  const s = state.value
  if (!s) return []
  const you = seat
  return s.owners
    .map((owner, n) => ({ owner, n }))
    .filter((h) => h.owner === you)
    .map(({ n }) => {
      const space = SPACES[n]
      const group = space.kind === 'street' ? space.group : null
      // A set is the colour sector for a company, and all four data centres or
      // both utilities for the others — the thing that lifts what they charge.
      const set =
        space.kind === 'street'
          ? groupSpaces(space.group)
          : SPACES.map((o, i) => ({ o, i })).filter((x) => x.o.kind === space.kind).map((x) => x.i)
      const owned = set.filter((i) => s.owners[i] === you).length
      return {
        n,
        space,
        houses: s.houses[n],
        mortgaged: s.mortgaged[n],
        band: group ? GROUP_COLOUR[group] : null,
        logo: space.kind === 'street',
        set: set.length,
        owned,
        /** A full set: what lets you expand, and what doubles a bare rent. */
        complete: owned === set.length,
        /** What it charges as things stand, or null when the throw decides it. */
        rent: space.kind === 'utility' ? null : rentFor(s, n, 0),
        /** Utilities charge a multiple of the throw, so that is what is shown. */
        multiplier: space.kind === 'utility' ? UTILITY_MULTIPLIER[countKind(s, you, 'utility')] : 0,
        price: priceOf(n),
        houseCost: space.kind === 'street' ? space.houseCost : 0,
        mortgageGain: mortgageValue(n),
        liftCost: unmortgageCost(n),
      }
    })
}

const myHoldings = computed(() => (game.you === null ? [] : holdingsOf(game.you)))

/**
 * What everyone else holds. Ownership, buildings and mortgages are all public
 * in Monopoly — the board already shows them — so gathering them per seat here
 * reveals nothing new; it only saves reading them off forty spaces. Bankrupt
 * seats are dropped: they own nothing and never will again.
 */
const opponents = computed(() =>
  players.value
    .filter((p) => p.id !== game.you && !p.bankrupt)
    .map((p) => ({ ...p, holdings: holdingsOf(p.id) })),
)

const winner = computed(() => {
  const w = state.value?.result?.winner
  return w === undefined ? null : nameOf(w)
})

const logMark = (turn: number) => t('monopoly.logMark', { n: turn })

// --- the hover card ---------------------------------------------------------

/**
 * Which space is being hovered, and where to put its card. Fixed positioning
 * off the hovered element's own rectangle, so one card serves the board and
 * both property lists — they sit in different scroll containers, and anything
 * measured relative to a parent would be wrong in at least one of them.
 */
const detail = ref<{ n: number; style: Record<string, string> } | null>(null)

const CARD_W = 240
const CARD_GAP = 10

function showDetail(event: Event, n: number) {
  // On a narrow screen the same gesture opens the sheet below, and a card hung
  // off a 30px tile would be most of the screen anyway.
  if (compact.value) return
  const el = event.currentTarget as HTMLElement | null
  if (!el) return
  const r = el.getBoundingClientRect()
  // Clamped to the viewport, because a card hung off a corner space would
  // otherwise open half off the screen.
  const x = Math.min(Math.max(r.left + r.width / 2, CARD_W / 2 + 8), window.innerWidth - CARD_W / 2 - 8)
  // Above by default; below when there is not room, which is the top row.
  const above = r.top > 320
  detail.value = {
    n,
    style: above
      ? { left: `${x}px`, top: `${r.top - CARD_GAP}px`, transform: 'translate(-50%, -100%)' }
      : { left: `${x}px`, top: `${r.bottom + CARD_GAP}px`, transform: 'translate(-50%, 0)' },
  }
}

const hideDetail = () => (detail.value = null)

/**
 * A tap opens the same card as a hover, as a sheet. A phone has no hover at all,
 * and the board's own tile is down to a name and a colour at that size — so the
 * space's rent ladder has to be reachable, and this is the way to it.
 */
const detailSheet = ref<number | null>(null)

function tapSpace(n: number) {
  if (compact.value) detailSheet.value = n
}

/** A space's sector colour, which bands both the card and the board. */
function bandOf(n: number): string | null {
  const space = SPACES[n]
  return space.kind === 'street' ? GROUP_COLOUR[space.group] : null
}

/** The sector colour for the hovered space, so the card is banded like the board. */
const detailBand = computed(() => (detail.value === null ? null : bandOf(detail.value.n)))
</script>

<template>
  <div class="game">
    <header class="topbar">
      <div class="turn">
        <strong>{{ turnLabel }}</strong>
        <span v-if="lastRollLabel" class="tiny muted">{{ lastRollLabel }}</span>
        <span
          v-if="clockLabel !== null && !isOver"
          class="clock"
          :class="{ urgent: clockUrgent, mine: game.mpIsMyTurn }"
          >{{ clockLabel }}</span
        >
      </div>
      <div class="top-actions">
        <span class="tiny muted code">{{ t('game.room', { code: state?.code ?? '' }) }}</span>
        <button v-if="game.isSeated && !isOver" class="btn ghost small" @click="game.togglePause()">
          {{ game.isPaused ? t('game.resume') : t('game.pause') }}
        </button>
        <TableMenu />
      </div>
    </header>

    <!-- Whose turn it is and what each seat is holding, for a screen with the
         players column shut. Scrolls sideways rather than wrapping: a phone has
         room for two or three of these at a time. -->
    <div v-if="compact" class="now" role="list">
      <div
        v-for="p in players"
        :key="p.id"
        role="listitem"
        class="now-seat"
        :class="{ current: p.id === state?.current && !isOver, out: p.bankrupt }"
        :style="{ '--seat': PLAYER_COLOURS[p.colour].ink }"
      >
        <SeatToken :colour="p.colour" :size="18" :current="p.id === state?.current && !isOver" :label="p.name" />
        <span class="now-name">{{ p.id === game.you ? t('lobby.badge.you') : p.name }}</span>
        <span class="now-cash">{{ money(p.cash) }}</span>
      </div>
    </div>

    <main class="table">
      <!-- Before the board in the source and after it on screen, so the prompt
           has somewhere to land on the very first render. -->
      <div v-if="compact" ref="actionsSlot" class="actions-slot"></div>

      <aside
        class="side"
        :class="{
          sheet: compact,
          open: compact && (panel === 'players' || panel === 'log' || panel === 'chat'),
          'only-log': panel === 'log',
          'only-players': panel === 'players',
          'only-chat': panel === 'chat',
        }"
      >
        <div v-if="compact" class="sheet-head">
          <strong>{{ sideTitle }}</strong>
          <button class="btn ghost small" @click="panel = null">{{ t('monopoly.panel.close') }}</button>
        </div>

        <ul class="players">
          <li
            v-for="p in players"
            :key="p.id"
            class="player"
            :class="{ current: p.id === state?.current && !isOver, offline: !p.connected, out: p.bankrupt }"
            :style="{ '--seat': PLAYER_COLOURS[p.colour].ink, '--seat-fill': PLAYER_COLOURS[p.colour].fill }"
          >
            <SeatToken :colour="p.colour" :size="22" :current="p.id === state?.current && !isOver" :label="p.name" />
            <div class="player-body">
              <div class="player-head">
                <span class="player-name">{{ p.name }}</span>
                <span v-if="p.id === game.you" class="badge">{{ t('lobby.badge.you') }}</span>
                <span v-if="p.jailed" class="badge">
                  <GameIcon name="monopoly.jail" :size="12" />
                </span>
                <span v-if="p.bankrupt" class="badge away">{{ t('monopoly.bankrupt') }}</span>
                <span v-else-if="!p.connected" class="badge away">{{ t('lobby.badge.away') }}</span>
              </div>
              <div class="player-stats tiny muted">
                <span class="cash">{{ money(p.cash) }}</span>
                <span>·</span>
                <span>{{ t('monopoly.worth', { amount: money(p.worth) }) }}</span>
              </div>
            </div>
          </li>
        </ul>

        <p v-if="state" class="tiny muted bank">
          {{ t('monopoly.bank.stock', { houses: state.bank.houses, hotels: state.bank.hotels }) }}
        </p>

        <!-- Wide only: on a phone the tab bar below has already chosen. -->
        <div v-if="!compact" class="side-switch" role="tablist">
          <button
            type="button"
            role="tab"
            class="switch-tab"
            :class="{ on: sideView === 'log' }"
            :aria-selected="sideView === 'log'"
            @click="sideView = 'log'"
          >
            {{ t('log.title') }}
          </button>
          <button
            type="button"
            role="tab"
            class="switch-tab"
            :class="{ on: sideView === 'chat' }"
            :aria-selected="sideView === 'chat'"
            @click="sideView = 'chat'"
          >
            {{ t('chat.title') }}
            <span v-if="unreadChat" class="tab-count unread">{{ unreadChat }}</span>
          </button>
        </div>

        <LogPanel
          v-if="state"
          v-show="showLogHere"
          class="log"
          :entries="state.log"
          :players="players"
          :mark-of="logMark"
        />

        <!-- Kept mounted rather than swapped in and out, so a half-typed line
             survives a look at the log. `open` is what tells it to catch up to
             the newest message when it comes back into view. -->
        <MonopolyChat v-show="showChatHere" class="chat-pane" :open="chatOpen" />
      </aside>

      <section class="board-wrap">
        <div class="board" :class="{ busy: animating }">
          <div
            v-for="c in cells"
            :key="c.n"
            class="space"
            :class="[`side-${c.side}`, { mortgaged: c.mortgaged, owned: c.owner !== null }]"
            :style="{
              gridColumn: c.col,
              gridRow: c.row,
              '--owner': c.ownerColour ?? 'transparent',
              '--tint': c.logo?.tint ?? 'transparent',
            }"
            tabindex="0"
            :aria-label="spaceTitle(c.n)"
            @click="tapSpace(c.n)"
            @mouseenter="showDetail($event, c.n)"
            @focus="showDetail($event, c.n)"
            @mouseleave="hideDetail()"
            @blur="hideDetail()"
          >
            <span v-if="c.logo" class="tint"></span>
            <span v-if="c.band" class="band" :style="{ background: c.band }"></span>

            <CompanyLogo v-if="c.logo" class="logo" :name="c.space.name" />
            <span class="space-name">{{ c.space.name }}</span>
            <span v-if="priceOf(c.n)" class="space-price">{{ money(priceOf(c.n)) }}</span>

            <GameIcon v-if="c.space.kind === 'station'" class="glyph" name="monopoly.station" :size="16" />
            <GameIcon v-else-if="c.space.kind === 'utility'" class="glyph" name="monopoly.utility" :size="16" />
            <GameIcon v-else-if="c.space.kind === 'chance' || c.space.kind === 'chest'" class="glyph" name="monopoly.deed" :size="16" />
            <GameIcon v-else-if="c.space.kind === 'jail' || c.space.kind === 'goToJail'" class="glyph" name="monopoly.jail" :size="16" />

            <span v-if="c.houses" class="builds">
              <GameIcon v-if="c.houses === HOTEL" name="monopoly.hotel" :size="13" />
              <GameIcon v-for="h in c.houses === HOTEL ? 0 : c.houses" v-else :key="h" name="monopoly.house" :size="11" />
            </span>

            <span v-if="c.tokens.length" class="tokens">
              <SeatToken
                v-for="p in c.tokens"
                :key="p.id"
                :colour="p.colour"
                :size="15"
                :current="p.id === state?.current && !isOver"
                :label="p.name"
              />
            </span>
          </div>

          <!-- The middle of the board carries whatever the table is waiting on. -->
          <div class="centre-panel">
            <!-- Both dice tumble on every throw, and go on showing the last
                 result between throws so the table can read what just happened. -->
            <div v-if="state?.phase === 'play'" class="dice">
              <Die3D :face="diceFaces[0]" :roll-key="rollKey" :duration-ms="ROLL_MS" :size="dieSize" />
              <Die3D :face="diceFaces[1]" :roll-key="rollKey" :duration-ms="ROLL_MS" :size="dieSize" />
            </div>

            <!--
              The prompt is the whole of what the table is waiting on. It sits in
              the middle of the board where there is room for it, and moves to a
              bar under the board where there is not — the same elements either
              way, carried across by the teleport rather than written twice.
            -->
            <Teleport :to="actionsSlot" :disabled="!compact || !actionsSlot">
              <div class="prompts">
                <div v-if="animating" class="prompt">
                  <p class="tiny muted">{{ turnLabel }}</p>
                </div>

                <div v-else-if="isOver && winner" class="prompt over">
                  <strong>{{ t('monopoly.winner', { name: winner }) }}</strong>
                  <p class="tiny muted">{{ t('monopoly.result.reason') }}</p>
                  <button v-if="game.isHost" class="btn" @click="game.rematch()">{{ t('over.playAgain') }}</button>
                </div>

                <div v-else-if="game.mpDebt !== null" class="prompt urgent">
                  <strong>{{ t('monopoly.debt.title', { amount: money(game.mpDebt) }) }}</strong>
                  <p class="tiny muted">{{ t('monopoly.debt.hint') }}</p>
                  <button class="btn danger" @click="game.mpGiveUp()">{{ t('monopoly.debt.giveUp') }}</button>
                </div>

                <div v-else-if="game.mpInJail" class="prompt">
                  <strong>{{ t('monopoly.jail.title') }}</strong>
                  <div class="prompt-actions">
                    <button class="btn" :disabled="!game.mpCan?.jailPay" @click="game.mpLeaveJail('pay')">
                      {{ t('monopoly.jail.pay', { fine: JAIL_FINE }) }}
                    </button>
                    <button class="btn" :disabled="!game.mpCan?.jailCard" @click="game.mpLeaveJail('card')">
                      {{ t('monopoly.jail.card') }}
                    </button>
                    <button class="btn" @click="game.mpLeaveJail('roll')">{{ t('monopoly.jail.roll') }}</button>
                  </div>
                </div>

                <div v-else-if="game.mpBuyOffer !== null" class="prompt">
                  <strong>{{ t('monopoly.buy.title', { name: SPACES[game.mpBuyOffer].name }) }}</strong>
                  <div class="prompt-actions">
                    <button class="btn" @click="game.mpBuy()">
                      {{ t('monopoly.buy.action', { price: money(priceOf(game.mpBuyOffer)) }) }}
                    </button>
                    <button class="btn ghost" @click="game.mpPass()">{{ t('monopoly.buy.pass') }}</button>
                  </div>
                </div>

                <div v-else-if="auction" class="prompt">
                  <strong>{{ t('monopoly.auction.title', { name: SPACES[auction.space].name }) }}</strong>
                  <p class="tiny muted">
                    {{
                      auction.highBidder === null
                        ? t('monopoly.auction.none')
                        : t('monopoly.auction.standing', { amount: money(auction.high), name: nameOf(auction.highBidder) })
                    }}
                  </p>
                  <template v-if="game.mpCanBid && canCoverBid">
                    <div class="prompt-actions">
                      <label class="bid-field">
                        <input
                          v-model.number="bidAmount"
                          class="bid"
                          type="number"
                          :min="game.mpMinBid"
                          :max="game.mpMaxBid"
                          step="1"
                        />
                        <span class="bid-unit tiny muted">{{ money(bidAmount || 0) }}</span>
                      </label>
                      <button class="btn" :disabled="!bidIsLegal" @click="game.mpBid(bidAmount)">
                        {{ t('monopoly.auction.bid') }}
                      </button>
                      <button class="btn ghost" @click="game.mpPass()">
                        {{ t('monopoly.auction.pass') }}
                      </button>
                    </div>
                    <p class="tiny bid-cap" :class="overCash ? 'over' : 'muted'">
                      {{
                        overCash
                          ? t('monopoly.auction.tooHigh')
                          : t('monopoly.auction.cash', { amount: money(game.mpMaxBid) })
                      }}
                    </p>
                  </template>

                  <!-- In the window, but with nothing that could beat the standing
                       bid: dropping out is the only move left. -->
                  <template v-else-if="game.mpCanBid">
                    <p class="tiny over">
                      {{ t('monopoly.auction.broke', { amount: money(game.mpMinBid) }) }}
                    </p>
                    <div class="prompt-actions">
                      <button class="btn ghost" @click="game.mpPass()">
                        {{ t('monopoly.auction.pass') }}
                      </button>
                    </div>
                  </template>
                  <!-- Two ways to have nothing to do here, and they are opposites. -->
                  <p v-else-if="auction.highBidder === game.you" class="tiny muted">
                    {{ t('monopoly.auction.leading') }}
                  </p>
                  <p v-else class="tiny muted">{{ t('monopoly.auction.out') }}</p>
                </div>

                <div v-else-if="offerToMe" class="prompt">
                  <strong>{{ t('monopoly.trade.incoming', { name: nameOf(offerToMe.from) }) }}</strong>
                  <dl class="terms tiny">
                    <dt>{{ t('monopoly.trade.theyGive') }}</dt>
                    <dd>
                      {{ offerToMe.give.spaces.map((i) => SPACES[i].name).join(', ') || t('monopoly.trade.nothing') }}
                      <template v-if="offerToMe.give.cash"> + {{ money(offerToMe.give.cash) }}</template>
                    </dd>
                    <dt>{{ t('monopoly.trade.theyWant') }}</dt>
                    <dd>
                      {{ offerToMe.want.spaces.map((i) => SPACES[i].name).join(', ') || t('monopoly.trade.nothing') }}
                      <template v-if="offerToMe.want.cash"> + {{ money(offerToMe.want.cash) }}</template>
                    </dd>
                  </dl>
                  <div class="prompt-actions">
                    <button class="btn" @click="game.mpAcceptTrade()">{{ t('monopoly.trade.accept') }}</button>
                    <button class="btn ghost" @click="game.mpDeclineTrade()">{{ t('monopoly.trade.decline') }}</button>
                  </div>
                </div>

                <div v-else-if="myOfferOut" class="prompt">
                  <p class="tiny muted">{{ t('monopoly.trade.waiting', { name: nameOf(myOfferOut.to) }) }}</p>
                </div>

                <div v-else-if="tradeElsewhere" class="prompt">
                  <p class="tiny muted">
                    {{ t('monopoly.trade.elsewhere', { a: nameOf(tradeElsewhere.from), b: nameOf(tradeElsewhere.to) }) }}
                  </p>
                </div>

                <div v-else-if="buyingElsewhere" class="prompt">
                  <p class="tiny muted">
                    {{ t('monopoly.buy.other', { name: nameOf(buyingElsewhere.player), space: SPACES[buyingElsewhere.space].name }) }}
                  </p>
                </div>

                <div v-else-if="debtElsewhere" class="prompt">
                  <p class="tiny muted">
                    {{ t('monopoly.debt.other', { name: nameOf(debtElsewhere.player), amount: money(debtElsewhere.amount) }) }}
                  </p>
                </div>

                <div v-else class="prompt">
                  <button v-if="game.mpCanRoll" class="btn big" @click="game.mpRoll()">
                    {{ state?.lastRoll?.doubles && state.lastRoll.player === game.you ? t('monopoly.rollAgain') : t('monopoly.roll') }}
                  </button>
                  <p v-else class="tiny muted">{{ turnLabel }}</p>
                </div>
              </div>
            </Teleport>

            <!-- Keyed on the draw count, so the deal animation replays for every
                 card rather than only for the first: Vue tears the old element
                 down and builds a new one, which restarts the keyframes. -->
            <div
              v-if="state?.lastCard && !animating"
              :key="state.cardCount"
              class="card-drawn"
              :class="state.lastCard.deck"
            >
              <span class="card-deck">{{ t(`monopoly.card.${state.lastCard.deck}`) }}</span>
              <p class="card-text">{{ state.lastCard.text }}</p>
              <span class="card-who tiny">{{ nameOf(state.lastCard.player) }}</span>
            </div>
            <p class="tiny muted salary">{{ t('monopoly.salary', { amount: money(GO_SALARY) }) }}</p>
          </div>
        </div>
      </section>

      <aside class="manage" :class="{ sheet: compact, open: compact && panel === 'properties' }">
        <div v-if="compact" class="sheet-head">
          <strong>{{ t('monopoly.manage.title') }}</strong>
          <button class="btn ghost small" @click="panel = null">{{ t('monopoly.panel.close') }}</button>
        </div>

        <h3>{{ t('monopoly.manage.title') }}</h3>

        <!-- An offer is a property matter and no longer part of a turn — any
             seat may make one whenever the table is idle — so it sits with the
             deeds rather than beside the dice. -->
        <button
          v-if="game.mpTradePartners.length"
          class="btn ghost small trade-open"
          @click="showTrade = true"
        >
          {{ t('monopoly.trade.open') }}
        </button>

        <p v-if="!myHoldings.length" class="tiny muted">{{ t('monopoly.manage.none') }}</p>
        <ul v-else class="deeds">
          <li
            v-for="h in myHoldings"
            :key="h.n"
            class="deed"
            :class="{ mortgaged: h.mortgaged, complete: h.complete && !h.mortgaged }"
            :style="{ '--band': h.band ?? 'var(--ink-faint)' }"
            @mouseenter="showDetail($event, h.n)"
            @mouseleave="hideDetail()"
          >
            <span class="deed-band"></span>

            <CompanyLogo v-if="h.logo" class="deed-logo" :name="h.space.name" />
            <span v-else class="deed-glyph">
              <GameIcon :name="h.space.kind === 'station' ? 'monopoly.station' : 'monopoly.utility'" :size="17" />
            </span>

            <div class="deed-main">
              <div class="deed-head">
                <span class="deed-name">{{ h.space.name }}</span>
                <span class="deed-price">{{ money(h.price) }}</span>
              </div>

              <div class="deed-meta">
                <span v-if="h.mortgaged" class="deed-flag">{{ t('monopoly.manage.mortgaged') }}</span>
                <span v-else-if="h.multiplier" class="deed-rent">
                  {{ t('monopoly.manage.rentTimes', { n: h.multiplier }) }}
                </span>
                <span v-else class="deed-rent">
                  {{ t('monopoly.manage.rent', { amount: money(h.rent ?? 0) }) }}
                </span>

                <span v-if="h.houses" class="deed-built">
                  <GameIcon v-if="h.houses === HOTEL" name="monopoly.hotel" :size="12" />
                  <GameIcon v-for="o in h.houses === HOTEL ? 0 : h.houses" v-else :key="o" name="monopoly.house" :size="11" />
                </span>

                <!-- How much of the set is yours: the fact that decides whether
                     expanding is even possible, and what doubles a bare rent. -->
                <span class="deed-set" :title="t('monopoly.manage.set', { owned: h.owned, total: h.set })">
                  <i v-for="i in h.set" :key="i" class="pip" :class="{ on: i <= h.owned }"></i>
                </span>
              </div>

              <div class="deed-actions">
                <button
                  v-if="game.mpBuildable.includes(h.n)"
                  class="btn ghost tiny-btn"
                  :title="t('monopoly.manage.buildHint', { amount: money(h.houseCost) })"
                  @click="game.mpBuild(h.n)"
                >
                  {{ t('monopoly.manage.build') }}<span class="cost out">−{{ money(h.houseCost) }}</span>
                </button>
                <button
                  v-if="game.mpSellable.includes(h.n)"
                  class="btn ghost tiny-btn"
                  :title="t('monopoly.manage.sellHint', { amount: money(Math.round(h.houseCost / 2)) })"
                  @click="game.mpSell(h.n)"
                >
                  {{ t('monopoly.manage.sell') }}<span class="cost in">+{{ money(Math.round(h.houseCost / 2)) }}</span>
                </button>
                <button
                  v-if="game.mpMortgageable.includes(h.n)"
                  class="btn ghost tiny-btn"
                  :title="t('monopoly.manage.mortgageHint', { amount: money(h.mortgageGain), cost: money(h.liftCost) })"
                  @click="game.mpMortgage(h.n)"
                >
                  {{ t('monopoly.manage.mortgage') }}<span class="cost in">+{{ money(h.mortgageGain) }}</span>
                </button>
                <button
                  v-if="game.mpUnmortgageable.includes(h.n)"
                  class="btn ghost tiny-btn"
                  :title="t('monopoly.manage.unmortgageHint', { amount: money(h.liftCost) })"
                  @click="game.mpUnmortgage(h.n)"
                >
                  {{ t('monopoly.manage.unmortgage') }}<span class="cost out">−{{ money(h.liftCost) }}</span>
                </button>
              </div>
            </div>
          </li>
        </ul>

        <!-- Everyone else's, read only. All of it is public — the board shows
             the same thing across forty spaces — so this only saves the reading. -->
        <template v-if="opponents.length">
          <h3 class="others-head">{{ t('monopoly.manage.others') }}</h3>
          <section v-for="o in opponents" :key="o.id" class="rival">
            <div class="rival-head">
              <SeatToken :colour="o.colour" :size="18" :label="o.name" />
              <span class="rival-name">{{ o.name }}</span>
              <span class="rival-cash tiny">{{ money(o.cash) }}</span>
            </div>
            <p v-if="!o.holdings.length" class="tiny muted rival-none">
              {{ t('monopoly.manage.noneYet') }}
            </p>
            <ul v-else class="rival-list">
              <li
                v-for="h in o.holdings"
                :key="h.n"
                class="rival-deed"
                :class="{ mortgaged: h.mortgaged, complete: h.complete && !h.mortgaged }"
                :style="{ '--band': h.band ?? 'var(--ink-faint)' }"
                tabindex="0"
                :aria-label="spaceTitle(h.n)"
                @mouseenter="showDetail($event, h.n)"
                @focus="showDetail($event, h.n)"
                @mouseleave="hideDetail()"
                @blur="hideDetail()"
              >
                <span class="rival-band"></span>
                <CompanyLogo v-if="h.logo" class="rival-logo" :name="h.space.name" />
                <span v-else class="rival-logo glyph">
                  <GameIcon :name="h.space.kind === 'station' ? 'monopoly.station' : 'monopoly.utility'" :size="13" />
                </span>
                <span class="rival-deed-name">{{ h.space.name }}</span>
                <span v-if="h.houses" class="rival-built">
                  <GameIcon v-if="h.houses === HOTEL" name="monopoly.hotel" :size="11" />
                  <GameIcon v-for="x in h.houses === HOTEL ? 0 : h.houses" v-else :key="x" name="monopoly.house" :size="10" />
                </span>
                <span class="rival-rent tiny">
                  <template v-if="h.mortgaged">—</template>
                  <template v-else-if="h.multiplier">{{ h.multiplier }}×</template>
                  <template v-else>{{ money(h.rent ?? 0) }}</template>
                </span>
              </li>
            </ul>
          </section>
        </template>
      </aside>
      <!-- The two side columns, reachable without giving up any of the board. -->
      <nav v-if="compact" class="tabs" :aria-label="t('monopoly.manage.title')">
        <button
          type="button"
          class="tab"
          :class="{ on: panel === 'players' }"
          :aria-expanded="panel === 'players'"
          @click="togglePanel('players')"
        >
          {{ t('monopoly.tab.players') }}
          <span class="tab-count">{{ players.length }}</span>
        </button>
        <button
          type="button"
          class="tab"
          :class="{ on: panel === 'properties' }"
          :aria-expanded="panel === 'properties'"
          @click="togglePanel('properties')"
        >
          {{ t('monopoly.tab.property') }}
          <span class="tab-count">{{ myHoldings.length }}</span>
        </button>
        <button
          type="button"
          class="tab"
          :class="{ on: panel === 'log' }"
          :aria-expanded="panel === 'log'"
          @click="togglePanel('log')"
        >
          {{ t('monopoly.tab.log') }}
          <span v-if="unreadLog" class="tab-count unread">{{ unreadLog }}</span>
        </button>
        <button
          type="button"
          class="tab"
          :class="{ on: panel === 'chat' }"
          :aria-expanded="panel === 'chat'"
          @click="togglePanel('chat')"
        >
          {{ t('chat.title') }}
          <span v-if="unreadChat" class="tab-count unread">{{ unreadChat }}</span>
        </button>
      </nav>

      <!-- Dims the board under an open sheet, and puts it away when tapped. -->
      <div v-if="compact && panel" class="sheet-scrim" @click="panel = null"></div>
    </main>

    <!-- A tapped space, where there is no hover to open the card with. The card
         itself is the desktop one — only the way in and the frame differ. -->
    <div v-if="compact && detailSheet !== null" class="detail-scrim" @click="detailSheet = null">
      <div class="detail-sheet" @click.stop>
        <SpaceDetail :n="detailSheet" :band="bandOf(detailSheet)" />
        <button class="btn ghost small" @click="detailSheet = null">
          {{ t('monopoly.panel.close') }}
        </button>
      </div>
    </div>

    <!-- Rendered at the end of the app rather than inside the board, so it is
         never clipped by a scrolling column. -->
    <Teleport to="body">
      <div v-if="detail" class="detail-layer" :style="detail.style">
        <SpaceDetail :n="detail.n" :band="detailBand" />
      </div>
    </Teleport>

    <MonopolyTradeDialog v-if="showTrade" @close="showTrade = false" />
  </div>
</template>

<style scoped>
.game {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.topbar {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.6rem 1rem;
  border-bottom: 1px solid var(--gold-line);
  background: var(--paper);
}

.turn {
  display: flex;
  align-items: baseline;
  gap: 0.6rem;
  min-width: 0;
}

.turn strong {
  font-family: var(--font-display);
}

.top-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.clock {
  font-variant-numeric: tabular-nums;
  padding: 0.1rem 0.45rem;
  border-radius: 999px;
  background: var(--paper-2);
  font-size: 0.82rem;
}

.clock.mine {
  background: var(--gold-line);
  color: #fffdf8;
}

.clock.urgent {
  background: var(--vermillion);
  color: #fff;
}

.table {
  flex: 1 1 auto;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(13rem, 15rem) minmax(0, 1fr) minmax(13rem, 16rem);
  gap: 0.75rem;
  padding: 0.75rem;
}

.side,
.manage {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  min-height: 0;
  overflow-y: auto;
}

.players {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.player {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0.5rem;
  border-radius: 8px;
  border: 1px solid var(--gold-line);
  background: var(--paper);
}

.player.current {
  border-color: var(--seat);
  box-shadow: inset 3px 0 0 var(--seat);
}

.player.offline,
.player.out {
  opacity: 0.55;
}



.player-body {
  min-width: 0;
  flex: 1 1 auto;
}

.player-head {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  flex-wrap: wrap;
}

.player-name {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.badge {
  display: inline-flex;
  align-items: center;
  padding: 0 0.3rem;
  border-radius: 999px;
  background: var(--paper-3);
  font-size: 0.68rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.badge.away {
  background: rgba(178, 58, 44, 0.16);
  color: var(--vermillion-dark);
}

.player-stats {
  display: flex;
  gap: 0.3rem;
}

.cash {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  color: var(--ink);
}

.bank {
  margin: 0;
}

/* The log and the chat take turns under the seats on a wide screen; this is
   what does the taking of turns. */
.side-switch {
  flex: none;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.3rem;
  padding: 0.4rem 0.5rem 0;
  border-top: 1px solid rgba(160, 137, 102, 0.35);
}

.switch-tab {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.3rem;
  padding: 0.3rem 0.4rem;
  border-radius: 7px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--ink-soft);
  font: inherit;
  font-size: 0.82rem;
  cursor: pointer;
}

.switch-tab:hover {
  background: rgba(160, 137, 102, 0.12);
}

.switch-tab.on {
  border-color: var(--gold-line);
  background: rgba(212, 160, 23, 0.14);
  color: var(--ink);
  font-weight: 600;
}

/* The chat takes the same room under the seats that the log does. */
.chat-pane {
  flex: 1 1 auto;
  min-height: 0;
}

.log {
  flex: 1 1 auto;
  min-height: 8rem;
}

/* --- the board ---------------------------------------------------------- */

.board-wrap {
  display: grid;
  place-items: center;
  min-height: 0;
  min-width: 0;
}

.board {
  display: grid;
  /* A deeper outer ring: the company fields take the room and the middle gives
     it up, which is also how a printed board is proportioned. */
  grid-template-columns: 1.42fr repeat(9, 1fr) 1.42fr;
  grid-template-rows: 1.42fr repeat(9, 1fr) 1.42fr;
  gap: 2px;
  /* 80vh, not the 100cqh this used to carry: nothing here declares a
     `container-type`, so `cqh` had no query container to resolve against and
     fell back to the whole viewport — sizing the board to the screen rather
     than to the space left under the topbar, which is what made it overflow. */
  width: min(100%, 80vh);
  /* Now a real container, so the space font below scales with the board
     instead of pinning to its own maximum against the viewport. */
  container-type: inline-size;
  aspect-ratio: 1;
  padding: 2px;
  border-radius: 10px;
  border: 1px solid var(--gold-line);
  background: var(--paper-3);
  box-shadow: var(--shadow);
}

.space {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  padding: 2px;
  overflow: hidden;
  border-radius: 3px;
  background: var(--paper);
  font-size: clamp(0.42rem, 1.02cqw, 0.78rem);
  line-height: 1.15;
  text-align: center;
}

/* The brand colour, as a light plate only. The logo itself is an element above
   this, not a background — a logo washed out behind text stops reading as the
   logo, which is the whole reason it is on the space. */
.tint {
  position: absolute;
  inset: 0;
  background: var(--tint);
  opacity: 0.1;
}

.logo {
  position: relative;
  width: 54%;
  max-height: 38%;
  flex: none;
}

/* A mortgaged company is greyed out, logo and all — it is earning nothing. */
.space.mortgaged .logo {
  opacity: 0.4;
  filter: grayscale(1);
}

.space.mortgaged .tint {
  opacity: 0.04;
}

/* The band is a strip along the outer edge, so the space's own content is
   inset past it. Before this the price was laid straight over the band and the
   dark ink on a saturated stripe was unreadable — the band's side depends on
   which run of the ring the space is on, so the inset does too. */
.side-bottom {
  padding-top: 26%;
}

.side-top {
  padding-bottom: 26%;
}

.side-left {
  padding-right: 26%;
}

.side-right {
  padding-left: 26%;
}

/* Owned spaces carry their owner's colour as a hairline on the inner edge,
   which is the side facing the middle of the board on each of the four runs. */
.space.owned {
  box-shadow: inset 0 0 0 1.5px var(--owner);
}

.space.mortgaged {
  background: repeating-linear-gradient(
    45deg,
    var(--paper-2),
    var(--paper-2) 3px,
    var(--paper-3) 3px,
    var(--paper-3) 6px
  );
}

.band {
  position: absolute;
  inset: 0 0 auto 0;
  height: 22%;
}

.side-bottom .band {
  inset: 0 0 auto 0;
}

.side-top .band {
  inset: auto 0 0 0;
}

.side-left .band {
  inset: 0 0 0 auto;
  width: 22%;
  height: auto;
}

.side-right .band {
  inset: 0 auto 0 0;
  width: 22%;
  height: auto;
}

.space-name,
.space-price,
.glyph,
.builds,
.tokens {
  position: relative;
}

.space-name {
  max-width: 100%;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  font-size: 1.14em;
  font-weight: 700;
  /* The logo sits above the name rather than behind it, so no ground is needed
     — but the tint plate is, on the couple of dark brands. */
  text-shadow: 0 1px 0 var(--paper);
}


.space-price {
  font-variant-numeric: tabular-nums;
  font-size: 0.95em;
  font-weight: 600;
  /* Full ink, not the soft grey it used to be: this is the figure a player
     actually has to read off the board. */
  color: var(--ink);
}

.glyph {
  color: var(--ink-soft);
}

.builds {
  display: flex;
  gap: 1px;
  color: var(--vermillion);
}

.tokens {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 2px;
}

/* Sized off the board, not off a fixed number: `cqw` resolves against `.board`
   (which declares the container), so a token is the same fraction of its space
   whether the board is 900px on a monitor or 320px on a phone. The floor keeps
   it a recognisable piece rather than a speck; the ceiling is the size the
   desktop board was drawn around. */
.tokens :deep(.seat-token) {
  width: clamp(8px, 2.6cqw, 15px);
  height: auto;
}

/* The pieces sit above the space's own content and may spill a little past the
   cell — a token that had to fit inside the padding would be back to a dot. */
.tokens {
  position: absolute;
  inset: auto 0 4% 0;
  z-index: 2;
  pointer-events: none;
}

/* Opacity only: animating a filter re-rasterises the whole board every frame. */
.board.busy .space {
  opacity: 0.72;
  transition: opacity 0.25s ease;
}

.dice {
  display: flex;
  gap: 0.35rem;
  align-items: center;
  justify-content: center;
}

.centre-panel {
  grid-column: 2 / 11;
  grid-row: 2 / 11;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 1rem;
  border-radius: 8px;
  background: var(--paper-2);
  text-align: center;
  perspective: 700px;
}

/* Invisible where the prompt stays on the board: its children go on being
   `.centre-panel`'s own flex items, exactly as they were before the teleport
   was put around them. It becomes a real box only in the bar under the board. */
.prompts {
  display: contents;
}

.prompt {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.45rem;
  max-width: 26rem;
}

.prompt p {
  margin: 0;
}

.prompt strong {
  font-family: var(--font-display);
}

.prompt.urgent strong {
  color: var(--vermillion-dark);
}

.prompt-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.4rem;
}

.bid-field {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.1rem;
}

.bid-unit {
  font-variant-numeric: tabular-nums;
}

/* What the cash in hand allows, under the field it caps. */
.bid-cap {
  font-variant-numeric: tabular-nums;
}

.over {
  color: var(--vermillion-dark);
  font-weight: 600;
}

.bid {
  width: 6rem;
  padding: 0.3rem 0.5rem;
  border-radius: 6px;
  border: 1px solid var(--gold-line);
  background: var(--paper);
  font: inherit;
  font-variant-numeric: tabular-nums;
}

.terms {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.15rem 0.5rem;
  margin: 0;
  text-align: left;
}

.terms dt {
  color: var(--ink-faint);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.terms dd {
  margin: 0;
}

/* The drawn card is dealt onto the table: it flips in off the deck, overshoots
   a little and settles. `animation` rather than a transition, because the
   element is rebuilt per draw (see the `:key`) and has no previous state to
   transition from. */
.card-drawn {
  position: relative;
  width: min(20rem, 100%);
  margin: 0;
  padding: 0.7rem 0.9rem 0.6rem;
  border-radius: 10px;
  background: var(--paper);
  border: 1px solid var(--gold-line);
  box-shadow: var(--shadow-lg);
  text-align: left;
  transform-origin: 50% 120%;
  animation: deal 0.62s cubic-bezier(0.2, 0.9, 0.25, 1.08) both;
}

/* Each deck gets its own edge, so which one was turned over reads before the
   words do — the same job the colour bands do on the board. */
.card-drawn.chance {
  border-left: 5px solid var(--vermillion);
}

.card-drawn.chest {
  border-left: 5px solid #2f7a45;
}

.card-deck {
  display: block;
  font-family: var(--font-display);
  font-size: 0.7rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--ink-faint);
}

.card-text {
  margin: 0.2rem 0 0;
  font-size: 0.9rem;
  line-height: 1.35;
}

.card-who {
  display: block;
  margin-top: 0.25rem;
  color: var(--ink-faint);
}

@keyframes deal {
  0% {
    opacity: 0;
    transform: translateY(26px) scale(0.72) rotateX(70deg) rotate(-8deg);
  }
  55% {
    opacity: 1;
    transform: translateY(-5px) scale(1.04) rotateX(0deg) rotate(1.5deg);
  }
  100% {
    opacity: 1;
    transform: translateY(0) scale(1) rotateX(0deg) rotate(0deg);
  }
}

/* A player who has asked for less motion still gets the card, just not thrown. */
@media (prefers-reduced-motion: reduce) {
  .card-drawn {
    animation: fade-in 0.2s ease both;
  }

  @keyframes fade-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
}

.salary {
  margin: 0;
}

/* --- your property ------------------------------------------------------ */

.manage h3 {
  margin: 0;
  font-size: 0.95rem;
}

.deeds {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

/* Band, mark, then everything about the property in one block. The old card
   carried a name and a lone button in twice this height; the figures here are
   the ones a decision actually turns on. */
.deed {
  display: grid;
  grid-template-columns: 4px auto 1fr;
  align-items: start;
  gap: 0 0.5rem;
  padding: 0.45rem 0.55rem 0.45rem 0;
  border-radius: 8px;
  border: 1px solid var(--gold-line);
  background: var(--paper);
  overflow: hidden;
}

/* Full width under the heading, the way the panel's own actions read. */
.trade-open {
  width: 100%;
  margin-bottom: 0.7rem;
}

/* A full set is the thing worth spotting from across the panel — it is what
   lets you expand and what doubles a bare rent. */
.deed.complete {
  border-color: var(--band);
  box-shadow: inset 0 0 0 1px var(--band);
}

.deed.mortgaged {
  background: repeating-linear-gradient(
    45deg,
    var(--paper),
    var(--paper) 4px,
    var(--paper-2) 4px,
    var(--paper-2) 8px
  );
}

.deed-band {
  grid-row: 1 / -1;
  align-self: stretch;
  background: var(--band);
}

.deed-logo,
.deed-glyph {
  width: 1.5rem;
  height: 1.5rem;
  margin-top: 0.05rem;
  display: grid;
  place-items: center;
  flex: none;
}

.deed-glyph {
  color: var(--ink-soft);
}

.deed.mortgaged .deed-logo,
.deed.mortgaged .deed-glyph {
  opacity: 0.45;
  filter: grayscale(1);
}

.deed-main {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.deed-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.4rem;
}

.deed-name {
  font-size: 0.86rem;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.deed-price {
  flex: none;
  font-size: 0.72rem;
  font-variant-numeric: tabular-nums;
  color: var(--ink-faint);
}

.deed-meta {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.72rem;
  color: var(--ink-soft);
}

.deed-rent {
  font-variant-numeric: tabular-nums;
}

.deed-flag {
  color: var(--vermillion-dark);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-size: 0.66rem;
}

.deed-built {
  display: flex;
  gap: 1px;
  color: var(--vermillion);
}

/* One pip per space in the set, filled for the ones you hold — "2 of 3" read
   at a glance rather than counted off the board. */
.deed-set {
  display: flex;
  gap: 2px;
  margin-left: auto;
  flex: none;
}

.pip {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  border: 1px solid var(--band);
  opacity: 0.55;
}

.pip.on {
  background: var(--band);
  opacity: 1;
}

.deed-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  margin-top: 0.1rem;
}

.detail-layer {
  position: fixed;
  z-index: 70;
  pointer-events: none;
}

/* Keyboard users get the card too, and need to see what has focus. */
.space:focus-visible,
.rival-deed:focus-visible {
  outline: 2px solid var(--vermillion);
  outline-offset: -2px;
}

.tiny-btn {
  display: inline-flex;
  align-items: baseline;
  gap: 0.3rem;
  padding: 0.12rem 0.4rem;
  font-size: 0.7rem;
}

/* Every action says what it pays or costs, so "Mortgage" is not a word you
   have to already know the price of. */
.cost {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  font-size: 0.66rem;
}

.cost.in {
  color: #2f7a45;
}

.cost.out {
  color: var(--vermillion-dark);
}

/* --- everyone else's property ------------------------------------------- */

.others-head {
  margin: 0.6rem 0 0;
  padding-top: 0.6rem;
  border-top: 1px solid var(--gold-line);
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: var(--ink-faint);
}

.rival-head {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin-bottom: 0.25rem;
}

.rival-name {
  font-weight: 600;
  font-size: 0.82rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rival-cash {
  margin-left: auto;
  font-variant-numeric: tabular-nums;
  color: var(--ink-soft);
}

.rival-none {
  margin: 0 0 0.3rem;
}

.rival-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

/* Denser than your own card: no decision is taken here, so it carries only
   what you need to know before landing on it — whose it is, and what it charges. */
.rival-deed {
  display: grid;
  grid-template-columns: 3px 1rem 1fr auto auto;
  align-items: center;
  gap: 0 0.35rem;
  padding: 0.15rem 0.35rem 0.15rem 0;
  border-radius: 5px;
  background: var(--paper);
  border: 1px solid transparent;
  font-size: 0.74rem;
  overflow: hidden;
}

.rival-deed.complete {
  border-color: var(--band);
}

.rival-deed.mortgaged {
  opacity: 0.55;
}

.rival-band {
  align-self: stretch;
  background: var(--band);
}

.rival-logo {
  width: 1rem;
  height: 1rem;
}

.rival-logo.glyph {
  display: grid;
  place-items: center;
  color: var(--ink-soft);
}

.rival-deed-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rival-built {
  display: flex;
  gap: 1px;
  color: var(--vermillion);
}

.rival-rent {
  font-variant-numeric: tabular-nums;
  color: var(--ink-soft);
}

/* --- a board too small to letter fully -------------------------------------

   A container query, not a media query: what decides whether a space can carry
   its price is how wide the *board* is, and the board is a container. A phone
   in landscape and a narrow desktop window arrive at the same board width by
   different routes, and both want the same tile.

   The price goes first — it is the one figure a tap can give back in full, and
   at this size it was three pixels of tabular numerals. What is left is the
   identity of the space and who owns it, which is the order the board is
   actually read in. */
@container (max-width: 28rem) {
  .space {
    font-size: clamp(0.5rem, 1.5cqw, 0.78rem);
    padding: 1px;
  }

  .space-price {
    display: none;
  }

  /* The name takes the room the price gave up. */
  .space-name {
    -webkit-line-clamp: 3;
    line-clamp: 3;
  }

  .logo {
    width: 66%;
    max-height: 44%;
  }

  /* The bands stay the same fraction of the tile, so the ring still reads as a
     ring; only the content inset comes back a little. */
  .side-bottom {
    padding-top: 30%;
  }

  .side-top {
    padding-bottom: 30%;
  }

  .side-left {
    padding-right: 30%;
  }

  .side-right {
    padding-left: 30%;
  }
}

/* --- the compact table -----------------------------------------------------

   Below this the three columns cannot all have room worth having, and the
   board is the game — so it takes the width, the prompt moves to a bar
   underneath it where a thumb can reach, and the two side columns become
   sheets behind a tab bar. Everything here is a rearrangement: the same
   elements, the same components, the same state. */
@media (max-width: 60rem) {
  .table {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    grid-auto-rows: min-content;
    gap: 0.5rem;
    padding: 0.5rem;
    overflow-y: auto;
  }

  .board {
    /* Width first; the cap is only there to stop a tall narrow window drawing a
       board taller than the room left under the topbar. `dvh` rather than `vh`,
       so a mobile browser's toolbars are counted. */
    width: min(100%, 80dvh);
  }

  /* Source order puts the slot before the board so the teleport has a target on
     the first render; screen order puts it after, under the board. */
  .board-wrap {
    order: 1;
  }

  .actions-slot {
    order: 2;
  }

  .tabs {
    order: 3;
  }

  /* --- the prompt, docked ------------------------------------------------- */

  .prompts {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 0.4rem;
    text-align: center;
  }

  .prompt {
    align-items: stretch;
  }

  /* Full-width targets. These are the buttons the game is played with, and on a
     phone they are the only ones on screen. */
  .prompt-actions {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(7rem, 1fr));
    gap: 0.4rem;
  }

  .prompt-actions .btn,
  .prompts > .prompt > .btn {
    width: 100%;
    min-height: 2.75rem;
  }

  .bid-field {
    flex-direction: row;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
  }

  .bid {
    width: 100%;
    min-height: 2.75rem;
  }

  /* --- who is on, and what they are holding -------------------------------- */

  .now {
    flex: none;
    display: flex;
    gap: 0.35rem;
    padding: 0.35rem 0.5rem;
    border-bottom: 1px solid var(--gold-line);
    overflow-x: auto;
    scrollbar-width: none;
  }

  .now-seat {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    flex: none;
    padding: 0.25rem 0.5rem;
    border: 1px solid var(--gold-line);
    border-radius: 999px;
    background: var(--paper);
    font-size: 0.78rem;
    line-height: 1.2;
  }

  /* The seat on turn is the one fact this strip exists to carry. */
  .now-seat.current {
    border-color: var(--seat);
    box-shadow: inset 0 0 0 1px var(--seat);
    background: var(--paper-2);
  }

  .now-seat.out {
    opacity: 0.5;
  }

  .now-name {
    font-weight: 600;
    max-width: 6rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .now-cash {
    font-variant-numeric: tabular-nums;
    color: var(--ink-soft);
  }

  /* --- the tab bar --------------------------------------------------------- */

  .tabs {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0.35rem;
    padding: 0.35rem 0 calc(0.15rem + env(safe-area-inset-bottom));
    background: var(--paper);
    border-top: 1px solid var(--gold-line);
  }

  .tab {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.3rem;
    min-width: 0;
    min-height: 2.75rem;
    padding: 0.3rem 0.4rem;
    border: 1px solid var(--gold-line);
    border-radius: 9px;
    background: var(--paper);
    color: var(--ink);
    font: inherit;
    /* Four labels across the narrowest phone, in a script with no spaces to
       break at either — so they are allowed to shrink and to wrap. The chat
       made this four; at 320px that is 80px a tab, which the lower bound and
       the wrapping between them have to fit a word like "Properties" into. */
    font-size: clamp(0.62rem, 2.3vw, 0.85rem);
    font-weight: 600;
    line-height: 1.15;
    text-align: center;
    touch-action: manipulation;
  }

  .tab.on {
    background: var(--paper-3);
    border-color: var(--ink-faint);
  }

  .tab-count {
    flex: none;
    min-width: 1.1rem;
    padding: 0 0.25rem;
    border-radius: 999px;
    background: var(--paper-3);
    color: var(--ink-soft);
    font-size: 0.72rem;
    font-variant-numeric: tabular-nums;
  }

  /* What has gone by behind a shut sheet, which is the only thing on this bar
     that is news rather than a count. */
  .tab-count.unread {
    background: var(--vermillion);
    color: #fff;
  }

  /* --- the side columns, as sheets ---------------------------------------- */

  .side,
  .manage {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 40;
    max-height: min(72dvh, 32rem);
    padding: 0.7rem 0.7rem calc(0.7rem + env(safe-area-inset-bottom));
    border-top: 1px solid var(--gold-line);
    border-radius: 14px 14px 0 0;
    background: var(--paper);
    box-shadow: var(--shadow-lg);
    /* Off the bottom until asked for, and out of the reach of a stray tap or a
       tab key while it is down there. */
    transform: translateY(100%);
    visibility: hidden;
    transition: transform 0.22s ease, visibility 0.22s;
  }

  .side.open,
  .manage.open {
    transform: translateY(0);
    visibility: visible;
  }

  .sheet-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding-bottom: 0.4rem;
    border-bottom: 1px solid var(--gold-line);
  }

  .sheet-head strong {
    font-family: var(--font-display);
  }

  /* One column, two panels: the seats and the log share a sheet and take turns
     in it, so the tab bar can offer them separately without a third element. */
  .side.only-log .players,
  .side.only-log .bank {
    display: none;
  }

  .side.only-players .log,
  .side.only-players .chat-pane {
    display: none;
  }

  .side.only-log .chat-pane {
    display: none;
  }

  /* The chat asks for the whole sheet: it is a conversation, not a sidebar. */
  .side.only-chat .players,
  .side.only-chat .bank,
  .side.only-chat .log {
    display: none;
  }

  .sheet-scrim {
    position: fixed;
    inset: 0;
    z-index: 35;
    background: rgba(28, 22, 19, 0.35);
  }

  /* --- a tapped space ------------------------------------------------------ */

  .detail-scrim {
    position: fixed;
    inset: 0;
    z-index: 60;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    background: rgba(28, 22, 19, 0.45);
  }

  .detail-sheet {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 0.5rem;
    width: 100%;
    max-height: 88dvh;
    overflow-y: auto;
    padding: 0.7rem 0.7rem calc(0.7rem + env(safe-area-inset-bottom));
    border-radius: 14px 14px 0 0;
    background: var(--paper);
    box-shadow: var(--shadow-lg);
  }

  /* The card is the desktop one; only its frame is different here. */
  .detail-sheet :deep(.detail) {
    width: 100%;
    box-shadow: none;
    border: 0;
    border-top: 4px solid var(--band);
  }

  /* --- the header ---------------------------------------------------------- */

  .topbar {
    flex-wrap: wrap;
    gap: 0.3rem 0.6rem;
    padding: 0.45rem 0.6rem;
  }

  .turn {
    flex: 1 1 8rem;
    min-width: 0;
  }

  .turn strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* Said again at the head of the table menu, and the widest thing in the row. */
  .code {
    display: none;
  }

  .centre-panel {
    padding: 0.5rem;
    gap: 0.35rem;
    /* Whatever is dealt into the middle stays inside the ring rather than
       spilling over the spaces around it. */
    overflow: hidden;
  }

  .card-drawn {
    padding: 0.45rem 0.55rem 0.4rem;
  }

  .card-text {
    font-size: 0.78rem;
  }

  .salary {
    display: none;
  }
}

/* Rotated, the width is the plentiful thing and the height is not: the board
   keeps the left and everything it is played with goes down the right, so
   nothing has to be scrolled to while a turn is being taken. */
@media (max-width: 60rem) and (orientation: landscape) {
  .table {
    grid-template-columns: minmax(0, 1fr) minmax(9rem, 15rem);
    align-content: start;
  }

  .board {
    width: min(100%, 68dvh);
  }

  .board-wrap {
    grid-column: 1;
    grid-row: 1 / span 2;
  }

  .actions-slot {
    grid-column: 2;
    grid-row: 1;
  }

  .tabs {
    grid-column: 2;
    grid-row: 2;
    position: static;
    grid-template-columns: 1fr;
    border-top: 0;
  }

  /* A phone on its side has enough width for these to open at the edge rather
     than across the board. */
  .side,
  .manage {
    left: auto;
    top: 0;
    width: min(24rem, 70%);
    max-height: none;
    border-radius: 0;
    border-left: 1px solid var(--gold-line);
    transform: translateX(100%);
  }

  .side.open,
  .manage.open {
    transform: translateX(0);
  }

  .detail-scrim {
    align-items: center;
  }

  .detail-sheet {
    width: min(24rem, 92%);
    max-height: 92dvh;
    border-radius: 14px;
  }
}

/* The sheets slide; a reader who has asked for less motion gets the same panel
   without the travel. */
@media (prefers-reduced-motion: reduce) {
  .side,
  .manage {
    transition: none;
  }
}
</style>
