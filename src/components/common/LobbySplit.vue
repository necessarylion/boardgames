<script setup lang="ts">
import { computed, ref } from 'vue'
import mainBackground from '../../../assets/mainbg.png'
import { COLOUR_ORDER, PLAYER_COLOURS } from '@shared/colours'
import type { GameKind, PlayerColour } from '@shared/types'
import { t } from '@/i18n'
import { useGameStore } from '@/stores/game'

/**
 * The lobby every game shares: a full-page split in the create-room screen's
 * image. The dark side column carries the room's identity — code tiles, invite
 * link and seats — and the paper column takes whatever the game slots in
 * (rules, options, the start button). Per-game colour comes from the `kind`
 * class; per-game badges ride the `seat-badges` slot.
 */
const props = defineProps<{
  kind: GameKind
  code: string
  hostId: number | undefined
  seats: readonly { id: number; name: string; colour: PlayerColour; connected: boolean }[]
  maxSeats: number
}>()

const GLYPHS: Record<GameKind, string> = {
  samurai: '侍',
  halligalli: '🔔',
  coup: '👑',
  carnivals: '🎪',
  cop: '🚔',
  snake: '🐍',
}

const game = useGameStore()
const copied = ref(false)

const emptySeats = computed(() => props.maxSeats - props.seats.length)
/** Colours already worn, so the picker can grey them out before the server would. */
const worn = computed(() => new Set(props.seats.map((s) => s.colour)))
// The kind rides along so the join screen can dress itself for this game —
// the code alone cannot say which table it opens.
const shareLink = computed(
  () => `${location.origin}${location.pathname}?room=${props.code}&g=${props.kind}`,
)

async function copyLink() {
  try {
    await navigator.clipboard.writeText(shareLink.value)
    copied.value = true
    setTimeout(() => (copied.value = false), 2000)
  } catch {
    game.showError(t('lobby.copyFailed'))
  }
}
</script>

<template>
  <div class="lobby-split" :class="kind">
    <aside class="side">
      <!-- Samurai brings artwork; the wash keeps the seats and code legible
           over it. The other games paint their gradient instead. -->
      <img v-if="kind === 'samurai'" class="side-art" :src="mainBackground" alt="" />
      <div v-if="kind === 'samurai'" class="side-wash"></div>
      <span class="watermark" aria-hidden="true">{{ GLYPHS[kind] }}</span>
      <div class="side-scroll">
        <div class="side-inner">
          <header class="head">
            <p class="tiny muted">{{ t('lobby.roomCode') }}</p>
            <h1 class="code">
              <span v-for="(ch, i) in code" :key="i" class="code-ch">{{ ch }}</span>
            </h1>
            <div class="share">
              <button class="btn ghost small" @click="copyLink">
                {{ copied ? t('lobby.linkCopied') : t('lobby.copyLink') }}
              </button>
              <button class="btn ghost small" @click="game.leaveRoom()">{{ t('lobby.leave') }}</button>
            </div>
          </header>

          <section>
            <h2>
              {{ t('lobby.players') }}
              <span class="tiny muted">
                {{ t('lobby.seatCount', { seated: seats.length, max: maxSeats }) }}
              </span>
            </h2>
            <ul class="seats">
              <li v-for="seat in seats" :key="seat.id" class="seat">
                <span
                  class="swatch"
                  :style="{
                    background: PLAYER_COLOURS[seat.colour].fill,
                    borderColor: PLAYER_COLOURS[seat.colour].ink,
                  }"
                />
                <span class="seat-name">{{ seat.name }}</span>
                <span v-if="seat.id === hostId" class="badge">{{ t('lobby.badge.host') }}</span>
                <span v-if="seat.id === game.you" class="badge you">{{ t('lobby.badge.you') }}</span>
                <span v-if="!seat.connected" class="badge away">{{ t('lobby.badge.away') }}</span>
                <slot name="seat-badges" :seat="seat" />
                <!-- Your own row carries the palette: pick any colour nobody
                     else is wearing. The server refuses a taken one anyway;
                     the disabling only saves the round trip. -->
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
                    :class="{ worn: c === seat.colour }"
                    :disabled="worn.has(c) && c !== seat.colour"
                    :style="{
                      background: PLAYER_COLOURS[c].fill,
                      borderColor: PLAYER_COLOURS[c].ink,
                    }"
                    :title="PLAYER_COLOURS[c].label"
                    :aria-label="PLAYER_COLOURS[c].label"
                    @click="game.setColour(c)"
                  />
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
</template>

<style scoped>
.lobby-split {
  height: 100%;
  overflow: hidden;
  display: grid;
  grid-template-columns: minmax(0, 0.95fr) minmax(0, 1.05fr);

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
}

/* Anchored right of centre like the home screen, so the standing figure stays
   in frame at every width. */
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
  padding: clamp(2rem, 5vw, 3.5rem) clamp(1.5rem, 4vw, 3rem);
}

.side-inner {
  max-width: 26rem;
}

.head {
  margin-bottom: 2rem;
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
  align-items: baseline;
  gap: 0.5rem;
  font-size: 1.1rem;
  margin-bottom: 0.75rem;
}

/* The same split as the log and the player panel: the room code, the headings
   and the seat names keep Audiowide, and everything you actually read to make a
   choice — option labels, hints, counts, badges — sits in the body face. */
p,
.badge,
h2 .tiny,
.empty-text,
:slotted(.badge) {
  font-family: var(--font-body);
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
  align-items: center;
  flex-wrap: wrap;
  gap: 0.6rem;
  padding: 0.5rem 0.65rem;
  border-radius: 8px;
  background: rgba(255, 253, 246, 0.07);
  border: 1px solid rgba(246, 236, 224, 0.16);
}

/* Your colour choice, on its own line under your name. */
.palette {
  flex-basis: 100%;
  display: flex;
  gap: 0.35rem;
}

.pick {
  padding: 0;
  cursor: pointer;
}

.pick.worn {
  outline: 2px solid #f6ece0;
  outline-offset: 1px;
}

.pick:disabled {
  opacity: 0.25;
  cursor: not-allowed;
}

.seat.empty {
  border-style: dashed;
  border-color: rgba(246, 236, 224, 0.28);
  background: transparent;
  gap: 0.35rem;
  flex-wrap: wrap;
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
  display: flex;
  justify-content: center;
  min-height: 0;
  overflow-y: auto;
  padding: clamp(2rem, 5vw, 3.5rem) clamp(1.25rem, 4vw, 3rem);
  border-left: 1px solid rgba(160, 137, 102, 0.35);
}

/* Auto margins rather than `align-items: center`, so the top of the column
   stays reachable once the settings outgrow the viewport. */
.conf-inner {
  width: 100%;
  max-width: 26rem;
  margin: auto 0;
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

:slotted(.wide) {
  width: 100%;
  margin-top: 0.5rem;
}

:slotted(.centre) {
  text-align: center;
  margin: 0.4rem 0 0;
}

/* --- stacked on narrow screens ------------------------------------------- */

@media (max-width: 52rem) {
  /* Stacked, the room column is a banner and the whole screen scrolls as one. */
  .lobby-split {
    grid-template-columns: 1fr;
    height: auto;
    min-height: 100%;
    overflow-y: auto;
  }

  .side {
    display: block;
  }

  .side-scroll {
    overflow: visible;
    padding-bottom: 1.5rem;
  }

  .conf {
    border-left: 0;
    overflow: visible;
  }

  .conf-inner {
    margin: 0;
  }
}
</style>
