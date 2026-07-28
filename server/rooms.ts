import { randomUUID } from 'node:crypto'

import { DEFAULT_OPTIONS, Game, type GameOptions, type GameState } from '../shared/engine'
import type { ClientState, PublicPlayer } from '../shared/protocol'
import { COLOUR_ORDER } from '../shared/colours'
import type { PlayerColour } from '../shared/types'
import type { RoomStore } from './store'

export const MAX_PLAYERS = 4
export const MIN_PLAYERS = 2

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
  seats: Seat[]
  hostToken: string
  /** Client tokens that consider this their current room, seated or watching. */
  members: string[]
  lastActivity: number
  game: GameState | null
}

export class Room {
  readonly code: string
  options: GameOptions = { ...DEFAULT_OPTIONS }
  seats: Seat[] = []
  game: Game | null = null
  hostToken = ''
  lastActivity = Date.now()
  /**
   * Everyone whose client is pointed at this room. Kept alongside the seats
   * because a player who drops before the game starts loses their seat but
   * stays at the table as a spectator until they leave.
   */
  members = new Set<string>()

  constructor(code: string) {
    this.code = code
  }

  toSnapshot(): RoomSnapshot {
    return {
      code: this.code,
      options: this.options,
      seats: this.seats,
      hostToken: this.hostToken,
      members: [...this.members],
      lastActivity: this.lastActivity,
      game: this.game?.state ?? null,
    }
  }

  static fromSnapshot(snapshot: RoomSnapshot): Room {
    const room = new Room(snapshot.code)
    room.options = snapshot.options
    // Nobody survives a restart still connected; their client reconnects and
    // says hello, which flips the seat back.
    room.seats = snapshot.seats.map((seat) => ({ ...seat, connected: false }))
    room.hostToken = snapshot.hostToken
    room.members = new Set(snapshot.members)
    room.lastActivity = snapshot.lastActivity
    room.game = snapshot.game ? Game.fromState(snapshot.game) : null
    return room
  }

  get started(): boolean {
    return this.game !== null
  }

  seatByToken(token: string): Seat | undefined {
    return this.seats.find((s) => s.token === token)
  }

  isHost(token: string): boolean {
    return this.hostToken === token
  }

  addSeat(token: string, name: string): Seat | null {
    if (this.seats.length >= MAX_PLAYERS) return null
    const seat: Seat = {
      id: this.seats.length,
      token,
      name: name.trim().slice(0, 18) || `Player ${this.seats.length + 1}`,
      colour: COLOUR_ORDER[this.seats.length],
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
      seat.colour = COLOUR_ORDER[i]
    })
    if (this.hostToken === token) this.hostToken = this.seats[0]?.token ?? ''
    this.touch()
  }

  start(): string | null {
    if (this.started) return 'The game has already started.'
    if (this.seats.length < MIN_PLAYERS) return 'At least two players are needed.'
    this.game = new Game(this.seats.length, this.options, (Math.random() * 0xffffffff) >>> 0)
    this.touch()
    return null
  }

  /** Deal a fresh game to the players who are still here. */
  rematch(): string | null {
    if (!this.game || this.game.state.phase !== 'over') return 'The game is still in progress.'
    this.dropAbsentPlayers()
    if (this.seats.length < MIN_PLAYERS) {
      return 'Not enough players are still connected to start another game.'
    }
    this.game = new Game(this.seats.length, this.options, (Math.random() * 0xffffffff) >>> 0)
    this.touch()
    return null
  }

  /**
   * End the game in progress and put everyone back in the lobby, where the host
   * can change the settings and deal again.
   */
  abandon(): string | null {
    if (!this.game) return 'No game is in progress.'
    this.game = null
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
      seat.colour = COLOUR_ORDER[i]
    })
    this.ensureHost()
  }

  /** Hand the host role to someone present, so a room is never left leaderless. */
  ensureHost() {
    const host = this.seatByToken(this.hostToken)
    if (host?.connected) return
    this.hostToken = this.seats.find((seat) => seat.connected)?.token ?? this.seats[0]?.token ?? ''
  }

  touch() {
    this.lastActivity = Date.now()
  }

  get expired(): boolean {
    return Date.now() - this.lastActivity > ROOM_TTL_MS
  }

  /** Build the redacted state for one viewer. `token` may belong to a spectator. */
  stateFor(token: string): ClientState {
    const seat = this.seatByToken(token)
    const game = this.game
    const open = this.options.openInformation || game?.state.phase === 'over'

    const players: PublicPlayer[] = this.seats.map((s) => {
      const p = game?.state.players[s.id]
      return {
        id: s.id,
        name: s.name,
        colour: s.colour,
        connected: s.connected,
        handCount: p?.hand.length ?? 0,
        stackCount: p?.stack.length ?? 0,
        capturedCount: p?.captured.length ?? 0,
        captured: open || (seat && seat.id === s.id) ? [...(p?.captured ?? [])] : null,
        ready: p?.draftReady ?? false,
      }
    })

    if (!game) {
      return {
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
      }
    }

    const s = game.state
    const mine = seat ? s.players[seat.id] : null
    return {
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
      // Only the player whose turn it is can take anything back, so the flag is
      // false for everyone else and the button never appears for them.
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
