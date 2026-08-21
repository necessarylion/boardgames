import { randomUUID } from 'node:crypto'

import {
  CarnivalGame,
  HAND_CARDS,
  affordances as carnivalAffordances,
  type CarnivalGameState,
} from '../shared/carnivals'
import {
  CopGame,
  affordances as copAffordances,
  lootTotal,
  type CopAffordances,
  type CopGameState,
} from '../shared/cop'
import {
  CoupGame,
  blockOptions,
  blockSeats,
  canChallenge,
  legalActions,
  legalTargets,
  responders,
  type CoupGameState,
} from '../shared/coup'
import { DEFAULT_OPTIONS, Game, type GameOptions, type GameState } from '../shared/engine'
import { HalliGame, fruitTotals, ringingFruit, type HalliGameState } from '../shared/halligalli'
import { SnakeGame, type SnakeGameState } from '../shared/snake'
import type {
  AnyClientState,
  CarnivalClientState,
  CarnivalPublicPlayer,
  CopClientState,
  CopPublicPlayer,
  CoupAffordances,
  CoupClientState,
  CoupPendingView,
  CoupPublicPlayer,
  HalliClientState,
  HalliPublicPlayer,
  PublicPlayer,
  SnakeClientState,
  SnakePublicPlayer,
} from '../shared/protocol'
import { teamArrangements, teamLeader, teamOf } from '../shared/rules'
import { COLOUR_ORDER } from '../shared/colours'
import { Rng, randomSeed } from '../shared/rng'
import { MAX_PLAYERS, MIN_PLAYERS, maxPlayersFor, type PlayerColour } from '../shared/types'
import type { RoomStore } from './store'

export { MAX_PLAYERS, MIN_PLAYERS }

/** Codes use an alphabet without characters that are easy to misread aloud. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const ROOM_TTL_MS = 1000 * 60 * 60 * 3
/** How long a room with nobody connected is kept around for people to return to. */
const EMPTY_ROOM_TTL_MS = 1000 * 60 * 30

export interface Seat {
  id: number
  token: string
  name: string
  colour: PlayerColour
  connected: boolean
}

export interface Client {
  token: string
  send(payload: string): void
}

/** A room flattened to plain JSON, as it is written to the database. */
export interface RoomSnapshot {
  code: string
  options: GameOptions
  /** The table's shuffled palette, so a restart does not recolour the seats. */
  colours: PlayerColour[]
  seats: Seat[]
  hostToken: string
  /** Client tokens that consider this their current room, seated or watching. */
  members: string[]
  /** Custom side names by team index; empty entries fall back to a letter. */
  teamNames: string[]
  lastActivity: number
  game: GameState | null
  /** The Halli Galli engine's state, when this is a Halli Galli table. */
  hg?: HalliGameState | null
  /** The Coup engine's state, when this is a Coup table. */
  coup?: CoupGameState | null
  /** The Carnivals engine's state, when this is a Carnivals table. */
  carn?: CarnivalGameState | null
  /** The COP engine's state, when this is a COP table. */
  cop?: CopGameState | null
  /** The Snake engine's state, when this is a Snake table. */
  snake?: SnakeGameState | null
}

export class Room {
  readonly code: string
  /**
   * The order this table hands its colours out in. Shuffled per room, so the
   * host is not gold at every table they open, and fixed for the room's life,
   * so nobody's colour moves under them between one game and the next.
   */
  colours: PlayerColour[] = new Rng(randomSeed()).shuffle([...COLOUR_ORDER])
  options: GameOptions = { ...DEFAULT_OPTIONS }
  seats: Seat[] = []
  game: Game | null = null
  /** The running Halli Galli game, when this room's kind is halligalli. */
  hg: HalliGame | null = null
  /** The running Coup game, when this room's kind is coup. */
  coup: CoupGame | null = null
  /** The running Carnivals game, when this room's kind is carnivals. */
  carn: CarnivalGame | null = null
  /** The running COP game, when this room's kind is cop. */
  cop: CopGame | null = null
  /** The running Snake game, when this room's kind is snake. */
  snake: SnakeGame | null = null
  hostToken = ''
  lastActivity = Date.now()
  /**
   * Everyone whose client is pointed at this room. Kept alongside the seats
   * because a player who drops before the game starts loses their seat but
   * stays at the table as a spectator until they leave.
   */
  members = new Set<string>()
  /** Custom side names by team index; a blank entry falls back to a letter. */
  teamNames: string[] = []
  /**
   * The shot clock. Deliberately not part of the snapshot: a server restart
   * should not cost whoever was thinking their turn, so a restored room simply
   * arms a fresh period the first time it is ticked.
   */
  turnDeadline: number | null = null
  /** Which turn the deadline above belongs to, so it is armed exactly once. */
  private turnKey: string | null = null
  /**
   * When the table was paused, or null when it is running. Like the deadline it
   * is deliberately not part of the snapshot: a restart during a pause simply
   * arms a fresh period on resume, the same way it does after any restore.
   */
  private pausedAt: number | null = null

  constructor(code: string) {
    this.code = code
  }

  toSnapshot(): RoomSnapshot {
    return {
      code: this.code,
      options: this.options,
      colours: this.colours,
      seats: this.seats,
      hostToken: this.hostToken,
      members: [...this.members],
      teamNames: this.teamNames,
      lastActivity: this.lastActivity,
      game: this.game?.state ?? null,
      hg: this.hg?.state ?? null,
      coup: this.coup?.state ?? null,
      carn: this.carn?.state ?? null,
      cop: this.cop?.state ?? null,
      snake: this.snake?.state ?? null,
    }
  }

  static fromSnapshot(snapshot: RoomSnapshot): Room {
    const room = new Room(snapshot.code)
    room.options = snapshot.options
    // Rooms written before the palette was shuffled were coloured in seat order,
    // which is exactly what falling back to it reproduces.
    room.colours = snapshot.colours ?? [...COLOUR_ORDER]
    // Nobody survives a restart still connected; their client reconnects and
    // says hello, which flips the seat back.
    room.seats = snapshot.seats.map((seat) => ({ ...seat, connected: false }))
    room.hostToken = snapshot.hostToken
    room.members = new Set(snapshot.members)
    // Older snapshots predate custom side names; an empty list is the default.
    room.teamNames = snapshot.teamNames ?? []
    room.lastActivity = snapshot.lastActivity
    room.game = snapshot.game ? Game.fromState(snapshot.game) : null
    room.hg = snapshot.hg ? HalliGame.fromState(snapshot.hg) : null
    room.coup = snapshot.coup ? CoupGame.fromState(snapshot.coup) : null
    room.carn = snapshot.carn ? CarnivalGame.fromState(snapshot.carn) : null
    room.cop = snapshot.cop ? CopGame.fromState(snapshot.cop) : null
    room.snake = snapshot.snake ? SnakeGame.fromState(snapshot.snake) : null
    return room
  }

  get started(): boolean {
    return (
      this.game !== null ||
      this.hg !== null ||
      this.coup !== null ||
      this.carn !== null ||
      this.cop !== null ||
      this.snake !== null
    )
  }

  /** Whether whichever game is running has finished. */
  private get gameOver(): boolean {
    if (this.hg) return this.hg.state.phase === 'over'
    if (this.coup) return this.coup.state.phase === 'over'
    if (this.carn) return this.carn.state.phase === 'over'
    if (this.cop) return this.cop.state.phase === 'over'
    if (this.snake) return this.snake.state.phase === 'over'
    return this.game?.state.phase === 'over'
  }

  seatByToken(token: string): Seat | undefined {
    return this.seats.find((s) => s.token === token)
  }

  isHost(token: string): boolean {
    return this.hostToken === token
  }

  addSeat(token: string, name: string): Seat | null {
    // Each game opens its own number of seats — the card games seat eight, Samurai
    // only six — so the ceiling is the room's game, not the palette-wide maximum.
    if (this.seats.length >= maxPlayersFor(this.options.kind)) return null
    const seat: Seat = {
      id: this.seats.length,
      token,
      name: name.trim().slice(0, 18) || `Player ${this.seats.length + 1}`,
      colour: this.colours[this.seats.length],
      connected: true,
    }
    this.seats.push(seat)
    if (!this.hostToken) this.hostToken = token
    this.touch()
    return seat
  }

  removeSeat(token: string) {
    // Seat ids index into the game, so seats can only be removed before it starts.
    if (this.started) {
      const seat = this.seatByToken(token)
      if (seat) seat.connected = false
      return
    }
    this.seats = this.seats.filter((s) => s.token !== token)
    this.seats.forEach((seat, i) => {
      seat.id = i
      seat.colour = this.colours[i]
    })
    if (this.hostToken === token) this.hostToken = this.seats[0]?.token ?? ''
    this.touch()
  }

  /**
   * A side's leader renames it; a blank name resets it to its letter. Allowed in
   * the lobby as well as in play, so a table can name its sides before it starts.
   */
  renameTeam(token: string, team: number, name: string): string | null {
    const seat = this.seatByToken(token)
    if (!seat) return 'You have no seat in this room.'
    if (this.options.teams < 2) return 'This table is not playing in teams.'
    if (!Number.isInteger(team) || team < 0 || team >= this.options.teams) return 'No such team.'
    if (seat.id !== teamLeader(team)) return 'Only the team leader can rename the team.'
    this.teamNames[team] = String(name ?? '').trim().slice(0, 20)
    this.touch()
    return null
  }

  /** Team play divides the table into equal sides, so the split has to fit. */
  private teamsError(playerCount: number): string | null {
    if (this.options.teams && !teamArrangements(playerCount).includes(this.options.teams)) {
      return 'That team split does not divide the players into equal sides.'
    }
    return null
  }

  /** Deal whichever game the room's options ask for. */
  private deal(): void {
    const seed = (Math.random() * 0xffffffff) >>> 0
    this.game = null
    this.hg = null
    this.coup = null
    this.carn = null
    this.cop = null
    this.snake = null
    const dice = this.options.diceStart
    if (this.options.kind === 'halligalli') this.hg = new HalliGame(this.seats.length, seed, dice)
    else if (this.options.kind === 'coup') this.coup = new CoupGame(this.seats.length, seed, dice)
    else if (this.options.kind === 'carnivals') this.carn = new CarnivalGame(this.seats.length, seed, dice)
    else if (this.options.kind === 'cop') this.cop = new CopGame(this.seats.length, seed, dice)
    // Snake has no opening seat to roll for — every snake moves at once.
    else if (this.options.kind === 'snake') this.snake = new SnakeGame(this.seats.length, seed)
    // Samurai reads the option off `options`, which it already carries.
    else this.game = new Game(this.seats.length, this.options, seed)
  }

  start(): string | null {
    if (this.started) return 'The game has already started.'
    if (this.seats.length < MIN_PLAYERS) return 'At least two players are needed.'
    // A lobby can fill to eight for a card game and then switch to Samurai, whose
    // engine seats only six — refuse rather than letting new Game() throw.
    const seatCap = maxPlayersFor(this.options.kind)
    if (this.seats.length > seatCap) {
      return `This game seats at most ${seatCap} players. Remove players or pick another game.`
    }
    const teams = this.teamsError(this.seats.length)
    if (teams) return teams
    this.deal()
    this.touch()
    return null
  }

  /** Deal a fresh game to the players who are still here. */
  rematch(): string | null {
    if (!this.started || !this.gameOver) return 'The game is still in progress.'
    this.dropAbsentPlayers()
    if (this.seats.length < MIN_PLAYERS) {
      return 'Not enough players are still connected to start another game.'
    }
    const teams = this.teamsError(this.seats.length)
    if (teams) return teams
    this.deal()
    this.touch()
    return null
  }

  /**
   * End the game in progress and put everyone back in the lobby, where the host
   * can change the settings and deal again.
   */
  abandon(): string | null {
    if (!this.started) return 'No game is in progress.'
    this.game = null
    this.hg = null
    this.coup = null
    this.carn = null
    this.cop = null
    this.snake = null
    this.dropAbsentPlayers()
    this.touch()
    return null
  }

  /**
   * Seat ids index into the game, so they can only be renumbered between games.
   * Players who are away when a new game is dealt lose their seat; if they come
   * back while the room is in the lobby their client claims a free seat again.
   */
  private dropAbsentPlayers() {
    this.seats = this.seats.filter((seat) => seat.connected)
    this.seats.forEach((seat, i) => {
      seat.id = i
      seat.colour = this.colours[i]
    })
    this.ensureHost()
  }

  /** Hand the host role to someone present, so a room is never left leaderless. */
  ensureHost() {
    const host = this.seatByToken(this.hostToken)
    if (host?.connected) return
    this.hostToken = this.seats.find((seat) => seat.connected)?.token ?? this.seats[0]?.token ?? ''
  }

  /** Whether whichever game is running is suspended. */
  get paused(): boolean {
    if (this.hg) return this.hg.state.paused
    if (this.coup) return this.coup.state.paused
    if (this.carn) return this.carn.state.paused
    if (this.cop) return this.cop.state.paused
    if (this.snake) return this.snake.state.paused
    return this.game?.state.paused ?? false
  }

  /** Null whenever nobody is on the clock — untimed table, lobby, draft, over. */
  private currentTurnKey(): string | null {
    if (!this.options.turnSeconds) return null
    if (this.coup) return this.coupTurnKey()
    if (this.carn) return this.carnivalTurnKey()
    if (this.cop) return this.copTurnKey()
    const s = this.game?.state
    if (!s || s.phase !== 'play') return null
    return `${s.turnNumber}:${s.current}`
  }

  /**
   * COP runs the clock on whatever the round is waiting for. The choosing step
   * waits on every thief at once and the resolved step on nobody in particular,
   * so each gets one period keyed on the round; the search and arrest wait on the
   * Cop. Keyed on the round so a fresh step gets a fresh period.
   */
  private copTurnKey(): string | null {
    const s = this.cop?.state
    if (!s || s.phase !== 'play') return null
    return `r${s.round}:${s.step}`
  }

  /**
   * Carnivals runs the clock on the betting seat, and on the showdown as a whole
   * — where the table is waiting on nobody in particular, so a period is armed
   * and the timeout simply deals the next hand when it lapses. Keyed on the hand
   * so a fresh betting seat gets a fresh period rather than inheriting the last.
   */
  private carnivalTurnKey(): string | null {
    const s = this.carn?.state
    if (!s || s.phase !== 'play') return null
    // The picking and reveal windows wait on several seats at once, so each gets
    // one period; betting keys on the seat, and a resolved hand keys on nobody
    // in particular so the timeout simply deals the next one when it lapses.
    if (s.step === 'selecting') return `h${s.handNumber}:select`
    if (s.step === 'showdown') return s.roundResult ? `h${s.handNumber}:done` : `h${s.handNumber}:reveal`
    return `h${s.handNumber}:bet:${s.current}`
  }

  /**
   * Coup's clock runs on the decision in front of the table, not on whose turn
   * it is: for most of a turn the game is waiting on a challenge or a block from
   * someone else entirely. Keying on the pending step means each of those gets
   * its own period, and that a window does not quietly re-arm every time one
   * more player waves it through.
   */
  private coupTurnKey(): string | null {
    const s = this.coup?.state
    if (!s || s.phase !== 'play') return null
    const p = s.pending[0]
    if (!p) return `t${s.turnNumber}:act:${s.current}`
    switch (p.step) {
      case 'action':
        return `t${s.turnNumber}:action:${p.actor}`
      case 'block':
        return `t${s.turnNumber}:block:${p.blocker}`
      // The depth matters here and nowhere else: one turn can ask the same
      // player for a second card — a lost challenge, then the assassination it
      // failed to stop — and without it the second loss would inherit the first
      // one's deadline, which by then has usually run out.
      case 'lose':
        return `t${s.turnNumber}:lose:${p.player}:${s.pending.length}`
      case 'exchange':
        return `t${s.turnNumber}:exchange:${p.player}`
      // A resolve step drains without anybody's input, so nobody is on the clock.
      default:
        return null
    }
  }

  /** Give whoever is on the clock a full period, whatever was left before. */
  rearmTurnTimer(now = Date.now()) {
    this.turnKey = this.currentTurnKey()
    this.turnDeadline = this.turnKey === null ? null : now + this.options.turnSeconds * 1000
  }

  /**
   * Start the clock when the turn passes to someone new, and leave it running
   * otherwise — placing a tile without ending your turn must not buy more time.
   *
   * A paused table freezes the clock where it stood; resuming pushes the
   * deadline out by however long the pause lasted, so the player is handed back
   * exactly the time they had left rather than a whole fresh period.
   */
  syncTurnTimer(now = Date.now()) {
    if (this.paused) {
      if (this.pausedAt === null) this.pausedAt = now
      return
    }
    if (this.pausedAt !== null) {
      if (this.turnDeadline !== null) this.turnDeadline += now - this.pausedAt
      this.pausedAt = null
    }
    if (this.currentTurnKey() !== this.turnKey) this.rearmTurnTimer(now)
  }

  /** Milliseconds left on the shot clock, frozen while the table is paused. */
  turnMsLeft(now = Date.now()): number | null {
    if (this.turnDeadline === null) return null
    const at = this.pausedAt ?? now
    return Math.max(0, this.turnDeadline - at)
  }

  touch() {
    this.lastActivity = Date.now()
  }

  get expired(): boolean {
    return Date.now() - this.lastActivity > ROOM_TTL_MS
  }

  /** Build the redacted state for one viewer. `token` may belong to a spectator. */
  stateFor(token: string): AnyClientState {
    if (this.options.kind === 'halligalli') return this.halliStateFor(token)
    if (this.options.kind === 'coup') return this.coupStateFor(token)
    if (this.options.kind === 'carnivals') return this.carnivalStateFor(token)
    if (this.options.kind === 'cop') return this.copStateFor(token)
    if (this.options.kind === 'snake') return this.snakeStateFor(token)
    const seat = this.seatByToken(token)
    const game = this.game
    const open = this.options.openInformation || game?.state.phase === 'over'
    // Teammates play with their captures open to one another, so a side can track
    // its running total; everyone else's stay behind the screen as before.
    const teams = game ? this.options.teams : 0

    const players: PublicPlayer[] = this.seats.map((s) => {
      const p = game?.state.players[s.id]
      const sameTeam = !!seat && teams > 0 && teamOf(seat.id, teams) === teamOf(s.id, teams)
      return {
        id: s.id,
        name: s.name,
        colour: s.colour,
        connected: s.connected,
        handCount: p?.hand.length ?? 0,
        stackCount: p?.stack.length ?? 0,
        capturedCount: p?.captured.length ?? 0,
        captured: open || (seat && seat.id === s.id) || sameTeam ? [...(p?.captured ?? [])] : null,
        ready: p?.draftReady ?? false,
      }
    })

    if (!game) {
      return {
        kind: 'samurai',
        code: this.code,
        phase: 'lobby',
        options: this.options,
        hostId: this.seats.find((s) => s.token === this.hostToken)?.id ?? 0,
        you: seat?.id ?? null,
        players,
        playerCount: this.seats.length,
        pieces: {},
        placed: {},
        current: 0,
        turnNumber: 0,
        placedThisTurn: [],
        lastPlaced: [],
        othersLastPlaced: [],
        opening: null,
        canUndo: false,
        playedNonFast: false,
        setAside: [],
        log: [],
        result: null,
        lastCaptures: [],
        hand: [],
        captured: [],
        draftPool: [],
        canEndTurn: false,
        canRedraw: false,
        teamNames: [...this.teamNames],
        paused: false,
        turnMsLeft: null,
      }
    }

    const s = game.state
    const mine = seat ? s.players[seat.id] : null
    return {
      kind: 'samurai',
      code: this.code,
      phase: s.phase,
      options: this.options,
      hostId: this.seats.find((x) => x.token === this.hostToken)?.id ?? 0,
      you: seat?.id ?? null,
      players,
      playerCount: s.playerCount,
      pieces: s.pieces,
      placed: s.placed,
      current: s.current,
      turnNumber: s.turnNumber,
      placedThisTurn: s.placedThisTurn,
      lastPlaced: s.lastPlaced,
      // Public information, but answered per viewer: every seat's last move
      // except the viewer's own, so nobody is told about a tile they placed
      // themselves. Deduped, because a space one seat played can be vacated by
      // a move and replayed by another, leaving it in two buckets.
      othersLastPlaced: [
        ...new Set(s.lastPlacedBy.filter((_, i) => i !== seat?.id).flat()),
      ],
      // Only the player whose turn it is can take anything back, so the flag is
      // false for everyone else and the button never appears for them.
      opening: s.opening,
      canUndo: seat?.id === s.current && s.phase === 'play' && s.undoStack.length > 0,
      playedNonFast: s.playedNonFast,
      setAside: s.setAside,
      log: s.log,
      result: s.result,
      lastCaptures: s.lastCaptures,
      hand: mine ? [...mine.hand] : [],
      captured: mine ? [...mine.captured] : [],
      draftPool: seat && s.phase === 'draft' && !mine?.draftReady ? game.draftPool(seat.id) : [],
      canEndTurn: seat ? game.canEndTurn(seat.id) : false,
      canRedraw: seat ? game.canRedraw(seat.id) : false,
      teamNames: [...this.teamNames],
      paused: s.paused,
      turnMsLeft: this.turnMsLeft(),
    }
  }

  /** The redacted Halli Galli state for one viewer — stacks as counts only. */
  private halliStateFor(token: string): HalliClientState {
    const seat = this.seatByToken(token)
    const hg = this.hg
    const hostId = this.seats.find((s) => s.token === this.hostToken)?.id ?? 0

    const players: HalliPublicPlayer[] = this.seats.map((s) => {
      const p = hg?.state.players[s.id]
      return {
        id: s.id,
        name: s.name,
        colour: s.colour,
        connected: s.connected,
        stackCount: p?.stack.length ?? 0,
        faceUp: p ? [...p.faceUp] : [],
        out: p?.out ?? false,
      }
    })

    const base = {
      kind: 'halligalli' as const,
      code: this.code,
      options: this.options,
      hostId,
      you: seat?.id ?? null,
      players,
      playerCount: this.seats.length,
    }

    if (!hg) {
      return {
        ...base,
        phase: 'lobby',
        current: 0,
        opening: null,
        turnNumber: 0,
        totals: { banana: 0, lime: 0, strawberry: 0, plum: 0 },
        ring: null,
        lastEvent: null,
        log: [],
        result: null,
        paused: false,
      }
    }

    const s = hg.state
    return {
      ...base,
      phase: s.phase,
      current: s.current,
      opening: s.opening,
      turnNumber: s.turnNumber,
      totals: fruitTotals(s.players),
      ring: ringingFruit(s.players),
      lastEvent: s.lastEvent,
      log: s.log,
      result: s.result,
      paused: s.paused,
    }
  }

  /**
   * The redacted Coup state for one viewer. Coup hides more than the other two
   * games put together: a hand is the whole of a player's position, so it goes
   * out as a count to everyone but its holder, the court deck never leaves at
   * all, and the pair drawn for an exchange reaches only the player who drew it.
   */
  private coupStateFor(token: string): CoupClientState {
    const seat = this.seatByToken(token)
    const coup = this.coup
    const hostId = this.seats.find((s) => s.token === this.hostToken)?.id ?? 0

    const players: CoupPublicPlayer[] = this.seats.map((s) => {
      const p = coup?.state.players[s.id]
      return {
        id: s.id,
        name: s.name,
        colour: s.colour,
        connected: s.connected,
        coins: p?.coins ?? 0,
        influence: p?.hand.length ?? 0,
        revealed: p ? [...p.revealed] : [],
        out: p?.out ?? false,
      }
    })

    const idle: CoupAffordances = {
      actions: [],
      targets: [],
      challenge: false,
      blocks: [],
      pass: false,
      lose: false,
      exchange: null,
    }

    const base = {
      kind: 'coup' as const,
      code: this.code,
      options: this.options,
      hostId,
      you: seat?.id ?? null,
      players,
      playerCount: this.seats.length,
    }

    if (!coup) {
      return {
        ...base,
        phase: 'lobby',
        current: 0,
        turnNumber: 0,
        opening: null,
        pending: null,
        hand: [],
        drawn: [],
        deckCount: 0,
        can: idle,
        lastEvent: null,
        log: [],
        result: null,
        paused: false,
        turnMsLeft: null,
      }
    }

    const s = coup.state
    const you = seat?.id ?? null
    const mine = you !== null ? s.players[you] : null
    const head = s.pending[0] ?? null

    // Only the head of the stack is anyone's business, and an exchange's drawn
    // cards are stripped out of it — they travel to their holder in `drawn`.
    let pending: CoupPendingView | null = null
    if (head) {
      if (head.step === 'exchange') pending = { step: 'exchange', player: head.player, count: head.drawn.length }
      else if (head.step === 'lose') pending = { step: 'lose', player: head.player, reason: head.reason }
      else if (head.step === 'action') {
        pending = {
          step: 'action',
          actor: head.actor,
          action: head.action,
          target: head.target,
          passed: [...head.passed],
          challengeable: head.challengeable,
          blockers: blockSeats(s, head.action, head.actor, head.target),
        }
      } else if (head.step === 'block') {
        pending = {
          step: 'block',
          actor: head.actor,
          action: head.action,
          target: head.target,
          blocker: head.blocker,
          character: head.character,
          passed: [...head.passed],
        }
      }
      // A `resolve` step is never waited on — it drains without anyone's input.
    }

    const can: CoupAffordances =
      you === null || !mine
        ? idle
        : {
            actions: legalActions(s, you),
            targets: legalTargets(s, you),
            challenge: canChallenge(s, you),
            blocks: blockOptions(s, you),
            pass: !s.paused && responders(s).includes(you),
            lose: !s.paused && head?.step === 'lose' && head.player === you,
            exchange: head?.step === 'exchange' && head.player === you ? mine.hand.length : null,
          }

    return {
      ...base,
      phase: s.phase,
      current: s.current,
      turnNumber: s.turnNumber,
      opening: s.opening,
      pending,
      hand: mine ? [...mine.hand] : [],
      drawn: head?.step === 'exchange' && head.player === you ? [...head.drawn] : [],
      deckCount: s.deck.length,
      can,
      lastEvent: s.lastEvent,
      log: s.log,
      result: s.result,
      paused: s.paused,
      turnMsLeft: this.turnMsLeft(),
    }
  }

  /**
   * The redacted Carnivals state for one viewer. The cards are the whole secret,
   * and the redaction is Carnivals' upside-down one: a viewer sees their own red
   * and never their own blue, and every opponent's blue and never their red.
   * The showdown lifts both restrictions, so once a hand is down every card is
   * public; folding lifts them the same way, laying the folded hand face up at
   * once. Everything else — the pot, the bets, who has folded — is already
   * public and travels in full.
   */
  private carnivalStateFor(token: string): CarnivalClientState {
    const seat = this.seatByToken(token)
    const carn = this.carn
    const hostId = this.seats.find((s) => s.token === this.hostToken)?.id ?? 0
    const you = seat?.id ?? null

    // Once the hand is settled every card is laid face up, so the whole table
    // can read the showdown — including a pot conceded to by folds, where nobody
    // was made to reveal.
    const roundOver = carn?.state.roundResult != null

    const players: CarnivalPublicPlayer[] = this.seats.map((s) => {
      const p = carn?.state.players[s.id]
      const isYou = you === s.id
      // A card goes public to the whole table once its owner turns their hand
      // over at the showdown, or the moment they fold — a folded seat lays both
      // cards face up for everyone. Either way, every hand is open once the round
      // has resolved.
      const shown = roundOver || (p?.revealed ?? false) || (p?.folded ?? false)
      return {
        id: s.id,
        name: s.name,
        colour: s.colour,
        connected: s.connected,
        carnivals: p?.carnivals ?? 0,
        committed: p?.committed ?? 0,
        folded: p?.folded ?? false,
        out: p?.out ?? false,
        selected: p?.selected ?? false,
        revealed: p?.revealed ?? false,
        // Your own red is yours to see; everyone else's stays hidden until they
        // reveal it.
        red: isYou || shown ? (p?.red ?? null) : null,
        // Your own blue is the one card you may never see until you turn your
        // hand over; everyone else's is public the moment it is picked.
        blue: !isYou || shown ? (p?.blue ?? null) : null,
      }
    })

    const idle = {
      select: false,
      check: false,
      call: false,
      callAmount: 0,
      raise: false,
      minRaiseTo: 0,
      maxRaiseTo: 0,
      allIn: false,
      allInAmount: 0,
      fold: false,
      reveal: false,
      nextHand: false,
    }

    const base = {
      kind: 'carnivals' as const,
      code: this.code,
      options: this.options,
      hostId,
      you,
      players,
      playerCount: this.seats.length,
    }

    if (!carn) {
      return {
        ...base,
        phase: 'lobby',
        current: 0,
        turnNumber: 0,
        opening: null,
        step: 'selecting',
        handCards: HAND_CARDS,
        pot: 0,
        currentBet: 0,
        minRaise: 0,
        can: idle,
        roundResult: null,
        lastEvent: null,
        log: [],
        result: null,
        paused: false,
        turnMsLeft: null,
      }
    }

    const s = carn.state
    return {
      ...base,
      phase: s.phase,
      current: s.current,
      turnNumber: s.turnNumber,
      opening: s.opening,
      step: s.step,
      handCards: HAND_CARDS,
      pot: s.pot,
      currentBet: s.currentBet,
      minRaise: s.minRaise,
      can: you === null ? idle : carnivalAffordances(s, you),
      roundResult: s.roundResult,
      lastEvent: s.lastEvent,
      log: s.log,
      result: s.result,
      paused: s.paused,
      turnMsLeft: this.turnMsLeft(),
    }
  }

  /**
   * The redacted COP state for one viewer. A seat's loot is the whole secret: a
   * player always sees their own, the Cop sees a caught thief's while the round
   * is being arrested and reviewed — the rulebook's "reveal all to the Cop" — and
   * everyone sees everything once the game is over. Room choices stay hidden
   * while they are being made: a viewer learns only their own, until the round
   * resolves and every door is opened for the whole table in `roundResult`.
   */
  private copStateFor(token: string): CopClientState {
    const seat = this.seatByToken(token)
    const cop = this.cop
    const hostId = this.seats.find((s) => s.token === this.hostToken)?.id ?? 0
    const you = seat?.id ?? null
    const s = cop?.state
    const open = this.options.openInformation || s?.phase === 'over'

    const players: CopPublicPlayer[] = this.seats.map((x) => {
      const p = s?.players[x.id]
      const isYou = you === x.id
      // A player's loot is theirs alone, with one exception the rulebook makes: a
      // caught thief reveals their holdings to the Cop for the arrest, so the Cop
      // can decide what to confiscate. That reveal lasts only the arrest step —
      // the seat chips never show it, so it reaches only the confiscation panel.
      const caughtToCop =
        !!s &&
        you !== null &&
        s.cop === you &&
        s.step === 'arrest' &&
        !!s.roundResult &&
        s.roundResult.caught.includes(x.id)
      const canSee = open || isYou || caughtToCop
      return {
        id: x.id,
        name: x.name,
        colour: x.colour,
        connected: x.connected,
        cop: s ? s.cop === x.id : false,
        caught: p?.caught ?? 0,
        selected: s ? s.selections[x.id] !== null : false,
        loot: canSee && p ? { ...p.loot } : null,
        total: canSee && p ? lootTotal(p.loot) : null,
      }
    })

    const idle: CopAffordances = {
      select: false,
      chosen: null,
      search: false,
      arrest: false,
      next: false,
    }

    const base = {
      kind: 'cop' as const,
      code: this.code,
      options: this.options,
      hostId,
      you,
      players,
      playerCount: this.seats.length,
    }

    if (!cop || !s) {
      return {
        ...base,
        phase: 'lobby',
        current: 0,
        turnNumber: 0,
        opening: null,
        rooms: [],
        cop: 0,
        round: 0,
        totalRounds: 0,
        step: 'select',
        yourRoom: null,
        roommates: [],
        roundResult: null,
        can: idle,
        lastEvent: null,
        log: [],
        result: null,
        paused: false,
        turnMsLeft: null,
      }
    }

    // Redact the resolved round. Once it is resolved, who hid in which room and
    // who was caught is public to the whole table — that is how you see who
    // escaped. What stays private is the *loot*: the share a room was split into
    // reaches only the thieves who were in it, and a confiscation only the Cop
    // and the thief it was taken from. Everything opens up under open information
    // or once the game is over.
    let roundResult = s.roundResult
    if (roundResult && !open) {
      const rr = roundResult
      roundResult = {
        ...rr,
        rooms: rr.rooms.map((r) =>
          you !== null && r.occupants.includes(you) ? r : { ...r, loot: {} },
        ),
        confiscations: Object.fromEntries(
          Object.entries(rr.confiscations).filter(([id]) => you === s.cop || Number(id) === you),
        ),
      }
    }

    const yourRoom = you !== null ? s.selections[you] : null
    // Once you are through a door you can see who else is already in with you —
    // but never who is behind any other door until the round is opened up.
    const roommates =
      you !== null && yourRoom !== null && (s.step === 'select' || s.step === 'search')
        ? s.selections.reduce<number[]>((mates, room, id) => {
            if (room === yourRoom && id !== you) mates.push(id)
            return mates
          }, [])
        : []

    return {
      ...base,
      phase: s.phase,
      current: s.cop,
      turnNumber: s.turnNumber,
      opening: s.opening,
      rooms: s.rooms,
      cop: s.cop,
      round: s.round,
      totalRounds: s.totalRounds,
      step: s.step,
      yourRoom,
      roommates,
      roundResult,
      can: you === null ? idle : copAffordances(s, you),
      lastEvent: s.lastEvent,
      log: s.log,
      result: s.result,
      paused: s.paused,
      turnMsLeft: this.turnMsLeft(),
    }
  }

  /**
   * The Snake state for one viewer. Nothing in Snake is secret — the whole
   * board is everyone's to see — so this is the engine's state reshaped for the
   * wire rather than redacted.
   */
  private snakeStateFor(token: string): SnakeClientState {
    const seat = this.seatByToken(token)
    const sn = this.snake
    const hostId = this.seats.find((s) => s.token === this.hostToken)?.id ?? 0

    const players: SnakePublicPlayer[] = this.seats.map((s) => {
      const p = sn?.state.players[s.id]
      return {
        id: s.id,
        name: s.name,
        colour: s.colour,
        connected: s.connected,
        alive: p?.alive ?? false,
        body: p ? p.body.map((c) => [...c] as [number, number]) : [],
        dir: p?.dir ?? 'up',
        apples: p?.apples ?? 0,
        length: p?.length ?? 0,
      }
    })

    const base = {
      kind: 'snake' as const,
      code: this.code,
      options: this.options,
      hostId,
      you: seat?.id ?? null,
      players,
      playerCount: this.seats.length,
    }

    if (!sn) {
      return {
        ...base,
        phase: 'lobby',
        current: 0,
        turnNumber: 0,
        opening: null,
        gridSize: 0,
        food: [],
        countdown: 0,
        log: [],
        result: null,
        paused: false,
      }
    }

    const s = sn.state
    return {
      ...base,
      phase: s.phase,
      current: s.current,
      turnNumber: s.turnNumber,
      opening: s.opening,
      gridSize: s.gridSize,
      food: s.food.map((c) => [...c] as [number, number]),
      countdown: s.countdown,
      log: s.log,
      result: s.result,
      paused: s.paused,
    }
  }
}

export class RoomManager {
  private rooms = new Map<string, Room>()
  /** Which room a client token currently belongs to. */
  private membership = new Map<string, string>()
  private store: RoomStore | null = null
  /** Codes with unwritten changes, and the flush in flight (at most one). */
  private dirty = new Set<string>()
  private deleted = new Set<string>()
  private flushing: Promise<void> | null = null

  /** Adopt a store and pull back whatever survived the last shutdown. */
  async restore(store: RoomStore): Promise<number> {
    this.store = store
    for (const snapshot of await store.loadAll()) {
      const room = Room.fromSnapshot(snapshot)
      this.rooms.set(room.code, room)
      for (const token of room.members) this.membership.set(token, room.code)
    }
    return this.rooms.size
  }

  newToken(): string {
    return randomUUID()
  }

  create(): Room {
    let code = this.generateCode()
    while (this.rooms.has(code)) code = this.generateCode()
    const room = new Room(code)
    this.rooms.set(code, room)
    return room
  }

  get(code: string): Room | undefined {
    return this.rooms.get(code.toUpperCase())
  }

  roomOf(token: string): Room | undefined {
    const code = this.membership.get(token)
    return code ? this.rooms.get(code) : undefined
  }

  bind(token: string, room: Room) {
    this.membership.set(token, room.code)
    room.members.add(token)
  }

  unbind(token: string) {
    const code = this.membership.get(token)
    if (code) this.rooms.get(code)?.members.delete(token)
    this.membership.delete(token)
  }

  /**
   * Note that a room changed. Writes are coalesced: a burst of changes to the
   * same room during one turn collapses into a single row rewrite, and a write
   * that fails is logged rather than thrown, since losing the durable copy is
   * not a reason to interrupt a game in progress.
   */
  markDirty(room: Room) {
    if (!this.store) return
    this.deleted.delete(room.code)
    this.dirty.add(room.code)
    this.schedule()
  }

  private markDeleted(code: string) {
    if (!this.store) return
    this.dirty.delete(code)
    this.deleted.add(code)
    this.schedule()
  }

  private schedule() {
    this.flushing ??= this.flush().finally(() => {
      this.flushing = null
    })
  }

  /**
   * Writes go out one batch at a time, in the order they were marked, so the
   * row can never end up holding an older snapshot than the one before it.
   */
  private async flush(): Promise<void> {
    while (this.dirty.size || this.deleted.size) {
      const codes = [...this.dirty]
      const gone = [...this.deleted]
      this.dirty.clear()
      this.deleted.clear()
      try {
        await this.store!.remove(gone)
        for (const code of codes) {
          const room = this.rooms.get(code)
          if (room) await this.store!.save(room.toSnapshot())
        }
      } catch (error) {
        // Losing the durable copy is not a reason to interrupt a live game.
        console.error('[db] could not persist rooms:', (error as Error).message)
      }
    }
  }

  /** Wait for every pending write, so shutdown does not drop the last move. */
  async drain(): Promise<void> {
    while (this.flushing) await this.flushing
  }

  private generateCode(): string {
    let out = ''
    for (let i = 0; i < 4; i++) {
      out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]
    }
    return out
  }

  /**
   * Rooms whose current player has run out of time, arming any clock that is
   * not running yet on the way past.
   *
   * Sweeping every room on a tick rather than holding a timer per room is what
   * makes this survive a restore: a room read back from the database has no
   * timer to reinstate, and the first tick simply starts one.
   */
  dueTurns(now = Date.now()): Room[] {
    const due: Room[] = []
    for (const room of this.rooms.values()) {
      room.syncTurnTimer(now)
      // A paused table keeps its deadline in the past while frozen; it must not
      // time anyone out until it is resumed.
      if (room.paused) continue
      if (room.turnDeadline !== null && now >= room.turnDeadline) due.push(room)
    }
    return due
  }

  /**
   * Rooms whose Snake game should advance a frame. A table with nobody
   * connected does not tick — a restored room comes back with every seat
   * disconnected, and running its clock would kill every snake before anyone
   * could reconnect to steer one.
   */
  tickableSnakes(): Room[] {
    const due: Room[] = []
    for (const room of this.rooms.values()) {
      const s = room.snake?.state
      if (s && s.phase === 'play' && !s.paused && room.seats.some((seat) => seat.connected)) {
        due.push(room)
      }
    }
    return due
  }

  /** Drop rooms nobody has touched for a while, so memory does not creep. */
  sweep() {
    for (const [code, room] of this.rooms) {
      const empty = room.seats.every((s) => !s.connected)
      if (room.expired || (empty && Date.now() - room.lastActivity > EMPTY_ROOM_TTL_MS)) {
        for (const token of room.members) this.membership.delete(token)
        for (const seat of room.seats) this.membership.delete(seat.token)
        this.rooms.delete(code)
        this.markDeleted(code)
      }
    }
  }

  get size(): number {
    return this.rooms.size
  }
}
