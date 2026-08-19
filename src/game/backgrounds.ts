import type { PlayerColour } from '@shared/types'
import teal from '../../assets/backgrounds/teal.png'
import crimson from '../../assets/backgrounds/crimson.png'
import forest from '../../assets/backgrounds/forest.png'
import heather from '../../assets/backgrounds/heather.png'
import mustard from '../../assets/backgrounds/mustard.png'
import navy from '../../assets/backgrounds/navy.png'
import plum from '../../assets/backgrounds/plum.png'
import rust from '../../assets/backgrounds/rust.png'

/**
 * A woven cloth per player colour, to fill an area the flat `fill` in
 * `PLAYER_COLOURS` would leave plain. It lives here rather than beside the
 * colours because `shared/colours.ts` is bundled into the server, which has no
 * asset pipeline to resolve these imports.
 *
 * Teal and rose are the two loose matches — the sheet has no blue-green and no
 * saturated pink, so they take the nearest cloth rather than an exact one.
 */
export const PLAYER_BACKGROUNDS: Record<PlayerColour, string> = {
  gold: mustard,
  red: crimson,
  green: forest,
  purple: plum,
  teal: teal,
  rose: heather,
  orange: rust,
  indigo: navy,
}
