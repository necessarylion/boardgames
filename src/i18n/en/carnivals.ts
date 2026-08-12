/**
 * The English catalogue for Carnivals — its landing and home blurbs and every
 * string on its lobby and table. Merged with the other catalogues in `../index`;
 * the shared shell keys (app, lobby chrome, menus) live there.
 */
export const enCarnivals = {
  // --- landing (choose a game) ----------------------------------------------
  'landing.carnivals.name': 'Carnivals',
  'landing.carnivals.blurb': 'Bet on a hand you can only half see — your own red, and everyone else’s blue.',
  'landing.carnivals.meta': '2–6 players · betting',

  // --- home ------------------------------------------------------------------
  'home.carnivals.tagline':
    'A betting game of hidden information. You see your own red card and every rival’s blue — but never your own blue, and never their red. Wager on what you can infer.',
  'home.carnivals.hostHint':
    'Nothing to set up — create the table and share the code. The dealer is drawn at random and betting is untimed.',

  // --- lobby -----------------------------------------------------------------
  'carnival.lobby.how': 'How to play',
  'carnival.lobby.cards': 'The cards',
  'carnival.lobby.yours': 'Your seat: you see your red, never your blue.',
  'carnival.lobby.theirs': 'A rival: you see their blue, never their red.',
  'carnival.rule.deal': 'Each hand you pick a red and a blue card blind — you are shown only your red.',
  'carnival.rule.see': 'You see your own red and everyone else’s blue — never your own blue, nor their red.',
  'carnival.rule.bet': 'Bet poker-style: check, call, raise or fold, going round until everyone has matched or folded.',
  'carnival.rule.show': 'At the showdown each player still in turns their own hand over. Score is red plus blue; highest takes the pot.',
  'carnival.rule.win': 'Run out of Carnivals and you are out. The last player with money wins.',

  // --- the cards -------------------------------------------------------------
  'carnival.card.red': 'Red {n}',
  'carnival.card.blue': 'Blue {n}',
  'carnival.card.red.hidden': 'A red card — hidden from you',
  'carnival.card.blue.hidden': 'Your blue card — you may not see it',

  // --- table -----------------------------------------------------------------
  'carnival.money': '{n} Carnivals',
  'carnival.handNo': 'Hand {hand}',
  'carnival.pot': 'Pot',
  'carnival.currentBet': 'Bet to match: {n}',
  'carnival.inPot': 'In: {n}',
  'carnival.selecting': 'Pick your cards',
  'carnival.revealing': 'Showdown — reveal your hands',
  'carnival.yourTurn': 'Your turn — place your bet',
  'carnival.playerTurn': '{name} to bet',
  'carnival.out': 'Out',
  'carnival.folded': 'Folded',
  'carnival.picking': 'picking…',
  'carnival.ready': 'ready',
  'carnival.hidden': 'to show',
  'carnival.shown': 'shown',
  'carnival.log.title': 'Log',

  // --- picking your cards ----------------------------------------------------
  'carnival.pick.title': 'Pick your cards',
  'carnival.pick.hint': 'Choose one card of each colour, blind. You will be shown only your red — your blue stays turned away.',
  'carnival.pick.red': 'Your red (you will see it)',
  'carnival.pick.blue': 'Your blue (hidden from you)',
  'carnival.pick.confirm': 'Take these cards',
  'carnival.pickPrompt': 'Pick your two cards to begin the hand.',
  'carnival.pickWaiting': 'Waiting for the others to pick…',

  // --- controls --------------------------------------------------------------
  'carnival.check': 'Check',
  'carnival.call': 'Call {n}',
  'carnival.allIn': 'All in ({n})',
  'carnival.allInTag': 'all in',
  'carnival.fold': 'Fold',
  'carnival.raiseTo': 'Raise to {n}',
  'carnival.reveal': 'Reveal my hand',
  'carnival.reveal.waiting': 'Waiting for the others to reveal…',
  'carnival.nextHand': 'Deal next hand',
  'carnival.waitingOn': 'Waiting on {name}…',

  // --- showdown --------------------------------------------------------------
  'carnival.showdown.title': 'Showdown',
  'carnival.showdown.done': 'The hand is over.',
  'carnival.showdown.won': '{name} takes the pot of {pot} Carnivals.',
  'carnival.showdown.split': '{names} share the pot of {pot} Carnivals.',
  'carnival.showdown.fold': '{name} takes {pot} Carnivals — everyone else folded.',
  'carnival.showdown.checked': 'Checked down — no bets, no pot.',

  // --- narration -------------------------------------------------------------
  'carnival.event.deal': 'Hand {hand} is dealt.',
  'carnival.event.select': '{name} picks their cards.',
  'carnival.event.reveal': '{name} turns their hand over.',
  'carnival.event.check': '{name} checks.',
  'carnival.event.call': '{name} calls {amount}.',
  'carnival.event.raise': '{name} raises to {to}.',
  'carnival.event.allIn': '{name} goes all in for {amount}.',
  'carnival.event.fold': '{name} folds.',
  'carnival.event.showdown': 'Showdown — {pot} Carnivals in the pot.',
  'carnival.event.out': '{name} is out of the game.',
  'carnival.winner': '{name} wins!',
  'carnival.draw': 'Nobody is left standing',

  // --- the quick reference ---------------------------------------------------
  'carnival.rules.open': 'Rules',
  'carnival.rules.title': 'Carnivals — quick reference',
  'carnival.rules.close': 'Close',
  'carnival.rules.aim':
    'Every player starts with {carnivals} Carnivals. Each hand you pick a red card and a blue card, both numbered {low}–{high}, blind — you are shown only your red — then bet on a total you can only partly see.',
  'carnival.rules.demo': 'Your hand: you read your red, but your blue is turned away from you.',
  'carnival.rules.visibility': 'What you can see',
  'carnival.rules.vis.ownRed': 'Your own red card — visible only to you.',
  'carnival.rules.vis.ownBlue': 'Your own blue card — hidden from you until you turn your hand over.',
  'carnival.rules.vis.theirBlue': 'Every rival’s blue card — open for all to read.',
  'carnival.rules.vis.theirRed': 'Every rival’s red card — hidden until they turn their hand over.',
  'carnival.rules.betting': 'Betting',
  'carnival.rules.bet.ante': 'There is no ante: the pot starts empty and grows only as the table bets.',
  'carnival.rules.bet.actions': 'On your turn check, bet or raise (by at least {raise}), call or fold.',
  'carnival.rules.bet.close': 'Betting ends once everyone still in has matched the bet or folded.',
  'carnival.rules.bet.stakes': 'Table stakes: you can only bet what is in front of you. If you cannot cover a bet you may go all in for the rest — a side pot then keeps your winnings to what you matched.',
  'carnival.rules.scoring': 'Winning the pot',
  'carnival.rules.score.total': 'Your score is your red plus your blue. The highest score among those still in wins the pot.',
  'carnival.rules.score.tie': 'Equal totals are broken by the higher single card; only two matching pairs split the pot.',
  'carnival.rules.score.out': 'A player who loses all their Carnivals is out of the game.',
  'carnival.rules.score.win': 'The last player with Carnivals wins.',
  'carnival.rules.motto': 'Trust what others reveal. Fear what they hide.',
}
