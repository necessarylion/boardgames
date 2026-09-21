import type { Caste, PlayerColour } from './types'

export interface ColourSet {
  /** Tile body. */
  fill: string
  /** Tile border and player accents. */
  ink: string
  /** Text drawn on the tile body. */
  text: string
  label: string
}

/**
 * Eight seat colours, chosen to be told apart at a glance and by as many people
 * as possible.
 *
 * Three things constrain the values. They are drawn at tile size on a board, so
 * hue alone is not enough — the set climbs a brightness ladder as well, which is
 * what keeps red, orange and yellow separable for a red-green colour deficiency,
 * and green from cyan. They sit on warm paper in the lobby and on dark boards in
 * play, so each carries a darker `ink` for its border and whichever `text`
 * survives on its body. And each has a woven cloth photograph behind it in
 * `src/game/backgrounds.ts` — the key names are those cloths, which is why
 * `gold` is the yellow and `indigo` the blue: renaming them would rename eight
 * image files and invalidate every colour stored in a saved room.
 *
 * The pair this replaced was `purple` #5b429e against `indigo` #3d4a9c — two
 * dark blue-violets three hue degrees apart, which nobody could tell apart on a
 * tile.
 */
export const PLAYER_COLOURS: Record<PlayerColour, ColourSet> = {
  red: { fill: '#c0392b', ink: '#7a1d14', text: '#fdeee8', label: 'Red' },
  indigo: { fill: '#2453c4', ink: '#12307d', text: '#eef2fd', label: 'Blue' },
  green: { fill: '#2e8b3d', ink: '#15521f', text: '#eefaee', label: 'Green' },
  gold: { fill: '#e6c229', ink: '#8a6d05', text: '#302704', label: 'Yellow' },
  purple: { fill: '#8e44c9', ink: '#4f207a', text: '#f6eefc', label: 'Purple' },
  orange: { fill: '#e07b1c', ink: '#8c4408', text: '#2b1602', label: 'Orange' },
  teal: { fill: '#17a3c4', ink: '#0a5e75', text: '#05262f', label: 'Cyan' },
  rose: { fill: '#d94a9a', ink: '#85215a', text: '#3d0c28', label: 'Pink' },
}

/**
 * The colours a table has to hand out. Each room shuffles its own copy of this
 * list (`Room.colours`), so nobody is the same colour at every table they sit
 * at; the order here is what a room stored before the shuffle existed falls
 * back to, which is why colours are appended rather than inserted.
 */
export const COLOUR_ORDER: readonly PlayerColour[] = [
  'red',
  'indigo',
  'green',
  'gold',
  'purple',
  'orange',
  'teal',
  'rose',
]

/**
 * The disc a caste piece sits on. The three pieces are drawn in much the same
 * brown, and at board size the silhouettes alone are hard to tell apart, so the
 * disc carries the distinction instead of the artwork.
 *
 * Buddha is blue rather than green because green is already the board's mark for
 * a piece you may click.
 */
export const CASTE_COLOURS: Record<Caste, Pick<ColourSet, 'fill' | 'ink'>> = {
  buddha: { fill: '#c6dbef', ink: '#2f5a86' },
  rice: { fill: '#f2c7c1', ink: '#8f2b26' },
  castle: { fill: '#f4dfa4', ink: '#8a6414' },
}
