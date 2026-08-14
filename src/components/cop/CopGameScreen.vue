<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import CopDoor, { type DoorOccupant } from './CopDoor.vue'
import CopToken from './CopToken.vue'
import TableMenu from '../common/TableMenu.vue'
import { CONFISCATE_LIMIT, RESOURCES, type Loot } from '@shared/cop'
import { PLAYER_COLOURS } from '@shared/colours'
import { useCountdown } from '@/composables/useCountdown'
import { t } from '@/i18n'
import { useGameStore } from '@/stores/game'

const game = useGameStore()
const logOpen = ref(true)

const players = computed(() => game.copPlayers)
const nameOf = (id: number | null) =>
  id === null ? '' : (players.value.find((p) => p.id === id)?.name ?? '')

const isOver = computed(() => game.cop?.phase === 'over')
const step = computed(() => game.copStep)
const can = computed(() => game.copCan)
const rooms = computed(() => game.copRooms)
const roundResult = computed(() => game.copResult)
const copSeat = computed(() => game.copCopSeat)
const you = computed(() => game.copYou)

const { label: clockLabel, urgent: clockUrgent } = useCountdown(
  () => game.cop?.turnMsLeft ?? null,
  () => game.isPaused,
)

/** Whether the clock is running on this viewer, so it can be shown loudly. */
const onClock = computed(() => {
  const c = can.value
  if (!c) return false
  return c.select || c.search || c.arrest || c.next
})

const turnLabel = computed(() => {
  if (isOver.value) return t('game.over')
  if (game.isPaused) return t('game.paused.badge')
  const c = can.value
  if (step.value === 'select') {
    if (game.copIsCop) return t('cop.turn.copWaits')
    if (c?.chosen !== null && c?.chosen !== undefined) return t('cop.turn.hidden')
    return t('cop.turn.choose')
  }
  if (step.value === 'search') return game.copIsCop ? t('cop.turn.search') : t('cop.turn.searchWait')
  if (step.value === 'arrest') return game.copIsCop ? t('cop.turn.arrest') : t('cop.turn.arrestWait')
  return t('cop.turn.resolved')
})

/** The last thing that happened, narrated for the whole table. */
const eventText = computed(() => {
  const e = game.cop?.lastEvent ?? null
  if (!e) return ''
  switch (e.kind) {
    case 'round':
      return t('cop.event.round', { round: e.round, name: nameOf(e.cop) })
    case 'select':
      return t('cop.event.select', { name: nameOf(e.player) })
    case 'search':
      return t('cop.event.search', { name: nameOf(e.cop), a: e.opened[0] + 1, b: e.opened[1] + 1 })
    case 'caught':
      return e.players.length
        ? t('cop.event.caught', { names: e.players.map((id) => nameOf(id)).join(', ') })
        : ''
    case 'safe':
      return t('cop.event.safe')
    case 'arrest':
      return e.taken > 0 ? t('cop.event.arrest', { name: nameOf(e.cop), n: e.taken }) : t('cop.event.letOff', { name: nameOf(e.cop) })
  }
  return ''
})

// --- the doors ---------------------------------------------------------------

function occupant(id: number, caught: boolean): DoorOccupant {
  const p = players.value.find((x) => x.id === id)
  return {
    id,
    name: p?.name ?? `#${id}`,
    colour: p?.colour ?? 'gold',
    caught,
    you: id === game.you,
  }
}

/**
 * Who the viewer may see inside a room. Once the round is resolved every door
 * opens and shows all its occupants; before then only the viewer's own room is
 * ajar, showing them and whichever roommates the server has revealed.
 */
function occupantsOf(room: number): DoorOccupant[] {
  const r = roundResult.value
  if (r) {
    const outcome = r.rooms.find((x) => x.room === room)
    if (!outcome) return []
    const caught = new Set(r.caught)
    // The split of a room is private: you see the loot only for your own room (or
    // on an open table). Elsewhere a safe thief is shown as escaped, no amount.
    const takeSeen = fullReveal.value || game.cop?.yourRoom === room
    return outcome.occupants.map((id) => ({
      ...occupant(id, caught.has(id)),
      takeSeen,
      gained: takeSeen ? (outcome.loot[id] ?? null) : null,
    }))
  }
  // Mid-round: only your own room is open to you, showing you and your roommates.
  if (game.copYou && game.cop?.yourRoom === room) {
    return [occupant(game.copYou.id, false), ...game.copRoommates.map((id) => occupant(id, false))]
  }
  return []
}

/** Every door opens up at the very end, or on an open-information table. */
const fullReveal = computed(() => isOver.value || (game.cop?.options.openInformation ?? false))

/** The state of one door, given the step and this viewer's role. */
function doorState(room: number) {
  const c = can.value
  const resolved = roundResult.value !== null
  const opened = resolved && (roundResult.value?.opened.includes(room) ?? false)
  const mineRoom = game.cop?.yourRoom === room
  // Mid-round your own door stands ajar to you alone; at the reveal every door
  // opens, so the whole table sees who hid where and who escaped.
  const open = resolved || mineRoom
  return {
    loot: rooms.value[room] ?? { key: 0, stamp: 0, card: 0 },
    // A thief picks a door while choosing; the Cop marks two while searching.
    selectable: !isOver.value && !game.isPaused && ((c?.select ?? false) || (c?.search ?? false)),
    picked: (c?.select ?? false) && game.copPickRoom === room,
    chosen: !resolved && mineRoom,
    marked: (c?.search ?? false) && game.copPickDoors.includes(room),
    opened,
    resolved,
    open,
    occupants: occupantsOf(room),
  }
}

function onDoor(room: number) {
  if (can.value?.select) game.copPickRoom = room
  else if (can.value?.search) game.copPickDoor(room)
}

// --- confiscation ------------------------------------------------------------

const caught = computed(() => game.copCaught)

function takeOf(id: number): Loot {
  return game.copTakings[id] ?? { key: 0, stamp: 0, card: 0 }
}

// --- the result --------------------------------------------------------------

const result = computed(() => game.cop?.result ?? null)
const winnerNames = computed(() =>
  (result.value?.winners ?? []).map((id) => nameOf(id)).join(', '),
)

/** Standings sorted best first, for the game-over table. */
const standings = computed(() => {
  const r = result.value
  if (!r) return []
  return [...r.standings].sort(
    (a, b) => b.leaderTokens.length - a.leaderTokens.length || b.total - a.total || a.caught - b.caught,
  )
})

// --- the log -----------------------------------------------------------------

const logLines = computed(() =>
  (game.cop?.log ?? []).map((entry, i) => ({
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
        <span class="tiny muted">{{
          t('cop.roundNo', { round: game.cop?.round ?? 0, total: game.cop?.totalRounds ?? 0 })
        }}</span>
      </div>
      <div class="top-actions">
        <span class="tiny muted code">{{ t('game.room', { code: game.cop?.code ?? '' }) }}</span>
        <button v-if="game.isSeated && !isOver" class="btn ghost small" @click="game.togglePause()">
          {{ game.isPaused ? t('game.resume') : t('game.pause') }}
        </button>
        <TableMenu />
      </div>
    </header>

    <main class="table">
      <!-- Who wears the badge, and the loot you are carrying. -->
      <div class="strip">
        <div class="cop-banner">
          <span class="badge-star" aria-hidden="true">🚔</span>
          <span>
            <span class="tiny muted">{{ t('cop.theCop') }}</span>
            <strong class="cop-name" :style="{ color: copSeat ? PLAYER_COLOURS[copSeat.colour].ink : undefined }">
              {{ copSeat?.name ?? '' }}
            </strong>
          </span>
        </div>
        <div v-if="you && you.loot" class="my-loot">
          <span class="tiny muted">{{ t('cop.yourLoot') }}</span>
          <CopToken v-for="r in RESOURCES" :key="r" :resource="r" :count="you.loot[r]" size="small" />
        </div>
      </div>

      <!-- The eight doors. -->
      <div class="doors">
        <CopDoor
          v-for="(_, i) in rooms"
          :key="i"
          :room="i"
          v-bind="doorState(i)"
          @pick="onDoor(i)"
        />
      </div>

      <aside class="log panel" :class="{ folded: !logOpen }">
        <button class="log-head" type="button" @click="logOpen = !logOpen">
          <span>{{ t('cop.log.title') }}</span>
          <span aria-hidden="true">{{ logOpen ? '▾' : '▴' }}</span>
        </button>
        <ol v-if="logOpen" ref="logEl" class="log-lines">
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

    <!-- The controls, by step and role. -->
    <footer v-if="game.isSeated && !isOver" class="controls">
      <Transition name="flash">
        <p v-if="eventText" :key="eventText" class="event tiny">{{ eventText }}</p>
      </Transition>

      <!-- Choosing a door (thieves). -->
      <div v-if="can?.select" class="row">
        <p class="tiny muted">{{ t('cop.pickPrompt') }}</p>
        <button class="btn" :disabled="game.copPickRoom === null" @click="game.copSelectRoom()">
          {{
            game.copPickRoom === null
              ? t('cop.pickNone')
              : t('cop.hideHere', { n: game.copPickRoom + 1 })
          }}
        </button>
      </div>

      <!-- Opening two doors (the Cop). -->
      <div v-else-if="can?.search" class="row">
        <p class="tiny muted">{{ t('cop.searchPrompt', { n: game.copPickDoors.length }) }}</p>
        <button class="btn" :disabled="game.copPickDoors.length !== 2" @click="game.copSearch()">
          {{ t('cop.openDoors') }}
        </button>
      </div>

      <!-- Confiscating from the catch (the Cop), blind — their holdings are hidden. -->
      <div v-else-if="can?.arrest" class="arrest">
        <p class="tiny muted">{{ t('cop.arrestPrompt', { limit: CONFISCATE_LIMIT }) }}</p>
        <div class="catch-list">
          <div v-for="c in caught" :key="c.id" class="catch">
            <div class="catch-head">
              <span class="pdot" :style="{ background: PLAYER_COLOURS[c.colour].ink }" />
              <strong>{{ c.name }}</strong>
              <span class="tiny muted">
                {{ t('cop.taking', { n: game.copTakeTotal(c.id), limit: CONFISCATE_LIMIT }) }}
              </span>
            </div>
            <div class="steppers">
              <div v-for="r in RESOURCES" :key="r" class="stepper">
                <span class="stepper-label">
                  <CopToken :resource="r" size="small" />
                  <span class="tiny">{{ t(`cop.resource.${r}`) }}</span>
                </span>
                <span class="held tiny muted">{{ t('cop.holds', { n: c.loot ? c.loot[r] : 0 }) }}</span>
                <div class="pm">
                  <button
                    type="button"
                    class="btn ghost xsmall"
                    :disabled="takeOf(c.id)[r] <= 0"
                    @click="game.copAdjustTake(c.id, r, -1)"
                  >
                    −
                  </button>
                  <span class="take">{{ takeOf(c.id)[r] }}</span>
                  <button
                    type="button"
                    class="btn ghost xsmall"
                    :disabled="
                      game.copTakeTotal(c.id) >= CONFISCATE_LIMIT ||
                      takeOf(c.id)[r] >= (c.loot ? c.loot[r] : 0)
                    "
                    @click="game.copAdjustTake(c.id, r, 1)"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
        <button class="btn" @click="game.copConfiscate()">{{ t('cop.confiscate') }}</button>
      </div>

      <!-- Round resolved: anyone can deal the next one on. -->
      <div v-else-if="can?.next" class="row">
        <p class="showdown-line">{{ t('cop.roundOver') }}</p>
        <button class="btn" @click="game.copNext()">{{ t('cop.nextRound') }}</button>
      </div>

      <p v-else class="tiny muted waiting">{{ turnLabel }}</p>
    </footer>

    <!-- Game over: leader tokens and the final tally. -->
    <div v-if="isOver" class="over-veil">
      <div class="over-card panel">
        <h2>{{ winnerNames ? t('cop.winner', { name: winnerNames }) : t('cop.draw') }}</h2>
        <p class="tiny muted">{{ t(result?.winners && result.winners.length > 1 ? 'cop.result.shared' : 'cop.result.won') }}</p>

        <table class="standings">
          <thead>
            <tr>
              <th>{{ t('cop.col.player') }}</th>
              <th v-for="r in RESOURCES" :key="r">{{ t(`cop.resource.${r}`) }}</th>
              <th>{{ t('cop.col.tokens') }}</th>
              <th>{{ t('cop.col.caught') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="st in standings" :key="st.player" :class="{ win: result?.winners.includes(st.player) }">
              <td class="who">
                <span class="pdot" :style="{ background: PLAYER_COLOURS[players.find((p) => p.id === st.player)?.colour ?? 'gold'].ink }" />
                {{ nameOf(st.player) }}
              </td>
              <td v-for="r in RESOURCES" :key="r" :class="{ lead: st.leaderTokens.includes(r) }">
                {{ st.loot[r] }}
              </td>
              <td class="tokens-cell">{{ st.leaderTokens.length }}</td>
              <td>{{ st.caught }}</td>
            </tr>
          </tbody>
        </table>

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
        <button v-if="game.isSeated" class="btn" @click="game.togglePause()">{{ t('game.resume') }}</button>
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
    linear-gradient(160deg, #e9d9c2, #d9c39c);
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

.table {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
  padding: 0.9rem 1rem 1.4rem;
}

.strip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}

.cop-banner {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.5rem 0.9rem;
  border-radius: 12px;
  border: 2px solid var(--gold-line);
  background: linear-gradient(170deg, rgba(255, 252, 242, 0.96), rgba(246, 231, 193, 0.9));
  box-shadow: var(--shadow);
}

.badge-star {
  font-size: 1.5rem;
}

.cop-name {
  display: block;
  font-family: var(--font-display);
  font-size: 1.2rem;
  line-height: 1.1;
}

.my-loot {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  flex-wrap: wrap;
}

.doors {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
  gap: 0.7rem;
}

.seats {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.pcard {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.35rem 0.6rem;
  border-radius: 999px;
  border: 1px solid var(--seat);
  background: rgba(255, 253, 246, 0.75);
  font-size: 0.85rem;
}

.pcard.iscop {
  box-shadow: 0 0 0 2px rgba(47, 90, 134, 0.35);
}

.pcard.me {
  background: rgba(255, 253, 247, 0.98);
}

.pdot {
  width: 0.7rem;
  height: 0.7rem;
  border-radius: 50%;
  background: var(--seat);
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

.tag.cop-tag {
  background: rgba(47, 90, 134, 0.18);
  color: #2f5a86;
  font-weight: 700;
}

.tag.you {
  background: rgba(178, 58, 44, 0.16);
  color: var(--vermillion-dark);
}

.tag.ready {
  background: rgba(47, 122, 69, 0.18);
  color: #1f6a3a;
}

.catches {
  margin-left: 0.1rem;
}

.ploot {
  display: inline-flex;
  gap: 0.25rem;
  flex-wrap: wrap;
}

.hidden-loot {
  font-style: italic;
}

/* --- log ------------------------------------------------------------------ */

.log {
  position: absolute;
  right: 1rem;
  bottom: 1rem;
  z-index: 20;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  width: min(17rem, calc(100% - 2rem));
  max-height: min(40%, 13rem);
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

.row {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  flex-wrap: wrap;
  justify-content: center;
}

.row p {
  margin: 0;
}

.showdown-line {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.05rem;
  color: var(--vermillion-dark);
}

.waiting {
  margin: 0;
}

/* --- arrest --------------------------------------------------------------- */

.arrest {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
}

.arrest > p {
  margin: 0;
}

.catch-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.7rem;
  justify-content: center;
}

.catch {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  padding: 0.6rem 0.7rem;
  border-radius: 10px;
  border: 1px solid rgba(150, 128, 94, 0.4);
  background: rgba(255, 253, 246, 0.8);
}

.catch-head {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.steppers {
  display: flex;
  gap: 0.7rem;
}

.stepper {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.3rem;
}

.stepper-label {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  color: var(--ink-soft);
}

.held {
  font-variant-numeric: tabular-nums;
}

.pm {
  display: flex;
  align-items: center;
  gap: 0.3rem;
}

.btn.xsmall {
  padding: 0.05rem 0.45rem;
  font-size: 1rem;
  line-height: 1;
  min-width: 1.6rem;
}

.take {
  min-width: 1rem;
  text-align: center;
  font-family: var(--font-display);
  font-variant-numeric: tabular-nums;
}

/* --- overlays ------------------------------------------------------------- */

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
  max-width: 34rem;
  text-align: center;
}

.over-actions {
  display: flex;
  gap: 0.5rem;
}

.standings {
  border-collapse: collapse;
  font-size: 0.9rem;
}

.standings th,
.standings td {
  padding: 0.3rem 0.6rem;
  border-bottom: 1px solid rgba(150, 128, 94, 0.28);
  text-align: center;
}

.standings .who {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  text-align: left;
}

.standings td.lead {
  font-weight: 700;
  color: var(--vermillion-dark);
}

.standings tr.win {
  background: rgba(212, 160, 23, 0.16);
}

.tokens-cell {
  font-family: var(--font-display);
}

.flash-enter-active {
  transition: opacity 0.2s ease;
}

.flash-enter-from {
  opacity: 0;
}
</style>
