import buddhaImage from '../../assets/buddha.png'
import castleImage from '../../assets/castle.png'
import riceImage from '../../assets/rice.png'
import roninImage from '../../assets/ronin.png'
import samuraiImage from '../../assets/samurai.png'
import shipImage from '../../assets/ship.png'

/**
 * Artwork for the three castes and the three wild tiles. GameIcon prefers an
 * entry here over ICONS, falling back to the drawn set for anything missing —
 * so removing a line here is all it takes to go back to the silhouette.
 *
 * These carry their own colour and ignore `currentColor`, and they are not all
 * the same shape, so GameIcon fits them inside the icon box rather than
 * stretching them to fill it.
 */
export const ICON_IMAGES: Record<string, string> = {
  buddha: buddhaImage,
  rice: riceImage,
  castle: castleImage,
  samurai: samuraiImage,
  ronin: roninImage,
  ship: shipImage,
}

/**
 * Inline SVG markup for the game's iconography — the actions and the settlement
 * mark, plus a drawn fallback for every caste and wild tile above.
 *
 * Every icon is drawn on the same 24×24 grid, inherits `currentColor` so one
 * component can recolour the whole set, and is built from solid silhouettes —
 * these render as small as 11px on the board, where outlines and thin strokes
 * disappear.
 */
export const ICONS: Record<string, string> = {
  // Caste — the three kinds of piece a settlement can hold.
  buddha: `
    <circle cx="12" cy="6" r="3.1"/>
    <path d="M12 10c-3.9 0-6.9 3.5-6.9 7.5 0 .9.7 1.6 1.6 1.6h10.6c.9 0 1.6-.7 1.6-1.6C18.9 13.5 15.9 10 12 10z"/>
    <rect x="4.2" y="19.7" width="15.6" height="1.9" rx=".95"/>
  `,
  rice: `
    <path d="M12 13.4C10.9 10.3 11.3 6.5 12 3.9c.7 2.6 1.1 6.4 0 9.5z"/>
    <path d="M11.8 14.1C9.9 11 6.4 9.4 3.9 9.7c.5 2.8 3.5 5.2 7.9 4.4z"/>
    <path d="M12.2 14.1c1.9-3.1 5.4-4.7 7.9-4.4-.5 2.8-3.5 5.2-7.9 4.4z"/>
    <rect x="9.5" y="14.2" width="5" height="2" rx="1"/>
    <path d="M10.6 16.6h2.8l-.5 4.3a.9.9 0 0 1-1.8 0z"/>
  `,
  castle: `
    <path d="M12 2.2 3.8 7.1h16.4z"/>
    <path d="M6.1 8.4h11.8l2.6 3.5H3.5z"/>
    <path d="M7.1 13.2h9.8l2.3 3.3H4.8z"/>
    <path d="M6.6 17.8h10.8v3.4H6.6z"/>
  `,

  // Wild — these count toward every caste.
  samurai: `
    <path d="M12 5.6c-4.3 0-7.8 3-7.8 6.8v1.9h15.6v-1.9c0-3.8-3.5-6.8-7.8-6.8z"/>
    <path d="M7.4 2.6 9.9 8 3.9 6.6z"/>
    <path d="M16.6 2.6 14.1 8l6-1.4z"/>
    <path d="M4.2 15.2h15.6v1.6a2.4 2.4 0 0 1-2.4 2.4H6.6a2.4 2.4 0 0 1-2.4-2.4z"/>
  `,
  ronin: `
    <path d="M3.6 18.9 15.5 7l1.6 1.6L5.2 20.5a1.1 1.1 0 0 1-1.6-1.6z"/>
    <path d="M20.4 18.9 8.5 7 6.9 8.6l11.9 11.9a1.1 1.1 0 0 0 1.6-1.6z"/>
    <circle cx="12" cy="4.4" r="2"/>
  `,
  ship: `
    <path d="M2.6 15.4h18.8l-2.3 4.6a2.2 2.2 0 0 1-2 1.2H6.9a2.2 2.2 0 0 1-2-1.2z"/>
    <rect x="11.2" y="2.2" width="1.6" height="12.2" rx=".8"/>
    <path d="M13.6 3.4c2.7.7 4.7 2.1 5.7 3.9-1 1.9-3 3.3-5.7 4z"/>
    <path d="M10.4 5.6c-2.2.6-3.8 1.8-4.6 3.3.8 1.5 2.4 2.7 4.6 3.3z"/>
  `,

  // Action — swap two pieces.
  switch: `
    <rect x="2.2" y="5.3" width="12.4" height="2.6" rx="1.3"/>
    <path d="M13.4 2.9 21.5 6.6l-8.1 3.7z"/>
    <rect x="9.4" y="16.1" width="12.4" height="2.6" rx="1.3"/>
    <path d="M10.6 13.7 2.5 17.4l8.1 3.7z"/>
  `,

  // Action — pick a placed tile up and set it down elsewhere.
  move: `
    <path d="M5.3 5.3 9.2 7.65v4.7L5.3 14.7 1.4 12.35v-4.7z"/>
    <rect x="10.6" y="8.8" width="7.4" height="2.4" rx="1.2"/>
    <path d="M16.4 5.9 22.7 10l-6.3 4.1z"/>
  `,

  // A settlement's buildings. The rulebook distinguishes settlements by how many
  // buildings they show — one for a village, two for a city, three for Edo — so
  // this single mark is simply repeated rather than drawn differently per kind.
  building: `<path d="M12 3.6 2.4 12.1h2.9v8.3h13.4v-8.3h2.9z"/>`,
}

export type IconName = keyof typeof ICONS
