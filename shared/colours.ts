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
 * Dyed-cloth tones: a saturated body, a darker thread for the border and the
 * weave, and whichever text colour holds up on that body — dark on the mustard,
 * light on the rest.
 */
export const PLAYER_COLOURS: Record<PlayerColour, ColourSet> = {
  gold: { fill: '#d4a017', ink: '#7d5309', text: '#3d2903', label: 'Gold' },
  red: { fill: '#a63a30', ink: '#6b1d17', text: '#fdeee8', label: 'Red' },
  green: { fill: '#2f7a45', ink: '#17482a', text: '#eff7ec', label: 'Green' },
  purple: { fill: '#5b429e', ink: '#32235f', text: '#f1ecfb', label: 'Purple' },
  teal: { fill: '#1e6f86', ink: '#0f3f52', text: '#eaf4f8', label: 'Teal' },
  rose: { fill: '#a8336f', ink: '#651a41', text: '#fceef5', label: 'Rose' },
  orange: { fill: '#c8632a', ink: '#803a13', text: '#fdf0e6', label: 'Orange' },
  indigo: { fill: '#3d4a9c', ink: '#222c5f', text: '#eceefb', label: 'Indigo' },
}

/**
 * The colours a table has to hand out. Each room shuffles its own copy of this
 * list (`Room.colours`), so nobody is the same colour at every table they sit
 * at; the order here is what a room stored before the shuffle existed falls
 * back to, which is why colours are appended rather than inserted.
 */
export const COLOUR_ORDER: readonly PlayerColour[] = [
  'gold',
  'red',
  'green',
  'purple',
  'teal',
  'rose',
  'orange',
  'indigo',
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
