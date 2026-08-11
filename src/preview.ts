// Development-only entry: renders the table against a locally simulated game
// so the visuals can be inspected without a server or a second browser.
import { DEFAULT_OPTIONS } from '@shared/engine'
import { createApp } from 'vue'
import { createPinia } from 'pinia'

import DraftScreen from './components/samurai/DraftScreen.vue'
import GameScreen from './components/samurai/GameScreen.vue'
import { Game } from '@shared/engine'
import { legalPlacements } from '@shared/rules'
import { buildTiles, tileFromId } from '@shared/tiles'
import type { ClientState } from '@shared/protocol'
import type { BoardShape, Caste } from '@shared/types'
import { COLOUR_ORDER } from '@shared/colours'
import { useGameStore } from './stores/game'
import './assets/main.css'

const NAMES = ['Takeda', 'Uesugi', 'Hojo', 'Imagawa', 'Mori', 'Shimazu']
const playerCount = Number(new URLSearchParams(location.search).get('players') ?? 4)
const turns = Number(new URLSearchParams(location.search).get('turns') ?? 26)
// An unknown shape falls back to the default map in buildBoard, so this is safe
// to take straight off the query string.
const boardShape = (new URLSearchParams(location.search).get('shape') ??
  DEFAULT_OPTIONS.boardShape) as BoardShape

const game = new Game(
  playerCount,
  { ...DEFAULT_OPTIONS, boardShape, randomHands: true, openInformation: true },
  20260728,
)

// Play a few plausible turns so the board is not empty.
for (let i = 0; i < turns; i++) {
  if (game.state.phase !== 'play') break
  const seat = game.state.current
  const options = game.state.players[seat].hand
    .map(tileFromId)
    .filter((t) => t.kind !== 'switch' && t.kind !== 'move')
    .map((t) => ({ tile: t, targets: legalPlacements(game.view, t) }))
    .filter((o) => o.targets.length > 0)
  if (options.length) {
    const pick = options[i % options.length]
    game.playTile(seat, pick.tile.id, pick.targets[(i * 7) % pick.targets.length])
  }
  if (game.canEndTurn(seat)) game.endTurn(seat)
  else break
}

const s = game.state
const state: ClientState = {
  kind: 'samurai',
  code: 'KN26',
  phase: s.phase,
  options: s.options,
  // The harness plays itself out before rendering, so the opening ceremony has
  // nothing to show by the time this state exists.
  opening: null,
  hostId: 0,
  you: 0,
  players: s.players.map((p, i) => ({
    id: i,
    name: NAMES[i],
    colour: COLOUR_ORDER[i],
    connected: i !== playerCount - 1,
    handCount: p.hand.length,
    stackCount: p.stack.length,
    capturedCount: p.captured.length,
    captured: [...p.captured],
    ready: true,
  })),
  playerCount,
  pieces: s.pieces,
  placed: s.placed,
  current: s.current,
  turnNumber: s.turnNumber,
  placedThisTurn: s.placedThisTurn,
  lastPlaced: s.lastPlaced,
  sinceYourTurn: [...s.unseenPlaced[0]],
  playedNonFast: s.playedNonFast,
  setAside: s.setAside,
  log: s.log,
  result: s.result,
  lastCaptures: s.lastCaptures,
  hand: [...s.players[0].hand],
  captured: [...s.players[0].captured],
  draftPool: [],
  canEndTurn: false,
  canUndo: false,
  canRedraw: false,
  teamNames: [],
  paused: false,
  turnMsLeft: null,
}

// ?screen=draft renders the opening-hand chooser instead of the table, with a
// full 20-tile pool to pick from.
const screen = new URLSearchParams(location.search).get('screen')
if (screen === 'draft') {
  state.phase = 'draft'
  state.draftPool = buildTiles(0).map((tile) => tile.id)
  state.players.forEach((p) => (p.ready = false))
}

const pinia = createPinia()
const app = createApp(screen === 'draft' ? DraftScreen : GameScreen)
app.use(pinia)
const store = useGameStore(pinia)
store.state = state
app.mount('#app')

// ?captured=buddha,rice opens the capture notice. Only one state is ever handed
// to the store here, and that first one is the baseline the notice keys off, so
// it has to be posed rather than played out.
const posed = new URLSearchParams(location.search).get('captured')
if (posed) store.capturedNotice = posed.split(',') as Caste[]

// ?zoom=N scrolls the board in by N wheel notches at the given ?at=x,y, so a
// zoomed view can be captured without a pointer.
const zoomSteps = Number(new URLSearchParams(location.search).get('zoom') ?? 0)
if (zoomSteps > 0) {
  requestAnimationFrame(() => {
    const svg = document.querySelector('svg.board')
    if (!svg) return
    const box = svg.getBoundingClientRect()
    const [ax, ay] = (new URLSearchParams(location.search).get('at') ?? '0.5,0.5')
      .split(',')
      .map(Number)
    for (let i = 0; i < zoomSteps; i++) {
      svg.dispatchEvent(
        new WheelEvent('wheel', {
          deltaY: -200,
          clientX: box.left + box.width * ax,
          clientY: box.top + box.height * ay,
          bubbles: true,
          cancelable: true,
        }),
      )
    }
  })
}
