/**
 * The English catalogue for Coup — the game's landing and home blurbs and every
 * string on its lobby and table. Merged with the other catalogues in `../index`;
 * the shared shell keys (app, lobby chrome, menus) live there.
 */
export const enCoup = {
  // --- landing (choose a game) ----------------------------------------------
  'landing.coup.name': 'Coup',
  'landing.coup.blurb': 'Claim whatever character suits you — and hope nobody calls your bluff.',
  'landing.coup.meta': '2–6 players · bluffing',

  // --- home ------------------------------------------------------------------
  'home.coup.tagline':
    'A game of bluff and deduction. Two hidden cards, five characters, and no obligation whatsoever to tell the truth about which you hold.',
  'home.coup.hostHint':
    'Choose whether to roll for the opening seat and how long a turn may take. Both can still be changed in the lobby.',

  // --- lobby -----------------------------------------------------------------
  'coup.lobby.how': 'How to play',
  'coup.lobby.characters': 'The five characters',
  'coup.rule.influence': 'You start with two hidden influence cards and two coins. Lose both cards and you are out.',
  'coup.rule.turn': 'On your turn take exactly one action. Some claim a character; anyone may call that claim a bluff.',
  'coup.rule.challenge': 'Challenge wrongly and you give up an influence. Get caught bluffing and you give up one instead.',
  'coup.rule.block': 'Some actions can be blocked by claiming the right character — and a block can be challenged too.',
  'coup.rule.coup': 'Pay seven coins to launch a coup: unblockable, unchallengeable. At ten coins you must.',
  'coup.rule.win': 'The last player with influence wins.',

  // --- characters ------------------------------------------------------------
  'coup.character.duke': 'Duke',
  'coup.character.assassin': 'Assassin',
  'coup.character.captain': 'Captain',
  'coup.character.ambassador': 'Ambassador',
  'coup.character.contessa': 'Contessa',
  'coup.character.duke.power': 'Tax: take 3 coins. Blocks foreign aid.',
  'coup.character.assassin.power': 'Assassinate: pay 3 coins to force a player to give up an influence.',
  'coup.character.captain.power': 'Steal: take 2 coins from a player. Blocks stealing.',
  'coup.character.ambassador.power': 'Exchange: draw 2 from the deck and return 2. Blocks stealing.',
  'coup.character.contessa.power': 'Blocks assassination.',

  // --- actions ---------------------------------------------------------------
  'coup.action.income': 'Income',
  'coup.action.foreignAid': 'Foreign aid',
  'coup.action.coup': 'Coup',
  'coup.action.tax': 'Tax',
  'coup.action.assassinate': 'Assassinate',
  'coup.action.steal': 'Steal',
  'coup.action.exchange': 'Exchange',
  'coup.action.income.hint': 'Take 1 coin. Nobody can stop it.',
  'coup.action.foreignAid.hint': 'Take 2 coins. A Duke can block it.',
  'coup.action.coup.hint': 'Pay 7 coins. The target loses an influence, no questions asked.',
  'coup.action.tax.hint': 'Claim Duke and take 3 coins.',
  'coup.action.assassinate.hint': 'Claim Assassin, pay 3 coins, and strike.',
  'coup.action.steal.hint': 'Claim Captain and take 2 coins from a player.',
  'coup.action.exchange.hint': 'Claim Ambassador and swap cards with the deck.',

  // --- table -----------------------------------------------------------------
  'coup.yourTurn': 'Your turn — choose an action',
  'coup.playerTurn': '{name} to act',
  'coup.coins': '{n} coins',
  'coup.coins.one': '1 coin',
  'coup.influence': '{n} influence',
  'coup.out': 'Out',
  'coup.deck': '{n} in the court deck',
  'coup.hand.title': 'Your influence',
  'coup.hand.hidden': 'Only you can see these.',
  'coup.log.title': 'Log',
  'coup.controls.title': 'Your move',
  'coup.controls.hide': 'Fold the controls away',
  'coup.controls.show': 'Bring the controls back',


  'coup.court.title': 'Lost influence',
  'coup.court.empty': 'Nobody has lost an influence yet.',
  'coup.court.owner': '{name}’s',
  'coup.pickTarget': 'Pick a target for {action}',
  'coup.cancel': 'Cancel',

  // --- the pending window ----------------------------------------------------
  'coup.pending.action': '{name} declares {action}',
  'coup.pending.actionOn': '{name} declares {action} on {target}',
  'coup.pending.waiting': 'Waiting on {n} player(s)',
  'coup.pending.block': '{name} blocks with {character}',
  'coup.pending.lose': '{name} is giving up an influence',
  'coup.pending.exchange': '{name} is exchanging with the deck',
  'coup.challenge': 'Challenge',
  'coup.block': 'Block with {character}',
  'coup.pass': 'Allow',
  'coup.yourLoss.title': 'Give up an influence',
  'coup.yourLoss.coup': 'You have been couped.',
  'coup.yourLoss.assassinate': 'You have been assassinated.',
  'coup.yourLoss.challengeLost': 'Your challenge was wrong.',
  'coup.yourLoss.bluffCaught': 'Your bluff was called.',
  'coup.exchange.title': 'Keep {n} card(s)',
  'coup.exchange.hint': 'Choose which to keep; the rest go back into the deck.',
  'coup.exchange.confirm': 'Confirm',

  // --- narration -------------------------------------------------------------
  'coup.event.action': '{name} declares {action}.',
  'coup.event.block': '{name} blocks with {character}.',
  'coup.event.challengeWon': '{name} called the bluff — {target} was not holding {character}.',
  'coup.event.challengeLost':
    '{name} challenged and was wrong — {target} held {character}, and has returned it under the deck for a fresh card.',
  'coup.event.lose': '{name} gives up {character}.',
  'coup.event.out': '{name} is out of the game.',
  'coup.winner': '{name} wins!',
  'coup.draw': 'Nobody is left standing',

  // --- the quick reference ---------------------------------------------------
  'coup.rules.open': 'Rules',
  'coup.rules.title': 'Coup — quick reference',
  'coup.rules.close': 'Close',
  'coup.rules.aim':
    'You start with {influence} hidden influence cards and {coins} coins. Take one action per turn, claiming whichever character suits you — truthfully or not. Lose both cards and you are out; the last player with influence wins.',
  'coup.rules.actions': 'Actions',
  'coup.rules.col.action': 'Action',
  'coup.rules.col.cost': 'Cost',
  'coup.rules.col.claims': 'Claims',
  'coup.rules.col.blockedBy': 'Blocked by',
  'coup.rules.anyone': 'Anyone',
  'coup.rules.nothing': 'Nothing',
  'coup.rules.challenges': 'Challenges and blocks',
  'coup.rules.challenge.who':
    'Any opponent may challenge a claimed character. The first challenge or block closes the window; everyone else only has to allow it.',
  'coup.rules.challenge.right':
    'Right to challenge: the bluffer gives up an influence and the action does not happen.',
  'coup.rules.challenge.wrong':
    'Wrong to challenge: you give up an influence, and the player shows the card, returns it under the deck and draws the top card.',
  'coup.rules.challenge.block':
    'A block is a claim too, so it can be challenged — but only by the player it thwarts.',
  'coup.rules.challenge.cost':
    'A proven claim still leaves a blockable action open to being blocked.',
  'coup.rules.money': 'Coins',
  'coup.rules.money.coup': 'A coup costs {cost} coins and cannot be challenged or blocked.',
  'coup.rules.money.forced': 'At {at} coins a coup is the only action you may take.',
  'coup.rules.money.assassin':
    'Costs are paid when you declare and are never refunded — a blocked or caught assassination still costs {cost} coins.',
  'coup.rules.timeout':
    'If the clock runs out the safest legal move is made for you: a window is allowed, a forced loss gives up your first card, and a turn takes income.',
}
