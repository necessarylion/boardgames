import { computed, ref, shallowRef, watch, type ComputedRef, type Ref } from 'vue'

import { buildBoard, DEFAULT_BOARD_SHAPE, type Board } from '@shared/board'
import type { Phase } from '@shared/engine'
import type { ClientMessage, ClientState } from '@shared/protocol'
import {
  canSwitch,
  hasAnySwitch,
  legalPlacements,
  moveDestinations,
  movableTiles,
  teamLeader,
  teamOf,
  type PieceRef,
  type RulesView,
} from '@shared/rules'
import { STARTING_HAND_SIZE, tileFromId } from '@shared/tiles'
import type { BoardShape, Caste, Tile } from '@shared/types'

/** What the local player is currently being asked to click. */
export type Interaction =
  | { mode: 'idle' }
  | { mode: 'place'; tileId: string }
  | { mode: 'switch-first'; tileId: string }
  | { mode: 'switch-second'; tileId: string; first: PieceRef }
  | { mode: 'move-pick'; tileId: string }
  | { mode: 'move-destination'; tileId: string; from: string }

/** How long the capture notice sits there before dismissing itself. */
export const CAPTURE_NOTICE_MS = 5000

/**
 * The slice of the connection store a Samurai table reads from. The socket and
 * the redacted `state` live in the parent store; this module owns everything
 * that is Samurai's alone — the board, the hand, the interaction the player is
 * mid-way through, and the turn actions — and is handed the shared fields it
 * needs to derive them.
 */
export interface SamuraiContext {
  /** Samurai's redacted state; null while a Halli Galli table is on screen. */
  state: Ref<ClientState | null>
  you: ComputedRef<number | null>
  phase: ComputedRef<'lobby' | Phase>
  isPaused: ComputedRef<boolean>
  send: (message: ClientMessage) => void
}

export function createSamurai(ctx: SamuraiContext) {
  const { state, you, phase, isPaused, send } = ctx

  // --- local interaction ---------------------------------------------------
  const interaction = ref<Interaction>({ mode: 'idle' })
  const draftPicks = ref<string[]>([])

  /** The connection layer calls this whenever an unexpected state arrives. */
  const resetInteraction = () => (interaction.value = { mode: 'idle' })

  // --- capture notice ------------------------------------------------------
  /**
   * What the local player captured on the turn that just ended, announced once
   * and only to them — `captured` otherwise grows behind the screen with nothing
   * on screen to mark it.
   *
   * `lastCaptures` is rewritten by the server only when a turn ends, and neither
   * `turnNumber` nor `current` moves at any other point, so that pair identifies
   * the turn-end this state belongs to. Keying on it announces each capture
   * exactly once however many broadcasts follow, and a client that arrives or
   * reconnects mid-turn takes the key as its baseline instead of replaying a
   * capture it has already seen. The final turn is deliberately silent: the
   * engine leaves both fields alone when the game ends, so the result dialog is
   * the only thing that opens.
   */
  const capturedNotice = ref<Caste[]>([])
  let captureTimer: ReturnType<typeof setTimeout> | null = null
  let lastTurnKey: string | null = null

  function dismissCaptureNotice() {
    if (captureTimer) clearTimeout(captureTimer)
    captureTimer = null
    capturedNotice.value = []
  }

  watch(state, (next) => {
    const key = next ? `${next.turnNumber}:${next.current}` : null
    if (key === lastTurnKey) return
    const baseline = lastTurnKey === null
    lastTurnKey = key
    if (baseline || !next || next.you === null) return

    const mine = next.lastCaptures.filter((c) => c.winner === next.you).map((c) => c.caste)
    if (!mine.length) return
    dismissCaptureNotice()
    capturedNotice.value = mine
    captureTimer = setTimeout(dismissCaptureNotice, CAPTURE_NOTICE_MS)
  })

  // --- derived -------------------------------------------------------------
  const players = computed(() => state.value?.players ?? [])
  const me = computed(() => players.value.find((p) => p.id === you.value) ?? null)
  const activePlayer = computed(
    () => players.value.find((p) => p.id === state.value?.current) ?? null,
  )
  const isMyTurn = computed(
    () => phase.value === 'play' && you.value !== null && you.value === state.value?.current,
  )

  /**
   * The board is fully determined by the player count and the table's chosen
   * shape, so it is rebuilt locally rather than sent. Both are part of the cache
   * key — keying on the count alone would keep a stale map after a rematch that
   * changed the shape.
   */
  const boardCache = shallowRef<{ count: number; shape: BoardShape; board: Board } | null>(null)
  const board = computed<Board>(() => {
    const count = state.value?.playerCount ?? 0
    const shape = state.value?.options.boardShape ?? DEFAULT_BOARD_SHAPE
    if (count < 2) return { spaces: {}, order: [] }
    if (boardCache.value?.count !== count || boardCache.value.shape !== shape) {
      boardCache.value = { count, shape, board: buildBoard(count, shape) }
    }
    return boardCache.value.board
  })

  const hand = computed<Tile[]>(() => (state.value?.hand ?? []).map(tileFromId))
  const draftPool = computed<Tile[]>(() => (state.value?.draftPool ?? []).map(tileFromId))

  /** Definitions for every tile on the board, rebuilt from ids. */
  const tiles = computed<Record<string, Tile>>(() => {
    const out: Record<string, Tile> = {}
    for (const placed of Object.values(state.value?.placed ?? {})) {
      out[placed.tileId] = tileFromId(placed.tileId)
    }
    for (const tile of hand.value) out[tile.id] = tile
    return out
  })

  /** How many sides the table plays in; a free-for-all reads as zero. */
  const teamCount = computed(() => state.value?.options.teams ?? 0)
  const isTeamGame = computed(() => teamCount.value >= 2)
  const teamOfPlayer = (id: number) => teamOf(id, teamCount.value)
  const myTeam = computed(() => (you.value === null ? null : teamOfPlayer(you.value)))
  /** Custom side names by team index; blanks fall back to a letter on display. */
  const teamNames = computed<string[]>(() => state.value?.teamNames ?? [])
  /**
   * The side this player leads, or null. The leadership rule lives in
   * `teamLeader` so the client and the server agree on who may rename a side.
   */
  const myLedTeam = computed(() => {
    if (you.value === null || !isTeamGame.value) return null
    const team = teamOfPlayer(you.value)
    return teamLeader(team) === you.value ? team : null
  })

  const view = computed<RulesView>(() => ({
    board: board.value,
    pieces: state.value?.pieces ?? {},
    placed: state.value?.placed ?? {},
    tiles: tiles.value,
    playerCount: state.value?.playerCount ?? 0,
    teams: teamCount.value,
  }))

  function isTilePlayable(tile: Tile): boolean {
    if (!isMyTurn.value || isPaused.value) return false
    if (!tile.fast && state.value?.playedNonFast) return false
    if (tile.kind === 'switch') return hasAnySwitch(view.value)
    if (tile.kind === 'move') {
      const sources = movableTiles(view.value, tile.owner, state.value?.placedThisTurn ?? [])
      return sources.some((from) => moveDestinations(view.value, from).length > 0)
    }
    return legalPlacements(view.value, tile).length > 0
  }

  const playableTileIds = computed(() =>
    hand.value.filter((tile) => isTilePlayable(tile)).map((tile) => tile.id),
  )

  const highlightedSpaces = computed<string[]>(() => {
    const act = interaction.value
    if (!isMyTurn.value || isPaused.value) return []
    switch (act.mode) {
      case 'place':
        return legalPlacements(view.value, tileFromId(act.tileId))
      case 'move-pick':
        return movableTiles(view.value, you.value!, state.value?.placedThisTurn ?? [])
      case 'move-destination':
        return moveDestinations(view.value, act.from)
      default:
        return []
    }
  })

  function allPieceRefs(): PieceRef[] {
    const refs: PieceRef[] = []
    for (const spaceId of board.value.order) {
      const list = state.value?.pieces[spaceId]
      if (list) list.forEach((_, index) => refs.push({ spaceId, index }))
    }
    return refs
  }

  const selectablePieces = computed<PieceRef[]>(() => {
    const act = interaction.value
    if (!isMyTurn.value || isPaused.value) return []
    if (act.mode === 'switch-first') {
      const refs = allPieceRefs()
      return refs.filter((ref) => refs.some((other) => canSwitch(view.value, ref, other)))
    }
    if (act.mode === 'switch-second') {
      return allPieceRefs().filter((ref) => canSwitch(view.value, act.first, ref))
    }
    return []
  })

  const canEndTurn = computed(() => isMyTurn.value && (state.value?.canEndTurn ?? false))
  /** The server decides this; it is false for everyone but the active player. */
  const canUndo = computed(() => isMyTurn.value && (state.value?.canUndo ?? false))
  /** The server gates this on the active player, round two, and no move made yet. */
  const canRedraw = computed(() => state.value?.canRedraw ?? false)
  const mustPlace = computed(
    () => isMyTurn.value && (state.value?.placedThisTurn.length ?? 0) === 0,
  )

  // --- draft ---------------------------------------------------------------
  function toggleDraftPick(tileId: string) {
    const at = draftPicks.value.indexOf(tileId)
    if (at >= 0) draftPicks.value.splice(at, 1)
    else if (draftPicks.value.length < STARTING_HAND_SIZE) draftPicks.value.push(tileId)
  }

  function randomiseDraft() {
    const pool = draftPool.value.map((t) => t.id)
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[pool[i], pool[j]] = [pool[j], pool[i]]
    }
    draftPicks.value = pool.slice(0, STARTING_HAND_SIZE)
  }

  function confirmDraft() {
    if (draftPicks.value.length !== STARTING_HAND_SIZE) return
    send({ t: 'draft', picks: [...draftPicks.value] })
    draftPicks.value = []
  }

  // --- turn actions --------------------------------------------------------
  function selectTile(tileId: string) {
    if (!isMyTurn.value) return
    const tile = tiles.value[tileId] ?? tileFromId(tileId)
    if (!state.value?.hand.includes(tileId) || !isTilePlayable(tile)) return

    if ('tileId' in interaction.value && interaction.value.tileId === tileId) {
      interaction.value = { mode: 'idle' }
      return
    }
    if (tile.kind === 'switch') interaction.value = { mode: 'switch-first', tileId }
    else if (tile.kind === 'move') interaction.value = { mode: 'move-pick', tileId }
    else interaction.value = { mode: 'place', tileId }
  }

  const cancelInteraction = () => (interaction.value = { mode: 'idle' })

  function clickSpace(spaceId: string) {
    const act = interaction.value
    if (!isMyTurn.value) return

    if (act.mode === 'place') {
      if (!highlightedSpaces.value.includes(spaceId)) return
      send({ t: 'play', tileId: act.tileId, spaceId })
      interaction.value = { mode: 'idle' }
      return
    }
    if (act.mode === 'move-pick') {
      if (!highlightedSpaces.value.includes(spaceId)) return
      interaction.value = { mode: 'move-destination', tileId: act.tileId, from: spaceId }
      return
    }
    if (act.mode === 'move-destination') {
      if (!highlightedSpaces.value.includes(spaceId)) return
      send({ t: 'move', tileId: act.tileId, from: act.from, to: spaceId })
      interaction.value = { mode: 'idle' }
    }
  }

  function clickPiece(ref: PieceRef) {
    const act = interaction.value
    if (!isMyTurn.value) return
    const same = (a: PieceRef, b: PieceRef) => a.spaceId === b.spaceId && a.index === b.index

    if (act.mode === 'switch-first') {
      if (!selectablePieces.value.some((p) => same(p, ref))) return
      interaction.value = { mode: 'switch-second', tileId: act.tileId, first: ref }
      return
    }
    if (act.mode === 'switch-second') {
      if (same(act.first, ref)) {
        interaction.value = { mode: 'switch-first', tileId: act.tileId }
        return
      }
      if (!canSwitch(view.value, act.first, ref)) return
      send({ t: 'switch', tileId: act.tileId, a: act.first, b: ref })
      interaction.value = { mode: 'idle' }
    }
  }

  function endTurn() {
    if (!canEndTurn.value) return
    send({ t: 'endTurn' })
    interaction.value = { mode: 'idle' }
  }

  /** Take back the last placement of this turn. Repeat to unwind the whole turn. */
  function undoPlacement() {
    if (!canUndo.value) return
    send({ t: 'undo' })
    // Whatever the player was half-way through choosing no longer applies.
    interaction.value = { mode: 'idle' }
  }

  /** Trade the whole hand for a fresh draw — free, once a turn, from round two. */
  function redrawHand() {
    if (!canRedraw.value) return
    send({ t: 'redraw' })
    interaction.value = { mode: 'idle' }
  }

  return {
    players,
    me,
    activePlayer,
    isMyTurn,
    board,
    hand,
    tiles,
    view,
    teamCount,
    isTeamGame,
    teamOfPlayer,
    myTeam,
    teamNames,
    myLedTeam,
    draftPool,
    draftPicks,
    interaction,
    resetInteraction,
    playableTileIds,
    highlightedSpaces,
    selectablePieces,
    canEndTurn,
    canUndo,
    canRedraw,
    mustPlace,
    capturedNotice,
    dismissCaptureNotice,
    toggleDraftPick,
    randomiseDraft,
    confirmDraft,
    selectTile,
    cancelInteraction,
    clickSpace,
    clickPiece,
    endTurn,
    undoPlacement,
    redrawHand,
  }
}
