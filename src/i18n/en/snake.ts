/**
 * The English catalogue for Snake — the game's landing and home blurbs and
 * every string on its lobby and table. Merged with the other catalogues in
 * `../index`; the shared shell keys (app, lobby chrome, menus) live there.
 */
export const enSnake = {
  // --- landing (choose a game) --------------------------------------------
  'landing.snake.name': 'Snake',
  'landing.snake.blurb': 'Steer your snake, eat apples to grow, and be the last one slithering.',
  'landing.snake.meta': '2–8 players · arcade',

  // --- home ----------------------------------------------------------------
  'home.snake.tagline':
    'The arcade classic, played head to head. Grow long, cut corners, and let the others crash first.',
  'home.snake.hostHint': 'Snake has no settings — create the room and start slithering.',

  // --- table ---------------------------------------------------------------
  'snake.lobby.how': 'How to play',
  'snake.rule.steer': 'Steer with the arrow keys, WASD, a swipe, or the on-screen pad.',
  'snake.rule.apple': 'Eat an apple to grow longer — the board keeps a few on it at all times.',
  'snake.rule.crash': 'Run into a wall or any snake — including yourself — and you crash out.',
  'snake.rule.win':
    'The last snake slithering wins. If the last crash takes everyone at once, the longest snake takes it.',
  'snake.countdownHint': 'Get ready…',
  'snake.steer.hint': 'Arrows, WASD or swipe to steer',
  'snake.length': '{n} long',
  'snake.apples': '{n} apples',
  'snake.crashed': 'Crashed',
  'snake.you.crashed': 'You crashed — spectating the rest.',
  'snake.winner': '{name} wins!',
  'snake.draw': "It's a draw",
}
