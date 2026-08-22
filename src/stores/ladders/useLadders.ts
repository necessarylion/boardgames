import { computed, type ComputedRef, type Ref } from 'vue'

import type { ClientMessage, LaddersClientState } from '@shared/protocol'

/**
 * The slice of the connection store a Snakes & Ladders table reads from. The
 * socket and the `ladders` wire state live in the parent store; this module
 * owns the derived seats and the one thing a player can do — roll.
 */
export interface LaddersContext {
  ladders: Ref<LaddersClientState | null>
  you: ComputedRef<number | null>
  isPaused: ComputedRef<boolean>
  send: (message: ClientMessage) => void
}

export function createLadders(ctx: LaddersContext) {
  const { ladders, you, isPaused, send } = ctx

  const ldPlayers = computed(() => ladders.value?.players ?? [])
  const ldYou = computed(() => ldPlayers.value.find((p) => p.id === you.value) ?? null)
  const ldIsMyTurn = computed(
    () => ladders.value?.phase === 'play' && you.value !== null && ladders.value.current === you.value,
  )
  /** Mirrors the engine's guard: in play, unpaused, and your turn. */
  const canRoll = computed(() => ldIsMyTurn.value && !isPaused.value)

  function rollDie() {
    if (!canRoll.value) return
    send({ t: 'laddersRoll' })
  }

  return {
    ldPlayers,
    ldYou,
    ldIsMyTurn,
    canRoll,
    rollDie,
  }
}
