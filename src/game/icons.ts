import buddhaImage from '../../assets/buddha.png'
import castleImage from '../../assets/castle.png'
import riceImage from '../../assets/rice.png'
import roninImage from '../../assets/ronin.png'
import samuraiImage from '../../assets/samurai.png'
import shipImage from '../../assets/ship.png'
import ambassadorCard from '../../assets/image/Ambassador.jpg'
import assassinCard from '../../assets/image/Assassin.jpg'
import captainCard from '../../assets/image/Captain.jpg'
import contessaCard from '../../assets/image/Contessa.jpg'
import dukeCard from '../../assets/image/Duke.jpg'

/**
 * Whole card faces for Coup's five characters, keyed by character id.
 *
 * Deliberately not part of `ICON_IMAGES`: that map feeds `GameIcon`, which draws
 * a 24×24 mark, and these are full portrait cards — routed through it they would
 * become unreadable thumbnails on the landing seal and the home masthead. Those
 * two keep the drawn `coup.*` silhouettes below.
 *
 * `CoupCard` prefers an entry here and falls back to the emblem-and-banner
 * layout for any character missing one, so removing a line is all it takes to go
 * back to the drawn card. Note the filenames are capitalised and the Docker
 * image builds on Linux, so these imports must match the files exactly.
 */
export const COUP_PORTRAITS: Record<string, string> = {
  duke: dukeCard,
  assassin: assassinCard,
  captain: captainCard,
  ambassador: ambassadorCard,
  contessa: contessaCard,
}

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

  // Coup's five characters. Namespaced, because these belong to a different game
  // and share nothing with the tiles above. They are emblems of each character's
  // power rather than portraits — original marks drawn to the same 24×24 grid,
  // with no relation to any published artwork.
  'coup.duke': `
    <path d="M2.6 8.2 7 11.6l5-6.6 5 6.6 4.4-3.4-1.6 8.6H4.2z"/>
    <rect x="4" y="18.4" width="16" height="2.6" rx="1.1"/>
  `,
  'coup.assassin': `
    <path d="M12 1.8 14 7.4v6.2h-4V7.4z"/>
    <rect x="7.4" y="13.8" width="9.2" height="2.2" rx="1.1"/>
    <rect x="10.9" y="16.4" width="2.2" height="3.6" rx="1.1"/>
    <circle cx="12" cy="21" r="1.5"/>
  `,
  'coup.captain': `
    <circle cx="12" cy="3.6" r="2.1"/>
    <rect x="10.9" y="5.6" width="2.2" height="14" rx="1.1"/>
    <rect x="6.6" y="7.4" width="10.8" height="2.1" rx="1.05"/>
    <path d="M4.2 12.6c0 4.6 3.5 8.2 7.8 8.2s7.8-3.6 7.8-8.2h-2.9c0 3.1-2.2 5.4-4.9 5.4s-4.9-2.3-4.9-5.4z"/>
  `,
  'coup.ambassador': `
    <rect x="5" y="3.2" width="14" height="13.2" rx="1.6"/>
    <rect x="3.2" y="16.8" width="17.6" height="2.4" rx="1.2"/>
    <circle cx="12" cy="21" r="2"/>
  `,
  'coup.contessa': `
    <path d="M12 19.8 4.6 8.9A9.6 9.6 0 0 1 19.4 8.9z"/>
    <rect x="10.8" y="18.4" width="2.4" height="3.4" rx="1.2"/>
  `,

  // A coin from the treasury. Drawn as a ring with a struck mark so it still
  // reads as money at the 14px it sits at beside a seat's coin count.
  'coup.coin': `
    <path d="M12 2.2a9.8 9.8 0 1 0 0 19.6 9.8 9.8 0 0 0 0-19.6zm0 2.6a7.2 7.2 0 1 1 0 14.4 7.2 7.2 0 0 1 0-14.4z"/>
    <path d="M12 6.6 13.5 10l3.7.3-2.8 2.4.86 3.6L12 14.4 8.74 16.3l.86-3.6L6.8 10.3 10.5 10z"/>
  `,

  // The mark on the back of every influence card: a compass rose set in a ring,
  // struck from two four-pointed stars so it still reads as an emblem rather
  // than a blob at the size a face-down card sits at in a seat. The ring is a
  // circle with a circle taken out of it, the same trick the coin uses.
  'coup.rose': `
    <path d="M12 .6a11.4 11.4 0 1 0 0 22.8 11.4 11.4 0 0 0 0-22.8zm0 1.2a10.2 10.2 0 1 1 0 20.4 10.2 10.2 0 0 1 0-20.4z"/>
    <path d="M12 2.4 13.84 10.16 21.6 12 13.84 13.84 12 21.6 10.16 13.84 2.4 12 10.16 10.16z"/>
    <path d="M16.81 7.19 14.2 12 16.81 16.81 12 14.2 7.19 16.81 9.8 12 7.19 7.19 12 9.8z"/>
    <circle cx="12" cy="12" r="2.2"/>
  `,

  // Curling vine for the corners of a card back — two mirrored scrolls springing
  // from a boss, which is what the gilt on the backs is made of.
  'coup.filigree': `
    <path d="M1.8 1.8c5.2.2 9 1.9 9.6 4.9.4 2-1 3.7-2.9 3.7-1.5 0-2.6-1-2.6-2.3 0-1.1.8-1.9 1.8-1.9.8 0 1.4.5 1.6 1.2.2-1.9-2.4-3.3-7.5-3.5z"/>
    <path d="M1.8 1.8c.2 5.2 1.9 9 4.9 9.6 2 .4 3.7-1 3.7-2.9 0-1.5-1-2.6-2.3-2.6-1.1 0-1.9.8-1.9 1.8 0 .8.5 1.4 1.2 1.6-1.9.2-3.3-2.4-3.5-7.5z"/>
    <circle cx="2.7" cy="2.7" r="1.6"/>
  `,

  // A corner piece for the gilded frames. Drawn for the top-left and rotated
  // into the other three, so one shape gilds a whole panel.
  'coup.corner': `
    <path d="M1.6 1.6h10.2v2.4H4V11.8H1.6z"/>
    <path d="M5.6 5.6h5.2v1.9H7.5v3.3H5.6z"/>
    <circle cx="2.9" cy="2.9" r="1.3"/>
  `,

  // The rule either side of a heading: a line running into a lozenge.
  'coup.flourish': `
    <path d="M0.4 11.2h7.4v1.6H0.4z"/>
    <path d="M16.2 11.2h7.4v1.6h-7.4z"/>
    <path d="M12 7.4 16.6 12 12 16.6 7.4 12z"/>
  `,

  // The play log's mark: a quill, for a table that keeps its own minutes.
  'coup.quill': `
    <path d="M21.2 2.2c-6.4.5-11.4 3.5-14 8.2a12.4 12.4 0 0 0-1.5 5l-2.4 2.4a1.1 1.1 0 0 0 1.6 1.6l2.4-2.4a12.4 12.4 0 0 0 5-1.5c4.7-2.6 7.7-7.6 8.2-14a.3.3 0 0 0-.3-.3z"/>
    <path d="M4.2 21.4h15.4v1.8H4.2z"/>
  `,

  // A settlement's buildings. The rulebook distinguishes settlements by how many
  // buildings they show — one for a village, two for a city, three for Edo — so
  // this single mark is simply repeated rather than drawn differently per kind.
  building: `<path d="M12 3.6 2.4 12.1h2.9v8.3h13.4v-8.3h2.9z"/>`,

  // Snakes & Ladders' power squares — Hugeicons (Stroke Rounded, free set,
  // MIT), inlined so the board needs no icon dependency. Stroke icons, unlike
  // the silhouettes above: each path sets fill="none" and strokes currentColor.
  'ladders.sprint': `
    <path d="M12.5 18C12.5 18 18.5 13.5811 18.5 12C18.5 10.4188 12.5 6 12.5 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M5.50005 18C5.50005 18 11.5 13.5811 11.5 12C11.5 10.4188 5.5 6 5.5 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  `,
  'ladders.slip': `
    <path d="M11.5 18C11.5 18 5.50001 13.5811 5.5 12C5.49999 10.4188 11.5 6 11.5 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M18.5 18C18.5 18 12.5 13.5811 12.5 12C12.5 10.4188 18.5 6 18.5 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  `,
  'ladders.again': `
    <path d="M9 9H8C5.17157 9 3.75736 9 2.87868 9.87868C2 10.7574 2 12.1716 2 15V16C2 18.8284 2 20.2426 2.87868 21.1213C3.75736 22 5.17157 22 8 22H9C11.8284 22 13.2426 22 14.1213 21.1213C15 20.2426 15 18.8284 15 16V15C15 12.1716 15 10.7574 14.1213 9.87868C13.2426 9 11.8284 9 9 9Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M18.0003 14.9827C19.5537 14.9359 20.4803 14.7626 21.1216 14.1213C22.0003 13.2426 22.0003 11.8284 22.0003 9V8C22.0003 5.17157 22.0003 3.75736 21.1216 2.87868C20.2429 2 18.8287 2 16.0003 2H15.0003C12.1718 2 10.7576 2 9.87893 2.87868C9.23763 3.51998 9.06438 4.44655 9.01758 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M6.5 13.25V13.5M7 13.5C7 13.7761 6.77614 14 6.5 14C6.22386 14 6 13.7761 6 13.5C6 13.2239 6.22386 13 6.5 13C6.77614 13 7 13.2239 7 13.5Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M13 5.75V6M13.5 6C13.5 6.27614 13.2761 6.5 13 6.5C12.7239 6.5 12.5 6.27614 12.5 6C12.5 5.72386 12.7239 5.5 13 5.5C13.2761 5.5 13.5 5.72386 13.5 6Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M18 5.75V6M18.5 6C18.5 6.27614 18.2761 6.5 18 6.5C17.7239 6.5 17.5 6.27614 17.5 6C17.5 5.72386 17.7239 5.5 18 5.5C18.2761 5.5 18.5 5.72386 18.5 6Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M18 10.75V11M18.5 11C18.5 11.2761 18.2761 11.5 18 11.5C17.7239 11.5 17.5 11.2761 17.5 11C17.5 10.7239 17.7239 10.5 18 10.5C18.2761 10.5 18.5 10.7239 18.5 11Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M10.5 17.25V17.5M11 17.5C11 17.7761 10.7761 18 10.5 18C10.2239 18 10 17.7761 10 17.5C10 17.2239 10.2239 17 10.5 17C10.7761 17 11 17.2239 11 17.5Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  `,
  'ladders.skip': `
    <path d="M4 7C4 5.58579 4 4.87868 4.43934 4.43934C4.87868 4 5.58579 4 7 4C8.41421 4 9.12132 4 9.56066 4.43934C10 4.87868 10 5.58579 10 7V17C10 18.4142 10 19.1213 9.56066 19.5607C9.12132 20 8.41421 20 7 20C5.58579 20 4.87868 20 4.43934 19.5607C4 19.1213 4 18.4142 4 17V7Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M14 7C14 5.58579 14 4.87868 14.4393 4.43934C14.8787 4 15.5858 4 17 4C18.4142 4 19.1213 4 19.5607 4.43934C20 4.87868 20 5.58579 20 7V17C20 18.4142 20 19.1213 19.5607 19.5607C19.1213 20 18.4142 20 17 20C15.5858 20 14.8787 20 14.4393 19.5607C14 19.1213 14 18.4142 14 17V7Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  `,
  'ladders.carry': `
    <path d="M16 21C15.7668 18.0685 13.3422 15.7477 10.3085 15.5521L9.49999 15.5C9.21121 15.5076 8.94209 15.5178 8.68816 15.5298C5.68124 15.6723 3.23089 18.0974 3 21" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M12.75 9.75C12.75 11.5449 11.2949 13 9.5 13C7.70508 13 6.25 11.5449 6.25 9.75C6.25 7.95507 7.70508 6.5 9.5 6.5C11.2949 6.5 12.75 7.95507 12.75 9.75Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M21 17.501C20.7709 14.6314 18.4541 12.2748 15.5 11.9961" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M15.9877 9C16.8965 8.42434 17.5001 7.40788 17.5001 6.25C17.5001 4.45507 16.0496 3 14.2602 3C13.3811 3 12.5838 3.35121 12.0001 3.92139" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  `,
  'ladders.swap': `
    <path d="M19 9H6.65856C5.65277 9 5.14987 9 5.02472 8.69134C4.89957 8.38268 5.25517 8.01942 5.96637 7.29289L8.21091 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M5 15H17.3414C18.3472 15 18.8501 15 18.9753 15.3087C19.1004 15.6173 18.7448 15.9806 18.0336 16.7071L15.7891 19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  `,
}

export type IconName = keyof typeof ICONS
