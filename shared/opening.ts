import type { Rng } from './rng'

/**
 * Who goes first, and how the table found out.
 *
 * This used to be drawn at random whatever the table asked for, because seat 0
 * was an accident of who happened to join first and handing it the opening turn
 * would have rewarded nothing. Turn positions removed that accident: seat 0 is
 * now whoever *chose* position 1. So the choice is the table's — either the
 * positions decide, and position 1 opens, or the table rolls for it and watches
 * the winner be decided.
 *
 * This lives apart from any one engine because every game wants it and none of
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
 * Pick the opening seat.
 *
 * With the dice on, the roll-off decides it and is kept so it can be replayed on
 * screen. With them off the turn positions decide, and seat 0 — position 1 —
 * opens: `Room.start()` has already seated the table in position order, so seat
 * 0 is the player who asked to go first.
 *
 * It used to draw at random in that second case too, which made the option a
 * choice about ceremony rather than about anything, and left a table that had
 * carefully arranged its positions opening on whichever seat the generator
 * liked.
 */
export function chooseFirst(
  rng: Rng,
  playerCount: number,
  dice: boolean,
): { first: number; opening: Opening | null } {
  if (!dice) return { first: 0, opening: null }
  const opening = rollForFirst(rng, playerCount)
  return { first: opening.winner, opening }
}
