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
  // The harness always sits on your own seat, so the hand renders live and a
  // tile can be picked up and flown onto the board by hand.
  current: 0,
  turnNumber: s.turnNumber,
  placedThisTurn: s.placedThisTurn,
  lastPlaced: s.lastPlaced,
  othersLastPlaced: [...new Set(s.lastPlacedBy.filter((_, i) => i !== 0).flat())],
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

/*
 * Captures are the one animation the harness cannot reach by clicking: they are
 * watched off a *second* state, the one a turn end produces, and the harness
 * only ever hands the store its first. So pose one — take the pieces off the
 * board, bank them, and name them in `lastCaptures`, which is what the flight to
 * the tally reads.
 *
 * ?capture=N on the URL fires it once the table has settled; the "c" key fires
 * it again, so the flight can be watched more than once without a reload.
 *
 * Every third piece goes uncontested to nobody, so both destinations in the
 * header — the caste tally and the set-aside chip — get flown to.
 */
function poseCapture(count: number) {
  const posed = store.state
  if (!posed) return
  const taken: { caste: Caste; spaceId: string; winner: number | null }[] = []
  for (const [spaceId, list] of Object.entries(posed.pieces)) {
    if (taken.length >= count) break
    if (!list.length) continue
    // Round the table rather than all to one seat, so each flight has its own row
    // to land on, and every third piece is contested and goes to nobody.
    const winner = taken.length % 3 === 2 ? null : taken.length % playerCount
    taken.push({ caste: list[list.length - 1], spaceId, winner })
  }
  for (const capture of taken) {
    posed.pieces[capture.spaceId].pop()
    if (capture.winner === null) posed.setAside.push(capture.caste)
    else posed.players[capture.winner].captured?.push(capture.caste)
  }
  posed.lastCaptures = taken
  // What the watch keys off: without a new turn the state reads as a re-broadcast.
  posed.turnNumber += 1
}

const captureCount = Number(new URLSearchParams(location.search).get('capture') ?? 0)
if (captureCount > 0) setTimeout(() => poseCapture(captureCount), 900)
window.addEventListener('keydown', (e) => {
  if (e.key === 'c') poseCapture(captureCount || 2)
})

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
