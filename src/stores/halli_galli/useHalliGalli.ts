import { computed, type ComputedRef, type Ref } from 'vue'

import type { ClientMessage, HalliClientState } from '@shared/protocol'

/**
 * The slice of the connection store a Halli Galli table reads from. The socket
 * and the redacted `halli` state live in the parent store; this module owns the
 * game's derived seats and the two things a player can do — flip and slap — and
 * is handed the shared fields it needs to gate them.
 */
export interface HalliContext {
  /** Halli Galli's redacted state; null while a Samurai table is on screen. */
  halli: Ref<HalliClientState | null>
  you: ComputedRef<number | null>
  isPaused: ComputedRef<boolean>
  send: (message: ClientMessage) => void
}

export function createHalliGalli(ctx: HalliContext) {
  const { halli, you, isPaused, send } = ctx

  const hgPlayers = computed(() => halli.value?.players ?? [])
  const hgYou = computed(() => hgPlayers.value.find((p) => p.id === you.value) ?? null)
  const hgActivePlayer = computed(
    () => hgPlayers.value.find((p) => p.id === halli.value?.current) ?? null,
  )
  /** Only the current player, in play, unpaused, with a card left, may flip. */
  const canFlip = computed(
    () =>
      halli.value?.phase === 'play' &&
      !isPaused.value &&
      you.value !== null &&
      you.value === halli.value.current &&
      !!hgYou.value &&
      !hgYou.value.out &&
      hgYou.value.stackCount > 0,
  )
  /**
   * A player may ring the bell whenever they like, so long as there is anything
   * to ring for: at least one card must be face up on the table, since with none
   * showing every ring is a guaranteed mistake. This mirrors the engine's own
   * guard exactly. An empty stack is deliberately no bar — a stackless player can
   * still ring correctly to sweep the piles back into the game, and when every
   * stack is empty a ring is the only move that can settle the frozen table.
   */
  const canSlap = computed(
    () =>
      halli.value?.phase === 'play' &&
      !isPaused.value &&
      !!hgYou.value &&
      !hgYou.value.out &&
      hgPlayers.value.some((p) => p.faceUp.length > 0),
  )

  function flipCard() {
    if (!canFlip.value) return
    send({ t: 'flip' })
  }

  function slapBell() {
    if (!canSlap.value) return
    send({ t: 'slap' })
  }

  return {
    hgPlayers,
    hgYou,
    hgActivePlayer,
    canFlip,
    canSlap,
    flipCard,
    slapBell,
  }
}
