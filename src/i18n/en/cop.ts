/**
 * The English catalogue for COP — its landing and home blurbs and every string
 * on its lobby and table. Merged with the other catalogues in `../index`; the
 * shared shell keys (app, lobby chrome, menus) live there.
 *
 * Not to be confused with Coup (`en/coup.ts`): two different games that rhyme.
 */
export const enCop = {
  // --- landing (choose a game) ----------------------------------------------
  'landing.cop.name': 'COP',
  'landing.cop.blurb': 'Hide behind a door with your loot — the Cop opens just two. Get caught and pay.',
  'landing.cop.meta': '2–8 players · bluffing',

  // --- home ------------------------------------------------------------------
  'home.cop.tagline':
    'A hidden-door heist. Each round one player is the Cop and the rest are thieves slipping into eight rooms in secret. The Cop opens two doors and strips whoever is caught; everyone left undisturbed splits the loot.',
  'home.cop.hostHint':
    'Nothing to set up — create the table and share the code. The first Cop is drawn at random and the badge passes round the table.',

  // --- lobby -----------------------------------------------------------------
  'cop.lobby.how': 'How to play',
  'cop.lobby.resources': 'The loot',
  'cop.lobby.start': 'Everyone starts with three of each. The badge passes round two rounds at a time until everyone has worn it.',
  'cop.rule.roles': 'Each round one player wears the Cop’s badge; everyone else is a thief.',
  'cop.rule.hide': 'Thieves slip into one of eight rooms in secret — nobody sees who is where.',
  'cop.rule.search': 'The Cop opens exactly two doors. Any thief behind them is caught and stripped of up to two resources.',
  'cop.rule.loot': 'Every room left shut is split among the thieves hiding in it, a die settling any share that will not divide.',
  'cop.rule.win': 'A leader token goes to the most Keys, Stamps and Cards. Most tokens wins.',

  // --- resources -------------------------------------------------------------
  'cop.resource.key': 'Keys',
  'cop.resource.stamp': 'Stamps',
  'cop.resource.card': 'Cards',

  // --- doors -----------------------------------------------------------------
  'cop.room': 'Room {n}',
  'cop.here': 'You’re here',
  'cop.empty': 'Empty',
  'cop.nobody': 'Nobody',
  'cop.took.none': 'caught — took nothing',
  'cop.took.zero': 'nothing',
  'cop.escaped': 'escaped',

  // --- table -----------------------------------------------------------------
  'cop.roundNo': 'Round {round} / {total}',
  'cop.theCop': 'The Cop',
  'cop.yourLoot': 'Your loot',
  'cop.badge': 'Cop',
  'cop.hidden': 'hidden',
  'cop.caughtCount': 'Caught {n} times',
  'cop.loot.hidden': 'loot hidden',
  'cop.log.title': 'Log',

  // --- turn labels -----------------------------------------------------------
  'cop.turn.choose': 'Choose a door to slip behind',
  'cop.turn.hidden': 'Hidden — waiting for the others',
  'cop.turn.copWaits': 'You’re the Cop — the thieves are choosing doors',
  'cop.turn.search': 'Open two doors',
  'cop.turn.searchWait': 'The Cop is choosing which doors to open',
  'cop.turn.arrest': 'Confiscate from the catch',
  'cop.turn.arrestWait': 'The Cop is searching the catch',
  'cop.turn.resolved': 'Round over',

  // --- controls --------------------------------------------------------------
  'cop.pickPrompt': 'Tap a door, then hide behind it.',
  'cop.pickNone': 'Pick a door first',
  'cop.hideHere': 'Hide in Room {n}',
  'cop.searchPrompt': 'Mark two doors to open ({n}/2).',
  'cop.openDoors': 'Open these doors',
  'cop.arrestPrompt': 'Caught thieves reveal their loot. Confiscate up to {limit} resources from each — no more than they hold.',
  'cop.holds': 'has {n}',
  'cop.taking': 'Taking {n}/{limit}',
  'cop.confiscate': 'Confiscate',
  'cop.roundOver': 'The round is settled.',
  'cop.nextRound': 'Next round',

  // --- narration -------------------------------------------------------------
  'cop.event.round': 'Round {round} — {name} takes the badge.',
  'cop.event.select': '{name} slips through a door.',
  'cop.event.search': '{name} opens doors {a} and {b}.',
  'cop.event.caught': 'Caught: {names}.',
  'cop.event.safe': 'The doors open on empty rooms.',
  'cop.event.arrest': '{name} confiscates {n} from the catch.',
  'cop.event.letOff': '{name} lets the catch off.',

  // --- game over -------------------------------------------------------------
  'cop.winner': '{name} wins!',
  'cop.draw': 'The game is a draw',
  'cop.result.won': 'The most leader tokens.',
  'cop.result.shared': 'Level on tokens, loot and catches.',
  'cop.col.player': 'Player',
  'cop.col.tokens': 'Tokens',
  'cop.col.caught': 'Caught',
}
