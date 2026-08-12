import { computed, ref, watch, type ComputedRef, type Ref } from 'vue'

import type { CoupActionKind, CoupCharacter } from '@shared/coup'
import type { ClientMessage, CoupClientState } from '@shared/protocol'

/**
 * The slice of the connection store a Coup table reads from. The socket and the
 * redacted `coup` state live in the parent store; this module owns the game's
 * derived seats, the local selection a targeted action needs, and the six things
 * a player can send.
 *
 * Unlike Samurai, almost nothing is derived here: the server decides what this
 * viewer may do and sends it as `can`, because a challenge window cannot be
 * worked out from a redacted hand without guessing. This module's job is to keep
 * the buttons honest and to hold the one piece of purely local state — which
 * seat a targeted action is aimed at, before it is sent.
 */
export interface CoupContext {
  /** Coup's redacted state; null while another game's table is on screen. */
  coup: Ref<CoupClientState | null>
  you: ComputedRef<number | null>
  send: (message: ClientMessage) => void
}

export function createCoup(ctx: CoupContext) {
  const { coup, you, send } = ctx

  /** The action awaiting a target, held locally until the seat is picked. */
  const coupAiming = ref<CoupActionKind | null>(null)
  /** Which cards an exchange will keep, as indices into hand followed by drawn. */
  const coupKeeping = ref<number[]>([])

  const coupPlayers = computed(() => coup.value?.players ?? [])
  const coupYou = computed(() => coupPlayers.value.find((p) => p.id === you.value) ?? null)
  const coupActivePlayer = computed(
    () => coupPlayers.value.find((p) => p.id === coup.value?.current) ?? null,
  )
  /** What this viewer may do, straight from the server. */
  const coupCan = computed(() => coup.value?.can ?? null)
  const coupPending = computed(() => coup.value?.pending ?? null)
  const coupHand = computed(() => coup.value?.hand ?? [])
  const coupDrawn = computed(() => coup.value?.drawn ?? [])
  /** Your hand followed by the drawn pair — what an exchange picks from. */
  const coupExchangePool = computed(() => [...coupHand.value, ...coupDrawn.value])
  const coupIsMyTurn = computed(
    () => you.value !== null && coup.value?.current === you.value && !coup.value?.pending,
  )

  /**
   * A stale selection is worse than none: any state that ends the window the
   * player was answering clears what they had half-chosen.
   */
  watch(
    () => coupPending.value?.step ?? null,
    () => {
      coupAiming.value = null
      coupKeeping.value = []
    },
  )

  function coupAim(action: CoupActionKind) {
    coupAiming.value = coupAiming.value === action ? null : action
  }

  /** Declare an action, aiming it at a seat when it needs one. */
  function coupAct(action: CoupActionKind, target: number | null = null) {
    if (!coupCan.value?.actions.includes(action)) return
    send({ t: 'coupAct', action, target })
    coupAiming.value = null
  }

  function coupChallenge() {
    if (!coupCan.value?.challenge) return
    send({ t: 'coupChallenge' })
  }

  function coupBlock(character: CoupCharacter) {
    if (!coupCan.value?.blocks.includes(character)) return
    send({ t: 'coupBlock', character })
  }

  function coupPass() {
    if (!coupCan.value?.pass) return
    send({ t: 'coupPass' })
  }

  function coupLose(character: CoupCharacter) {
    if (!coupCan.value?.lose) return
    send({ t: 'coupLose', character })
  }

  /** Toggle one card of the exchange, up to the number that must be kept. */
  function coupToggleKeep(index: number) {
    const wanted = coupCan.value?.exchange
    if (wanted === null || wanted === undefined) return
    const picked = coupKeeping.value
    if (picked.includes(index)) coupKeeping.value = picked.filter((i) => i !== index)
    else if (picked.length < wanted) coupKeeping.value = [...picked, index]
  }

  function coupConfirmExchange() {
    const wanted = coupCan.value?.exchange
    if (wanted === null || wanted === undefined) return
    if (coupKeeping.value.length !== wanted) return
    send({ t: 'coupExchange', keep: [...coupKeeping.value] })
    coupKeeping.value = []
  }

  return {
    coupPlayers,
    coupYou,
    coupActivePlayer,
    coupCan,
    coupPending,
    coupHand,
    coupDrawn,
    coupExchangePool,
    coupIsMyTurn,
    coupAiming,
    coupKeeping,
    coupAim,
    coupAct,
    coupChallenge,
    coupBlock,
    coupPass,
    coupLose,
    coupToggleKeep,
    coupConfirmExchange,
  }
}
