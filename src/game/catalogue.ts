import type { MessageKey } from '@/i18n'
import type { GameKind } from '@shared/types'
import { GAME_KINDS, maxPlayersFor } from '@shared/types'

/**
 * What a game looks like when it is being *chosen* rather than played: a glyph,
 * the message keys for its name and blurb, and the class its seal is dressed in.
 *
 * It lives here because three separate screens used to keep their own copy of
 * this list — the landing cards, the home masthead and the lobby watermark —
 * and a new game had to be added to all three or it silently lost its name in
 * one of them. Like `GAME_ART`, this is a total `Record<GameKind, …>`, so a new
 * kind will not compile until it has an entry.
 */
export interface GameCard {
  kind: GameKind
  /** The seal's face. An emoji for most; Samurai and Coup draw their own. */
  glyph: string
  /** The modifier class that colours the seal — `.seal.fruits`, `.seal.crown`… */
  seal: string
  name: MessageKey
  blurb: MessageKey
  meta: MessageKey
}

export const GAME_CARDS: Record<GameKind, GameCard> = {
  samurai: {
    kind: 'samurai',
    glyph: '侍',
    seal: '',
    name: 'landing.samurai.name',
    blurb: 'landing.samurai.blurb',
    meta: 'landing.samurai.meta',
  },
  halligalli: {
    kind: 'halligalli',
    glyph: '🔔',
    seal: 'fruits',
    name: 'landing.halli.name',
    blurb: 'landing.halli.blurb',
    meta: 'landing.halli.meta',
  },
  coup: {
    kind: 'coup',
    glyph: '👑',
    seal: 'crown',
    name: 'landing.coup.name',
    blurb: 'landing.coup.blurb',
    meta: 'landing.coup.meta',
  },
  carnivals: {
    kind: 'carnivals',
    glyph: '🎪',
    seal: 'tent',
    name: 'landing.carnivals.name',
    blurb: 'landing.carnivals.blurb',
    meta: 'landing.carnivals.meta',
  },
  cop: {
    kind: 'cop',
    glyph: '🚔',
    seal: 'siren',
    name: 'landing.cop.name',
    blurb: 'landing.cop.blurb',
    meta: 'landing.cop.meta',
  },
  snake: {
    kind: 'snake',
    glyph: '🐍',
    seal: 'serpent',
    name: 'landing.snake.name',
    blurb: 'landing.snake.blurb',
    meta: 'landing.snake.meta',
  },
  ladders: {
    kind: 'ladders',
    glyph: '🎲',
    seal: 'die',
    name: 'landing.ladders.name',
    blurb: 'landing.ladders.blurb',
    meta: 'landing.ladders.meta',
  },
  monopoly: {
    kind: 'monopoly',
    glyph: '🏠',
    seal: 'terrace',
    name: 'landing.monopoly.name',
    blurb: 'landing.monopoly.blurb',
    meta: 'landing.monopoly.meta',
  },
}

/** Every game, in the order the picker offers them. */
export const GAME_LIST: readonly GameCard[] = GAME_KINDS.map((kind) => GAME_CARDS[kind])

/**
 * Whether a table this size could play `kind` at all. The lobby fills before a
 * game is settled on now, so a room of seven can be sitting there when the host
 * reaches for Samurai, which seats six — the picker says so rather than letting
 * `start()` be the one to refuse.
 */
export function seatsFit(kind: GameKind, players: number): boolean {
  return players <= maxPlayersFor(kind)
}
