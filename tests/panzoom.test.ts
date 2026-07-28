// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { mount } from '@vue/test-utils'

import { usePanZoom, type Bounds } from '../src/composables/usePanZoom'

// The container is deliberately a different shape from the board, so the
// "no letterboxing" behaviour is actually exercised.
const CONTENT: Bounds = { x: 0, y: 0, width: 400, height: 300 }
const RECT = { left: 0, top: 0, width: 900, height: 600 }

// jsdom has no layout, so every element reports the same fixed box. This has to
// be in place before mounting: the composable measures on mount.
beforeEach(() => {
  Element.prototype.getBoundingClientRect = () =>
    ({
      ...RECT,
      right: RECT.left + RECT.width,
      bottom: RECT.top + RECT.height,
      x: RECT.left,
      y: RECT.top,
      toJSON: () => ({}),
    }) as DOMRect
})

function parse(viewBox: string) {
  const [x, y, width, height] = viewBox.split(' ').map(Number)
  return { x, y, width, height }
}

/** Mount the composable against an element with a known, fixed size. */
function harness(content: Bounds = CONTENT) {
  let api!: ReturnType<typeof usePanZoom>
  const component = defineComponent({
    setup() {
      const frame = ref<HTMLElement | null>(null)
      api = usePanZoom(frame, ref(content))
      return () => h('div', { ref: frame })
    },
  })
  const wrapper = mount(component, { attachTo: document.body })
  return { api, wrapper }
}

const pointer = (id: number, x: number, y: number, currentTarget?: Element) =>
  ({
    pointerId: id,
    clientX: x,
    clientY: y,
    pointerType: 'touch',
    button: 0,
    currentTarget,
  }) as unknown as PointerEvent

/** Stands in for the SVG, recording which pointers it captured. */
function captureSpy() {
  const captured = new Set<number>()
  const element = {
    hasPointerCapture: (id: number) => captured.has(id),
    setPointerCapture: (id: number) => captured.add(id),
  } as unknown as Element
  return { element, captured }
}

const clickEvent = (onStop: () => void) =>
  ({ stopPropagation: onStop, preventDefault: () => {} }) as unknown as MouseEvent

describe('board pan and zoom', () => {
  it('frames the whole board at rest, matching the container aspect', () => {
    const { api } = harness()
    const view = parse(api.viewBox.value)

    // The container is wider than the board, so the view widens rather than
    // letterboxing — and the board stays centred inside it.
    expect(view.height).toBeCloseTo(CONTENT.height)
    expect(view.width).toBeCloseTo(CONTENT.height * (RECT.width / RECT.height))
    expect(view.x + view.width / 2).toBeCloseTo(CONTENT.x + CONTENT.width / 2)
    expect(view.y + view.height / 2).toBeCloseTo(CONTENT.y + CONTENT.height / 2)
    expect(api.zoom.value).toBe(1)
  })

  it('shows a smaller area as it zooms in', () => {
    const { api } = harness()
    const before = parse(api.viewBox.value)
    api.zoomIn()
    const after = parse(api.viewBox.value)

    expect(api.zoom.value).toBeGreaterThan(1)
    expect(after.width).toBeLessThan(before.width)
    expect(after.height).toBeLessThan(before.height)
  })

  it('will not zoom out past the fitted view', () => {
    const { api } = harness()
    api.zoomOut()
    api.zoomOut()
    expect(api.zoom.value).toBe(1)
    expect(api.canZoomOut.value).toBe(false)
  })

  it('keeps the point under the cursor fixed while wheel-zooming', () => {
    const { api } = harness()
    const anchor = { x: 200, y: 150 }
    const contentAt = (view: ReturnType<typeof parse>) => ({
      x: view.x + (anchor.x / RECT.width) * view.width,
      y: view.y + (anchor.y / RECT.height) * view.height,
    })

    const before = contentAt(parse(api.viewBox.value))
    api.handlers.onWheel({
      deltaY: -300,
      clientX: anchor.x,
      clientY: anchor.y,
      preventDefault() {},
    } as WheelEvent)
    const after = contentAt(parse(api.viewBox.value))

    expect(api.zoom.value).toBeGreaterThan(1)
    expect(after.x).toBeCloseTo(before.x, 4)
    expect(after.y).toBeCloseTo(before.y, 4)
  })

  it('pans with a drag once zoomed in, and reports the drag', () => {
    const { api } = harness()
    api.zoomIn()
    const before = parse(api.viewBox.value)

    api.handlers.onPointerdown(pointer(1, 400, 300))
    api.handlers.onPointermove(pointer(1, 340, 260))
    const after = parse(api.viewBox.value)
    api.handlers.onPointerup(pointer(1, 340, 260))

    expect(api.dragging.value).toBe(true)
    // Dragging left moves the view right across the board.
    expect(after.x).toBeGreaterThan(before.x)
    expect(after.y).toBeGreaterThan(before.y)
  })

  it('treats a press that barely moves as a click, not a drag', () => {
    const { api } = harness()
    api.zoomIn()
    const before = api.viewBox.value

    api.handlers.onPointerdown(pointer(1, 400, 300))
    api.handlers.onPointermove(pointer(1, 402, 301))
    api.handlers.onPointerup(pointer(1, 402, 301))

    expect(api.dragging.value).toBe(false)
    expect(api.viewBox.value).toBe(before)
  })

  // Hardly anyone clicks without the pointer creeping a few pixels, and every
  // one of those that reads as a drag silently eats the tile placement. These
  // are the wobbles a hand actually produces, on both axes at once.
  it.each([
    [5, 2],
    [3, 5],
    [6, 6],
    [-7, 4],
  ])('still places a tile when the click drifts by (%i, %i)', (dx, dy) => {
    const { api } = harness()
    api.zoomIn()

    api.handlers.onPointerdown(pointer(1, 400, 300))
    api.handlers.onPointermove(pointer(1, 400 + dx, 300 + dy))
    api.handlers.onPointerup(pointer(1, 400 + dx, 300 + dy))

    expect(api.dragging.value).toBe(false)

    let stopped = false
    api.onClickCapture(clickEvent(() => (stopped = true)))
    expect(stopped, 'the click reached the board and placed the tile').toBe(false)
  })

  // A captured pointer takes the click with it: the browser retargets the
  // compatibility mouse events to the capturing element, so a hex never sees
  // the click that was meant to place a tile on it. Capture has to wait until
  // the press has proved itself a drag.
  it('does not capture the pointer on a press that turns out to be a click', () => {
    const { api } = harness()
    const { element, captured } = captureSpy()
    api.zoomIn()

    api.handlers.onPointerdown(pointer(1, 400, 300, element))
    expect(captured.has(1), 'a press alone must not capture').toBe(false)

    api.handlers.onPointermove(pointer(1, 403, 302, element))
    api.handlers.onPointerup(pointer(1, 403, 302, element))
    expect(captured.has(1), 'a wobble must not capture either').toBe(false)
  })

  it('captures the pointer once a press becomes a drag', () => {
    const { api } = harness()
    const { element, captured } = captureSpy()
    api.zoomIn()

    api.handlers.onPointerdown(pointer(1, 400, 300, element))
    api.handlers.onPointermove(pointer(1, 340, 260, element))

    expect(api.dragging.value).toBe(true)
    expect(captured.has(1), 'a pan must keep following the pointer off-board').toBe(true)
  })

  it('still treats a deliberate pan as a drag', () => {
    const { api } = harness()
    api.zoomIn()

    api.handlers.onPointerdown(pointer(1, 400, 300))
    api.handlers.onPointermove(pointer(1, 386, 292))

    expect(api.dragging.value).toBe(true)
    let stopped = false
    api.onClickCapture(clickEvent(() => (stopped = true)))
    expect(stopped, 'a real pan must not place a tile').toBe(true)
  })

  it('swallows the click that ends a drag so no tile is placed', () => {
    const { api } = harness()
    api.zoomIn()
    api.handlers.onPointerdown(pointer(1, 400, 300))
    api.handlers.onPointermove(pointer(1, 300, 300))

    let stopped = false
    api.onClickCapture(clickEvent(() => (stopped = true)))
    expect(stopped).toBe(true)

    // The next click, with no drag before it, passes straight through.
    let stoppedAgain = false
    api.onClickCapture(clickEvent(() => (stoppedAgain = true)))
    expect(stoppedAgain).toBe(false)
  })

  it('zooms with a two-finger pinch', () => {
    const { api } = harness()
    api.handlers.onPointerdown(pointer(1, 300, 300))
    api.handlers.onPointerdown(pointer(2, 500, 300))
    // Spread the fingers to twice the distance.
    api.handlers.onPointermove(pointer(1, 200, 300))
    api.handlers.onPointermove(pointer(2, 600, 300))

    expect(api.zoom.value).toBeCloseTo(2, 1)
    api.handlers.onPointerup(pointer(1, 200, 300))
    api.handlers.onPointerup(pointer(2, 600, 300))
  })

  it('returns to the fitted view when reset', () => {
    const { api } = harness()
    const fitted = api.viewBox.value
    api.zoomIn()
    api.handlers.onPointerdown(pointer(1, 400, 300))
    api.handlers.onPointermove(pointer(1, 250, 200))
    api.handlers.onPointerup(pointer(1, 250, 200))

    api.reset()
    expect(api.zoom.value).toBe(1)
    expect(api.viewBox.value).toBe(fitted)
  })

  it('keeps the board from being dragged out of sight', () => {
    const { api } = harness()
    api.zoomIn()
    // Fling far past the edge of the board in several steps.
    api.handlers.onPointerdown(pointer(1, 400, 300))
    for (let i = 0; i < 12; i++) {
      api.handlers.onPointermove(pointer(1, 400 - i * 200, 300 - i * 200))
    }
    api.handlers.onPointerup(pointer(1, 0, 0))

    const view = parse(api.viewBox.value)
    // Some part of the board is still inside the view.
    expect(view.x).toBeLessThan(CONTENT.x + CONTENT.width)
    expect(view.x + view.width).toBeGreaterThan(CONTENT.x)
    expect(view.y).toBeLessThan(CONTENT.y + CONTENT.height)
    expect(view.y + view.height).toBeGreaterThan(CONTENT.y)
  })
})
