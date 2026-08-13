import { computed, ref, watch, type ComputedRef, type Ref } from 'vue'

import { CONFISCATE_LIMIT, type Loot } from '@shared/cop'
import type { ClientMessage, CopClientState } from '@shared/protocol'

/**
 * The slice of the connection store a COP table reads from. The socket and the
 * redacted `cop` state live in the parent store; this module owns the game's
 * derived seats, the little local state the choices need before they are sent —
 * the door a thief is about to pick, and the loot the Cop is about to confiscate
 * from each caught thief — and the handful of moves a player can make.
 *
 * Like Coup and Carnivals, almost nothing is derived here: the server decides
 * what this viewer may do and sends it as `can`, so this module only keeps the
 * buttons honest and holds the half-made choices.
 */
export interface CopContext {
  /** COP's redacted state; null while another game's table is on screen. */
  cop: Ref<CopClientState | null>
  you: ComputedRef<number | null>
  send: (message: ClientMessage) => void
}

const emptyLoot = (): Loot => ({ key: 0, stamp: 0, card: 0 })

export function createCop(ctx: CopContext) {
  const { cop, you, send } = ctx

  /** The door a thief has tapped but not yet committed to. */
  const copPickRoom = ref<number | null>(null)
  /** The two doors the Cop has selected to open, in tap order. */
  const copPickDoors = ref<number[]>([])
  /** What the Cop is about to take from each caught thief, by seat id. */
  const copTakings = ref<Record<number, Loot>>({})

  const copPlayers = computed(() => cop.value?.players ?? [])
  const copYou = computed(() => copPlayers.value.find((p) => p.id === you.value) ?? null)
  const copCopSeat = computed(() => copPlayers.value.find((p) => p.id === cop.value?.cop) ?? null)
  const copRooms = computed(() => cop.value?.rooms ?? [])
  const copCan = computed(() => cop.value?.can ?? null)
  const copStep = computed(() => cop.value?.step ?? 'select')
  const copResult = computed(() => cop.value?.roundResult ?? null)
  const copIsCop = computed(() => you.value !== null && cop.value?.cop === you.value)
  /** The other thieves the server has revealed sharing your room this round. */
  const copRoommates = computed(() => cop.value?.roommates ?? [])
  /** The caught thieves this round, resolved to their seats, for the arrest UI. */
  const copCaught = computed(() => {
    const ids = cop.value?.roundResult?.caught ?? []
    return ids.map((id) => copPlayers.value.find((p) => p.id === id)).filter((p) => p != null)
  })

  /** Clear the half-made room pick whenever the choosing window opens or closes. */
  watch(
    () => copCan.value?.select ?? false,
    () => {
      copPickRoom.value = null
    },
  )

  /** Clear the Cop's door picks whenever the search window opens or closes. */
  watch(
    () => copCan.value?.search ?? false,
    () => {
      copPickDoors.value = []
    },
  )

  /** Seed a fresh, empty confiscation for each caught thief when the arrest opens. */
  watch(
    () => copCan.value?.arrest ?? false,
    (open) => {
      if (!open) return
      const next: Record<number, Loot> = {}
      for (const p of copCaught.value) next[p.id] = emptyLoot()
      copTakings.value = next
    },
  )

  function copPickDoor(room: number) {
    const doors = copPickDoors.value
    if (doors.includes(room)) {
      copPickDoors.value = doors.filter((d) => d !== room)
    } else if (doors.length < 2) {
      copPickDoors.value = [...doors, room]
    } else {
      // Already holding two: replace the older of them, so a third tap just moves
      // the selection along rather than being ignored.
      copPickDoors.value = [doors[1], room]
    }
  }

  /**
   * Nudge one resource of one caught thief's confiscation up or down. Bounded by
   * the four-resource cap and by what the thief actually holds — the Cop sees a
   * caught thief's loot during the arrest, so a take can never exceed it.
   */
  function copAdjustTake(playerId: number, resource: keyof Loot, delta: number) {
    const take = { ...(copTakings.value[playerId] ?? emptyLoot()) }
    const held = copPlayers.value.find((p) => p.id === playerId)?.loot?.[resource] ?? 0
    const next = take[resource] + delta
    if (next < 0 || next > held) return
    take[resource] = next
    const total = take.key + take.stamp + take.card
    if (total > CONFISCATE_LIMIT) return
    copTakings.value = { ...copTakings.value, [playerId]: take }
  }

  const copTakeTotal = (playerId: number) => {
    const t = copTakings.value[playerId] ?? emptyLoot()
    return t.key + t.stamp + t.card
  }

  function copSelectRoom() {
    if (!copCan.value?.select || copPickRoom.value === null) return
    send({ t: 'copSelect', room: copPickRoom.value })
  }

  function copSearch() {
    if (!copCan.value?.search || copPickDoors.value.length !== 2) return
    send({ t: 'copSearch', doorA: copPickDoors.value[0], doorB: copPickDoors.value[1] })
  }

  function copConfiscate() {
    if (!copCan.value?.arrest) return
    send({ t: 'copConfiscate', takings: copTakings.value })
  }

  function copNext() {
    if (!copCan.value?.next) return
    send({ t: 'copNext' })
  }

  return {
    copPlayers,
    copYou,
    copCopSeat,
    copRooms,
    copCan,
    copStep,
    copResult,
    copIsCop,
    copRoommates,
    copCaught,
    copPickRoom,
    copPickDoors,
    copTakings,
    copPickDoor,
    copAdjustTake,
    copTakeTotal,
    copSelectRoom,
    copSearch,
    copConfiscate,
    copNext,
  }
}
