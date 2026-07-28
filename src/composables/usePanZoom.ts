import { computed, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue'

export interface Bounds {
  x: number
  y: number
  width: number
  height: number
}

export interface PanZoomOptions {
  min?: number
  max?: number
  /** Movement in screen pixels before a press counts as a drag, not a click. */
  dragThreshold?: number
}

/**
 * Pan and zoom for an SVG, driven by its `viewBox`.
 *
 * The view box is always given the same aspect ratio as its container, so it
 * never letterboxes and screen coordinates map to content coordinates with a
 * plain linear transform — which is what makes anchored zooming (keeping the
 * point under the cursor or pinch still) exact rather than approximate.
 */
export function usePanZoom(
  container: Ref<HTMLElement | null>,
  content: Ref<Bounds>,
  options: PanZoomOptions = {},
) {
  const MIN = options.min ?? 1
  const MAX = options.max ?? 6
  const DRAG_THRESHOLD = options.dragThreshold ?? 4

  // Seeded with a sensible shape so the first render is correct even before the
  // element has been measured (and under test runners with no layout).
  const size = ref({ width: 1000, height: 700 })
  const zoom = ref(1)
  const centre = ref({ x: 0, y: 0 })
  /** True while the current press has moved far enough to be a drag. */
  const dragging = ref(false)

  /** The view box that frames the whole board at zoom 1. */
  const fitted = computed<Bounds>(() => {
    const aspect = Math.max(size.value.width, 1) / Math.max(size.value.height, 1)
    const c = content.value
    let width = Math.max(c.width, 1)
    let height = Math.max(c.height, 1)
    if (width / height > aspect) height = width / aspect
    else width = height * aspect
    return {
      x: c.x + c.width / 2 - width / 2,
      y: c.y + c.height / 2 - height / 2,
      width,
      height,
    }
  })

  const view = computed<Bounds>(() => {
    const f = fitted.value
    const width = f.width / zoom.value
    const height = f.height / zoom.value
    return { x: centre.value.x - width / 2, y: centre.value.y - height / 2, width, height }
  })

  const viewBox = computed(
    () => `${view.value.x} ${view.value.y} ${view.value.width} ${view.value.height}`,
  )

  const canZoomIn = computed(() => zoom.value < MAX - 1e-6)
  const canZoomOut = computed(() => zoom.value > MIN + 1e-6)

  function contentCentre() {
    const c = content.value
    return { x: c.x + c.width / 2, y: c.y + c.height / 2 }
  }

  function reset() {
    zoom.value = 1
    centre.value = contentCentre()
  }

  /** Keep the board from being dragged off into empty space. */
  function clampCentre() {
    const c = content.value
    const v = view.value
    const slackX = v.width * 0.3
    const slackY = v.height * 0.3
    const minX = c.x - slackX + v.width / 2
    const maxX = c.x + c.width + slackX - v.width / 2
    const minY = c.y - slackY + v.height / 2
    const maxY = c.y + c.height + slackY - v.height / 2
    const middle = contentCentre()
    centre.value = {
      x: minX > maxX ? middle.x : Math.min(Math.max(centre.value.x, minX), maxX),
      y: minY > maxY ? middle.y : Math.min(Math.max(centre.value.y, minY), maxY),
    }
  }

  /** Convert a client (screen) point into board coordinates. */
  function toContent(clientX: number, clientY: number) {
    const rect = container.value?.getBoundingClientRect()
    const v = view.value
    if (!rect || rect.width < 1 || rect.height < 1) {
      return { x: centre.value.x, y: centre.value.y }
    }
    return {
      x: v.x + ((clientX - rect.left) / rect.width) * v.width,
      y: v.y + ((clientY - rect.top) / rect.height) * v.height,
    }
  }

  /** Zoom so that the board point under `clientX/Y` stays under it. */
  function zoomAt(next: number, clientX: number, clientY: number) {
    const target = Math.min(Math.max(next, MIN), MAX)
    if (target === zoom.value) return
    const before = toContent(clientX, clientY)
    zoom.value = target
    const after = toContent(clientX, clientY)
    centre.value = {
      x: centre.value.x + (before.x - after.x),
      y: centre.value.y + (before.y - after.y),
    }
    clampCentre()
  }

  /** Zoom about the middle of the viewport, for the on-screen buttons. */
  function zoomBy(factor: number) {
    const rect = container.value?.getBoundingClientRect()
    const cx = rect ? rect.left + rect.width / 2 : 0
    const cy = rect ? rect.top + rect.height / 2 : 0
    zoomAt(zoom.value * factor, cx, cy)
  }

  function panByScreen(dx: number, dy: number) {
    const rect = container.value?.getBoundingClientRect()
    if (!rect || rect.width < 1 || rect.height < 1) return
    const v = view.value
    centre.value = {
      x: centre.value.x - (dx / rect.width) * v.width,
      y: centre.value.y - (dy / rect.height) * v.height,
    }
    clampCentre()
  }

  // --- pointer input -------------------------------------------------------

  const pointers = new Map<number, { x: number; y: number }>()
  let pinchDistance = 0
  let pinchZoom = 1
  let pressOrigin = { x: 0, y: 0 }

  function spread() {
    const [a, b] = [...pointers.values()]
    return Math.hypot(a.x - b.x, a.y - b.y)
  }

  function midpoint() {
    const [a, b] = [...pointers.values()]
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
  }

  function onPointerDown(event: PointerEvent) {
    // Ignore secondary mouse buttons so right-click menus still work.
    if (event.pointerType === 'mouse' && event.button !== 0) return
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (pointers.size === 1) {
      pressOrigin = { x: event.clientX, y: event.clientY }
      dragging.value = false
    }
    if (pointers.size === 2) {
      pinchDistance = spread()
      pinchZoom = zoom.value
      dragging.value = true
    }
    ;(event.currentTarget as Element | null)?.setPointerCapture?.(event.pointerId)
  }

  function onPointerMove(event: PointerEvent) {
    const previous = pointers.get(event.pointerId)
    if (!previous) return
    const next = { x: event.clientX, y: event.clientY }
    pointers.set(event.pointerId, next)

    if (pointers.size === 1) {
      if (
        Math.abs(next.x - pressOrigin.x) > DRAG_THRESHOLD ||
        Math.abs(next.y - pressOrigin.y) > DRAG_THRESHOLD
      ) {
        dragging.value = true
      }
      if (dragging.value) panByScreen(next.x - previous.x, next.y - previous.y)
      return
    }

    if (pointers.size === 2 && pinchDistance > 0) {
      const mid = midpoint()
      zoomAt((pinchZoom * spread()) / pinchDistance, mid.x, mid.y)
    }
  }

  function endPointer(event: PointerEvent) {
    pointers.delete(event.pointerId)
    if (pointers.size < 2) pinchDistance = 0
  }

  function onWheel(event: WheelEvent) {
    event.preventDefault()
    // Trackpad pinches arrive as ctrl+wheel; both gestures zoom.
    zoomAt(zoom.value * Math.exp(-event.deltaY * 0.0018), event.clientX, event.clientY)
  }

  /**
   * Swallow the click that ends a drag, so dragging across the board never
   * places a tile. Must be bound in the capture phase, above the hexes.
   */
  function onClickCapture(event: MouseEvent) {
    if (!dragging.value) return
    event.stopPropagation()
    event.preventDefault()
    dragging.value = false
  }

  // --- sizing --------------------------------------------------------------

  let observer: ResizeObserver | null = null

  function measure() {
    const rect = container.value?.getBoundingClientRect()
    if (rect && rect.width >= 1 && rect.height >= 1) {
      size.value = { width: rect.width, height: rect.height }
    }
  }

  onMounted(() => {
    measure()
    if (typeof ResizeObserver !== 'undefined' && container.value) {
      observer = new ResizeObserver(measure)
      observer.observe(container.value)
    } else {
      window.addEventListener('resize', measure)
    }
  })

  onBeforeUnmount(() => {
    observer?.disconnect()
    window.removeEventListener('resize', measure)
  })

  // A different board (a new game, or a different player count) reframes.
  watch(content, reset, { immediate: true })

  return {
    viewBox,
    zoom,
    dragging,
    canZoomIn,
    canZoomOut,
    reset,
    zoomIn: () => zoomBy(1.35),
    zoomOut: () => zoomBy(1 / 1.35),
    handlers: {
      onPointerdown: onPointerDown,
      onPointermove: onPointerMove,
      onPointerup: endPointer,
      onPointercancel: endPointer,
      onPointerleave: endPointer,
      onWheel,
    },
    onClickCapture,
  }
}
