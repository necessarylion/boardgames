/**
 * The English catalogue, and the list of keys every other language has to fill.
 * Keys are grouped by the screen they appear on; `{name}` placeholders are
 * substituted by `t()`.
 */
export const en = {
  // --- app shell -----------------------------------------------------------
  'app.connecting': 'Connecting to the game server…',
  'app.connectionLost': 'Connection lost — reconnecting…',
  'app.notConnected': 'Not connected to the server yet.',
  'app.replaced': 'This table is open in another tab.',
  'app.replaced.action': 'Play here instead',

  'lang.label': 'Language',

  // --- castes (mapped from shared/types.ts at the point of display) --------
  'caste.piece.buddha': 'Buddha',
  'caste.piece.rice': 'Rice',
  'caste.piece.castle': 'Castle',
  'caste.name.buddha': 'Religion',
  'caste.name.rice': 'Commerce',
  'caste.name.castle': 'Military',
  'caste.lower.buddha': 'religion',
  'caste.lower.rice': 'commerce',
  'caste.lower.castle': 'military',

  // --- home ----------------------------------------------------------------
  'home.tagline':
    'Feudal Japan, 1336. Place your influence, surround the settlements, and lead the most castes.',
  'home.name.title': 'Your name',
  'home.name.placeholder': 'e.g. Takeda',
  'home.host.title': 'Host a table',
  'home.create': 'Create room',
  'home.join.title': 'Join a table',
  'home.join.hint': 'Ask the host for the four-character room code.',
  'home.join.placeholder': 'ABCD',
  'home.join.action': 'Join room',
  'home.invited.title': "You've been invited",
  'home.invited.hint': 'The room code came with your link. Enter your name and join.',
  'home.invited.hostInstead': 'Host my own table instead',
  'home.footnote':
    'Two to four players, each on their own device. The board grows with the number of players.',
  'home.board.title': 'Board',
  'board.mountain': 'Mountains',
  'board.mountain.hint': 'Two peaks either side of a valley.',
  'board.valley': 'Valley',
  'board.valley.hint': 'A broad chevron dropping to a point in the middle.',
  'board.bay': 'Bay',
  'board.bay.hint': 'Shores curving away either side of a deep centre.',
  'home.error.name': 'Enter a name first.',
  'home.error.code': 'Room codes are four characters.',

  // --- table options (home and lobby) --------------------------------------
  'option.randomHands': 'Deal opening hands at random',
  'option.randomHands.hint': '— skips the hand-selection step',
  'option.openInfo': 'Open information',
  'option.openInfo.hint': "— everyone's captured pieces stay visible",
  'option.openInfo.long': 'Open information (captured pieces stay visible)',
  'game.timeLeft': 'Time left this turn',
  'option.turnClock': 'Turn timer',
  'option.turnClock.hint': '— out of time plays one tile at random and ends the turn',
  'option.turnClock.off': 'Off',
  'option.turnClock.seconds': '{n}s',
  'option.turnClock.minutes': '{n}m',

  // --- lobby ---------------------------------------------------------------
  'lobby.roomCode': 'Room code',
  'lobby.copyLink': 'Copy invite link',
  'lobby.linkCopied': 'Link copied',
  'lobby.copyFailed': 'Could not copy — select the link and copy it manually.',
  'lobby.leave': 'Leave',
  'lobby.players': 'Players',
  'lobby.seatCount': '{seated} / {max}',
  'lobby.badge.host': 'Host',
  'lobby.badge.you': 'You',
  'lobby.badge.away': 'Away',
  'lobby.waitingForPlayer': 'Waiting for a player…',
  'lobby.settings': 'Table settings',
  'lobby.hostOnly': 'Only the host can change these.',
  'lobby.supply':
    'With {players} players the supply is {pieces} pieces of each caste, and the board is sized to match.',
  'lobby.start': 'Start game',
  'lobby.waitingHost': 'Waiting for the host…',
  'lobby.needTwo': 'At least two players are needed.',

  // --- draft ---------------------------------------------------------------
  'draft.title': 'Choose your opening hand',
  'draft.intro':
    'Pick {picks} of your 20 tiles. The other 15 are shuffled into your draw stack. Everyone chooses at the same time, and nobody sees your choice.',
  'draft.reference': 'What each tile does',
  'draft.chosen': '{picked} / {total} chosen',
  'draft.random': 'Choose for me',
  'draft.confirm': 'Confirm hand',
  'draft.done': 'Your hand is set',
  'draft.waitingFor': 'Waiting for {names}.',

  // --- game screen ---------------------------------------------------------
  'game.over': 'Game over',
  'game.yourTurn': 'Your turn',
  'game.playerTurn': "{name}'s turn",
  'game.noTurn': '—',
  'game.round': 'Round {turn}',
  'game.room': 'Room {code}',
  'game.rules': 'Rules',
  'game.hideInfo': 'Hide',
  'game.showInfo': 'Info',
  'game.spectating': 'You are watching this table. Captured pieces stay hidden until the game ends.',

  // --- board ---------------------------------------------------------------
  'board.label': 'Samurai game board',
  'board.zoomIn': 'Zoom in',
  'board.zoomOut': 'Zoom out',
  'board.fit': 'Fit the whole board',
  'board.fitShort': 'Fit',

  // --- hand bar ------------------------------------------------------------
  'hand.title': 'Your hand',
  'hand.stackLeft': '· {count} left in your stack',
  'hand.waitingFor': 'Waiting for {name} to play.',
  'hand.waiting': 'Waiting…',
  'hand.prompt.place': 'Choose a highlighted space to place the tile.',
  'hand.prompt.switchFirst': 'Choose the first caste piece to swap.',
  'hand.prompt.switchSecond': 'Choose the caste piece to swap it with.',
  'hand.prompt.movePick': 'Choose one of your tiles on the board to reposition.',
  'hand.prompt.moveDestination': 'Choose an empty land space to move that tile to.',
  'hand.prompt.mustPlace': 'Play a tile. 速 tiles do not use up your placement.',
  'hand.prompt.done': 'Placement done — end your turn, or play another 速 tile.',
  'hand.empty': 'No tiles left.',
  'hand.undo': 'Take back',
  'hand.undo.hint': 'Return the last tile you placed to your hand. Only until you end your turn.',
  'hand.cancel': 'Cancel',
  'hand.endTurn': 'End turn',

  // --- player panel --------------------------------------------------------
  'panel.onBoard': 'Caste pieces on the board',
  'panel.endNote': 'The game ends the moment any caste is cleared from the board.',
  'panel.setAside': 'Set aside',
  'panel.setAsideCount': '{count} / {max}',
  'panel.setAsideEmpty':
    'Nothing contested yet. A tie for the highest influence takes the piece out of the game.',
  'panel.players': 'Players',
  'panel.stats': '{hand} in hand · {stack} in stack · {captured} captured',
  'panel.hiddenCaptured': 'Captured pieces kept behind their screen.',

  // --- play log ------------------------------------------------------------
  'log.title': 'Play log',
  'log.empty': 'Nothing has happened yet.',

  // --- tile reference ------------------------------------------------------
  'tiles.kind.caste': 'Caste',
  'tiles.kind.wild': 'Wild',
  'tiles.kind.action': 'Action',
  'tiles.caste.name': '{piece} tiles',
  'tiles.caste.text':
    'The {caste} caste. Counts toward {piece} pieces only, and nothing against the other two.',
  'tiles.samurai.name': 'Samurai',
  'tiles.samurai.text':
    'Wild — counts toward every caste in an adjacent settlement. Your strongest all-purpose tiles.',
  'tiles.ronin.name': 'Ronin',
  'tiles.ronin.text': 'Wild and fast. Low value, but free to drop alongside your real placement.',
  'tiles.ship.name': 'Ship',
  'tiles.ship.text':
    'Wild and fast, and the only tile for sea spaces. Sea never has to be filled, so a ship adds influence without hastening the capture.',
  'tiles.switch.name': 'Switch',
  'tiles.switch.text':
    'Fast, and never placed. Swaps any two caste pieces on the board — no settlement may end up holding two of a type — then leaves the game.',
  'tiles.move.name': 'Move',
  'tiles.move.text':
    'Uses your placement. Lifts one of your own earlier non-fast tiles onto any empty land space, and fills the space it left adding no influence.',
  'tiles.count': '{count}×',
  'tiles.noInfluence': 'no influence',
  'tiles.valueRange': 'values {from}–{to}',
  'tiles.value': 'value {value}',
  'tiles.fast': 'Fast',
  'tiles.footnote':
    'marks a fast tile — it does not use up your one placement, so play as many as you like each turn.',

  // --- rules sheet ---------------------------------------------------------
  'rules.title': 'How Samurai works',
  'rules.close': 'Close',
  'rules.goal.title': 'The goal',
  'rules.goal.text':
    'Capture caste pieces to become the leader of a caste. Whoever leads the most castes wins.',
  'rules.turn.title': 'Your turn',
  'rules.turn.place':
    'Place <strong>one tile</strong> on an empty land space — plus any number of tiles marked <strong>速</strong> (fast), in any order. Ship tiles go on sea spaces, and are the only tile that can.',
  'rules.turn.capture': 'Any settlement whose adjacent land spaces are all filled is captured.',
  'rules.turn.draw': 'You draw back up to five tiles and your turn ends.',
  'rules.capturing.title': 'Capturing',
  'rules.capturing.text':
    "Adjacent sea spaces do not have to be filled. When a settlement is surrounded, each of its pieces is contested separately: every player totals the influence of their own tiles adjacent to that settlement which match the piece's caste. Wild tiles — samurai, ronin and ship — count toward all three castes. The single highest total takes the piece; a tie removes it from the game instead.",
  'rules.ending.title': 'Ending the game',
  'rules.ending.text':
    'The game ends at the end of a turn once every piece of any one caste has left the board, or once {count} pieces have been set aside from ties.',
  'rules.scoring.title': 'Who wins',
  'rules.scoring.token':
    'Each caste has one <strong>leader token</strong>, and it goes to whoever captured strictly the most pieces of that caste. Level with someone and nobody takes it, so three tokens exist and fewer may be handed out.',
  'rules.scoring.margin':
    'Leading a caste by one piece is worth exactly as much as leading it by ten. Pieces beyond the lead count for nothing until the tiebreakers.',
  'rules.scoring.order': 'The winner is settled in this order:',
  'rules.scoring.tokens': 'Most leader tokens.',
  'rules.scoring.other':
    'Level: most pieces from the castes they do <em>not</em> lead — the caste you already led does not count twice.',
  'rules.scoring.total': 'Still level: most pieces overall.',
  'rules.scoring.shared': 'Still level: the victory is shared.',
  'rules.tiles.title': 'Your {count} tiles',
  'rules.tiles.lede':
    "Everyone owns the same set. You pick five to open with, then draw the rest in the order they happen to come up. A tile's number is the influence it lends to every settlement it touches.",

  // --- capture notice ------------------------------------------------------
  'capture.eyebrow': 'A capture',
  'capture.one': 'Yay! You took a {piece}.',
  'capture.many': 'Yay! You took {count} pieces.',
  'capture.note': 'Kept behind your screen until the game ends.',
  'capture.ok': 'OK',

  // --- game over -----------------------------------------------------------
  'over.eyebrow': 'The game has ended',
  'over.youEyebrow': 'The game is yours',
  'over.wins': '{name} wins',
  'over.shared': '{names} share the victory',
  'over.youWin': 'You win!',
  'over.youShareWin': 'You win — shared with {names}!',
  'over.and': ' and ',
  'over.unknownPlayer': 'Unknown',
  'over.player': 'Player',
  'over.leaderTokens': 'Leader tokens',
  'over.total': 'Total',
  'over.leader': 'Leader',
  'over.unclaimed': 'Unclaimed leader tokens: {castes} — tied, so nobody leads.',
  'over.starNote': '* marks a caste this player leads.',
  'over.playAgain': 'Play again',
  'over.backToLobby': 'Back to lobby',
  'over.waitingHost': 'Waiting for the host to deal another game.',
  'over.leaveTable': 'Leave table',
  'over.hostNote':
    '“Play again” deals a fresh game to the same players; “Back to lobby” lets you change the table settings first. Players who have left are dropped either way.',

  // --- table menu ----------------------------------------------------------
  'menu.table': 'Table',
  'menu.room': 'Room {code}',
  'menu.endConfirm': 'End this game for everyone and go back to the lobby? The current board is lost.',
  'menu.endGame': 'End game',
  'menu.endHint': 'Back to the lobby to deal again',
  'menu.hostOnly': 'Only the host can end the game.',
  'menu.leaveConfirm': 'Leave the table? You will lose your seat in this game.',
  'menu.leaveTable': 'Leave table',
  'menu.leaveHint': 'Return to the start screen',
  'menu.cancel': 'Cancel',
}
