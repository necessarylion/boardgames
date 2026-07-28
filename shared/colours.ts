import type { PlayerColour } from './types'

export interface ColourSet {
  /** Tile body. */
  fill: string
  /** Tile border and player accents. */
  ink: string
  /** Text drawn on the tile body. */
  text: string
  label: string
}

export const PLAYER_COLOURS: Record<PlayerColour, ColourSet> = {
  gold: { fill: '#e5c06a', ink: '#8a6414', text: '#4a3406', label: 'Gold' },
  red: { fill: '#e08b86', ink: '#8f2b26', text: '#4a100d', label: 'Red' },
  green: { fill: '#8fbf8a', ink: '#2f6b34', text: '#123d16', label: 'Green' },
  purple: { fill: '#a999cf', ink: '#4d3d80', text: '#241a45', label: 'Purple' },
}

export const COLOUR_ORDER: readonly PlayerColour[] = ['gold', 'red', 'green', 'purple']
