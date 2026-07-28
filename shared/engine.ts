import { buildBoard, type Board } from './board'
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
  type Caste,
  type GameResult,
  type LogEntry,
  type PlacedTile,
  type Tile,
} from './types'

export type Phase = 'lobby' | 'draft' | 'play' | 'over'

export interface GameOptions {
  /** Deal starting hands at random instead of letting each player choose five. */
  randomHands: boolean
  /** Reveal every player's captured pieces instead of keeping them secret. */
  openInformation: boolean
}

export const DEFAULT_OPTIONS: GameOptions = {
  randomHands: false,
  openInformation: false,
}

export interface EnginePlayer {
  id: number
  hand: string[]
  stack: string[]
  captured: Caste[]
  /** Draft picks confirmed; empty until the player has chosen. */
  draftReady: boolean
}

export interface GameState {
  phase: Phase
  options: GameOptions
  seed: number
  playerCount: number
  pieces: Record<string, Caste[]>
  placed: Record<string, PlacedTile>
  players: EnginePlayer[]
  current: number
  turnNumber: number
  placedThisTurn: string[]
  playedNonFast: boolean
  setAside: Caste[]
  log: LogEntry[]
  result: GameResult | null
  /** Captures produced by the most recent completed turn, for the UI recap. */
  lastCaptures: { caste: Caste; spaceId: string; winner: number | null }[]
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
    if (playerCount < 2 || playerCount > 4) throw new Error('Samurai is for 2 to 4 players')
    this.board = buildBoard(playerCount)
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

    this.state = {
      phase: options.randomHands ? 'play' : 'draft',
      options,
      seed,
      playerCount,
      pieces: distributePieces(this.board, playerCount, rng),
      placed: {},
      players,
      current: 0,
      turnNumber: 1,
      placedThisTurn: [],
      playedNonFast: false,
      setAside: [],
      log: [],
      result: null,
      lastCaptures: [],
    }

    if (options.randomHands) {
      for (const player of players) player.hand = player.stack.splice(0, STARTING_HAND_SIZE)
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
    game.state = state
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
    if (!tile.fast) this.state.playedNonFast = true
    this.log(playerId, `plays ${tileLabel(tile)}${tile.fast ? ' (fast)' : ''}.`)
    return OK
  }

  useMove(playerId: number, tileId: string, from: string, to: string): ActionResult {
    const turn = this.requireTurn(playerId)
    if (!turn.ok) return turn
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
    this.state.playedNonFast = true
    this.log(playerId, `repositions ${tileLabel(tileFromId(moved.tileId))} with the move tile.`)
    return OK
  }

  useSwitch(playerId: number, tileId: string, a: PieceRef, b: PieceRef): ActionResult {
    const turn = this.requireTurn(playerId)
    if (!turn.ok) return turn
    if (!this.holdsTile(playerId, tileId)) return fail('That tile is not in your hand.')
    if (tileFromId(tileId).kind !== 'switch') return fail('That is not a switch tile.')
    if (!canSwitch(this.view, a, b)) return fail('Those two caste pieces cannot be swapped.')

    const casteA = this.state.pieces[a.spaceId][a.index]
    const casteB = this.state.pieces[b.spaceId][b.index]
    this.state.pieces[a.spaceId][a.index] = casteB
    this.state.pieces[b.spaceId][b.index] = casteA
    this.discard(playerId, tileId)
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

  endTurn(playerId: number): ActionResult {
    const turn = this.requireTurn(playerId)
    if (!turn.ok) return turn
    if (!this.canEndTurn(playerId)) return fail('You must place a tile before ending your turn.')

    this.resolveCaptures()
    this.refreshHand(playerId)

    const end = checkEnd(this.view, this.state.setAside)
    if (end.over) {
      this.state.result = { ...scoreGame(this.state.players), reason: end.reason }
      this.log(null, end.reason)
      this.state.phase = 'over'
      return OK
    }

    this.state.current = (this.state.current + 1) % this.state.playerCount
    if (this.state.current === 0) this.state.turnNumber += 1
    this.state.placedThisTurn = []
    this.state.playedNonFast = false
    return OK
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
