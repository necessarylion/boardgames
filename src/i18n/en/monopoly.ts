/**
 * The English catalogue for Monopoly — the game's landing and home blurbs and
 * every string on its lobby and table. Merged with the other catalogues in
 * `../index`; the shared shell keys live there.
 *
 * The forty space names are not here. They are part of the board in
 * `shared/monopoly.ts`, which the server writes into its play log, and a company
 * called Apple is a company called Apple in every language — the same reason the
 * caste names sit in `shared/types.ts` rather than being translated per locale.
 */
export const enMonopoly = {
  // --- landing (choose a game) --------------------------------------------
  'landing.monopoly.name': 'Monopoly',
  'landing.monopoly.blurb':
    'Buy up the tech giants, build them out, and charge everyone else rent until they are broke.',
  'landing.monopoly.meta': '2–8 players · property trading',

  // --- home ----------------------------------------------------------------
  'home.monopoly.tagline':
    'Twenty-two tech companies, four data centres and one bank. Buy, build, mortgage and trade the whole sector until only one player is left solvent.',
  'home.monopoly.hostHint': 'There is nothing to set up beyond the clock — create the room and roll.',

  // --- lobby ---------------------------------------------------------------
  'monopoly.lobby.how': 'How to play',
  'monopoly.rule.roll':
    'On your turn, throw two dice and move that many spaces clockwise. Pass the IPO and collect {salary}. Doubles earn you another throw.',
  'monopoly.rule.buy':
    'Stop on an unowned company, data centre or utility and you may buy it from the bank. Turn it down — or fail to afford it — and it goes to auction, open to the whole table. Bid no more than the cash in hand, and drop out of the bidding and you are out of it for good.',
  'monopoly.rule.rent':
    'Stop on someone else’s and you pay their rent. A company with nothing built on it charges double once its owner holds the whole sector.',
  'monopoly.rule.build':
    'Holding a whole sector lets you expand. Offices go up evenly across it — no company gets its next office until the others have caught up — and a fifth office becomes an HQ.',
  'monopoly.rule.jail':
    'Three doubles in one turn, the Go to Antitrust corner, or the wrong card puts you under antitrust review. Pay the {fine} fine, file a card, or throw doubles to end it.',
  'monopoly.rule.money':
    'Short of cash? Sell offices back at half price, mortgage what you own, or trade with another player. Run out of ways to pay and you are bankrupt.',
  'monopoly.rule.win': 'The last player still solvent wins.',

  // --- turn --------------------------------------------------------------
  'monopoly.turn.yours': 'Your turn',
  'monopoly.turn.other': '{name} to play',
  'monopoly.turn.moving': '{name} is moving…',
  'monopoly.roll': 'Throw the dice',
  'monopoly.rollAgain': 'Doubles — throw again',
  'monopoly.endTurn': 'End turn',
  'monopoly.rolled': '{name} threw {a} and {b}',

  // --- the panels a narrow screen keeps its side columns in ----------------
  'monopoly.tab.players': 'Players',
  'monopoly.tab.property': 'Property',
  'monopoly.tab.log': 'Log',
  'monopoly.panel.close': 'Close',
  'monopoly.panel.tap': 'Tap a space for its details',

  // --- buying and auctions -------------------------------------------------
  'monopoly.buy.title': '{name} is for sale',
  'monopoly.buy.action': 'Buy for {price}',
  'monopoly.buy.pass': 'Send to auction',
  'monopoly.buy.other': '{name} is deciding whether to buy {space}.',
  'monopoly.auction.title': '{name} under the hammer',
  'monopoly.auction.standing': 'Standing bid {amount} from {name}',
  'monopoly.auction.none': 'No bids yet',
  'monopoly.auction.bid': 'Bid',
  'monopoly.auction.pass': 'Drop out',
  'monopoly.auction.waiting': 'Waiting on {count} more bidders',
  'monopoly.auction.cash': 'You have {amount} to bid with',
  'monopoly.auction.tooHigh': 'More than you have in hand',
  'monopoly.auction.broke': 'You cannot cover {amount}, so dropping out is all that is left.',
  'monopoly.auction.leading': 'Your bid stands. Waiting on the other bidders.',
  'monopoly.auction.out': 'You dropped out — you cannot bid for this one again.',

  // --- trading -------------------------------------------------------------
  'monopoly.trade.open': 'Offer a trade',
  'monopoly.trade.title': 'Offer a trade',
  'monopoly.trade.with': 'With',
  'monopoly.trade.youGive': 'You give',
  'monopoly.trade.youWant': 'You want',
  'monopoly.trade.cash': 'Cash',
  'monopoly.trade.send': 'Send the offer',
  'monopoly.trade.cancel': 'Cancel',
  'monopoly.trade.incoming': '{name} offers you a trade',
  'monopoly.trade.theyGive': 'They give',
  'monopoly.trade.theyWant': 'They want',
  'monopoly.trade.accept': 'Accept',
  'monopoly.trade.decline': 'Decline',
  'monopoly.trade.waiting': 'Waiting for {name} to answer your offer.',
  'monopoly.trade.elsewhere': '{a} and {b} are talking terms.',
  'monopoly.trade.nothing': 'Nothing',

  // --- antitrust ----------------------------------------------------------------
  'monopoly.jail.title': 'You are under antitrust review',
  'monopoly.jail.pay': 'Pay {fine}',
  'monopoly.jail.card': 'File a card',
  'monopoly.jail.roll': 'Throw for doubles',
  'monopoly.jail.other': '{name} is under antitrust review.',
  'monopoly.jail.visiting': 'Cleared, not charged',

  // --- money trouble -------------------------------------------------------
  'monopoly.debt.title': 'You owe {amount}',
  'monopoly.debt.hint': 'Sell offices or mortgage what you own to cover it.',
  'monopoly.debt.giveUp': 'Declare bankruptcy',
  'monopoly.debt.other': '{name} owes {amount} and is raising the money.',

  // --- property management -------------------------------------------------
  'monopoly.manage.title': 'Your property',
  'monopoly.manage.none': 'You own nothing yet.',
  'monopoly.manage.build': 'Expand',
  'monopoly.manage.sell': 'Sell an office',
  'monopoly.manage.mortgage': 'Mortgage',
  'monopoly.manage.unmortgage': 'Lift mortgage',
  'monopoly.manage.mortgaged': 'Mortgaged',
  'monopoly.manage.others': 'Everyone else',
  'monopoly.manage.noneYet': 'Nothing yet.',
  'monopoly.manage.rent': 'Rent {amount}',
  'monopoly.manage.rentTimes': 'Rent {n}× the throw',
  'monopoly.manage.set': '{owned} of {total} in the set',
  // The hover text on each action. A player should never have to already know
  // what "mortgage" means, or what it pays, to decide whether to press it.
  'monopoly.manage.buildHint': 'Add an office here for {amount}. Rent goes up sharply.',
  'monopoly.manage.sellHint': 'Sell an office back to the bank for {amount}. Rent drops again.',
  'monopoly.manage.mortgageHint':
    'Borrow {amount} against this. It earns no rent until you buy it back for {cost}, and you cannot expand its sector while it is mortgaged.',
  'monopoly.manage.unmortgageHint': 'Pay off the loan for {amount}. It starts earning rent again.',
  'monopoly.bank.stock': 'Bank: {houses} offices, {hotels} HQs',
  'monopoly.salary': 'IPO: {amount}',

  // --- sectors (the colour bands) -------------------------------------------
  'monopoly.sector.brown': 'Social',
  'monopoly.sector.cyan': 'Consumer apps',
  'monopoly.sector.pink': 'Creative & enterprise',
  'monopoly.sector.orange': 'Media & devices',
  'monopoly.sector.red': 'Semiconductors',
  'monopoly.sector.yellow': 'EV & AI',
  'monopoly.sector.green': 'Cloud giants',
  'monopoly.sector.blue': 'The two largest',

  // --- the hover card -------------------------------------------------------
  'monopoly.detail.rentBare': 'Rent',
  'monopoly.detail.rentSet': 'Whole sector held',
  'monopoly.detail.rentOffice': '1 office',
  'monopoly.detail.rentOffices': '{n} offices',
  'monopoly.detail.rentHQ': 'HQ',
  'monopoly.detail.stations': '{n} of 4 data centres',
  'monopoly.detail.utilityOne': 'One utility',
  'monopoly.detail.utilityBoth': 'Both utilities',
  'monopoly.detail.times': '{n}× the throw',
  'monopoly.detail.officeCost': 'Each office {amount}',
  'monopoly.detail.mortgageValue': 'Mortgage raises {amount}',
  'monopoly.detail.youOwn': 'Yours',
  'monopoly.detail.go': 'Collect {amount} every time you pass or land here.',
  'monopoly.detail.jail': 'Just passing through costs nothing. You are only held here if you are sent.',
  'monopoly.detail.parking': 'Nothing happens here. Rest a turn.',
  'monopoly.detail.goToJail': 'Go straight to Antitrust. You do not collect the IPO on the way.',
  'monopoly.detail.chance': 'Turn over a Market card and do what it says.',
  'monopoly.detail.chest': 'Turn over a Venture Fund card and do what it says.',
  'monopoly.detail.tax': 'Pay {amount} to the bank.',

  // --- the board -----------------------------------------------------------
  'monopoly.space.price': 'Price {price}',
  'monopoly.space.rent': 'Rent {rent}',
  'monopoly.space.owner': 'Owned by {name}',
  'monopoly.space.bank': 'Unowned',
  'monopoly.space.houses': '{n} offices',
  'monopoly.space.house': '1 office',
  'monopoly.space.hotel': 'HQ',
  'monopoly.card.chance': 'Market',
  'monopoly.card.chest': 'Venture Fund',

  // --- panels and the end --------------------------------------------------
  'monopoly.worth': 'Worth {amount}',
  'monopoly.bankrupt': 'Bankrupt',
  'monopoly.you': 'You',
  'monopoly.logMark': 'Turn {n}',
  'monopoly.winner': '{name} wins!',
  'monopoly.result.reason': 'Last player left solvent.',
  'monopoly.turnClock.hint':
    '— out of time buys the space you stopped on, drops a bid, refuses an offer, throws to clear an antitrust review, or mortgages to settle a debt',

  'monopoly.bidClock': 'Time to answer a bid',
  'monopoly.bidClock.same': 'Same as turn',
  'monopoly.bidClock.hint':
    '— counted again from each bid; a bidder who lets it run out drops out of the auction',

  // --- table talk ----------------------------------------------------------
  'chat.title': 'Chat',
  'chat.label': 'Message the table',
  'chat.placeholder': 'Say something…',
  'chat.send': 'Send',
  'chat.empty': 'Nothing said yet. The table is listening.',
  'chat.remaining': '{n} left',
  'chat.newCount': '{count} new ↓',
  'chat.toNewest': 'Jump to newest ↓',
  'chat.joined': '{name} joined the table.',
  'chat.left': '{name} left the table.',
  'chat.away': '{name} lost connection.',
  'chat.back': '{name} is back.',
}
