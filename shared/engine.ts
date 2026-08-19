import { buildBoard, DEFAULT_BOARD_SHAPE, type Board } from './board'
import { chooseFirst, type Opening } from './opening'
import { Rng } from './rng'
import {
  canSwitch,
  checkEnd,
  legalPlacements,
  moveDestinations,
  movableTiles,
  pendingCaptures,
  scoreGame,
  type PieceRef,
  type RulesView,
} from './rules'
import { distributePieces } from './setup'
import { STARTING_HAND_SIZE, buildTiles, tileFromId, tileLabel } from './tiles'
import {
  CASTE_PIECE_LABEL,
  GAME_MAX_PLAYERS,
  MIN_PLAYERS,
  type BoardShape,
  type Caste,
  type GameKind,
  type GameResult,
  type LogEntry,
  type PlacedTile,
  type Tile,
} from './types'

export type Phase = 'lobby' | 'draft' | 'play' | 'over'

export interface GameOptions {
  /**
   * Which game the room plays. Held on the options so it flows through create,
   * the lobby, the snapshot and restore with no extra plumbing. Every field
   * below it is Samurai's; a Halli Galli table simply leaves them at default.
   */
  kind: GameKind
  /** Deal starting hands at random instead of letting each player choose five. */
  randomHands: boolean
  /** Reveal every player's captured pieces instead of keeping them secret. */
  openInformation: boolean
  /** Which island chain to play on. The board is rebuilt from this, never sent. */
  boardShape: BoardShape
  /** Seconds a player has to take their turn; 0 leaves the table untimed. */
  turnSeconds: number
  /**
   * How many sides the table plays in, or 0 for a free-for-all. Seats deal round
   * the sides in turn (A, B, A, B…), so the split has to divide the players into
   * equal teams of at least two — 2 at four players, 2 or 3 at six. The server
   * holds a table to a valid split at the start.
   */
  teams: number
  /**
   * Coup's: roll dice for the opening seat instead of drawing it silently.
   * Either way the seat is random — this only decides whether the table gets to
   * watch it being decided.
   */
  diceStart: boolean
}

/** Shot-clock lengths a table can be set up with. 0 is no clock at all. */
export const TURN_SECONDS_CHOICES = [0, 30, 45, 60, 120] as const

export const DEFAULT_OPTIONS: GameOptions = {
  kind: 'samurai',
  randomHands: false,
  openInformation: false,
  boardShape: DEFAULT_BOARD_SHAPE,
  turnSeconds: 0,
  teams: 0,
  diceStart: true,
}

export interface EnginePlayer {
  id: number
  hand: string[]
  stack: string[]
  captured: Caste[]
  /** Draft picks confirmed; empty until the player has chosen. */
  draftReady: boolean
}

/**
 * Enough to reverse one action of the turn in progress.
 *
 * Recorded explicitly rather than inferred from `placedThisTurn`, because the
 * three actions leave very different marks: a placement adds one space, a move
 * adds two and relocates an existing tile, and a switch adds none at all.
 */
export type UndoEntry =
  | { kind: 'place'; tileId: string; spaceId: string }
  | { kind: 'move'; tileId: string; from: string; to: string }
  | { kind: 'switch'; tileId: string; a: PieceRef; b: PieceRef }

export interface GameState {
  phase: Phase
  options: GameOptions
  seed: number
  playerCount: number
  pieces: Record<string, Caste[]>
  placed: Record<string, PlacedTile>
  players: EnginePlayer[]
  current: number
  /**
   * The seat that opened the game. Rounds are counted from it rather than from
   * seat 0, because the opening seat is drawn rather than given to whoever made
   * the room. Older snapshots predate it; `fromState` falls back to 0, which is
   * exactly what those games started on.
   */
  first: number
  /** How the opening seat was decided, or null when it was drawn quietly. */
  opening: Opening | null
  turnNumber: number
  placedThisTurn: string[]
  /**
   * Where the previous turn's tiles landed. Kept once the turn closes so the
   * rest of the table can still see the move that was just made — by the time
   * play reaches you, `placedThisTurn` belongs to you and is empty.
   */
  lastPlaced: string[]
  /**
   * Indexed by seat: the spaces every *other* player has committed since that
   * seat's own turn last closed. `lastPlaced` holds one turn only, so at a
   * five-player table four plays go unmarked before play comes back round.
   */
  unseenPlaced: string[][]
  /**
   * What the current player has done this turn, newest last, so a misclick can
   * be taken back. Emptied by `endTurn`, which is the point everything commits:
   * captures resolve, hands refill, and the board is no longer yours to edit.
   */
  undoStack: UndoEntry[]
  playedNonFast: boolean
  /** Whether the current player has spent their one hand-redraw this turn. */
  redrewThisTurn: boolean
  setAside: Caste[]
  log: LogEntry[]
  result: GameResult | null
  /** Captures produced by the most recent completed turn, for the UI recap. */
  lastCaptures: { caste: Caste; spaceId: string; winner: number | null }[]
  /**
   * The table is suspended: no seat may play, switch, move, end their turn or
   * redraw until it is resumed, and the shot clock is frozen. Any seated player
   * can toggle it, so it is not tied to whose turn it is.
   */
  paused: boolean
}

export type ActionResult = { ok: true } | { ok: false; error: string }

const OK: ActionResult = { ok: true }
const fail = (error: string): ActionResult => ({ ok: false, error })

/**
 * The authoritative game. The server owns one of these per room and rejects any
 * action it does not accept, so a tampered client cannot cheat.
 */
export class Game {
  readonly board: Board
  /** Every tile in the game, keyed by id. Derived, never sent over the wire. */
  readonly tiles: Record<string, Tile> = {}
  state: GameState

  constructor(playerCount: number, options: GameOptions, seed: number) {
    if (playerCount < MIN_PLAYERS || playerCount > GAME_MAX_PLAYERS.samurai) {
      throw new Error(`Samurai is for ${MIN_PLAYERS} to ${GAME_MAX_PLAYERS.samurai} players`)
    }
    this.board = buildBoard(playerCount, options.boardShape)
    const rng = new Rng(seed)

    const players: EnginePlayer[] = Array.from({ length: playerCount }, (_, id) => {
      const owned = buildTiles(id)
      for (const tile of owned) this.tiles[tile.id] = tile
      return {
        id,
        hand: [],
        stack: rng.shuffle(owned.map((t) => t.id)),
        captured: [],
        draftReady: false,
      }
    })

    const pieces = distributePieces(this.board, playerCount, rng)

    /*
     * The opening seat is drawn last, once the board and the stacks have taken
     * everything they need from the generator. Two reasons, both learnt the hard
     * way. Drawing it first meant near-neighbour seeds opened on the same player
     * far too often, because this is a plain linear congruential generator and
     * its first output tracks its seed closely. Drawing it in the middle shifted
     * every draw after it, which silently dealt a different board for the same
     * seed — so it goes at the end, where nothing is downstream of it.
     */
    const { first, opening } = chooseFirst(rng, playerCount, options.diceStart)

    this.state = {
      phase: options.randomHands ? 'play' : 'draft',
      options,
      seed,
      playerCount,
      pieces,
      placed: {},
      players,
      first,
      opening,
      current: first,
      turnNumber: 1,
      placedThisTurn: [],
      lastPlaced: [],
      unseenPlaced: Array.from({ length: playerCount }, () => []),
      undoStack: [],
      playedNonFast: false,
      redrewThisTurn: false,
      setAside: [],
      log: [],
      result: null,
      lastCaptures: [],
      paused: false,
    }

    if (options.randomHands) {
      // Fast tiles are held back from the deal. They cost no placement, so a
      // hand of them can be emptied in a single turn — nobody drafting their
      // own hand would open that way, and a random deal should not force it.
      // Switch and move go with them because both act on tiles already placed,
      // so on the opening round there is nothing for either to work on; move is
      // not a fast tile, so it needs holding back by kind rather than by cost.
      // They stay in the stack in their shuffled order and come up on the draw.
      for (const player of players) {
        const dealt = player.stack
          .filter((id) => {
            const tile = tileFromId(id)
            return !tile.fast && tile.kind !== 'switch' && tile.kind !== 'move'
          })
          .slice(0, STARTING_HAND_SIZE)
        for (const id of dealt) player.stack.splice(player.stack.indexOf(id), 1)
        player.hand = dealt
      }
      this.log(null, 'Starting hands were dealt at random.')
    }
    this.log(null, `A ${playerCount}-player game begins.`)
  }

  /**
   * Rebuild a game from a state that was written out earlier (the server stores
   * one per room so a restart does not lose the table).
   *
   * The board and the tile definitions are pure functions of the player count,
   * so running the constructor and then dropping the state it dealt is both
   * correct and cheap — it happens once per room at boot.
   */
  static fromState(state: GameState): Game {
    const game = new Game(state.playerCount, state.options, state.seed)
    // Snapshots written before undo existed have no stack; an empty one simply
    // means "nothing to take back", which is correct for a restored room. The
    // same goes for the last turn's placements: an empty list just means no
    // tile is marked on the board. The buckets are rebuilt to the seat count
    // rather than defaulted whole, so a short or missing list still gives every
    // seat one.
    game.state = {
      ...state,
      undoStack: state.undoStack ?? [],
      lastPlaced: state.lastPlaced ?? [],
      unseenPlaced: Array.from({ length: state.playerCount }, (_, i) => state.unseenPlaced?.[i] ?? []),
      // A snapshot written before pause existed was never paused.
      paused: state.paused ?? false,
      // Nor could it have redrawn under a rule it predates.
      redrewThisTurn: state.redrewThisTurn ?? false,
      // A snapshot from before the opening seat was drawn started on seat 0,
      // which is exactly what rounds were counted from at the time.
      first: state.first ?? 0,
      opening: state.opening ?? null,
    }
    return game
  }

  // --- helpers -------------------------------------------------------------

  get view(): RulesView {
    return {
      board: this.board,
      pieces: this.state.pieces,
      placed: this.state.placed,
      tiles: this.tiles,
      playerCount: this.state.playerCount,
      teams: this.state.options.teams,
    }
  }

  private log(player: number | null, text: string) {
    this.state.log.push({ turn: this.state.turnNumber, player, text })
    // Keep the transcript bounded for long games.
    if (this.state.log.length > 400) this.state.log.splice(0, this.state.log.length - 400)
  }

  private requireTurn(playerId: number): ActionResult {
    if (this.state.phase !== 'play') return fail('The game is not in the play phase.')
    if (this.state.current !== playerId) return fail('It is not your turn.')
    return OK
  }

  private holdsTile(playerId: number, tileId: string): boolean {
    return this.state.players[playerId]?.hand.includes(tileId) ?? false
  }

  private discard(playerId: number, tileId: string) {
    const hand = this.state.players[playerId].hand
    const at = hand.indexOf(tileId)
    if (at >= 0) hand.splice(at, 1)
  }

  // --- draft ---------------------------------------------------------------

  /** The 20 tiles a player chooses their opening hand from. */
  draftPool(playerId: number): string[] {
    const player = this.state.players[playerId]
    return player ? [...player.hand, ...player.stack] : []
  }

  submitDraft(playerId: number, picks: string[]): ActionResult {
    if (this.state.phase !== 'draft') return fail('Hands are already set.')
    const player = this.state.players[playerId]
    if (!player) return fail('You are not seated in this game.')
    if (player.draftReady) return fail('You have already confirmed your hand.')
    if (picks.length !== STARTING_HAND_SIZE) {
      return fail(`Choose exactly ${STARTING_HAND_SIZE} tiles.`)
    }
    const pool = new Set(this.draftPool(playerId))
    const unique = new Set(picks)
    if (unique.size !== picks.length || picks.some((id) => !pool.has(id))) {
      return fail('That is not a valid selection of your own tiles.')
    }

    const rng = new Rng(this.state.seed + 31 * (playerId + 1))
    const all = this.draftPool(playerId)
    player.hand = all.filter((id) => unique.has(id))
    player.stack = rng.shuffle(all.filter((id) => !unique.has(id)))
    player.draftReady = true

    if (this.state.players.every((p) => p.draftReady)) {
      this.state.phase = 'play'
      this.log(null, 'All hands are set. Play begins.')
    }
    return OK
  }

  // --- placement -----------------------------------------------------------

  playTile(playerId: number, tileId: string, spaceId: string): ActionResult {
    const turn = this.requireTurn(playerId)
    if (!turn.ok) return turn
    if (this.state.paused) return fail('The game is paused.')
    if (!this.holdsTile(playerId, tileId)) return fail('That tile is not in your hand.')

    const tile = tileFromId(tileId)
    if (tile.owner !== playerId) return fail('That tile is not yours.')
    if (tile.kind === 'switch') return fail('Use the switch action for a switch tile.')
    if (tile.kind === 'move') return fail('Use the move action for a move tile.')
    if (!tile.fast && this.state.playedNonFast) {
      return fail('You have already placed a tile this turn. Only fast tiles remain.')
    }
    if (!legalPlacements(this.view, tile).includes(spaceId)) {
      return fail('That tile cannot be placed there.')
    }

    this.state.placed[spaceId] = { tileId, owner: playerId }
    this.discard(playerId, tileId)
    this.state.placedThisTurn.push(spaceId)
    this.state.undoStack.push({ kind: 'place', tileId, spaceId })
    if (!tile.fast) this.state.playedNonFast = true
    this.log(playerId, `plays ${tileLabel(tile)}${tile.fast ? ' (fast)' : ''}.`)
    return OK
  }

  useMove(playerId: number, tileId: string, from: string, to: string): ActionResult {
    const turn = this.requireTurn(playerId)
    if (!turn.ok) return turn
    if (this.state.paused) return fail('The game is paused.')
    if (!this.holdsTile(playerId, tileId)) return fail('That tile is not in your hand.')
    if (tileFromId(tileId).kind !== 'move') return fail('That is not a move tile.')
    if (this.state.playedNonFast) return fail('You have already placed a tile this turn.')
    if (!movableTiles(this.view, playerId, this.state.placedThisTurn).includes(from)) {
      return fail('You can only reposition your own non-fast tiles from an earlier turn.')
    }
    if (!moveDestinations(this.view, from).includes(to)) {
      return fail('A repositioned tile must go on an empty land space.')
    }

    const moved = this.state.placed[from]
    this.state.placed[to] = moved
    this.state.placed[from] = { tileId, owner: playerId }
    this.discard(playerId, tileId)
    this.state.placedThisTurn.push(from, to)
    this.state.undoStack.push({ kind: 'move', tileId, from, to })
    this.state.playedNonFast = true
    this.log(playerId, `repositions ${tileLabel(tileFromId(moved.tileId))} with the move tile.`)
    return OK
  }

  useSwitch(playerId: number, tileId: string, a: PieceRef, b: PieceRef): ActionResult {
    const turn = this.requireTurn(playerId)
    if (!turn.ok) return turn
    if (this.state.paused) return fail('The game is paused.')
    if (!this.holdsTile(playerId, tileId)) return fail('That tile is not in your hand.')
    if (tileFromId(tileId).kind !== 'switch') return fail('That is not a switch tile.')
    if (!canSwitch(this.view, a, b)) return fail('Those two caste pieces cannot be swapped.')

    const casteA = this.state.pieces[a.spaceId][a.index]
    const casteB = this.state.pieces[b.spaceId][b.index]
    this.state.pieces[a.spaceId][a.index] = casteB
    this.state.pieces[b.spaceId][b.index] = casteA
    this.discard(playerId, tileId)
    this.state.undoStack.push({ kind: 'switch', tileId, a, b })
    this.log(
      playerId,
      `swaps a ${CASTE_PIECE_LABEL[casteA]} and a ${CASTE_PIECE_LABEL[casteB]} with the switch tile.`,
    )
    return OK
  }

  // --- ending a turn -------------------------------------------------------

  /** A turn may only end once a tile has been placed, unless none can be. */
  canEndTurn(playerId: number): boolean {
    if (this.state.phase !== 'play' || this.state.current !== playerId) return false
    if (this.state.placedThisTurn.length > 0) return true
    return !this.hasLegalPlacement(playerId)
  }

  private hasLegalPlacement(playerId: number): boolean {
    const view = this.view
    return this.state.players[playerId].hand.some((id) => {
      const tile = tileFromId(id)
      if (!tile.fast && this.state.playedNonFast) return false
      if (tile.kind === 'switch') return false
      if (tile.kind === 'move') {
        return movableTiles(view, playerId, this.state.placedThisTurn).some(
          (from) => moveDestinations(view, from).length > 0,
        )
      }
      return legalPlacements(view, tile).length > 0
    })
  }

  /**
   * Take back the last thing done this turn — a misclick fix, not a take-back
   * of a move. Only ever reaches as far as the start of the current turn:
   * `endTurn` is where captures resolve and hands refill, and unwinding past
   * that would mean rewriting information other players have already acted on.
   *
   * Nothing here needs to touch captures, because none have happened yet.
   */
  undoLast(playerId: number): ActionResult {
    const turn = this.requireTurn(playerId)
    if (!turn.ok) return turn
    if (this.state.paused) return fail('The game is paused.')

    const last = this.state.undoStack.pop()
    if (!last) return fail('There is nothing to take back this turn.')

    const hand = this.state.players[playerId].hand
    switch (last.kind) {
      case 'place':
        delete this.state.placed[last.spaceId]
        break
      case 'move':
        // The moved tile goes home and the move tile leaves the board.
        this.state.placed[last.from] = this.state.placed[last.to]
        delete this.state.placed[last.to]
        break
      case 'switch': {
        const casteA = this.state.pieces[last.a.spaceId][last.a.index]
        const casteB = this.state.pieces[last.b.spaceId][last.b.index]
        this.state.pieces[last.a.spaceId][last.a.index] = casteB
        this.state.pieces[last.b.spaceId][last.b.index] = casteA
        break
      }
    }

    hand.push(last.tileId)
    // Rebuild from what is left rather than guessing: a fast tile undone after
    // a normal one must not hand the placement back.
    this.state.placedThisTurn = this.state.undoStack.flatMap((entry) =>
      entry.kind === 'place' ? [entry.spaceId] : entry.kind === 'move' ? [entry.from, entry.to] : [],
    )
    this.state.playedNonFast = this.state.undoStack.some(
      (entry) => entry.kind === 'move' || (entry.kind === 'place' && !tileFromId(entry.tileId).fast),
    )
    // Drop the line this action wrote. It reads as the history of the game, and
    // as far as the game is concerned this never happened.
    this.state.log.pop()
    return OK
  }

  endTurn(playerId: number): ActionResult {
    const turn = this.requireTurn(playerId)
    if (!turn.ok) return turn
    if (this.state.paused) return fail('The game is paused.')
    if (!this.canEndTurn(playerId)) return fail('You must place a tile before ending your turn.')
    this.advanceTurn(playerId)
    return OK
  }

  /**
   * Close the current turn and pass play on: resolve captures, refill the
   * ending player's hand, check whether the game is over, and hand the clock to
   * the next seat. Shared by ending a turn normally, running out of time, and
   * redrawing a hand — each spends the whole turn and then advances.
   */
  private advanceTurn(playerId: number) {
    // A move leaves a tile at both ends, so both spaces stay marked; a turn that
    // placed nothing clears the mark rather than leaving the last one to linger.
    this.state.lastPlaced = this.state.placedThisTurn.filter((id) => id in this.state.placed)

    // Hand this turn to everyone who has not acted since, and clear the ending
    // player's own bucket — they have just had their look at the board. Written
    // here rather than after the end-of-game check below, which returns early:
    // the final turn has to reach the table like any other.
    for (let seat = 0; seat < this.state.playerCount; seat++) {
      this.state.unseenPlaced[seat] =
        seat === playerId ? [] : [...this.state.unseenPlaced[seat], ...this.state.lastPlaced]
    }

    this.resolveCaptures()
    this.refreshHand(playerId)

    const end = checkEnd(this.view, this.state.setAside)
    if (end.over) {
      const scored = scoreGame(this.state.players, this.state.options.teams)
      this.state.result = { ...scored, reason: end.reason }
      this.log(null, end.reason)
      this.state.phase = 'over'
      return
    }

    this.state.current = (this.state.current + 1) % this.state.playerCount
    // A round closes when play comes back to whoever opened the game, which is
    // no longer always seat 0 — the opening seat is drawn. Counting on a wrap to
    // zero instead would end the first round early at every table that did not
    // happen to start there.
    if (this.state.current === this.state.first) this.state.turnNumber += 1
    this.state.placedThisTurn = []
    this.state.playedNonFast = false
    this.state.redrewThisTurn = false
    this.state.undoStack = []
  }

  // --- pausing -------------------------------------------------------------

  private canToggle(playerId: number): ActionResult {
    if (this.state.phase !== 'play') return fail('The game is not in progress.')
    if (!this.state.players[playerId]) return fail('You are not seated in this game.')
    return OK
  }

  /** Suspend the table. Any seated player may do this, whoever is on the clock. */
  pause(playerId: number): ActionResult {
    const allowed = this.canToggle(playerId)
    if (!allowed.ok) return allowed
    if (this.state.paused) return fail('The game is already paused.')
    this.state.paused = true
    this.log(playerId, 'pauses the game.')
    return OK
  }

  /** Resume a suspended table. Again open to any seated player. */
  resume(playerId: number): ActionResult {
    const allowed = this.canToggle(playerId)
    if (!allowed.ok) return allowed
    if (!this.state.paused) return fail('The game is not paused.')
    this.state.paused = false
    this.log(playerId, 'resumes the game.')
    return OK
  }

  // --- redrawing a hand ----------------------------------------------------

  /**
   * Whether the current player may shuffle their hand back into their stack and
   * draw a fresh one. A free action — it does not use up the placement — but
   * only once per turn, and never in the opening round, so a drafted or dealt
   * hand is played at least once before it can be swapped. Offered only at the
   * start of the turn, before anything else has been done.
   */
  canRedraw(playerId: number): boolean {
    return (
      this.state.phase === 'play' &&
      !this.state.paused &&
      this.state.current === playerId &&
      this.state.turnNumber >= 2 &&
      !this.state.redrewThisTurn &&
      this.state.placedThisTurn.length === 0 &&
      this.state.undoStack.length === 0
    )
  }

  /**
   * Trade the whole hand for a fresh draw and carry on with the turn. Shuffling
   * hand and stack together and dealing back off the top can never grow the
   * hand beyond what a normal refill would, so it hands out no free tiles; the
   * once-per-turn flag is what keeps it from being spun until the hand suits.
   */
  redrawHand(playerId: number): ActionResult {
    const turn = this.requireTurn(playerId)
    if (!turn.ok) return turn
    if (this.state.paused) return fail('The game is paused.')
    if (this.state.turnNumber < 2) return fail('Your hand can only be redrawn from the second round.')
    if (this.state.redrewThisTurn) return fail('You have already redrawn your hand this turn.')
    if (this.state.placedThisTurn.length > 0 || this.state.undoStack.length > 0) {
      return fail('Redraw your hand at the start of your turn, before doing anything else.')
    }

    const player = this.state.players[playerId]
    // Seeded off the turn rather than Math.random, so a room restored from a
    // snapshot would resolve the same redraw the same way.
    const rng = new Rng(this.state.seed + 6301 * this.state.turnNumber + playerId + 1)
    const shuffled = rng.shuffle([...player.hand, ...player.stack])
    player.hand = shuffled.slice(0, STARTING_HAND_SIZE)
    player.stack = shuffled.slice(STARTING_HAND_SIZE)
    this.state.redrewThisTurn = true
    this.log(playerId, 'redraws their hand.')
    return OK
  }

  /**
   * Play for whoever is on the clock when their time runs out: one tile, on a
   * space picked at random, and the turn ends.
   *
   * Deliberately the weakest legal move rather than a good one — the clock is
   * there to keep the table moving, not to play the game on someone's behalf.
   * Anything they managed to do before the clock went stands; only the gap is
   * filled, so a player who placed but never pressed end turn simply has their
   * turn closed for them.
   */
  timeOut(playerId: number): ActionResult {
    const turn = this.requireTurn(playerId)
    if (!turn.ok) return turn

    this.log(playerId, 'runs out of time.')
    if (this.state.placedThisTurn.length === 0) {
      // Seeded off the turn rather than Math.random, so a room restored from a
      // snapshot resolves the same timeout the same way instead of inventing a
      // different move.
      const seed = this.state.seed + 7919 * this.state.turnNumber + playerId + 1
      this.playSomething(playerId, new Rng(seed))
    }
    // A player with nothing legal left is allowed to end on nothing, which is
    // the case `canEndTurn` already covers.
    return this.endTurn(playerId)
  }

  /** One tile from hand onto one random empty space it may legally go on. */
  private playSomething(playerId: number, rng: Rng): boolean {
    const view = this.view
    const hand = rng.shuffle(this.state.players[playerId].hand)

    for (const tileId of hand) {
      const tile = tileFromId(tileId)
      if (tile.kind === 'switch' || tile.kind === 'move') continue
      const spaces = legalPlacements(view, tile)
      if (spaces.length) return this.playTile(playerId, tileId, spaces[rng.int(spaces.length)]).ok
    }

    /*
     * A move tile only as a last resort: it drags a tile already on the board
     * rather than simply adding one. It cannot be skipped either, because
     * `canEndTurn` refuses while any placement remains legal — a hand down to
     * nothing but a move tile would otherwise leave the turn unable to end and
     * the clock firing forever.
     */
    for (const tileId of hand) {
      if (tileFromId(tileId).kind !== 'move') continue
      for (const from of rng.shuffle(movableTiles(view, playerId, this.state.placedThisTurn))) {
        const to = moveDestinations(view, from)
        if (to.length) return this.useMove(playerId, tileId, from, to[rng.int(to.length)]).ok
      }
    }
    return false
  }

  private resolveCaptures() {
    this.state.lastCaptures = []
    const contests = pendingCaptures(this.view)
    if (!contests.length) return

    for (const contest of contests) {
      this.state.lastCaptures.push({
        caste: contest.caste,
        spaceId: contest.spaceId,
        winner: contest.winner,
      })
      if (contest.winner === null) {
        this.state.setAside.push(contest.caste)
        this.log(null, `A ${CASTE_PIECE_LABEL[contest.caste]} is contested and set aside.`)
      } else {
        this.state.players[contest.winner].captured.push(contest.caste)
        this.log(contest.winner, `captures a ${CASTE_PIECE_LABEL[contest.caste]}.`)
      }
    }

    // Removal happens after every contest is decided, so all of them see the
    // same board position.
    for (const contest of contests) {
      const list = this.state.pieces[contest.spaceId]
      const at = list.indexOf(contest.caste)
      if (at >= 0) list.splice(at, 1)
    }
  }

  private refreshHand(playerId: number) {
    const player = this.state.players[playerId]
    while (player.hand.length < STARTING_HAND_SIZE && player.stack.length > 0) {
      player.hand.push(player.stack.shift()!)
    }
  }
}
