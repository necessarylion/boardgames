import { chooseFirst, type Opening } from './opening'
import { Rng } from './rng'
import type { LogEntry } from './types'

/**
 * COP — a hidden-door resource game for two to eight, unrelated to Samurai,
 * Halli Galli, Coup and Carnivals and sharing none of their rules. One player is
 * the Cop; everyone else are Thieves. Each round the thieves slip into one of
 * eight rooms in secret, the Cop opens exactly two doors, and whoever is caught
 * is stripped of some of their loot while everyone left undisturbed splits the
 * spoils of their room. The Cop's badge passes round the table two rounds at a
 * time until everyone has worn it, and the leader tokens for the most Keys, the
 * most Stamps and the most Cards decide the game.
 *
 * Do not confuse this with `shared/coup.ts`: they are two different games with
 * two different ids (`cop` here, `coup` there) that only happen to rhyme.
 *
 * Like the other four engines this module owns the only real state, validates
 * every action and hands back `{ok:false,error}` for anything it rejects, so the
 * client can call the read-only helpers freely without ever mutating a game.
 *
 * The published sheet leaves the exact room contents "random" and the scoring
 * partly open; the choices made here — how the eight rooms are stocked, that a
 * caught thief still counts a catch whatever the Cop takes, and the tie-breaks
 * on the leader tokens — are flagged where they matter and drawn from no
 * published component.
 */

/** The three kinds of loot competed over; a leader token rides on each. */
export type Resource = 'key' | 'stamp' | 'card'

export const RESOURCES: readonly Resource[] = ['key', 'stamp', 'card']

/** A bundle of the three resources — a room's contents, or a player's holdings. */
export interface Loot {
  key: number
  stamp: number
  card: number
}

/** Every player starts a game holding this many of each resource. */
export const STARTING_EACH = 3
/** The board always has eight doors, Room 1 the richest and Room 8 the barest. */
export const ROOM_COUNT = 8
/** Each room's raw draw is scaled by this, trimming the loot ~40% off the top. */
export const ROOM_RICHNESS = 0.6
/** The Cop opens exactly this many doors each round. */
export const DOORS_OPENED = 2
/** The most resources the Cop may confiscate from any one caught thief. */
export const CONFISCATE_LIMIT = 2
/** How many rounds a player wears the badge before it passes on. */
export const ROUNDS_PER_COP = 2

export interface CopPlayer {
  id: number
  /** This player's own loot, hidden from the others until it is caught or scored. */
  loot: Loot
  /** How many times this player has been caught — the last tie-break at the end. */
  caught: number
}

/**
 * A round runs through the thieves choosing rooms, the Cop opening two doors, the
 * Cop stripping whoever was caught, and a settled pause before the next round.
 * `arrest` is skipped outright when nobody was caught.
 */
export type CopStep = 'select' | 'search' | 'arrest' | 'resolved'

/** What became of one room once the doors were opened. */
export interface CopRoomOutcome {
  room: number
  /** Whether the Cop opened this door. An opened room yields no loot. */
  opened: boolean
  /** The thieves who chose this room, revealed now the round is resolved. */
  occupants: number[]
  /** Loot each occupant carried off, by seat id; empty for an opened room. */
  loot: Record<number, Loot>
}

/**
 * How a round finished, kept whole so the table can replay it: which doors the
 * Cop opened, who was caught, what everyone in the safe rooms took, and — once
 * the Cop has acted — what was confiscated from each caught thief.
 */
export interface CopRoundResult {
  round: number
  cop: number
  opened: number[]
  caught: number[]
  rooms: CopRoomOutcome[]
  /** What the Cop took from each caught thief, by seat id. Filled at the arrest. */
  confiscations: Record<number, Loot>
}

/** The most recent notable moment, so the table can narrate and animate it. */
export type CopEvent =
  | { kind: 'round'; round: number; cop: number }
  | { kind: 'select'; player: number }
  | { kind: 'search'; cop: number; opened: number[] }
  | { kind: 'caught'; players: number[] }
  | { kind: 'safe' }
  | { kind: 'arrest'; cop: number; taken: number }

/** One player's final tally, kept so the whole table can see how it was scored. */
export interface CopStanding {
  player: number
  loot: Loot
  /** Resources this player leads outright — one token each. */
  leaderTokens: Resource[]
  total: number
  caught: number
}

export interface CopResult {
  winners: number[]
  standings: CopStanding[]
  /** Who leads each resource outright, or null where a tie left the token unwon. */
  leaders: Record<Resource, number | null>
  /** A translation key for how it was decided; the client resolves it. */
  reason: string
}

export type CopPhase = 'play' | 'over'

export interface CopGameState {
  playerCount: number
  players: CopPlayer[]
  /** The eight rooms, fixed for the game; Room 1 (index 0) is the richest. */
  rooms: Loot[]
  /**
   * Where the generator has got to. COP rolls a die every round to break loot
   * ties, so like Coup and Carnivals it stores the generator's position rather
   * than replaying from the original seed.
   */
  seed: number
  /** The seat that first wore the badge; the rotation counts from here. */
  firstCop: number
  /** Whose badge it is this round. */
  cop: number
  /** The round in progress, 1-based, up to `totalRounds`. */
  round: number
  /** Two rounds per player, so the badge goes all the way round the table. */
  totalRounds: number
  /**
   * How the first Cop was chosen, or null when drawn quietly. Choosing the Cop at
   * random is the rulebook's own opening; shared with the other four games, see
   * `shared/opening.ts`.
   */
  opening: Opening | null
  phase: CopPhase
  step: CopStep
  paused: boolean
  /** Mirrors `round`, for the generic shell that reads `turnNumber`. */
  turnNumber: number
  /** The room each seat slipped into this round; the Cop's stays null. */
  selections: (number | null)[]
  /** The two doors the Cop opened this round; empty until the search. */
  openedDoors: number[]
  /** Set once a round is resolved; null while it is still being played out. */
  roundResult: CopRoundResult | null
  /** The last notable moment, so the table can narrate and animate it. */
  lastEvent: CopEvent | null
  log: LogEntry[]
  result: CopResult | null
}

export type Outcome = { ok: true } | { ok: false; error: string }

const ok: Outcome = { ok: true }
const fail = (error: string): Outcome => ({ ok: false, error })

// --- loot helpers ------------------------------------------------------------

export const emptyLoot = (): Loot => ({ key: 0, stamp: 0, card: 0 })
export const lootTotal = (l: Loot): number => l.key + l.stamp + l.card
const cloneLoot = (l: Loot): Loot => ({ key: l.key, stamp: l.stamp, card: l.card })

// --- read-only helpers, safe for the client to call --------------------------

/** Whether a seat is wearing the badge this round. */
export const isCop = (state: CopGameState, playerId: number): boolean => state.cop === playerId

/** The thieves this round — everyone but the Cop. */
export const thieves = (state: CopGameState): number[] =>
  state.players.map((p) => p.id).filter((id) => id !== state.cop)

/**
 * What this viewer may do right now, decided from the full state and sent
 * ready-made the way Coup and Carnivals send theirs. The client cannot tell a
 * thief who has yet to choose from one already hidden behind a door without the
 * server saying so, so it says so.
 */
export interface CopAffordances {
  /** A thief in the choosing step who has not yet picked a room. */
  select: boolean
  /** The room this viewer has slipped into this round, or null. */
  chosen: number | null
  /** The Cop, waiting to open two doors. */
  search: boolean
  /** The Cop, with caught thieves to strip. */
  arrest: boolean
  /** The round is resolved and this seat may move the game on. */
  next: boolean
}

export function affordances(state: CopGameState, playerId: number): CopAffordances {
  const idle: CopAffordances = { select: false, chosen: null, search: false, arrest: false, next: false }
  const player = state.players[playerId]
  if (!player || state.phase !== 'play' || state.paused) return idle

  const chosen = state.selections[playerId]
  if (state.step === 'select') {
    return { ...idle, chosen, select: !isCop(state, playerId) && chosen === null }
  }
  if (state.step === 'search') return { ...idle, chosen, search: isCop(state, playerId) }
  if (state.step === 'arrest') return { ...idle, chosen, arrest: isCop(state, playerId) }
  // resolved: anyone still at the table can deal the next round on.
  return { ...idle, chosen, next: true }
}

export class CopGame {
  state: CopGameState

  constructor(playerCount: number, seed: number, diceStart = true) {
    this.state = CopGame.deal(playerCount, seed, diceStart)
  }

  /** Rebuild an engine around state read back from the database. */
  static fromState(state: CopGameState): CopGame {
    const game = Object.create(CopGame.prototype) as CopGame
    game.state = state
    return game
  }

  /**
   * Stock the eight rooms. Each gets a random spread of the three resources and
   * they are then sorted richest first, so Room 1 always holds the most and Room
   * 8 the least — the rulebook's one fixed shape over an otherwise free draw.
   */
  private static stockRooms(rng: Rng): Loot[] {
    // Each resource is scaled down so a room is not worth a whole round's worth
    // of loot; the raw draw ran too rich for the table.
    const scale = (n: number) => Math.round(n * ROOM_RICHNESS)
    const rooms: Loot[] = Array.from({ length: ROOM_COUNT }, () => ({
      key: scale(rng.int(6) + 1),
      stamp: scale(rng.int(7)),
      card: scale(rng.int(3) + 1),
    }))
    return rooms.sort((a, b) => lootTotal(b) - lootTotal(a))
  }

  private static deal(playerCount: number, seed: number, diceStart: boolean): CopGameState {
    const rng = new Rng(seed)
    const players: CopPlayer[] = Array.from({ length: playerCount }, (_, id) => ({
      id,
      loot: { key: STARTING_EACH, stamp: STARTING_EACH, card: STARTING_EACH },
      caught: 0,
    }))
    const rooms = CopGame.stockRooms(rng)
    // The first Cop is chosen at random — the rulebook's own opening — either by
    // a roll-off the table watches or quietly from the same generator. Drawn last
    // of everything the deal takes, so inserting it does not restock the rooms.
    const { first: firstCop, opening } = chooseFirst(rng, playerCount, diceStart)

    const state: CopGameState = {
      playerCount,
      players,
      rooms,
      seed: rng.position,
      firstCop,
      cop: firstCop,
      round: 1,
      totalRounds: playerCount * ROUNDS_PER_COP,
      opening,
      phase: 'play',
      step: 'select',
      paused: false,
      turnNumber: 1,
      selections: Array.from({ length: playerCount }, () => null),
      openedDoors: [],
      roundResult: null,
      lastEvent: { kind: 'round', round: 1, cop: firstCop },
      log: [
        {
          turn: 1,
          player: firstCop,
          text: `Round 1 — #${firstCop} takes the badge.`,
        },
      ],
      result: null,
    }
    return state
  }

  // --- actions ---------------------------------------------------------------

  /**
   * Slip into a room, in secret. Only a thief chooses, and only once a round; the
   * choice is hidden from the rest of the table until the round is resolved.
   */
  select(playerId: number, room: number): Outcome {
    const s = this.state
    if (s.phase !== 'play') return fail('The game is over.')
    if (s.paused) return fail('The table is paused.')
    if (s.step !== 'select') return fail('The doors are already chosen.')
    const player = s.players[playerId]
    if (!player) return fail('You have no seat in this game.')
    if (isCop(s, playerId)) return fail('You are the Cop this round.')
    if (s.selections[playerId] !== null) return fail('You have already chosen a room.')
    if (!Number.isInteger(room) || room < 0 || room >= ROOM_COUNT) return fail('No such room.')

    s.selections[playerId] = room
    s.lastEvent = { kind: 'select', player: playerId }
    this.log(playerId, 'slips through a door.')

    // Once every thief is hidden, the Cop may open the doors.
    if (thieves(s).every((id) => s.selections[id] !== null)) {
      s.step = 'search'
    }
    return ok
  }

  /**
   * Open exactly two doors. Any thief behind them is caught; the rooms left shut
   * are shared out at once, with a die settling any loot that will not divide.
   */
  search(playerId: number, doorA: number, doorB: number): Outcome {
    const s = this.state
    if (s.phase !== 'play') return fail('The game is over.')
    if (s.paused) return fail('The table is paused.')
    if (s.step !== 'search') return fail('It is not time to open the doors.')
    if (!isCop(s, playerId)) return fail('Only the Cop opens the doors.')
    const doors = [doorA, doorB]
    for (const d of doors) {
      if (!Number.isInteger(d) || d < 0 || d >= ROOM_COUNT) return fail('No such room.')
    }
    if (doorA === doorB) return fail('You must open two different doors.')

    this.resolveSearch(doors)
    return ok
  }

  /**
   * Strip the caught thieves. `takings` gives, per caught seat, the resources the
   * Cop demands — up to four in total from each. The Cop never sees a catch's
   * holdings (nobody sees another player's resources until the game is over), so
   * the demand is made blind: asking for more of a resource than a thief carries
   * simply takes all they have of it. A seat left out, or an empty entry, is let
   * off. Whatever is taken is added to the Cop's own pile.
   */
  confiscate(playerId: number, takings: Record<number, Loot>): Outcome {
    const s = this.state
    if (s.phase !== 'play') return fail('The game is over.')
    if (s.paused) return fail('The table is paused.')
    if (s.step !== 'arrest') return fail('There is nobody to arrest.')
    if (!isCop(s, playerId)) return fail('Only the Cop confiscates.')
    const result = s.roundResult
    if (!result) return fail('There is nobody to arrest.')

    const caught = new Set(result.caught)
    // Validate the whole demand before taking a single resource, so a bad entry
    // cannot leave a thief half-stripped. Only the four-resource cap is checked;
    // the holdings are not, because the Cop cannot see them.
    for (const [key, take] of Object.entries(takings)) {
      const id = Number(key)
      if (!caught.has(id)) return fail('That thief was not caught.')
      if (lootTotal(this.cleanTake(take)) > CONFISCATE_LIMIT) {
        return fail(`You may take at most ${CONFISCATE_LIMIT} from a thief.`)
      }
    }

    let taken = 0
    const cop = s.players[s.cop].loot
    for (const [key, take] of Object.entries(takings)) {
      const id = Number(key)
      const want = this.cleanTake(take)
      const held = s.players[id].loot
      const took = emptyLoot()
      for (const r of RESOURCES) {
        // Clamp the blind demand to what the thief actually carries.
        const amount = Math.min(want[r], held[r])
        held[r] -= amount
        cop[r] += amount
        took[r] = amount
      }
      result.confiscations[id] = took
      taken += lootTotal(took)
    }

    s.step = 'resolved'
    s.lastEvent = { kind: 'arrest', cop: s.cop, taken }
    this.log(s.cop, taken > 0 ? `confiscates ${taken} from the catch.` : 'lets the catch off.')
    return ok
  }

  /** Deal the next round on once this one is settled. Open to any player. */
  next(playerId: number): Outcome {
    const s = this.state
    if (s.phase !== 'play') return fail('The game is over.')
    if (s.paused) return fail('The table is paused.')
    if (s.step !== 'resolved') return fail('The round is not over yet.')
    if (!s.players[playerId]) return fail('You have no seat in this game.')
    this.advanceRound()
    return ok
  }

  /**
   * The clock ran out on whoever the table was waiting for. Each step takes the
   * least eventful legal move: a thief who never chose is put behind the first
   * door, the Cop opens the first two doors, an unmade arrest lets the catch off,
   * and a settled round is simply dealt past so the table never stalls.
   *
   * Like Coup's and Carnivals', this takes no player: a round can be waiting on
   * several thieves at once, so it resolves whatever the step is asking.
   */
  timeOut(): Outcome {
    const s = this.state
    if (s.phase !== 'play') return fail('The game is over.')
    if (s.paused) return fail('The table is paused.')

    if (s.step === 'select') {
      let acted = false
      for (const id of thieves(s)) {
        if (s.selections[id] === null) acted = this.select(id, 0).ok || acted
      }
      return acted ? ok : fail('There is nobody to time out.')
    }
    if (s.step === 'search') return this.search(s.cop, 0, 1)
    if (s.step === 'arrest') return this.confiscate(s.cop, {})
    // resolved
    this.advanceRound()
    return ok
  }

  /** Suspend the table; any seated player may. Mirrors the other four games. */
  pause(playerId: number): Outcome {
    const s = this.state
    if (s.phase === 'over') return fail('The game is already over.')
    if (s.paused) return fail('The table is already paused.')
    if (!s.players[playerId]) return fail('You have no seat in this game.')
    s.paused = true
    return ok
  }

  resume(playerId: number): Outcome {
    const s = this.state
    if (!s.paused) return fail('The table is not paused.')
    if (!s.players[playerId]) return fail('You have no seat in this game.')
    s.paused = false
    return ok
  }

  // --- round resolution ------------------------------------------------------

  /**
   * Work out the round once the two doors are open: catch whoever was behind
   * them, split every room still shut, and leave the caught thieves for the Cop
   * to strip — or settle the round outright when the sweep caught no one.
   */
  private resolveSearch(doors: number[]): void {
    const s = this.state
    const rng = new Rng(s.seed)
    const opened = new Set(doors)

    // Group the thieves by the room each chose.
    const inRoom: number[][] = Array.from({ length: ROOM_COUNT }, () => [])
    for (const id of thieves(s)) {
      const room = s.selections[id]
      if (room !== null) inRoom[room].push(id)
    }

    const caught: number[] = []
    const rooms: CopRoomOutcome[] = []
    for (let room = 0; room < ROOM_COUNT; room++) {
      const occupants = inRoom[room]
      const isOpen = opened.has(room)
      const loot: Record<number, Loot> = {}
      if (isOpen) {
        // The door swung open: everyone here is caught, and the room yields
        // nothing to anyone.
        for (const id of occupants) caught.push(id)
      } else if (occupants.length > 0) {
        this.shareRoom(s.rooms[room], occupants, rng, loot)
      }
      rooms.push({ room, opened: isOpen, occupants: [...occupants], loot })
    }
    s.seed = rng.position

    for (const id of caught) s.players[id].caught += 1

    s.openedDoors = [...doors]
    s.roundResult = {
      round: s.round,
      cop: s.cop,
      opened: [...doors],
      caught: [...caught].sort((a, b) => a - b),
      rooms,
      confiscations: {},
    }
    s.lastEvent = { kind: 'search', cop: s.cop, opened: [...doors] }
    this.log(s.cop, `opens doors ${doors[0] + 1} and ${doors[1] + 1}.`)

    if (caught.length > 0) {
      s.step = 'arrest'
      s.lastEvent = { kind: 'caught', players: [...caught].sort((a, b) => a - b) }
      const names = caught.map((id) => `#${id}`).join(', ')
      this.log(null, `Caught: ${names}.`)
    } else {
      s.step = 'resolved'
      s.lastEvent = { kind: 'safe' }
      this.log(null, 'The doors open on empty rooms.')
    }
  }

  /**
   * Share one shut room's contents among the thieves hiding in it. Each takes an
   * equal whole share; a resource that will not divide gives one apiece as far as
   * it goes and settles the last few by a die roll among the thieves, highest
   * rolls first — the rulebook's own tie-break, made deterministic from the seed.
   */
  private shareRoom(contents: Loot, occupants: number[], rng: Rng, out: Record<number, Loot>): void {
    for (const id of occupants) out[id] = emptyLoot()
    const n = occupants.length
    for (const r of RESOURCES) {
      const total = contents[r]
      const each = Math.floor(total / n)
      for (const id of occupants) out[id][r] += each
      let remainder = total - each * n
      if (remainder > 0) {
        // Roll for the odd resources and hand them out to the highest rolls,
        // ties broken by seat order so the draw is settled either way.
        const rolls = occupants.map((id) => ({ id, roll: rng.int(6) + 1 }))
        rolls.sort((a, b) => b.roll - a.roll || a.id - b.id)
        for (let i = 0; i < remainder; i++) out[rolls[i].id][r] += 1
      }
    }
    // Pay the shares into each thief's pile, keeping `out` as the record of what
    // this room gave them for the round result.
    for (const id of occupants) {
      const held = this.state.players[id].loot
      for (const r of RESOURCES) held[r] += out[id][r]
    }
  }

  private advanceRound(): void {
    const s = this.state
    s.round += 1
    if (s.round > s.totalRounds) {
      this.finish()
      return
    }
    // The badge sits with one player for two rounds, then passes to the next seat.
    const copIndex = Math.floor((s.round - 1) / ROUNDS_PER_COP)
    s.cop = (s.firstCop + copIndex) % s.playerCount
    s.turnNumber = s.round
    s.selections = Array.from({ length: s.playerCount }, () => null)
    s.openedDoors = []
    s.roundResult = null
    s.step = 'select'
    s.lastEvent = { kind: 'round', round: s.round, cop: s.cop }
    this.log(s.cop, `Round ${s.round} — #${s.cop} takes the badge.`)
  }

  /**
   * Score the game. A leader token goes to whoever holds the most of a resource
   * outright — a tie leaves it unwon. The most tokens wins; ties fall to the most
   * total loot, then to the fewest times caught, and only a dead-level table
   * shares the win.
   */
  private finish(): void {
    const s = this.state
    const leaders: Record<Resource, number | null> = { key: null, stamp: null, card: null }
    for (const r of RESOURCES) {
      const best = Math.max(...s.players.map((p) => p.loot[r]))
      const holders = s.players.filter((p) => p.loot[r] === best)
      // A tie leaves the token unclaimed, the way Samurai leaves a contested caste.
      leaders[r] = holders.length === 1 ? holders[0].id : null
    }

    const standings: CopStanding[] = s.players.map((p) => ({
      player: p.id,
      loot: cloneLoot(p.loot),
      leaderTokens: RESOURCES.filter((r) => leaders[r] === p.id),
      total: lootTotal(p.loot),
      caught: p.caught,
    }))

    // Most tokens, then most loot, then fewest catches; a seat that ties on all
    // three shares the win.
    const rank = (st: CopStanding): [number, number, number] => [
      st.leaderTokens.length,
      st.total,
      -st.caught,
    ]
    let best = standings[0]
    for (const st of standings) {
      const [a, b, c] = rank(st)
      const [x, y, z] = rank(best)
      if (a > x || (a === x && (b > y || (b === y && c > z)))) best = st
    }
    const [ba, bb, bc] = rank(best)
    const winners = standings
      .filter((st) => {
        const [a, b, c] = rank(st)
        return a === ba && b === bb && c === bc
      })
      .map((st) => st.player)

    s.phase = 'over'
    s.result = {
      winners,
      standings,
      leaders,
      reason: winners.length > 1 ? 'cop.result.shared' : 'cop.result.won',
    }
    const names = winners.map((id) => `#${id}`).join(', ')
    this.log(null, `Game over. ${names} ${winners.length > 1 ? 'share the win' : 'wins'}.`)
  }

  // --- internals -------------------------------------------------------------

  /** A confiscation clamped to whole, non-negative resources. */
  private cleanTake(take: Loot | undefined): Loot {
    const clamp = (n: unknown) => Math.max(0, Math.floor(Number(n) || 0))
    return { key: clamp(take?.key), stamp: clamp(take?.stamp), card: clamp(take?.card) }
  }

  private log(player: number | null, text: string): void {
    this.state.log.push({ turn: this.state.round, player, text })
    if (this.state.log.length > 200) this.state.log.splice(0, this.state.log.length - 200)
  }
}
