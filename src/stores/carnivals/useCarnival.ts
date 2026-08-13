import { computed, ref, watch, type ComputedRef, type Ref } from 'vue'

import type { CarnivalClientState, ClientMessage } from '@shared/protocol'

/**
 * The slice of the connection store a Carnivals table reads from. The socket and
 * the redacted `carnival` state live in the parent store; this module owns the
 * game's derived seats, the one piece of purely local state a raise needs — the
 * amount, before it is sent — and the handful of moves a player can make.
 *
 * Like Coup, almost nothing is derived here: the server decides what this viewer
 * may do and sends it as `can`, so this module's job is only to keep the buttons
 * honest and to hold the pending raise amount.
 */
export interface CarnivalContext {
  /** Carnivals' redacted state; null while another game's table is on screen. */
  carnival: Ref<CarnivalClientState | null>
  you: ComputedRef<number | null>
  send: (message: ClientMessage) => void
}

export function createCarnival(ctx: CarnivalContext) {
  const { carnival, you, send } = ctx

  /** The total a raise will commit to, held locally until it is sent. */
  const carnivalRaiseTo = ref(0)
  /** The face-down positions picked in the selecting step, before they are sent. */
  const carnivalPickRed = ref<number | null>(null)
  const carnivalPickBlue = ref<number | null>(null)

  const carnivalPlayers = computed(() => carnival.value?.players ?? [])
  const carnivalYou = computed(
    () => carnivalPlayers.value.find((p) => p.id === you.value) ?? null,
  )
  const carnivalActivePlayer = computed(
    () => carnivalPlayers.value.find((p) => p.id === carnival.value?.current) ?? null,
  )
  /** What this viewer may do, straight from the server. */
  const carnivalCan = computed(() => carnival.value?.can ?? null)
  const carnivalStep = computed(() => carnival.value?.step ?? 'selecting')
  const carnivalPot = computed(() => carnival.value?.pot ?? 0)
  const carnivalResult = computed(() => carnival.value?.roundResult ?? null)
  const carnivalHandCards = computed(() => carnival.value?.handCards ?? 10)
  const carnivalIsMyTurn = computed(
    () =>
      you.value !== null &&
      carnival.value?.current === you.value &&
      carnival.value?.step === 'betting',
  )

  /**
   * Re-seed the raise slider to the smallest legal raise whenever a fresh
   * decision lands, so it never sits on a value the previous window allowed and
   * this one does not.
   */
  watch(
    () => [carnivalCan.value?.minRaiseTo, carnival.value?.current, carnivalStep.value] as const,
    () => {
      const min = carnivalCan.value?.minRaiseTo ?? 0
      carnivalRaiseTo.value = min
    },
  )

  /** Clear a half-finished pick whenever the picking window opens or closes. */
  watch(
    () => carnivalCan.value?.select ?? false,
    () => {
      carnivalPickRed.value = null
      carnivalPickBlue.value = null
    },
  )

  function carnivalPick(colour: 'red' | 'blue', index: number) {
    if (colour === 'red') carnivalPickRed.value = index
    else carnivalPickBlue.value = index
  }

  function carnivalConfirmSelect() {
    if (!carnivalCan.value?.select) return
    if (carnivalPickRed.value === null || carnivalPickBlue.value === null) return
    send({ t: 'carnivalAct', move: 'select', red: carnivalPickRed.value, blue: carnivalPickBlue.value })
  }

  function carnivalReveal() {
    if (!carnivalCan.value?.reveal) return
    send({ t: 'carnivalAct', move: 'reveal' })
  }

  function carnivalCheck() {
    if (!carnivalCan.value?.check) return
    send({ t: 'carnivalAct', move: 'check' })
  }

  function carnivalCall() {
    if (!carnivalCan.value?.call) return
    send({ t: 'carnivalAct', move: 'call' })
  }

  function carnivalRaise(to: number = carnivalRaiseTo.value) {
    const can = carnivalCan.value
    if (!can?.raise) return
    const amount = Math.round(to)
    if (amount < can.minRaiseTo || amount > can.maxRaiseTo) return
    send({ t: 'carnivalAct', move: 'raise', to: amount })
  }

  function carnivalAllIn() {
    if (!carnivalCan.value?.allIn) return
    send({ t: 'carnivalAct', move: 'allIn' })
  }

  function carnivalFold() {
    if (!carnivalCan.value?.fold) return
    send({ t: 'carnivalAct', move: 'fold' })
  }

  function carnivalNext() {
    if (!carnivalCan.value?.nextHand) return
    send({ t: 'carnivalAct', move: 'next' })
  }

  return {
    carnivalPlayers,
    carnivalYou,
    carnivalActivePlayer,
    carnivalCan,
    carnivalStep,
    carnivalPot,
    carnivalResult,
    carnivalHandCards,
    carnivalIsMyTurn,
    carnivalRaiseTo,
    carnivalPickRed,
    carnivalPickBlue,
    carnivalPick,
    carnivalConfirmSelect,
    carnivalReveal,
    carnivalCheck,
    carnivalCall,
    carnivalRaise,
    carnivalAllIn,
    carnivalFold,
    carnivalNext,
  }
}
