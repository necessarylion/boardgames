import { money } from './money'
import { chooseFirst, type Opening } from './opening'
import { Rng } from './rng'
import type { LogEntry } from './types'

/**
 * Monopoly — the property trading game, unrelated to every other game here and
 * sharing only the room machinery. Players circle a forty-space track buying
 * companies, charging one another rent, and building until everyone else is
 * broke. Like the other engines this one owns the only real state, validates
 * every action and hands back `{ok:false,error}` for anything it rejects.
 *
 * The board is original: its layout, prices and both card decks are this repo's
 * own, written to the structural rules the game needs (eight colour groups of
 * two or three, four stations, two utilities) rather than copied from a
 * published edition. Rules and mechanics are not copyrightable; a printed
 * board's street names and artwork are, which is why none of them appear here.
 *
 * Coup is the model rather than Snakes & Ladders, because Monopoly's decisions
 * are not all the current player's: an auction waits on every solvent opponent
 * at once and a trade on one named opponent. So `pending` is a stack, and
 * `advance()` drains every step that needs nobody's input and stops on the
 * first that does. The generator is carried by position, like Coup's, because
 * dice and cards are drawn all game long rather than once at the deal.
 */

export const BOARD_SIZE = 40
export const START_CASH = 1500
/** Collected for passing or landing on the IPO. */
export const GO_SALARY = 200
export const JAIL_SPACE = 10
export const GO_TO_JAIL_SPACE = 30
export const JAIL_FINE = 50
/** Throws under review before the fine stops being optional. */
export const MAX_JAIL_TURNS = 3
/** A third double in one turn is a trip to Antitrust rather than a third move. */
export const DOUBLES_TO_JAIL = 3
export const DIE_FACES = 6

/** Offices and HQs the bank holds. Running out is part of the game. */
export const HOUSE_SUPPLY = 32
export const HOTEL_SUPPLY = 12
/** `houses[space]` at this value is an HQ, not five offices. */
export const HOTEL = 5

/** What a mortgage pays, and what lifting one costs, as fractions of the price. */
export const MORTGAGE_RATE = 0.5
export const UNMORTGAGE_RATE = 0.55

export type Group =
  | 'brown'
  | 'cyan'
  | 'pink'
  | 'orange'
  | 'red'
  | 'yellow'
  | 'green'
  | 'blue'

export const GROUPS: readonly Group[] = [
  'brown',
  'cyan',
  'pink',
  'orange',
  'red',
  'yellow',
  'green',
  'blue',
]

export type MonopolySpace =
  | { kind: 'go'; name: string }
  | { kind: 'jail'; name: string }
  | { kind: 'parking'; name: string }
  | { kind: 'goToJail'; name: string }
  | { kind: 'chance'; name: string }
  | { kind: 'chest'; name: string }
  | { kind: 'tax'; name: string; amount: number }
  | {
      kind: 'street'
      name: string
      group: Group
      price: number
      /** Rent bare, then with one to four offices, then with an HQ. */
      rent: readonly [number, number, number, number, number, number]
      houseCost: number
    }
  | { kind: 'station'; name: string; price: number }
  | { kind: 'utility'; name: string; price: number }

/** Station rent by how many of the four the owner holds. */
export const STATION_RENT: readonly number[] = [0, 25, 50, 100, 200]
/** Utility rent multiplies the throw — by this, according to how many are held. */
export const UTILITY_MULTIPLIER: readonly number[] = [0, 4, 10]

/**
 * The board. Forty spaces, laid out with the IPO at 0 and running clockwise:
 * the corners at 0, 10, 20 and 30, a data centre a quarter of the way round
 * from each, and the colour groups climbing in price as they go.
 *
 * The properties are technology companies and each colour band is a sector —
 * social, consumer apps, creative and enterprise software, media and devices,
 * semiconductors, EV and AI, the cloud giants, and the two largest last. The
 * band ids stay colour names because that is what they are on the board: a
 * stripe along the edge of the space, and what `Group` means everywhere else.
 *
 * Every company's rent ladder is deliberately half what the usual scale gives
 * for its price, and every `houseCost` 30% above it — a house rule, so that the
 * money moves slowly and building is a commitment rather than an obvious buy.
 * Prices, both taxes, the mortgage rates and the salary are untouched, so this
 * is a real reduction rather than a rescaling. The data centres and the two
 * utilities keep their full rent, which is what makes a set of them worth
 * holding against a built sector.
 *
 * The names are the companies' own; the marks drawn for them in
 * `src/game/companies.ts` are not. A logo is a registered trademark, so every
 * space carries an original emblem instead — the same line this repo draws
 * around `shared/board.ts` and `src/game/icons.ts`.
 */
export const SPACES: readonly MonopolySpace[] = [
  { kind: 'go', name: 'IPO' },
  // Social
  { kind: 'street', name: 'Snap', group: 'brown', price: 60, rent: [1, 5, 15, 45, 80, 125], houseCost: 65 },
  { kind: 'chest', name: 'Venture Fund' },
  { kind: 'street', name: 'Reddit', group: 'brown', price: 60, rent: [2, 10, 30, 90, 160, 225], houseCost: 65 },
  { kind: 'tax', name: 'Data Tax', amount: 200 },
  { kind: 'station', name: 'Polaris Data Centre', price: 200 },
  // Consumer apps
  { kind: 'street', name: 'Spotify', group: 'cyan', price: 100, rent: [3, 15, 45, 135, 200, 275], houseCost: 65 },
  { kind: 'chance', name: 'Market' },
  { kind: 'street', name: 'Uber', group: 'cyan', price: 100, rent: [3, 15, 45, 135, 200, 275], houseCost: 65 },
  { kind: 'street', name: 'PayPal', group: 'cyan', price: 120, rent: [4, 20, 50, 150, 225, 300], houseCost: 65 },
  { kind: 'jail', name: 'Antitrust' },
  // Creative and enterprise software
  { kind: 'street', name: 'Adobe', group: 'pink', price: 140, rent: [5, 25, 75, 225, 313, 375], houseCost: 130 },
  { kind: 'utility', name: 'Power Grid', price: 150 },
  { kind: 'street', name: 'Oracle', group: 'pink', price: 140, rent: [5, 25, 75, 225, 313, 375], houseCost: 130 },
  { kind: 'street', name: 'Salesforce', group: 'pink', price: 160, rent: [6, 30, 90, 250, 350, 450], houseCost: 130 },
  { kind: 'station', name: 'Meridian Data Centre', price: 200 },
  // Media and devices
  { kind: 'street', name: 'X', group: 'orange', price: 180, rent: [7, 35, 100, 275, 375, 475], houseCost: 130 },
  { kind: 'chest', name: 'Venture Fund' },
  { kind: 'street', name: 'Netflix', group: 'orange', price: 180, rent: [7, 35, 100, 275, 375, 475], houseCost: 130 },
  { kind: 'street', name: 'Samsung', group: 'orange', price: 200, rent: [8, 40, 110, 300, 400, 500], houseCost: 130 },
  { kind: 'parking', name: 'Sandbox' },
  // Semiconductors
  { kind: 'street', name: 'Intel', group: 'red', price: 220, rent: [9, 45, 125, 350, 438, 525], houseCost: 195 },
  { kind: 'chance', name: 'Market' },
  { kind: 'street', name: 'AMD', group: 'red', price: 220, rent: [9, 45, 125, 350, 438, 525], houseCost: 195 },
  { kind: 'street', name: 'TSMC', group: 'red', price: 240, rent: [10, 50, 150, 375, 463, 550], houseCost: 195 },
  { kind: 'station', name: 'Southern Cross Data Centre', price: 200 },
  // EV and AI
  { kind: 'street', name: 'Tesla', group: 'yellow', price: 260, rent: [11, 55, 165, 400, 488, 575], houseCost: 195 },
  { kind: 'street', name: 'Meta', group: 'yellow', price: 260, rent: [11, 55, 165, 400, 488, 575], houseCost: 195 },
  { kind: 'utility', name: 'Fibre Network', price: 150 },
  { kind: 'street', name: 'OpenAI', group: 'yellow', price: 280, rent: [12, 60, 180, 425, 513, 600], houseCost: 195 },
  { kind: 'goToJail', name: 'Go to Antitrust' },
  // The cloud giants
  { kind: 'street', name: 'Amazon', group: 'green', price: 300, rent: [13, 65, 195, 450, 550, 638], houseCost: 260 },
  { kind: 'street', name: 'Microsoft', group: 'green', price: 300, rent: [13, 65, 195, 450, 550, 638], houseCost: 260 },
  { kind: 'chest', name: 'Venture Fund' },
  { kind: 'street', name: 'Google', group: 'green', price: 320, rent: [14, 75, 225, 500, 600, 700], houseCost: 260 },
  { kind: 'station', name: 'Horizon Data Centre', price: 200 },
  { kind: 'chance', name: 'Market' },
  // The two largest
  { kind: 'street', name: 'NVIDIA', group: 'blue', price: 350, rent: [18, 88, 250, 550, 650, 750], houseCost: 260 },
  { kind: 'tax', name: 'Cloud Bill', amount: 100 },
  { kind: 'street', name: 'Apple', group: 'blue', price: 400, rent: [25, 100, 300, 700, 850, 1000], houseCost: 260 },
]

/** Whether a space can be owned at all — the three that carry a price. */
export function isOwnable(space: number): boolean {
  const s = SPACES[space]
  return s?.kind === 'street' || s?.kind === 'station' || s?.kind === 'utility'
}

/** What the bank asks for an unowned space, or 0 where nothing is for sale. */
export function priceOf(space: number): number {
  const s = SPACES[space]
  return s && (s.kind === 'street' || s.kind === 'station' || s.kind === 'utility') ? s.price : 0
}

/** Every space in a colour group, in board order. */
export function groupSpaces(group: Group): number[] {
  const out: number[] = []
  SPACES.forEach((s, i) => {
    if (s.kind === 'street' && s.group === group) out.push(i)
  })
  return out
}

// --- cards -------------------------------------------------------------------

/**
 * What a card does. Every effect resolves the moment the card is drawn — none
 * of them waits on a decision, which is why there is no `card` pending step:
 * a draw either settles itself or leaves a `debt` or `buy` behind it, both of
 * which the stack already knows how to handle.
 */
export type CardEffect =
  /** Advance to a space, collecting the Go salary if the board wraps. */
  | { do: 'move'; to: number }
  /** Step backwards without passing Go. */
  | { do: 'back'; steps: number }
  /** Forward to the next station or utility, whichever is named. */
  | { do: 'nearest'; target: 'station' | 'utility' }
  | { do: 'cash'; amount: number }
  /** Collect from (positive) or pay (negative) every other solvent player. */
  | { do: 'each'; amount: number }
  | { do: 'jail' }
  | { do: 'jailCard' }
  | { do: 'repairs'; perHouse: number; perHotel: number }

export interface MonopolyCard {
  text: string
  effect: CardEffect
}

/** The Market deck — the one that mostly moves you. Original texts. */
export const CHANCE: readonly MonopolyCard[] = [
  { text: 'Your lock-up expires. Advance to the IPO.', effect: { do: 'move', to: 0 } },
  { text: 'A supply deal lands you at Apple. Advance there.', effect: { do: 'move', to: 39 } },
  { text: 'Adobe calls an emergency board meeting. Advance there.', effect: { do: 'move', to: 11 } },
  { text: 'Your workload is migrated to Polaris. Advance there.', effect: { do: 'move', to: 5 } },
  { text: 'A failed migration is rolled back. Go back three spaces.', effect: { do: 'back', steps: 3 } },
  { text: 'Capacity frees up. Go to the next data centre.', effect: { do: 'nearest', target: 'station' } },
  { text: 'A brownout on your rack. Go to the next utility.', effect: { do: 'nearest', target: 'utility' } },
  { text: 'A regulator opens a case against you. Go to Antitrust.', effect: { do: 'jail' } },
  { text: 'Your lawyers file ahead of time. Keep this card to end an antitrust review.', effect: { do: 'jailCard' } },
  { text: 'A patent settles in your favour. Collect $150B.', effect: { do: 'cash', amount: 150 } },
  { text: 'A short squeeze goes your way. Collect $100B.', effect: { do: 'cash', amount: 100 } },
  { text: 'An outage refunds your customers. Pay $50B.', effect: { do: 'cash', amount: -50 } },
  { text: 'A domain renewal you forgot. Pay $25B.', effect: { do: 'cash', amount: -25 } },
  { text: 'You buy the whole sector lunch at the summit. Pay each player $50B.', effect: { do: 'each', amount: -50 } },
  { text: 'Everyone settles their licence arrears. Collect $25B from each player.', effect: { do: 'each', amount: 25 } },
  { text: 'A security audit of your estate. Pay $25B per office and $100B per HQ.', effect: { do: 'repairs', perHouse: 25, perHotel: 100 } },
]

/** The Venture Fund deck — the one that mostly pays. Original texts. */
export const CHEST: readonly MonopolyCard[] = [
  { text: 'Your round closes early. Advance to the IPO.', effect: { do: 'move', to: 0 } },
  { text: 'An acquihire pays out. Collect $200B.', effect: { do: 'cash', amount: 200 } },
  { text: 'A cloud credit rebate. Collect $100B.', effect: { do: 'cash', amount: 100 } },
  { text: 'A contract you had written off renews. Collect $75B.', effect: { do: 'cash', amount: 75 } },
  { text: 'A bug bounty you posted goes unclaimed. Collect $50B.', effect: { do: 'cash', amount: 50 } },
  { text: 'An unplanned weekend of on-call. Pay $100B.', effect: { do: 'cash', amount: -100 } },
  { text: 'Your seat licences renew. Pay $75B.', effect: { do: 'cash', amount: -75 } },
  { text: 'Compliance training for the quarter. Pay $50B.', effect: { do: 'cash', amount: -50 } },
  { text: 'A leaked memo reaches the regulator. Go to Antitrust.', effect: { do: 'jail' } },
  { text: 'A filing clerk loses the complaint. Keep this card to end an antitrust review.', effect: { do: 'jailCard' } },
  { text: 'It is your founding day. Collect $20B from each player.', effect: { do: 'each', amount: 20 } },
  { text: 'You host the offsite. Pay each player $25B.', effect: { do: 'each', amount: -25 } },
  { text: 'An inspection of your estate. Pay $40B per office and $115B per HQ.', effect: { do: 'repairs', perHouse: 40, perHotel: 115 } },
  { text: 'A prize for the best developer experience. Collect $60B.', effect: { do: 'cash', amount: 60 } },
  { text: 'An escrow release. Collect $45B.', effect: { do: 'cash', amount: 45 } },
  { text: 'A rush order of spare drives. Pay $30B.', effect: { do: 'cash', amount: -30 } },
]

// --- state -------------------------------------------------------------------

export interface MonopolyPlayer {
  id: number
  cash: number
  /** Space stood on, 0–39. */
  pos: number
  jailed: boolean
  /** Throws taken under this review. */
  jailTurns: number
  /** Cards held that end a review without paying. */
  jailCards: number
  bankrupt: boolean
}

/** The most recent throw, kept so the table can animate it. */
export interface MonopolyRoll {
  player: number
  dice: [number, number]
  from: number
  to: number
  /** Whether the move ran past Go. */
  passedGo: boolean
  doubles: boolean
}

/** What one side of a trade puts up. Cash is always non-negative on each side. */
export interface TradeSide {
  spaces: number[]
  cash: number
}

export type MonopolyPending =
  /** The lander may buy the space they stopped on, or send it to auction. */
  | { step: 'buy'; player: number; space: number }
  /**
   * A space nobody bought, open to the whole table. `high` and `highBidder`
   * carry the standing bid; `passed` closes the window the way Coup's
   * reaction windows close, when everyone still eligible has answered.
   *
   * Dropping out is final: a seat in `passed` is out of the bidding for this
   * space however high it goes afterwards, and is never taken back off the
   * list. That is what makes the window shrink towards a close rather than
   * reopening on every raise, and it is why the last bidder standing wins.
   */
  | { step: 'auction'; space: number; high: number; highBidder: number | null; passed: number[] }
  /** An offer waiting on the one seat it was aimed at. */
  | { step: 'trade'; from: number; to: number; give: TradeSide; want: TradeSide }
  /**
   * Money owed that the debtor cannot cover. They sell and mortgage until they
   * can, or declare themselves bankrupt. `creditor` is null for the bank.
   */
  | { step: 'debt'; player: number; amount: number; creditor: number | null }
  /** A turn that begins under review: pay, use a card, or throw for doubles. */
  | { step: 'jail'; player: number }

export type MonopolyPhase = 'play' | 'over'

export interface MonopolyResult {
  winner: number
  /** Every seat, richest last out first — the winner heads the list. */
  standings: number[]
  reason: string
}

export interface MonopolyGameState {
  playerCount: number
  players: MonopolyPlayer[]
  /** Who owns each space, by board index; null is the bank or not ownable. */
  owners: (number | null)[]
  /** Offices on each space, by board index; `HOTEL` is an HQ. */
  houses: number[]
  /** Whether each space is mortgaged, by board index. */
  mortgaged: boolean[]
  current: number
  /** The current seat has thrown and may now manage the turn and end it. */
  rolled: boolean
  /**
   * Throws made this game. The table keys its dice animation on this, and the
   * shot clock re-arms on it — a second throw after doubles shares both the
   * turn number and the seat with the first, so nothing else would change.
   */
  rollCount: number
  /**
   * Cards turned over this game, for the same reason `rollCount` exists: the
   * table replays a draw, and two identical draws in a row are indistinguishable
   * from one. One throw can turn over two cards — a card sending you back three
   * spaces can land you on the other deck — so this is not derivable from the
   * throw count either.
   */
  cardCount: number
  /** Doubles thrown in a row this turn; a third is a trip to Antitrust. */
  doubles: number
  pending: MonopolyPending[]
  lastRoll: MonopolyRoll | null
  /** The card just turned over, kept so the table can show it. */
  lastCard: { deck: 'chance' | 'chest'; text: string; player: number } | null
  /** Undrawn cards, by index into the deck above. Reshuffled when exhausted. */
  chance: number[]
  chest: number[]
  opening: Opening | null
  phase: MonopolyPhase
  paused: boolean
  turnNumber: number
  log: LogEntry[]
  result: MonopolyResult | null
  /** Where the generator has got to; dice and cards are drawn all game long. */
  rngPosition: number
}

export type Outcome = { ok: true } | { ok: false; error: string }

const ok: Outcome = { ok: true }
const fail = (error: string): Outcome => ({ ok: false, error })

// --- derived reads -----------------------------------------------------------

/**
 * The parts of a state that ownership and rent depend on. All three are public
 * — they travel to every client in full — so the table can work out what a
 * space charges by calling the very function the server charges with, rather
 * than keeping a second copy of the rules that can drift from this one.
 */
export type RentView = Pick<MonopolyGameState, 'owners' | 'houses' | 'mortgaged'>

/** Spaces owned by a seat, in board order. */
export function holdings(state: RentView, playerId: number): number[] {
  const out: number[] = []
  state.owners.forEach((owner, i) => {
    if (owner === playerId) out.push(i)
  })
  return out
}

/** Whether a seat holds every space in a colour group. */
export function ownsGroup(state: RentView, playerId: number, group: Group): boolean {
  return groupSpaces(group).every((i) => state.owners[i] === playerId)
}

/** How many of the four data centres, or two utilities, a seat holds. */
export function countKind(state: RentView, playerId: number, kind: 'station' | 'utility'): number {
  return state.owners.filter((owner, i) => owner === playerId && SPACES[i].kind === kind).length
}

/**
 * Rent owed for stopping on `space`, given the throw that got there. A
 * mortgaged space charges nothing, and a bare street in a complete group
 * charges double — the one place the group matters before any building.
 */
export function rentFor(state: RentView, space: number, diceTotal: number): number {
  const s = SPACES[space]
  const owner = state.owners[space]
  if (owner === null || state.mortgaged[space]) return 0
  if (s.kind === 'street') {
    const houses = state.houses[space]
    if (houses > 0) return s.rent[houses]
    return ownsGroup(state, owner, s.group) ? s.rent[0] * 2 : s.rent[0]
  }
  if (s.kind === 'station') return STATION_RENT[countKind(state, owner, 'station')]
  if (s.kind === 'utility') return diceTotal * UTILITY_MULTIPLIER[countKind(state, owner, 'utility')]
  return 0
}

/** Offices and HQs standing on the board — what the bank has lent out. */
export function builtCounts(state: MonopolyGameState): { houses: number; hotels: number } {
  let houses = 0
  let hotels = 0
  for (const n of state.houses) {
    if (n === HOTEL) hotels++
    else houses += n
  }
  return { houses, hotels }
}

/**
 * Spaces a seat may put a house on right now: their own street, in a complete
 * unmortgaged group, level with the least-built space in that group, with the
 * bank holding the piece and the seat holding the money.
 */
export function buildable(state: MonopolyGameState, playerId: number): number[] {
  const player = state.players[playerId]
  if (!player || player.bankrupt) return []
  const { houses, hotels } = builtCounts(state)
  return holdings(state, playerId).filter((i) => {
    const s = SPACES[i]
    if (s.kind !== 'street') return false
    if (!ownsGroup(state, playerId, s.group)) return false
    const group = groupSpaces(s.group)
    if (group.some((g) => state.mortgaged[g])) return false
    if (state.houses[i] >= HOTEL) return false
    // Building is even: nothing gets its next storey until the group is level.
    if (state.houses[i] > Math.min(...group.map((g) => state.houses[g]))) return false
    if (state.houses[i] === HOTEL - 1 ? hotels >= HOTEL_SUPPLY : houses >= HOUSE_SUPPLY) return false
    return player.cash >= s.houseCost
  })
}

/** Spaces a seat may take an office back off — the mirror of `buildable`. */
export function sellable(state: MonopolyGameState, playerId: number): number[] {
  return holdings(state, playerId).filter((i) => {
    const s = SPACES[i]
    if (s.kind !== 'street' || state.houses[i] === 0) return false
    const group = groupSpaces(s.group)
    // Selling is even too, from the top down.
    return state.houses[i] >= Math.max(...group.map((g) => state.houses[g]))
  })
}

/** Spaces a seat may mortgage: their own, unmortgaged, with nothing built in the group. */
export function mortgageable(state: MonopolyGameState, playerId: number): number[] {
  return holdings(state, playerId).filter((i) => {
    if (state.mortgaged[i]) return false
    const s = SPACES[i]
    if (s.kind === 'street' && groupSpaces(s.group).some((g) => state.houses[g] > 0)) return false
    return true
  })
}

/** Spaces a seat may lift a mortgage on, if they can afford the interest. */
export function unmortgageable(state: MonopolyGameState, playerId: number): number[] {
  const cash = state.players[playerId]?.cash ?? 0
  return holdings(state, playerId).filter(
    (i) => state.mortgaged[i] && cash >= Math.round(priceOf(i) * UNMORTGAGE_RATE),
  )
}

/** What mortgaging a space pays, and what lifting it costs. */
export const mortgageValue = (space: number): number => Math.round(priceOf(space) * MORTGAGE_RATE)
export const unmortgageCost = (space: number): number => Math.round(priceOf(space) * UNMORTGAGE_RATE)

/**
 * Everything a seat could raise by selling every office and mortgaging every
 * space. A debtor who cannot reach what they owe even so is finished, which is
 * what makes bankruptcy a fact rather than a choice.
 */
export function liquidValue(state: MonopolyGameState, playerId: number): number {
  let total = state.players[playerId]?.cash ?? 0
  for (const i of holdings(state, playerId)) {
    const s = SPACES[i]
    if (s.kind === 'street' && state.houses[i] > 0) {
      // Rounded per office, exactly as `sell()` pays: `houseCost` is odd at two
      // tiers, so rounding the total instead would understate what the debtor
      // can actually raise and call a payable debt bankruptcy.
      total += Math.round(s.houseCost / 2) * state.houses[i]
    }
    if (!state.mortgaged[i]) total += mortgageValue(i)
  }
  return total
}

/** Seats still in the game, other than `playerId` — the ones a trade may name. */
export function tradePartners(state: MonopolyGameState, playerId: number): number[] {
  return state.players.filter((p) => !p.bankrupt && p.id !== playerId).map((p) => p.id)
}

/**
 * Whether a seat is still owed an answer by the standing auction.
 *
 * Three ways to be out of one: bankruptcy, having dropped out — which is final
 * — and holding the standing bid, since that seat has already answered and has
 * nothing it could usefully say until somebody outbids it. Everything else
 * reads the window through this one function: what the client is offered, who
 * the shot clock answers for, and when the hammer falls.
 */
export function inAuction(state: MonopolyGameState, playerId: number): boolean {
  const p = state.pending[0]
  if (p?.step !== 'auction') return false
  const player = state.players[playerId]
  if (!player || player.bankrupt) return false
  return !p.passed.includes(playerId) && p.highBidder !== playerId
}

// --- engine ------------------------------------------------------------------

export class MonopolyGame {
  state: MonopolyGameState

  constructor(playerCount: number, seed: number, diceStart = true) {
    this.state = MonopolyGame.deal(playerCount, seed, diceStart)
  }

  /** Rebuild an engine around state read back from the database. */
  static fromState(state: MonopolyGameState): MonopolyGame {
    const game = Object.create(MonopolyGame.prototype) as MonopolyGame
    game.state = state
    return game
  }

  private static deal(playerCount: number, seed: number, diceStart: boolean): MonopolyGameState {
    const rng = new Rng(seed)
    const { first, opening } = chooseFirst(rng, playerCount, diceStart)
    // Both decks are shuffled after the opening seat is drawn, so a seed still
    // opens with the same seat however the cards fall.
    const chance = rng.shuffle(CHANCE.map((_, i) => i))
    const chest = rng.shuffle(CHEST.map((_, i) => i))
    const state: MonopolyGameState = {
      playerCount,
      players: Array.from({ length: playerCount }, (_, id) => ({
        id,
        cash: START_CASH,
        pos: 0,
        jailed: false,
        jailTurns: 0,
        jailCards: 0,
        bankrupt: false,
      })),
      owners: Array.from({ length: BOARD_SIZE }, () => null),
      houses: Array.from({ length: BOARD_SIZE }, () => 0),
      mortgaged: Array.from({ length: BOARD_SIZE }, () => false),
      current: first,
      rolled: false,
      rollCount: 0,
      cardCount: 0,
      doubles: 0,
      pending: [],
      lastRoll: null,
      lastCard: null,
      chance,
      chest,
      opening,
      phase: 'play',
      paused: false,
      turnNumber: 1,
      log: [{ turn: 0, player: null, text: `${playerCount} players set out with ${money(START_CASH)} each.` }],
      result: null,
      rngPosition: rng.position,
    }
    return state
  }

  // --- actions ---------------------------------------------------------------

  /** Throw the dice and move. Only the seat whose turn it is, and only once. */
  roll(playerId: number): Outcome {
    const s = this.state
    const guard = this.guard(playerId)
    if (guard) return guard
    if (playerId !== s.current) return fail('It is not your turn.')
    if (s.pending.length) return fail('There is something to settle first.')
    if (s.rolled) return fail('You have already thrown this turn.')

    const [a, b] = this.dice()
    const player = s.players[playerId]
    if (a === b) {
      s.doubles++
      if (s.doubles >= DOUBLES_TO_JAIL) {
        const from = player.pos
        this.log(playerId, `throws a third double (${a} and ${b}) and is placed under antitrust review.`)
        this.sendToJail(player)
        s.lastRoll = { player: playerId, dice: [a, b], from, to: JAIL_SPACE, passedGo: false, doubles: true }
        this.advance()
        return ok
      }
    }
    // A double earns another throw, so the turn is not spent until one is not.
    s.rolled = a !== b
    this.move(player, a + b, [a, b])
    this.advance()
    return ok
  }

  /** Buy the space just landed on, at the bank's price. */
  buy(playerId: number): Outcome {
    const s = this.state
    const guard = this.guard(playerId)
    if (guard) return guard
    const p = s.pending[0]
    if (p?.step !== 'buy' || p.player !== playerId) return fail('There is nothing to buy.')
    const price = priceOf(p.space)
    const player = s.players[playerId]
    if (player.cash < price) return fail('You cannot afford it.')
    player.cash -= price
    s.owners[p.space] = playerId
    s.pending.shift()
    this.log(playerId, `buys ${SPACES[p.space].name} for ${money(price)}.`)
    this.advance()
    return ok
  }

  /**
   * Decline: a space on the block goes to auction, and a bid in an auction is
   * given up. One message covers both because the table only ever has one of
   * them open, and the client would otherwise have to work out which.
   */
  pass(playerId: number): Outcome {
    const s = this.state
    const guard = this.guard(playerId)
    if (guard) return guard
    const p = s.pending[0]
    if (p?.step === 'buy' && p.player === playerId) {
      s.pending.shift()
      this.openAuction(p.space)
      this.advance()
      return ok
    }
    if (p?.step === 'auction') {
      // Answered ahead of the general refusal, which would otherwise tell the
      // player who is winning the auction that they were never in it.
      if (p.highBidder === playerId) return fail('Your bid stands; you cannot drop out of it.')
      if (!inAuction(s, playerId)) return fail('You are not in this auction.')
      p.passed.push(playerId)
      this.log(playerId, 'drops out of the auction.')
      this.advance()
      return ok
    }
    if (p?.step === 'trade' && p.to === playerId) return this.declineTrade(playerId)
    return fail('There is nothing to decline.')
  }

  /** Raise the standing bid on the space under the hammer. */
  bid(playerId: number, amount: number): Outcome {
    const s = this.state
    const guard = this.guard(playerId)
    if (guard) return guard
    const p = s.pending[0]
    if (p?.step !== 'auction') return fail('Nothing is under the hammer.')
    if (p.highBidder === playerId) return fail('Your bid is already the standing one.')
    if (!inAuction(s, playerId)) return fail('You are not in this auction.')
    if (!Number.isInteger(amount) || amount <= p.high) return fail('That does not beat the standing bid.')
    if (s.players[playerId].cash < amount) return fail('You cannot cover that bid.')
    p.high = amount
    p.highBidder = playerId
    // `passed` is deliberately left alone: a raise does not buy anyone who has
    // already walked away a second look at the space.
    this.log(playerId, `bids ${money(amount)} for ${SPACES[p.space].name}.`)
    this.advance()
    return ok
  }

  /** Put an offer to one other seat. Only the seat whose turn it is may open one. */
  offerTrade(playerId: number, to: number, give: TradeSide, want: TradeSide): Outcome {
    const s = this.state
    const guard = this.guard(playerId)
    if (guard) return guard
    if (playerId !== s.current) return fail('You may only trade on your own turn.')
    if (s.pending.length) return fail('There is something to settle first.')
    if (!tradePartners(s, playerId).includes(to)) return fail('That seat is not in the game.')
    const problem = this.tradeProblem(playerId, to, give, want)
    if (problem) return fail(problem)
    s.pending.unshift({ step: 'trade', from: playerId, to, give, want })
    this.log(playerId, `offers ${s.players[to] ? `player ${to + 1}` : 'a player'} a trade.`)
    return ok
  }

  /** Take the offer on the table. Only the seat it was aimed at may. */
  acceptTrade(playerId: number): Outcome {
    const s = this.state
    const guard = this.guard(playerId)
    if (guard) return guard
    const p = s.pending[0]
    if (p?.step !== 'trade' || p.to !== playerId) return fail('No offer is waiting on you.')
    // Re-checked on acceptance: the offerer may have mortgaged or built since.
    const problem = this.tradeProblem(p.from, p.to, p.give, p.want)
    if (problem) {
      s.pending.shift()
      return fail(problem)
    }
    const from = s.players[p.from]
    const to = s.players[p.to]
    for (const i of p.give.spaces) s.owners[i] = p.to
    for (const i of p.want.spaces) s.owners[i] = p.from
    from.cash += p.want.cash - p.give.cash
    to.cash += p.give.cash - p.want.cash
    s.pending.shift()
    this.log(playerId, 'accepts the trade.')
    this.advance()
    return ok
  }

  /** Turn the offer down. */
  declineTrade(playerId: number): Outcome {
    const s = this.state
    const guard = this.guard(playerId)
    if (guard) return guard
    const p = s.pending[0]
    if (p?.step !== 'trade' || p.to !== playerId) return fail('No offer is waiting on you.')
    s.pending.shift()
    this.log(playerId, 'turns the trade down.')
    this.advance()
    return ok
  }

  /** Put an office — or the fifth, an HQ — on one of your companies. */
  build(playerId: number, space: number): Outcome {
    const s = this.state
    const guard = this.guard(playerId)
    if (guard) return guard
    if (!buildable(s, playerId).includes(space)) return fail('You cannot build there.')
    const street = SPACES[space]
    if (street.kind !== 'street') return fail('You cannot build there.')
    s.players[playerId].cash -= street.houseCost
    s.houses[space]++
    const what = s.houses[space] === HOTEL ? 'an HQ' : `office ${s.houses[space]}`
    this.log(playerId, `builds ${what} on ${street.name} for ${money(street.houseCost)}.`)
    return ok
  }

  /** Sell an office back to the bank, at half what it cost. */
  sell(playerId: number, space: number): Outcome {
    const s = this.state
    const guard = this.guard(playerId, true)
    if (guard) return guard
    if (!sellable(s, playerId).includes(space)) return fail('You cannot sell that.')
    const street = SPACES[space]
    if (street.kind !== 'street') return fail('You cannot sell that.')
    s.houses[space]--
    s.players[playerId].cash += Math.round(street.houseCost / 2)
    this.log(playerId, `sells an office at ${street.name}.`)
    this.advance()
    return ok
  }

  /** Mortgage a space, taking half its price from the bank. */
  mortgage(playerId: number, space: number): Outcome {
    const s = this.state
    const guard = this.guard(playerId, true)
    if (guard) return guard
    if (!mortgageable(s, playerId).includes(space)) return fail('You cannot mortgage that.')
    s.mortgaged[space] = true
    s.players[playerId].cash += mortgageValue(space)
    this.log(playerId, `mortgages ${SPACES[space].name} for ${money(mortgageValue(space))}.`)
    this.advance()
    return ok
  }

  /** Lift a mortgage, paying back the loan with interest. */
  unmortgage(playerId: number, space: number): Outcome {
    const s = this.state
    const guard = this.guard(playerId)
    if (guard) return guard
    if (!unmortgageable(s, playerId).includes(space)) return fail('You cannot lift that mortgage.')
    s.mortgaged[space] = false
    s.players[playerId].cash -= unmortgageCost(space)
    this.log(playerId, `lifts the mortgage on ${SPACES[space].name}.`)
    return ok
  }

  /** End the review: pay the fine, file a card, or throw for doubles. */
  jailChoice(playerId: number, choice: 'pay' | 'card' | 'roll'): Outcome {
    const s = this.state
    const guard = this.guard(playerId)
    if (guard) return guard
    const p = s.pending[0]
    if (p?.step !== 'jail' || p.player !== playerId) return fail('You are not under antitrust review.')
    const player = s.players[playerId]

    if (choice === 'card') {
      if (player.jailCards < 1) return fail('You have no card to end the review.')
      player.jailCards--
      s.pending.shift()
      this.release(player, 'files ahead and ends the review')
      return ok
    }
    if (choice === 'pay') {
      if (player.cash < JAIL_FINE) return fail('You cannot afford the fine.')
      player.cash -= JAIL_FINE
      s.pending.shift()
      this.release(player, `pays the ${money(JAIL_FINE)} fine and settles the review`)
      return ok
    }

    const [a, b] = this.dice()
    if (a === b) {
      s.pending.shift()
      this.release(player, `throws ${a} and ${b} and the case is dropped`)
      // Doubles bought the way out; they do not also buy another throw.
      s.rolled = true
      this.move(player, a + b, [a, b])
      this.advance()
      return ok
    }
    player.jailTurns++
    this.log(playerId, `throws ${a} and ${b} — no doubles.`)
    if (player.jailTurns >= MAX_JAIL_TURNS) {
      s.pending.shift()
      this.release(player, 'has waited long enough and owes the fine')
      s.rolled = true
      this.charge(player, JAIL_FINE, null)
      this.move(player, a + b, [a, b])
      this.advance()
      return ok
    }
    s.pending.shift()
    s.rolled = true
    s.lastRoll = { player: playerId, dice: [a, b], from: player.pos, to: player.pos, passedGo: false, doubles: false }
    this.advance()
    return ok
  }

  /**
   * Give up. Everything goes to the creditor — or, where the bank is owed, the
   * spaces go back on the market and the buildings back in the box.
   */
  declareBankrupt(playerId: number): Outcome {
    const s = this.state
    const guard = this.guard(playerId, true)
    if (guard) return guard
    const p = s.pending[0]
    if (p?.step !== 'debt' || p.player !== playerId) return fail('You owe nothing.')
    this.bankrupt(s.players[playerId], p.creditor)
    s.pending.shift()
    this.advance()
    return ok
  }

  /** Hand the turn on. Only once the dice have been thrown and nothing is pending. */
  endTurn(playerId: number): Outcome {
    const s = this.state
    const guard = this.guard(playerId)
    if (guard) return guard
    if (playerId !== s.current) return fail('It is not your turn.')
    if (s.pending.length) return fail('There is something to settle first.')
    if (!s.rolled) return fail('You have not thrown yet.')
    this.nextTurn()
    this.advance()
    return ok
  }

  /**
   * The shot clock ran out. Settle whatever the table is waiting on in the way
   * that costs the absent player nothing they have not already lost: a bid is
   * dropped, an offer declined, a purchase declined, a review turn thrown for,
   * and a turn simply ended.
   */
  timeOut(): Outcome {
    const s = this.state
    const p = s.pending[0]
    if (p?.step === 'buy') return this.pass(p.player)
    if (p?.step === 'auction') {
      const waiting = s.players.find((pl) => inAuction(s, pl.id))
      return waiting ? this.pass(waiting.id) : ok
    }
    if (p?.step === 'trade') return this.declineTrade(p.to)
    if (p?.step === 'jail') return this.jailChoice(p.player, 'roll')
    if (p?.step === 'debt') {
      // Raise what can be raised without a decision; failing that, it is over.
      const raise = this.raiseFunds(p.player, p.amount)
      return raise ? ok : this.declareBankrupt(p.player)
    }
    if (!s.rolled) return this.roll(s.current)
    return this.endTurn(s.current)
  }

  /** Suspend the table; any seated player may. Mirrors the other games' pause. */
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

  // --- internals -------------------------------------------------------------

  /**
   * The checks every action shares. `whileInDebt` marks the handful that are
   * the *point* of owing money — selling, mortgaging, giving up — and so must
   * still work when a debt is blocking everything else.
   */
  private guard(playerId: number, whileInDebt = false): Outcome | null {
    const s = this.state
    if (s.phase !== 'play') return fail('The game is over.')
    if (s.paused) return fail('The table is paused.')
    const player = s.players[playerId]
    if (!player) return fail('You have no seat in this game.')
    if (player.bankrupt) return fail('You are out of the game.')
    if (!whileInDebt && s.pending[0]?.step === 'debt' && s.pending[0].player === playerId) {
      return fail('Settle what you owe first.')
    }
    return null
  }

  /** Two dice from the shared generator, which is carried by position. */
  private dice(): [number, number] {
    const s = this.state
    const rng = new Rng(s.rngPosition)
    const a = rng.int(DIE_FACES) + 1
    const b = rng.int(DIE_FACES) + 1
    s.rngPosition = rng.position
    s.rollCount++
    return [a, b]
  }

  /** Walk a player forward, collecting the IPO salary on the way past. */
  private move(player: MonopolyPlayer, steps: number, dice: [number, number]): void {
    const s = this.state
    const from = player.pos
    const to = (from + steps) % BOARD_SIZE
    const passedGo = from + steps >= BOARD_SIZE
    player.pos = to
    if (passedGo) {
      player.cash += GO_SALARY
      this.log(player.id, `passes the IPO and collects ${money(GO_SALARY)}.`)
    }
    s.lastRoll = { player: player.id, dice, from, to, passedGo, doubles: dice[0] === dice[1] }
    this.log(player.id, `throws ${dice[0]} and ${dice[1]} and moves to ${SPACES[to].name}.`)
    this.land(player, to, dice[0] + dice[1])
  }

  /** Move without dice — a card sending you somewhere. */
  private teleport(player: MonopolyPlayer, to: number, collectGo: boolean): void {
    const from = player.pos
    player.pos = to
    if (collectGo && to <= from) {
      player.cash += GO_SALARY
      this.log(player.id, `passes the IPO and collects ${money(GO_SALARY)}.`)
    }
    const roll = this.state.lastRoll
    this.land(player, to, roll ? roll.dice[0] + roll.dice[1] : 0)
  }

  /** Whatever the space asks of whoever stopped on it. */
  private land(player: MonopolyPlayer, space: number, diceTotal: number): void {
    const s = this.state
    const def = SPACES[space]
    if (def.kind === 'tax') {
      this.log(player.id, `pays ${money(def.amount)} in ${def.name.toLowerCase()}.`)
      this.charge(player, def.amount, null)
      return
    }
    if (def.kind === 'goToJail') {
      this.log(player.id, 'is referred to the regulator.')
      this.sendToJail(player)
      return
    }
    if (def.kind === 'chance' || def.kind === 'chest') {
      this.drawCard(player, def.kind)
      return
    }
    if (!isOwnable(space)) return

    const owner = s.owners[space]
    if (owner === null) {
      // Nothing to decide if the price is out of reach — straight to auction.
      if (player.cash < priceOf(space)) this.openAuction(space)
      else s.pending.push({ step: 'buy', player: player.id, space })
      return
    }
    if (owner === player.id) return
    if (s.mortgaged[space]) {
      this.log(player.id, `stops on ${def.name}, which is mortgaged — no rent.`)
      return
    }
    const rent = rentFor(s, space, diceTotal)
    this.log(player.id, `owes ${money(rent)} in rent on ${def.name}.`)
    this.charge(player, rent, owner)
  }

  /**
   * Take money off a player, or leave a debt on the stack when they cannot
   * cover it. Everything that costs money goes through here, so there is one
   * place bankruptcy can begin.
   */
  private charge(player: MonopolyPlayer, amount: number, creditor: number | null): void {
    const s = this.state
    if (amount <= 0) return
    if (player.cash >= amount) {
      player.cash -= amount
      if (creditor !== null) s.players[creditor].cash += amount
      return
    }
    s.pending.push({ step: 'debt', player: player.id, amount, creditor })
  }

  private sendToJail(player: MonopolyPlayer): void {
    player.pos = JAIL_SPACE
    player.jailed = true
    player.jailTurns = 0
    // A referral ends the turn, doubles or not.
    this.state.doubles = 0
    this.state.rolled = true
  }

  private release(player: MonopolyPlayer, text: string): void {
    player.jailed = false
    player.jailTurns = 0
    this.log(player.id, `${text}.`)
  }

  /** Turn over the top card of a deck, reshuffling it when it runs out. */
  private drawCard(player: MonopolyPlayer, deck: 'chance' | 'chest'): void {
    const s = this.state
    const cards = deck === 'chance' ? CHANCE : CHEST
    let pile = deck === 'chance' ? s.chance : s.chest
    if (pile.length === 0) {
      const rng = new Rng(s.rngPosition)
      pile = rng.shuffle(cards.map((_, i) => i))
      s.rngPosition = rng.position
      if (deck === 'chance') s.chance = pile
      else s.chest = pile
    }
    const index = pile.shift()!
    const card = cards[index]
    s.cardCount++
    s.lastCard = { deck, text: card.text, player: player.id }
    this.log(player.id, `draws: ${card.text}`)
    this.applyCard(player, card.effect)
  }

  private applyCard(player: MonopolyPlayer, effect: CardEffect): void {
    const s = this.state
    switch (effect.do) {
      case 'move':
        this.teleport(player, effect.to, true)
        return
      case 'back':
        // Backwards never passes the IPO, even when the board wraps underneath.
        this.teleport(player, (player.pos - effect.steps + BOARD_SIZE) % BOARD_SIZE, false)
        return
      case 'nearest': {
        let to = player.pos
        do {
          to = (to + 1) % BOARD_SIZE
        } while (SPACES[to].kind !== effect.target)
        this.teleport(player, to, true)
        return
      }
      case 'cash':
        if (effect.amount >= 0) player.cash += effect.amount
        else this.charge(player, -effect.amount, null)
        return
      case 'each': {
        const others = s.players.filter((p) => !p.bankrupt && p.id !== player.id)
        for (const other of others) {
          if (effect.amount >= 0) this.charge(other, effect.amount, player.id)
          else this.charge(player, -effect.amount, other.id)
        }
        return
      }
      case 'jail':
        this.sendToJail(player)
        return
      case 'jailCard':
        player.jailCards++
        return
      case 'repairs': {
        let due = 0
        for (const i of holdings(s, player.id)) {
          if (s.houses[i] === HOTEL) due += effect.perHotel
          else due += s.houses[i] * effect.perHouse
        }
        if (due > 0) this.log(player.id, `owes ${money(due)} for repairs.`)
        this.charge(player, due, null)
        return
      }
    }
  }

  private openAuction(space: number): void {
    this.state.pending.push({ step: 'auction', space, high: 0, highBidder: null, passed: [] })
    this.log(null, `${SPACES[space].name} goes under the hammer.`)
  }

  /** Hand the auctioned space to whoever was left holding the highest bid. */
  private closeAuction(p: Extract<MonopolyPending, { step: 'auction' }>): void {
    const s = this.state
    if (p.highBidder === null) {
      this.log(null, `Nobody bids for ${SPACES[p.space].name}; it stays with the bank.`)
      return
    }
    s.players[p.highBidder].cash -= p.high
    s.owners[p.space] = p.highBidder
    this.log(p.highBidder, `wins ${SPACES[p.space].name} at auction for ${money(p.high)}.`)
  }

  /** Why a trade cannot go through, or null when it can. */
  private tradeProblem(from: number, to: number, give: TradeSide, want: TradeSide): string | null {
    const s = this.state
    if (give.cash < 0 || want.cash < 0) return 'A trade cannot ask for a negative sum.'
    if (!give.spaces.length && !want.spaces.length && !give.cash && !want.cash) {
      return 'An offer has to put something up.'
    }
    for (const [seat, side] of [
      [from, give],
      [to, want],
    ] as const) {
      if (s.players[seat].cash < side.cash) return 'That side cannot cover the cash in the offer.'
      for (const i of side.spaces) {
        if (s.owners[i] !== seat) return 'A space in the offer is not theirs to trade.'
        // Buildings are not tradeable; they have to be sold back first.
        const def = SPACES[i]
        if (def.kind === 'street' && groupSpaces(def.group).some((g) => s.houses[g] > 0)) {
          return 'Sell the buildings in that group before trading it.'
        }
      }
    }
    return null
  }

  /**
   * Settle a debt out of what the player already holds, without asking them
   * anything. Only ever used by the shot clock — a player at the table decides
   * for themselves what to sell.
   */
  private raiseFunds(playerId: number, amount: number): boolean {
    const s = this.state
    if (liquidValue(s, playerId) < amount) return false
    while (s.players[playerId].cash < amount) {
      const house = sellable(s, playerId)[0]
      if (house !== undefined) {
        this.sell(playerId, house)
        continue
      }
      const space = mortgageable(s, playerId)[0]
      if (space === undefined) return false
      this.mortgage(playerId, space)
    }
    return true
  }

  /** Everything a broke player has, to their creditor or back to the bank. */
  private bankrupt(player: MonopolyPlayer, creditor: number | null): void {
    const s = this.state
    const spaces = holdings(s, player.id)
    if (creditor !== null) {
      const winner = s.players[creditor]
      winner.cash += player.cash
      winner.jailCards += player.jailCards
      for (const i of spaces) {
        s.owners[i] = creditor
        // Buildings are sold back to the bank; the creditor takes bare ground.
        const def = SPACES[i]
        if (def.kind === 'street' && s.houses[i] > 0) {
          winner.cash += Math.round(def.houseCost / 2) * s.houses[i]
          s.houses[i] = 0
        }
      }
      this.log(player.id, `is bankrupt, and everything passes to player ${creditor + 1}.`)
    } else {
      for (const i of spaces) {
        s.owners[i] = null
        s.houses[i] = 0
        s.mortgaged[i] = false
      }
      this.log(player.id, 'is bankrupt, and everything goes back to the bank.')
    }
    player.cash = 0
    player.jailCards = 0
    player.bankrupt = true
    player.jailed = false
  }

  /** Pass play to the next seat still in the game. */
  private nextTurn(): void {
    const s = this.state
    s.rolled = false
    s.doubles = 0
    s.lastCard = null
    let id = s.current
    for (let i = 0; i < s.playerCount; i++) {
      id = (id + 1) % s.playerCount
      if (!s.players[id].bankrupt) break
    }
    s.current = id
    s.turnNumber++
  }

  /**
   * Drain every pending step that needs nobody's input, and stop on the first
   * that does — the same shape as Coup's, and the reason the stack works at
   * all. Also where the game checks whether it is over.
   */
  private advance(): void {
    const s = this.state
    for (;;) {
      if (this.checkEnd()) return
      const p = s.pending[0]

      if (!p) {
        // A seat that went bankrupt on its own turn has to be moved off it here.
        // It cannot end the turn itself — `guard()` rejects a bankrupt player —
        // and nobody else can either, because it is not their turn, so leaving
        // `current` pointing at it deadlocks the whole table. `checkEnd()` at
        // the top of this loop is what stops the search running away when there
        // is nobody solvent left to hand the turn to.
        if (s.players[s.current].bankrupt) {
          this.nextTurn()
          continue
        }
        // A seat that has thrown and settled everything still ends its own turn,
        // so it can build and trade first; a jailed one is asked at the top.
        if (s.players[s.current].jailed && !s.rolled) {
          s.pending.push({ step: 'jail', player: s.current })
          continue
        }
        return
      }

      if (p.step === 'auction') {
        // Closed when nobody is left to answer: everyone else has dropped out,
        // and the standing bidder is never waiting on themselves. With drop-outs
        // final the window only shrinks, so an auction always reaches a hammer.
        if (!s.players.some((pl) => inAuction(s, pl.id))) {
          s.pending.shift()
          this.closeAuction(p)
          continue
        }
        return
      }

      if (p.step === 'debt') {
        const player = s.players[p.player]
        if (player.cash >= p.amount) {
          player.cash -= p.amount
          if (p.creditor !== null) s.players[p.creditor].cash += p.amount
          s.pending.shift()
          continue
        }
        // Nothing left to sell that would cover it: the debt settles itself.
        if (liquidValue(s, p.player) < p.amount) {
          this.bankrupt(player, p.creditor)
          s.pending.shift()
          continue
        }
        return
      }

      if (p.step === 'jail' && !s.players[p.player].jailed) {
        s.pending.shift()
        continue
      }

      return
    }
  }

  /** One solvent seat left is the end of it. */
  private checkEnd(): boolean {
    const s = this.state
    if (s.phase === 'over') return true
    const alive = s.players.filter((p) => !p.bankrupt)
    if (alive.length > 1) return false
    const winner = alive[0]?.id ?? 0
    // Richest first among the survivors, then the bankrupts in reverse order of
    // going out — the last to fall placed highest.
    const out = s.players.filter((p) => p.bankrupt).map((p) => p.id)
    s.phase = 'over'
    s.pending = []
    s.result = {
      winner,
      standings: [winner, ...out.reverse()],
      reason: 'last player left solvent',
    }
    this.log(null, 'The game is over.')
    return true
  }

  private log(player: number | null, text: string): void {
    this.state.log.push({ turn: this.state.turnNumber, player, text })
  }
}
