<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import GamePicker from './GamePicker.vue'
import { COLOUR_ORDER, PLAYER_COLOURS } from '@shared/colours'
import { MAX_POSITIONS, type GameKind, type PlayerColour } from '@shared/types'
import { GAME_ART } from '@/game/artwork'
import { GAME_CARDS } from '@/game/catalogue'
import { t } from '@/i18n'
import { useGameStore } from '@/stores/game'

/**
 * The lobby every game shares: a full-page split in the start screen's image.
 * The dark side column carries the room's identity — code, invite link, the
 * game being played and the seats — and the paper column takes whatever the
 * game slots in (rules, options). The start button rides the `actions` slot and
 * is pinned, so it is never scrolled off.
 *
 * The room's identity deliberately outlives the game: the host can change what
 * is being played from here, which re-renders the paper half (and this
 * component's own wrapper class) while the code, the seats and the colours
 * carry straight over.
 */
const props = defineProps<{
  kind: GameKind
  code: string
  hostId: number | undefined
  seats: readonly {
    id: number
    name: string
    colour: PlayerColour
    position: number
    connected: boolean
  }[]
  maxSeats: number
}>()

const game = useGameStore()
const copied = ref(false)
const codeCopied = ref(false)

const card = computed(() => GAME_CARDS[props.kind])
const emptySeats = computed(() => Math.max(0, props.maxSeats - props.seats.length))
/** Colours already worn, so the picker can grey them out before the server would. */
const wornBy = computed(() => {
  const map = new Map<PlayerColour, string>()
  for (const seat of props.seats) map.set(seat.colour, seat.name)
  return map
})
const mySeat = computed(() => props.seats.find((s) => s.id === game.you) ?? null)

/** Turn positions already held, so the picker can grey them out before the
 *  server would. Who holds each one is worth saying, not just that it is gone. */
const heldBy = computed(() => {
  const map = new Map<number, string>()
  for (const seat of props.seats) map.set(seat.position, seat.name)
  return map
})

// The kind rides along so the join screen can dress itself for this game —
// the code alone cannot say which table it opens.
const shareLink = computed(
  () => `${location.origin}${location.pathname}?room=${props.code}&g=${props.kind}`,
)

/*
 * The ref is named rather than passed: a template unwraps refs on the way into
 * a handler, so `copy(link, copied)` would hand this the boolean rather than
 * the box holding it.
 */
async function copy(text: string, which: 'link' | 'code') {
  try {
    await navigator.clipboard.writeText(text)
    const flag = which === 'link' ? copied : codeCopied
    flag.value = true
    setTimeout(() => (flag.value = false), 2000)
  } catch {
    game.showError(t('lobby.copyFailed'))
  }
}

const chooseGame = (next: GameKind) => game.setGameKind(next)

/* --- what just happened -------------------------------------------------- */

/*
 * A lobby is the one screen where things change because of someone *else* —
 * a seat fills, a colour is taken, the host swaps the game out from under you.
 * None of that is worth a modal and all of it is worth a sentence, so it is
 * said once, in a live region above the seats.
 *
 * The line is kept in the store rather than here: changing the game replaces
 * this whole component, and a notice held locally would be thrown away by the
 * one event most worth announcing. The store announces that one itself; these
 * are the ones only the seats can see.
 */
const say = (text: string) => game.showNotice(text)

watch(
  () => props.seats.map((s) => `${s.id}:${s.name}`),
  (now, before) => {
    if (!before) return
    const names = (list: readonly string[]) => list.map((entry) => entry.split(':').slice(1).join(':'))
    const arrived = names(now).filter((n) => !names(before).includes(n))
    const gone = names(before).filter((n) => !names(now).includes(n))
    if (arrived.length === 1) say(t('lobby.notice.joined', { name: arrived[0] }))
    else if (arrived.length > 1) say(t('lobby.notice.joinedMany', { count: arrived.length }))
    else if (gone.length === 1) say(t('lobby.notice.left', { name: gone[0] }))
    else if (gone.length > 1) say(t('lobby.notice.leftMany', { count: gone.length }))
  },
)

watch(
  () => mySeat.value?.colour,
  (colour, before) => {
    if (!colour || !before || colour === before) return
    say(t('lobby.notice.colour', { colour: PLAYER_COLOURS[colour].label }))
  },
)
</script>

<template>
  <div class="lobby-split" :class="kind">
    <!-- `display: contents` on a desktop, so the two columns stay direct
         grid items and that layout is untouched; a scrolling box of its
         own on a phone, so the bar below is a footer rather than something
         floating over the column. -->
    <div class="panes">
      <aside class="side">
        <!-- Every game brings its own painting; the wash keeps the seats and
             code legible over it, and the gradient underneath is what shows
             until the image arrives. -->
        <img class="side-art" :src="GAME_ART[kind]" alt="" />
        <div class="side-wash"></div>
        <span class="watermark" aria-hidden="true">{{ card.glyph }}</span>
        <div class="side-scroll">
          <div class="side-inner">
            <header class="head">
              <p class="tiny muted">{{ t('lobby.roomCode') }}</p>
              <h1 class="code">
                <span v-for="(ch, i) in code" :key="i" class="code-ch">{{ ch }}</span>
              </h1>
              <div class="share">
                <button class="btn ghost small" @click="copy(shareLink, 'link')">
                  {{ copied ? t('lobby.linkCopied') : t('lobby.copyLink') }}
                </button>
                <button class="btn ghost small" @click="copy(code, 'code')">
                  {{ codeCopied ? t('lobby.codeCopied') : t('lobby.copyCode') }}
                </button>
                <button class="btn ghost small" @click="game.leaveRoom()">
                  {{ t('lobby.leave') }}
                </button>
              </div>
            </header>

            <!-- The game, which the host owns and everyone can see. It sits above
                 the seats because it decides how many of them there are. -->
            <section class="game-section">
              <h2>{{ t('lobby.game.title') }}</h2>

              <!-- The host picks from the shelf; everyone else is told what was
                   picked. Two shapes rather than one greyed-out shelf, because a
                   guest reading eight disabled cards has to work out which one
                   is the answer. -->
              <GamePicker
                v-if="game.isHost"
                class="shelf"
                :chosen="kind"
                :players="seats.length"
                @pick="chooseGame"
              />

              <template v-else>
                <div class="chosen-game">
                  <span class="seal" :class="card.seal" aria-hidden="true">{{ card.glyph }}</span>
                  <span class="chosen-name">{{ t(card.name) }}</span>
                  <span class="chosen-meta tiny">{{ t(card.meta) }}</span>
                </div>
                <p class="tiny muted host-picks">{{ t('lobby.game.hostPicks') }}</p>
              </template>
            </section>

            <section>
              <h2>
                {{ t('lobby.players') }}
                <span class="count" :class="{ full: seats.length >= maxSeats }">
                  {{ t('lobby.seatCount', { seated: seats.length, max: maxSeats }) }}
                </span>
              </h2>

              <p class="notice" role="status" aria-live="polite">
                <span v-if="game.notice">{{ game.notice }}</span>
              </p>

              <ul class="seats">
                <li v-for="seat in seats" :key="seat.id" class="seat" :class="{ mine: seat.id === game.you }">
                  <div class="seat-head">
                    <span
                      class="swatch"
                      :style="{
                        background: PLAYER_COLOURS[seat.colour].fill,
                        borderColor: PLAYER_COLOURS[seat.colour].ink,
                      }"
                      :title="PLAYER_COLOURS[seat.colour].label"
                    />
                    <!-- Read-only for everyone; the seat that owns it gets the
                         picker below as well. -->
                    <span
                      class="pos-chip"
                      :title="t('lobby.positionOf', { n: seat.position, name: seat.name })"
                      >{{ seat.position }}</span
                    >
                    <span class="seat-name">{{ seat.name }}</span>
                    <span v-if="seat.id === hostId" class="badge">{{ t('lobby.badge.host') }}</span>
                    <span v-if="seat.id === game.you" class="badge you">{{ t('lobby.badge.you') }}</span>
                    <span v-if="!seat.connected" class="badge away">{{ t('lobby.badge.away') }}</span>
                    <slot name="seat-badges" :seat="seat" />
                  </div>

                  <!-- Your own row carries the palette, and only your own: a seat
                       you do not hold has no controls at all, so there is nothing
                       to mis-tap on a phone. The server refuses a taken colour
                       anyway — first request in wins — and the disabling here only
                       saves the round trip. -->
                  <div
                    v-if="seat.id === game.you"
                    class="palette"
                    role="group"
                    :aria-label="t('lobby.pickColour')"
                  >
                    <button
                      v-for="c in COLOUR_ORDER"
                      :key="c"
                      type="button"
                      class="swatch pick"
                      :class="{ worn: c === seat.colour, taken: wornBy.has(c) && c !== seat.colour }"
                      :disabled="wornBy.has(c) && c !== seat.colour"
                      :style="{
                        background: PLAYER_COLOURS[c].fill,
                        borderColor: PLAYER_COLOURS[c].ink,
                      }"
                      :title="
                        wornBy.has(c) && c !== seat.colour
                          ? t('lobby.colourTaken', { name: wornBy.get(c) ?? '', colour: PLAYER_COLOURS[c].label })
                          : PLAYER_COLOURS[c].label
                      "
                      :aria-label="PLAYER_COLOURS[c].label"
                      :aria-pressed="c === seat.colour"
                      @click="game.setColour(c)"
                    >
                      <!-- Not colour alone: the one you are wearing carries a
                           tick, so the state survives a screen, a printout and
                           a colour deficiency. -->
                      <span v-if="c === seat.colour" class="tick" aria-hidden="true">✓</span>
                    </button>
                  </div>

                  <!-- Turn order. Vacant positions and your own are live; the
                       ones other players hold are shown, disabled, and say
                       whose they are. Nobody is ever moved by this. -->
                  <div
                    v-if="seat.id === game.you"
                    class="positions"
                    role="group"
                    :aria-label="t('lobby.pickPosition')"
                  >
                    <button
                      v-for="n in MAX_POSITIONS"
                      :key="n"
                      type="button"
                      class="pos"
                      :class="{ mine: n === seat.position, taken: heldBy.has(n) && n !== seat.position }"
                      :disabled="heldBy.has(n) && n !== seat.position"
                      :aria-pressed="n === seat.position"
                      :title="
                        heldBy.has(n) && n !== seat.position
                          ? t('lobby.positionTaken', { n, name: heldBy.get(n) ?? '' })
                          : t('lobby.positionFree', { n })
                      "
                      @click="game.setPosition(n)"
                    >
                      {{ n }}
                    </button>
                  </div>
                </li>
                <!-- One row for all the open seats: a ghost swatch per seat says
                     how many are left without repeating the line five times. -->
                <li v-if="emptySeats" class="seat empty">
                  <span v-for="n in emptySeats" :key="n" class="swatch empty-swatch" />
                  <span class="muted empty-text">{{ t('lobby.waitingForPlayer') }}</span>
                </li>
              </ul>
            </section>
          </div>
        </div>
      </aside>

      <main class="conf">
        <div class="conf-inner">
          <slot />
        </div>
      </main>
    </div>

    <!-- A footer, in both layouts, rather than the last thing in a scrolling
         column: on a phone that put "Start" under six rules and a settings
         block, reachable only by scrolling past everything the lobby is for.
         Deliberately not `position: sticky` — a stuck bar is lifted out of the
         flow and covers whatever is beneath it, which cost the browser suite a
         checkbox it could not tick. -->
    <div class="actions">
      <div class="actions-inner">
        <!-- Said once, for every game: a lobby can fill to eight for a card
             game and then be pointed at Samurai, which seats six. -->
        <p v-if="seats.length > maxSeats" class="tiny over">
          {{ t('lobby.game.tooManyNow', { game: t(card.name), max: maxSeats }) }}
        </p>
        <slot name="actions" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.lobby-split {
  height: 100%;
  overflow: hidden;
  display: grid;
  grid-template-columns: minmax(0, 0.95fr) minmax(0, 1.05fr);
  grid-template-rows: minmax(0, 1fr) auto;

  /* Each game darkens its landing gradient into a side column of its own. */
  --side-bg: linear-gradient(165deg, #14100d 0%, #1d1712 55%, #271a12 100%);
}

.lobby-split.halligalli {
  --side-bg: linear-gradient(165deg, #2e120d 0%, #59231a 55%, #7a3c1c 100%);
}

.lobby-split.coup {
  --side-bg: linear-gradient(165deg, #191223 0%, #332347 55%, #4a2f66 100%);
}

.lobby-split.carnivals {
  --side-bg: linear-gradient(165deg, #33120e 0%, #3c2233 50%, #1c3550 100%);
}

.lobby-split.cop {
  --side-bg: linear-gradient(165deg, #101d30 0%, #24303f 55%, #4a1d15 100%);
}

.lobby-split.snake {
  --side-bg: linear-gradient(165deg, #0e1f13 0%, #1a3a23 55%, #245231 100%);
}

/* Inert on a desktop: the columns below are the grid items, exactly as they
   were before the wrapper existed. */
.panes {
  display: contents;
}

/* --- left: the room ------------------------------------------------------ */

/* The wrapper clips the watermark and never scrolls itself — only the inner
   region does, and only when the seats genuinely outgrow the column. */
.side {
  position: relative;
  overflow: hidden;
  min-height: 0;
  display: flex;
  background: var(--side-bg);
  color: #f6ece0;
  grid-row: 1 / span 2;
}

/* Anchored right of centre like the start screen, so each painting's subject
   stays in frame at every width. */
.side-art {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: 72% 50%;
}

.side-wash {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    165deg,
    rgba(14, 12, 11, 0.92) 0%,
    rgba(14, 12, 11, 0.78) 55%,
    rgba(14, 12, 11, 0.6) 100%
  );
}

.watermark {
  position: absolute;
  right: -1.5rem;
  bottom: -3rem;
  font-family: var(--font-display);
  font-size: 17rem;
  line-height: 1;
  color: #f6ece0;
  opacity: 0.05;
  pointer-events: none;
  user-select: none;
}

.side-scroll {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: clamp(1.5rem, 5vw, 3.5rem) clamp(1.25rem, 4vw, 3rem);
}

.side-inner {
  max-width: 26rem;
}

.head {
  margin-bottom: 1.5rem;
}

/* The code is what you read out to friends, so it is set as four tiles —
   the same stamp treatment the invite card gives it on the way in. */
.code {
  display: inline-flex;
  gap: 0.45rem;
  font-size: 1.9rem;
  line-height: 1;
  margin-top: 0.4rem;
}

.code-ch {
  display: grid;
  place-items: center;
  width: 2.9rem;
  height: 2.9rem;
  border-radius: 10px;
  background: rgba(255, 253, 246, 0.07);
  border: 1px solid rgba(246, 236, 224, 0.3);
}

.share {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 1rem;
}

.side .btn.ghost {
  border-color: rgba(246, 236, 224, 0.4);
  background: transparent;
  color: #f6ece0;
}

.side .btn.ghost:hover:not(:disabled) {
  background: rgba(246, 236, 224, 0.12);
  border-color: rgba(246, 236, 224, 0.6);
  color: #fff;
}

.side .muted,
.side .tiny {
  color: rgba(240, 228, 212, 0.62);
}

h2,
:slotted(h2) {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 1.1rem;
  margin-bottom: 0.75rem;
}

/* The same split as the log and the player panel: the room code, the headings
   and the seat names keep Audiowide, and everything you actually read to make a
   choice — option labels, hints, counts, badges — sits in the body face. */
p,
.badge,
.count,
.empty-text,
:slotted(.badge) {
  font-family: var(--font-body);
}

/* --- the game ------------------------------------------------------------ */

.game-section {
  margin-bottom: 1.5rem;
}

.chosen-game {
  display: grid;
  grid-template-columns: auto 1fr;
  grid-template-areas:
    'seal name'
    'seal meta';
  align-items: center;
  column-gap: 0.7rem;
  padding: 0.6rem 0.7rem;
  border-radius: 10px;
  background: rgba(255, 253, 246, 0.09);
  border: 1px solid rgba(246, 236, 224, 0.22);
}

.seal {
  grid-area: seal;
  display: grid;
  place-items: center;
  width: 2.4rem;
  height: 2.4rem;
  border-radius: 8px;
  font-size: 1.2rem;
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

.chosen-name {
  grid-area: name;
  font-family: var(--font-display);
  font-size: 1rem;
}

.chosen-meta {
  grid-area: meta;
  color: rgba(240, 228, 212, 0.62);
  font-family: var(--font-body);
}

.host-picks {
  margin: 0.45rem 0 0;
}

.shelf {
  margin-top: 0.1rem;
}

/* --- the seats ----------------------------------------------------------- */

.count {
  padding: 0.12rem 0.5rem;
  border-radius: 999px;
  font-size: 0.78rem;
  background: rgba(246, 236, 224, 0.16);
  color: rgba(246, 236, 224, 0.85);
}

.count.full {
  background: rgba(215, 92, 74, 0.3);
  color: #f4b8ab;
}

/* Reserved whether or not there is anything to say, so the seats below do not
   jump a line every time someone arrives. */
.notice {
  min-height: 1.15rem;
  margin: 0 0 0.5rem;
  font-size: 0.82rem;
  color: #f0d9a8;
}

.seats {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}

.seat {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.5rem 0.65rem;
  border-radius: 8px;
  background: rgba(255, 253, 246, 0.07);
  border: 1px solid rgba(246, 236, 224, 0.16);
}

.seat.mine {
  border-color: rgba(215, 92, 74, 0.5);
  background: rgba(215, 92, 74, 0.12);
}

.seat-head {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
}

/* The turn position, beside the name on every row. */
.pos-chip {
  flex: none;
  display: grid;
  place-items: center;
  min-width: 1.5rem;
  height: 1.5rem;
  padding: 0 0.3rem;
  border-radius: 6px;
  background: rgba(246, 236, 224, 0.16);
  border: 1px solid rgba(246, 236, 224, 0.28);
  font-family: var(--font-display);
  font-size: 0.82rem;
  font-variant-numeric: tabular-nums;
}

/* Your own turn position, on the line under the palette. */
.positions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.pos {
  width: 2rem;
  height: 2rem;
  padding: 0;
  border-radius: 6px;
  border: 1px solid rgba(246, 236, 224, 0.35);
  background: rgba(255, 253, 246, 0.07);
  color: #f6ece0;
  font: inherit;
  font-family: var(--font-display);
  font-size: 0.85rem;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
}

.pos:hover:not(:disabled) {
  background: rgba(246, 236, 224, 0.2);
}

.pos.mine {
  background: var(--vermillion);
  border-color: #f6ece0;
  color: #fff;
  font-weight: 700;
  outline: 2px solid #f6ece0;
  outline-offset: 2px;
}

/* Held by somebody else: shown, not hidden, so the table can be read. */
.pos.taken {
  opacity: 0.35;
  cursor: not-allowed;
  text-decoration: line-through;
}

/* Your colour choice, on its own line under your name. */
.palette {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.pick {
  position: relative;
  display: grid;
  place-items: center;
  width: 2rem;
  height: 2rem;
  padding: 0;
  border-radius: 6px;
  cursor: pointer;
}

.tick {
  font-size: 0.9rem;
  font-weight: 700;
  line-height: 1;
  color: #fffdf7;
  text-shadow: 0 0 2px rgba(20, 16, 13, 0.85);
}

.pick.worn {
  outline: 2px solid #f6ece0;
  outline-offset: 2px;
}

/* Taken by someone else: dimmed *and* struck through, because dimming alone
   reads as "disabled for now" and this is "that one is theirs". */
.pick.taken {
  opacity: 0.4;
  cursor: not-allowed;
}

.pick.taken::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(
    to bottom right,
    transparent calc(50% - 1px),
    rgba(20, 16, 13, 0.9) calc(50% - 1px),
    rgba(20, 16, 13, 0.9) calc(50% + 1px),
    transparent calc(50% + 1px)
  );
}

.seat.empty {
  flex-direction: row;
  align-items: center;
  flex-wrap: wrap;
  border-style: dashed;
  border-color: rgba(246, 236, 224, 0.28);
  background: transparent;
  gap: 0.35rem;
}

.empty-text {
  margin-left: 0.35rem;
  font-size: 0.88rem;
}

.swatch {
  width: 1.1rem;
  height: 1.1rem;
  border-radius: 4px;
  border: 2px solid;
  flex: none;
}

.empty-swatch {
  border-color: rgba(246, 236, 224, 0.35);
  background: transparent;
}

.seat-name {
  font-weight: 600;
  word-break: break-word;
}

.badge,
:slotted(.badge) {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  padding: 0.12rem 0.4rem;
  border-radius: 4px;
  background: rgba(246, 236, 224, 0.16);
  color: rgba(246, 236, 224, 0.85);
}

.badge.you {
  background: rgba(215, 92, 74, 0.3);
  color: #f4b8ab;
}

.badge.away {
  background: rgba(140, 140, 140, 0.28);
}

/* --- right: the game's own half ------------------------------------------ */

.conf {
  grid-row: 1;
  display: flex;
  justify-content: center;
  min-height: 0;
  overflow-y: auto;
  padding: clamp(1.5rem, 5vw, 3.5rem) clamp(1.25rem, 4vw, 3rem);
  border-left: 1px solid rgba(160, 137, 102, 0.35);
}

/* Auto margins rather than `align-items: center`, so the top of the column
   stays reachable once the settings outgrow the viewport. */
.conf-inner {
  width: 100%;
  max-width: 26rem;
  margin: auto 0;
}

/* --- the start button ---------------------------------------------------- */

.actions {
  grid-row: 2;
  grid-column: 2;
  display: flex;
  justify-content: center;
  padding: 0.85rem clamp(1.25rem, 4vw, 3rem);
  border-left: 1px solid rgba(160, 137, 102, 0.35);
  border-top: 1px solid rgba(160, 137, 102, 0.35);
  background: var(--paper);
}

.actions-inner {
  width: 100%;
  max-width: 26rem;
}

.over {
  margin: 0 0 0.45rem;
  text-align: center;
  color: var(--vermillion-dark);
}

/* The slotted start button and its hint, wherever the bar is drawn. */
:slotted(.wide) {
  width: 100%;
}

:slotted(.centre) {
  text-align: center;
  margin: 0.4rem 0 0;
}

/* Shared shapes for the slotted settings, so every game's half reads alike. */
:slotted(.rules) {
  margin: 0 0 0.9rem;
  padding-left: 1.2rem;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  color: var(--ink-soft);
  line-height: 1.45;
  font-size: 0.92rem;
  font-family: var(--font-body);
}

:slotted(.check) {
  display: flex;
  gap: 0.55rem;
  align-items: flex-start;
  margin-bottom: 0.55rem;
  font-size: 0.92rem;
  line-height: 1.4;
  font-family: var(--font-body);
}

:slotted(.check.locked) {
  opacity: 0.7;
}

:slotted(p) {
  font-family: var(--font-body);
}

/* --- stacked on narrow screens ------------------------------------------- */

@media (max-width: 52rem) {
  /* Stacked, the room column is a banner and the whole screen scrolls as one —
     so this is the scroll container the pinned action bar sticks inside. */
  /* A column: the two panes scroll together above a bar that does not. */
  .lobby-split {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }

  .panes {
    display: block;
    flex: 1;
    min-height: 0;
    overflow-y: auto;
  }

  .side {
    display: block;
    grid-row: auto;
  }

  .side-scroll {
    overflow: visible;
    padding-bottom: 1.25rem;
  }

  .conf {
    grid-row: auto;
    border-left: 0;
    overflow: visible;
    padding-bottom: 1.5rem;
  }

  .conf-inner {
    margin: 0;
  }

  .actions {
    flex: none;
    border-left: 0;
    box-shadow: 0 -8px 20px rgba(28, 22, 19, 0.16);
  }

  .watermark {
    font-size: 11rem;
    right: -1rem;
    bottom: -2rem;
  }
}

/* A thumb needs more than a 17px square, and the palette is the one control
   here that is drawn rather than written. */
@media (pointer: coarse) {
  .pick,
  .pos {
    width: 2.75rem;
    height: 2.75rem;
  }
}
</style>
