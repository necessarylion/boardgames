import type { Rng } from './rng'

/**
 * Who goes first, and how the table found out.
 *
 * Opening the room is not an advantage in any of the three games, so none of
 * them hands the first turn to seat 0 just for having been dealt first. The seat
 * is drawn — either quietly, or by a roll-off the whole table gets to watch.
 *
 * This lives apart from any one engine because all three want it and none of
 * them owns it: the roll decides a seat number and knows nothing about tiles,
 * fruit or influence.
 */

/** One seat's throw in the opening roll-off. */
export interface Roll {
  player: number
  roll: number
}

/**
 * How the opening seat was decided, kept so the table can watch it rather than
 * be told the answer. Each entry is one round of throws; a round with a tie at
 * the top is followed by another between just those seats, so the winner of the
 * last round is always alone at the top of it.
 */
export interface Opening {
  rounds: Roll[][]
  winner: number
}

/** Faces on the die rolled for the opening seat. */
export const DIE_FACES = 6

/** Enough rounds to settle any realistic tie; the bound is only a stop. */
const MAX_ROLL_OFFS = 12

export function rollForFirst(rng: Rng, playerCount: number): Opening {
  const rounds: Roll[][] = []
  let contenders = Array.from({ length: playerCount }, (_, id) => id)
  while (contenders.length > 1 && rounds.length < MAX_ROLL_OFFS) {
    const round = contenders.map((player) => ({ player, roll: rng.int(DIE_FACES) + 1 }))
    rounds.push(round)
    const best = Math.max(...round.map((r) => r.roll))
    contenders = round.filter((r) => r.roll === best).map((r) => r.player)
  }
  return { rounds, winner: contenders[0] }
}

/**
 * Pick the opening seat. With the dice on, the roll-off decides it and is kept
 * so it can be replayed on screen; with them off the seat is drawn from the same
 * generator without ceremony. Either way it is random — the option only decides
 * whether anyone gets to see it happen.
 */
export function chooseFirst(
  rng: Rng,
  playerCount: number,
  dice: boolean,
): { first: number; opening: Opening | null } {
  const opening = dice ? rollForFirst(rng, playerCount) : null
  return { first: opening ? opening.winner : rng.int(playerCount), opening }
}
