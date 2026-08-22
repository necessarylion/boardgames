/**
 * The English catalogue for Snakes & Ladders — the game's landing and home
 * blurbs and every string on its lobby and table. Merged with the other
 * catalogues in `../index`; the shared shell keys live there.
 */
export const enLadders = {
  // --- landing (choose a game) --------------------------------------------
  'landing.ladders.name': 'Snakes & Ladders',
  'landing.ladders.blurb': 'Roll the die, climb the ladders, dodge the snakes, and be first to square 100.',
  'landing.ladders.meta': '2–8 players · dice race',

  // --- home ----------------------------------------------------------------
  'home.ladders.tagline':
    'The classic race to the top. Ladders lift you, snakes drop you, and the die decides the rest.',
  'home.ladders.hostHint': 'There is nothing to set up beyond the clock — create the room and roll.',

  // --- table ---------------------------------------------------------------
  'ladders.lobby.how': 'How to play',
  'ladders.rule.roll': 'On your turn, roll the die and move forward that many squares.',
  'ladders.rule.ladder': 'Land on the foot of a ladder and climb to its top.',
  'ladders.rule.snake': 'Land on the head of a snake and slide down to its tail.',
  'ladders.rule.win':
    'The first player to land exactly on square 100 wins. Throw too much and you bounce back — count up to 100, then the rest backwards. The race runs on for the places behind until one player is left.',
  'ladders.turn.yours': 'Your turn — roll the die',
  'ladders.turn.other': '{name} to roll',
  'ladders.roll': 'Roll',
  'ladders.again': 'Extra throw — roll again',
  'ladders.last.moved': '{name} rolled {roll} and moved to {to}',
  'ladders.last.ladder': '{name} rolled {roll} and climbed a ladder to {to}',
  'ladders.last.snake': '{name} rolled {roll} and slid down a snake to {to}',
  'ladders.last.bounce': '{name} rolled {roll} and bounced back to {to}',
  'ladders.square': 'Square {n}',
  'ladders.start': 'Start',
  'ladders.rolls': '{n} rolls',
  'ladders.logMark': 'Roll {n}',
  'ladders.place.1': '1st place',
  'ladders.place.2': '2nd place',
  'ladders.place.3': '3rd place',
  'ladders.place.n': '{n}th place',
  'ladders.power.sprint': 'Sprint: 3 squares on',
  'ladders.power.slip': 'Slip: 5 squares back',
  'ladders.power.again': 'Again: an extra throw',
  'ladders.power.skip': 'Skip: sit out your next turn',
  'ladders.power.carry': 'Carry: everyone on the square you left comes along',
  'ladders.power.swap': 'Swap: trade places with the player just ahead',
  'ladders.skipping': 'Sitting out',
  'ladders.rule.powers': 'Power squares fire the moment you stop on them:',
  'ladders.winner': '{name} wins!',
}
