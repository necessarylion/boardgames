import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import type { GameOptions } from '@shared/engine'
import {
  CLOSE_REPLACED,
  HEARTBEAT_MS,
  PROTOCOL_VERSION,
  type AnyClientState,
  type CarnivalClientState,
  type ClientMessage,
  type ClientState,
  type CopClientState,
  type CoupClientState,
  type HalliClientState,
  type LaddersClientState,
  type MonopolyClientState,
  type ServerMessage,
  type SnakeClientState,
} from '@shared/protocol'
import { maxPlayersFor, type GameKind, type PlayerColour } from '@shared/types'
import { GAME_CARDS } from '@/game/catalogue'
import { t } from '@/i18n'
import { createCarnival } from './carnivals/useCarnival'
import { createCop } from './cop/useCop'
import { createCoup } from './coup/useCoup'
import { createHalliGalli } from './halli_galli/useHalliGalli'
import { createLadders } from './ladders/useLadders'
import { createMonopoly } from './monopoly/useMonopoly'
import { createSamurai } from './samurai/useSamurai'
import { createSnake } from './snake/useSnake'

// Re-exported so callers that only know the store keep their import unchanged,
// even though the values now live with the game they belong to.
export { CAPTURE_NOTICE_MS } from './samurai/useSamurai'
export type { Interaction } from './samurai/useSamurai'

export type Connection = 'connecting' | 'open' | 'closed'

/**
 * Identity is per table, not per browser. The server allows one socket per
 * token, so a single shared token meant a second tab silently closed the first
 * — two tables at once was impossible. Keying the token by room code instead
 * gives each table its own identity, so two tabs at two rooms never collide,
 * while a refresh or a reopened link still reconnects into the same seat.
 */
const tokenKey = (code: string) => `samurai.token.${code.toUpperCase()}`
const NAME_KEY = 'samurai.name'
/** Retired: one token for the whole browser, which is what tabs fought over. */
const LEGACY_TOKEN_KEY = 'samurai.token'

/**
 * Which table this tab is at. The URL is the only authority — localStorage is
 * shared by every tab, so it cannot say where *this* one is.
 */
function roomFromUrl(): string | null {
  const code = new URLSearchParams(location.search).get('room')
  return code ? code.trim().toUpperCase() : null
}

/** Put the table in the URL, so a refresh — or a second tab — lands back here. */
function showRoomInUrl(code: string | null, kind?: GameKind) {
  const url = new URL(location.href)
  if (code) {
    url.searchParams.set('room', code)
    if (kind) url.searchParams.set('g', kind)
  } else {
    url.searchParams.delete('room')
    url.searchParams.delete('g')
  }
  if (url.href !== location.href) history.replaceState(history.state, '', url)
}

/** No word from the server for this long means the connection is dead. */
const SILENCE_LIMIT_MS = HEARTBEAT_MS * 3

function socketUrl(): string {
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws'
  return `${protocol}://${location.host}/ws`
}

export const useGameStore = defineStore('game', () => {
  // --- connection ----------------------------------------------------------
  const connection = ref<Connection>('connecting')
  /** Samurai's redacted state; null while a Halli Galli table is on screen. */
  const state = ref<ClientState | null>(null)
  /** Halli Galli's redacted state; null while another game's table is on screen. */
  const halli = ref<HalliClientState | null>(null)
  /** Coup's redacted state; null while another game's table is on screen. */
  const coup = ref<CoupClientState | null>(null)
  /** Carnivals' redacted state; null while another game's table is on screen. */
  const carnival = ref<CarnivalClientState | null>(null)
  /** COP's redacted state; null while another game's table is on screen. */
  const cop = ref<CopClientState | null>(null)
  /** Snake's wire state; null while another game's table is on screen. */
  const snake = ref<SnakeClientState | null>(null)
  /** Snakes & Ladders' wire state; null while another game's table is on screen. */
  const ladders = ref<LaddersClientState | null>(null)
  /** Monopoly's wire state; null while another game's table is on screen. */
  const monopoly = ref<MonopolyClientState | null>(null)
  /** Whichever game's state is current, for the fields they all share. */
  const room = computed<AnyClientState | null>(
    () =>
      state.value ??
      halli.value ??
      coup.value ??
      carnival.value ??
      cop.value ??
      snake.value ??
      ladders.value ??
      monopoly.value,
  )
  const error = ref<string | null>(null)
  /**
   * A passing line about something someone else did — a seat filled, a colour
   * taken, the game swapped out from under you. It lives here rather than in
   * the lobby because changing the game unmounts that lobby and mounts another
   * one: a notice held in the component would be destroyed by the very event it
   * was announcing.
   */
  const notice = ref<string | null>(null)
  const myName = ref(localStorage.getItem(NAME_KEY) ?? '')
  /** Another tab took this seat. Nothing reconnects until the player says so. */
  const replaced = ref(false)
  /**
   * This tab is older than the server it is talking to. Like `replaced` it stops
   * the reconnect loop, because retrying cannot fix a version gap — only a
   * reload can, which is what the banner offers.
   */
  const stale = ref(false)

  // --- shell fields both games share ---------------------------------------
  // Read off `room`, so the home banner, routing and lobby chrome work the same
  // whichever table is on screen. The per-game modules below derive from these.
  const inRoom = computed(() => room.value !== null)
  const kind = computed<GameKind>(() => room.value?.kind ?? 'samurai')
  const phase = computed(() => room.value?.phase ?? 'lobby')
  const you = computed(() => room.value?.you ?? null)
  const isSeated = computed(() => you.value !== null)
  const isHost = computed(() => room.value != null && room.value.you === room.value.hostId)
  /** The table is suspended; nobody may act until any seated player resumes it. */
  const isPaused = computed(() => room.value?.paused ?? false)

  /**
   * This tab's identity. Starts as whatever was stored for the table named in
   * the URL — null on the home screen, where the server issues a fresh one, so
   * a tab that hosts a new table never borrows another tab's seat.
   */
  let token: string | null = (() => {
    localStorage.removeItem(LEGACY_TOKEN_KEY)
    const code = roomFromUrl()
    return code ? localStorage.getItem(tokenKey(code)) : null
  })()

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
    // A reload is the only way past a version gap, so do not keep dialling.
    if (stale.value) return
    if (retryTimer) {
      clearTimeout(retryTimer)
      retryTimer = null
    }
    bindWakeListeners()
    replaced.value = false
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
      send({ t: 'hello', token, code: state.value?.code ?? roomFromUrl() })
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

    socket.onclose = (event) => {
      if (socket !== opening) return
      socket = null
      stopWatchdog()
      connection.value = 'closed'
      // The seat moved to another tab. Reconnecting would take it straight back
      // and the two tabs would drop each other in turn, forever — so this tab
      // waits until the player says which one they mean to play in.
      if (event.code === CLOSE_REPLACED) {
        replaced.value = true
        return
      }
      // Nothing to retry into: the next socket would fail the same handshake.
      if (stale.value) return
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
      if (document.visibilityState === 'hidden' || replaced.value || stale.value) return
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

  /** Tie this tab's token to the table it is at, in storage and in the URL. */
  function rememberSeat(code: string, kind?: GameKind) {
    if (token) localStorage.setItem(tokenKey(code), token)
    showRoomInUrl(code, kind)
  }

  /**
   * The seat is gone, so the token that held it is worth nothing. A null code
   * means we never got to a table — an invite link to a room that has expired —
   * and the link stays in the URL for the join form to offer back.
   */
  function forgetSeat(code: string | null) {
    if (!code) return
    localStorage.removeItem(tokenKey(code))
    showRoomInUrl(null)
  }

  /**
   * Every game's state, not just the newest arrival's: `room` falls through to
   * whichever is left set, so one survivor keeps `inRoom` true and leaves the
   * wrong table on screen.
   */
  function clearStates() {
    state.value = null
    halli.value = null
    coup.value = null
    carnival.value = null
    cop.value = null
    snake.value = null
    ladders.value = null
    monopoly.value = null
  }

  function handle(message: ServerMessage) {
    // Past a version mismatch nothing is safe to act on: a state this build
    // cannot read would be rendered as though it understood it. The socket is
    // closed too, so in practice little follows — this is the belt to that brace.
    if (stale.value) return
    switch (message.t) {
      case 'ping':
        send({ t: 'pong' })
        break
      case 'hello':
        // A tab left open across a deploy is talking a protocol the server no
        // longer speaks. Carrying on would mean acting on states it cannot read
        // and sending actions the server will reject, so it stops here and asks
        // to be reloaded rather than half-working.
        if (message.version !== PROTOCOL_VERSION) {
          stale.value = true
          socket?.close()
          return
        }
        token = message.token
        // Nothing is stored yet if we are still on the home screen: the token
        // only belongs to a table once we know which table that is.
        if (state.value) rememberSeat(state.value.code)
        break
      case 'state': {
        seatBusy.value = false
        if (hasLeft) return
        const incoming = message.state
        rememberSeat(incoming.code, incoming.kind)
        // Any state the local player did not expect invalidates a half-finished
        // interaction (for example a piece someone else just captured).
        if (incoming.kind === 'samurai' && incoming.you !== incoming.current) {
          samurai.resetInteraction()
        }
        // The host may have pointed the room at another game, which arrives
        // as a state of a different kind and takes this lobby off screen.
        const was = room.value
        if (was && was.code === incoming.code && was.kind !== incoming.kind) {
          showNotice(t('lobby.notice.game', { game: t(GAME_CARDS[incoming.kind].name) }))
        }
        clearStates()
        if (incoming.kind === 'halligalli') halli.value = incoming
        else if (incoming.kind === 'coup') coup.value = incoming
        else if (incoming.kind === 'carnivals') carnival.value = incoming
        else if (incoming.kind === 'cop') cop.value = incoming
        else if (incoming.kind === 'snake') snake.value = incoming
        else if (incoming.kind === 'ladders') ladders.value = incoming
        else if (incoming.kind === 'monopoly') monopoly.value = incoming
        else state.value = incoming
        reclaimSeat(incoming)
        break
      }
      case 'error':
        seatBusy.value = false
        showError(message.message)
        samurai.resetInteraction()
        break
      case 'left':
        forgetSeat(room.value?.code ?? null)
        hasLeft = true
        clearStates()
        samurai.resetInteraction()
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
  function reclaimSeat(next: AnyClientState) {
    if (next.you !== null) {
      reclaimedFor = null
      return
    }
    const full = next.players.length >= maxPlayersFor(next.kind)
    if (next.phase !== 'lobby' || full || !myName.value || reclaimedFor === next.code) return
    reclaimedFor = next.code
    send({ t: 'join', code: next.code, name: myName.value })
  }

  let noticeTimer: ReturnType<typeof setTimeout> | null = null

  function showNotice(text: string) {
    notice.value = text
    if (noticeTimer) clearTimeout(noticeTimer)
    noticeTimer = setTimeout(() => (notice.value = null), 3500)
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

  // --- per-game modules ----------------------------------------------------
  // Each game owns its own derived state and actions; the connection layer above
  // hands them the shared fields (`state`/`halli`, `you`, `isPaused`, `send`).
  const samurai = createSamurai({ state, you, phase, isPaused, send })
  const halliGalli = createHalliGalli({ halli, you, isPaused, send })
  const coupGame = createCoup({ coup, you, send })
  const carnivalGame = createCarnival({ carnival, you, send })
  const copGame = createCop({ cop, you, send })
  const snakeGame = createSnake({ snake, you, isPaused, send })
  const laddersGame = createLadders({ ladders, you, isPaused, send })
  const monopolyGame = createMonopoly({ monopoly, you, isPaused, send })

  // --- room actions --------------------------------------------------------
  /** Bring the seat back to this tab after another one took it over. */
  function takeOverSeat() {
    retry = 0
    connect()
  }

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
    const wanted = code.trim().toUpperCase()
    // If this browser already holds a seat at that table, say hello as its owner
    // before joining, so the seat is reclaimed rather than a second one taken.
    // Messages are handled in order, so the identity is in place by the join.
    const held = localStorage.getItem(tokenKey(wanted))
    if (held && held !== token) send({ t: 'hello', token: held, code: wanted })
    send({ t: 'join', code: wanted, name })
  }

  /** Leave the table for good, taking its chatter off screen with it. */
  const leaveRoom = () => {
    notice.value = null
    send({ t: 'leave' })
  }
  const setOptions = (options: GameOptions) => send({ t: 'options', options })
  /**
   * Host only: point the room at a different game. It is the same `options`
   * message the settings use — `kind` is one of them — so the room keeps its
   * code, its seats and their colours, and every client is handed the new
   * game's lobby state on the next broadcast. The server refuses a non-host and
   * refuses it once the game has started; this only saves the round trip.
   */
  function setGameKind(next: GameKind) {
    const options = room.value?.options
    if (!options || !isHost.value || options.kind === next) return
    setOptions({ ...options, kind: next })
  }
  /**
   * Pick your own seat colour or turn position. Both are the server's to
   * decide: it refuses one another player already holds, and of two players
   * reaching for the same one the first request in wins. `seatBusy` is true
   * from the moment one is sent until the answer lands, which is what holds the
   * start button while a change is still in the air.
   */
  const seatBusy = ref(false)
  let seatBusyTimer: ReturnType<typeof setTimeout> | null = null

  function claimSeating(message: ClientMessage) {
    seatBusy.value = true
    if (seatBusyTimer) clearTimeout(seatBusyTimer)
    // A socket that never answers must not leave the button dead for good.
    seatBusyTimer = setTimeout(() => (seatBusy.value = false), 3000)
    send(message)
  }

  const setColour = (colour: PlayerColour) => claimSeating({ t: 'colour', colour })
  /** Take a vacant turn position, 1 to 8. Nobody else is moved by it. */
  const setPosition = (position: number) => claimSeating({ t: 'position', position })
  /** Team leaders only (the server enforces it); a blank name resets to a letter. */
  const renameTeam = (team: number, name: string) => send({ t: 'renameTeam', team, name })
  const startGame = () => send({ t: 'start' })
  const rematch = () => send({ t: 'rematch' })
  /** Host only: end the game in progress and take everyone back to the lobby. */
  const abandonGame = () => send({ t: 'abandon' })

  /** Suspend or resume the table for everyone. Any seated player may do either. */
  function togglePause() {
    if (!isSeated.value) return
    send({ t: isPaused.value ? 'resume' : 'pause' })
    // A half-finished interaction cannot survive the freeze.
    samurai.resetInteraction()
  }

  return {
    // connection
    connection,
    connect,
    replaced,
    stale,
    takeOverSeat,
    error,
    showError,
    notice,
    showNotice,
    myName,
    rememberName,
    // shared shell
    state,
    halli,
    coup,
    carnival,
    cop,
    snake,
    ladders,
    monopoly,
    room,
    kind,
    inRoom,
    phase,
    you,
    isSeated,
    isHost,
    isPaused,
    // room actions
    createRoom,
    joinRoom,
    leaveRoom,
    setOptions,
    setGameKind,
    setColour,
    setPosition,
    seatBusy,
    renameTeam,
    startGame,
    rematch,
    abandonGame,
    togglePause,
    // landing
    // Samurai
    ...samurai,
    // Halli Galli
    ...halliGalli,
    // Coup
    ...coupGame,
    // Carnivals
    ...carnivalGame,
    // COP
    ...copGame,
    // Snake
    ...snakeGame,
    // Snakes & Ladders
    ...laddersGame,
    // Monopoly
    ...monopolyGame,
  }
})
