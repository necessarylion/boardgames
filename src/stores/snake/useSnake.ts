import { computed, type ComputedRef, type Ref } from 'vue'

import type { ClientMessage, SnakeClientState } from '@shared/protocol'
import type { SnakeDir } from '@shared/snake'

/**
 * The slice of the connection store a Snake table reads from. The socket and
 * the `snake` wire state live in the parent store; this module owns the game's
 * derived seats and the one thing a player can do — steer.
 */
export interface SnakeContext {
  /** Snake's wire state; null while another game's table is on screen. */
  snake: Ref<SnakeClientState | null>
  you: ComputedRef<number | null>
  isPaused: ComputedRef<boolean>
  send: (message: ClientMessage) => void
}

export function createSnake(ctx: SnakeContext) {
  const { snake, you, isPaused, send } = ctx

  const snPlayers = computed(() => snake.value?.players ?? [])
  const snYou = computed(() => snPlayers.value.find((p) => p.id === you.value) ?? null)
  /** Mirrors the engine's guard: in play, unpaused, and your snake still alive. */
  const canSteer = computed(
    () => snake.value?.phase === 'play' && !isPaused.value && !!snYou.value?.alive,
  )

  function steer(dir: SnakeDir) {
    if (!canSteer.value) return
    send({ t: 'snakeDir', dir })
  }

  return {
    snPlayers,
    snYou,
    canSteer,
    steer,
  }
}
