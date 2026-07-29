import { defineStore } from 'pinia'
import { computed, ref, shallowRef, watch } from 'vue'

import { buildBoard, DEFAULT_BOARD_SHAPE, type Board } from '@shared/board'
import type { GameOptions } from '@shared/engine'
import { HEARTBEAT_MS, type ClientMessage, type ClientState, type ServerMessage } from '@shared/protocol'
import {
  canSwitch,
  hasAnySwitch,
  legalPlacements,
  moveDestinations,
  movableTiles,
  type PieceRef,
  type RulesView,
} from '@shared/rules'
import { STARTING_HAND_SIZE, tileFromId } from '@shared/tiles'
import type { BoardShape, Caste, Tile } from '@shared/types'
import { t } from '@/i18n'

/** What the local player is currently being asked to click. */
export type Interaction =
  | { mode: 'idle' }
  | { mode: 'place'; tileId: string }
  | { mode: 'switch-first'; tileId: string }
  | { mode: 'switch-second'; tileId: string; first: PieceRef }
  | { mode: 'move-pick'; tileId: string }
  | { mode: 'move-destination'; tileId: string; from: string }

export type Connection = 'connecting' | 'open' | 'closed'

const TOKEN_KEY = 'samurai.token'
const NAME_KEY = 'samurai.name'

/** No word from the server for this long means the connection is dead. */
const SILENCE_LIMIT_MS = HEARTBEAT_MS * 3

/** How long the capture notice sits there before dismissing itself. */
export const CAPTURE_NOTICE_MS = 5000

function socketUrl(): string {
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws'
  return `${protocol}://${location.host}/ws`
}

export const useGameStore = defineStore('game', () => {
  // --- connection ----------------------------------------------------------
  const connection = ref<Connection>('connecting')
  const state = ref<ClientState | null>(null)
  const error = ref<string | null>(null)
  const myName = ref(localStorage.getItem(NAME_KEY) ?? '')

  let socket: WebSocket | null = null
  let retry = 0
  let retryTimer: ReturnType<typeof setTimeout> | null = null
  let errorTimer: ReturnType<typeof setTimeout> | null = null
  let watchdog: ReturnType<typeof setInterval> | null = null
  let lastMessageAt = 0
  let listenersBound = false

  function connect() {
    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
      return
    }
    if (retryTimer) {
      clearTimeout(retryTimer)
      retryTimer = null
    }
    bindWakeListeners()
    connection.value = 'connecting'
    lastMessageAt = Date.now()

    let opening: WebSocket
    try {
      opening = new WebSocket(socketUrl())
    } catch {
      // Constructing can throw outright (for example an offline device); treat
      // it as a failed attempt so the backoff still runs.
      return scheduleRetry()
    }
    socket = opening

    socket.onopen = () => {
      retry = 0
      lastMessageAt = Date.now()
      connection.value = 'open'
      // Tell the server which table we think we are at, so it can correct us if
      // the room is gone.
      send({ t: 'hello', token: localStorage.getItem(TOKEN_KEY), code: state.value?.code ?? null })
      startWatchdog(opening)
    }

    socket.onmessage = (event) => {
      lastMessageAt = Date.now()
      let message: ServerMessage
      try {
        message = JSON.parse(event.data as string) as ServerMessage
      } catch {
        return
      }
      handle(message)
    }

    socket.onclose = () => {
      if (socket !== opening) return
      socket = null
      stopWatchdog()
      connection.value = 'closed'
      scheduleRetry()
    }

    socket.onerror = () => opening.close()
  }

  /**
   * Exponential backoff with jitter, capped, so a server restart is picked up
   * quickly while a long outage neither hammers the network nor lines every
   * player's browser up to retry on the same tick.
   */
  function scheduleRetry() {
    const delay = Math.min(500 * 2 ** retry++, 10_000)
    if (retryTimer) clearTimeout(retryTimer)
    retryTimer = setTimeout(connect, delay + Math.random() * 400)
  }

  /**
   * A socket can die without a close frame — a sleeping laptop, a proxy quietly
   * dropping an idle connection. The server pings on a fixed interval, so
   * silence for longer than that means the connection is gone whatever the
   * browser thinks its state is.
   */
  function startWatchdog(watched: WebSocket) {
    stopWatchdog()
    watchdog = setInterval(() => {
      if (Date.now() - lastMessageAt < SILENCE_LIMIT_MS) return
      stopWatchdog()
      watched.close()
    }, HEARTBEAT_MS)
  }

  function stopWatchdog() {
    if (watchdog) clearInterval(watchdog)
    watchdog = null
  }

  /**
   * Coming back from a sleeping tab or a dropped network is the moment a
   * reconnect is most likely to succeed, so try again immediately instead of
   * waiting out the backoff.
   */
  function bindWakeListeners() {
    if (listenersBound || typeof window === 'undefined') return
    listenersBound = true
    const wake = () => {
      if (document.visibilityState === 'hidden') return
      retry = 0
      connect()
    }
    window.addEventListener('online', wake)
    document.addEventListener('visibilitychange', wake)
  }

  /**
   * Set the moment we leave a table, so a state broadcast that was already in
   * flight cannot put us back at it. Cleared when we next create or join.
   */
  let hasLeft = false

  function handle(message: ServerMessage) {
    switch (message.t) {
      case 'ping':
        send({ t: 'pong' })
        break
      case 'hello':
        localStorage.setItem(TOKEN_KEY, message.token)
        break
      case 'state':
        if (hasLeft) return
        state.value = message.state
        // Any state the local player did not expect invalidates a half-finished
        // interaction (for example a piece someone else just captured).
        if (message.state.you !== message.state.current) interaction.value = { mode: 'idle' }
        reclaimSeat(message.state)
        break
      case 'error':
        showError(message.message)
        interaction.value = { mode: 'idle' }
        break
      case 'left':
        hasLeft = true
        state.value = null
        interaction.value = { mode: 'idle' }
        reclaimedFor = null
        break
    }
  }

  /**
   * A player who was away when a new game was dealt loses their seat. If they
   * are back while the room sits in the lobby, quietly take a free seat again
   * rather than stranding them as a spectator.
   */
  let reclaimedFor: string | null = null
  function reclaimSeat(next: ClientState) {
    if (next.you !== null) {
      reclaimedFor = null
      return
    }
    const full = next.players.length >= 4
    if (next.phase !== 'lobby' || full || !myName.value || reclaimedFor === next.code) return
    reclaimedFor = next.code
    send({ t: 'join', code: next.code, name: myName.value })
  }

  function showError(text: string) {
    error.value = text
    if (errorTimer) clearTimeout(errorTimer)
    errorTimer = setTimeout(() => (error.value = null), 4000)
  }

  function send(message: ClientMessage) {
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message))
    else showError(t('app.notConnected'))
  }

  // --- local interaction ---------------------------------------------------
  const interaction = ref<Interaction>({ mode: 'idle' })
  const draftPicks = ref<string[]>([])

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
  const inRoom = computed(() => state.value !== null)
  const phase = computed(() => state.value?.phase ?? 'lobby')
  const you = computed(() => state.value?.you ?? null)
  const isSeated = computed(() => you.value !== null)
  const isHost = computed(() => state.value != null && state.value.you === state.value.hostId)
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

  const view = computed<RulesView>(() => ({
    board: board.value,
    pieces: state.value?.pieces ?? {},
    placed: state.value?.placed ?? {},
    tiles: tiles.value,
    playerCount: state.value?.playerCount ?? 0,
  }))

  function isTilePlayable(tile: Tile): boolean {
    if (!isMyTurn.value) return false
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
    if (!isMyTurn.value) return []
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
    if (!isMyTurn.value) return []
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
  const mustPlace = computed(
    () => isMyTurn.value && (state.value?.placedThisTurn.length ?? 0) === 0,
  )

  // --- room actions --------------------------------------------------------
  function rememberName(name: string) {
    myName.value = name
    localStorage.setItem(NAME_KEY, name)
  }

  function createRoom(name: string, options: GameOptions) {
    rememberName(name)
    hasLeft = false
    send({ t: 'create', name, options })
  }

  function joinRoom(code: string, name: string) {
    rememberName(name)
    hasLeft = false
    send({ t: 'join', code: code.trim().toUpperCase(), name })
  }

  const leaveRoom = () => send({ t: 'leave' })
  const setOptions = (options: GameOptions) => send({ t: 'options', options })
  const startGame = () => send({ t: 'start' })
  const rematch = () => send({ t: 'rematch' })
  /** Host only: end the game in progress and take everyone back to the lobby. */
  const abandonGame = () => send({ t: 'abandon' })

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

  return {
    // connection
    connection,
    connect,
    error,
    showError,
    myName,
    rememberName,
    // state
    state,
    inRoom,
    phase,
    you,
    isSeated,
    isHost,
    players,
    me,
    activePlayer,
    isMyTurn,
    board,
    hand,
    tiles,
    view,
    draftPool,
    draftPicks,
    interaction,
    playableTileIds,
    highlightedSpaces,
    selectablePieces,
    canEndTurn,
    canUndo,
    mustPlace,
    capturedNotice,
    dismissCaptureNotice,
    // actions
    createRoom,
    joinRoom,
    leaveRoom,
    setOptions,
    startGame,
    rematch,
    abandonGame,
    toggleDraftPick,
    randomiseDraft,
    confirmDraft,
    selectTile,
    cancelInteraction,
    clickSpace,
    clickPiece,
    endTurn,
    undoPlacement,
  }
})
