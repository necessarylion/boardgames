/**
 * A ghost of something already on screen, thrown from one element to another.
 *
 * The ghost is a clone rather than markup of its own, so nothing here knows what
 * a tile or a caste piece looks like — whatever is rendered is what flies. It
 * works in screen coordinates throughout, because the two ends of every flight
 * live in different spaces: the board is an SVG viewBox that pans and zooms,
 * while the hand and the topbar are plain DOM.
 */
export interface Flight {
  /** Where the ghost starts; also the node cloned, unless `node` says otherwise. */
  from: Element | null
  /** Where it lands. */
  to: Element | null
  /** Clone this instead of `from` — for a piece that has already left the board. */
  node?: Element | null
  /**
   * How much of each endpoint's width the ghost covers at that end of the
   * flight. Left out, it keeps the clone's own size there.
   */
  startFit?: number
  endFit?: number
  duration?: number
  delay?: number
  /** Bounce the target as the ghost lands, so the count it changes is noticed. */
  pulse?: boolean
}

export function flyGhost({
  from,
  to,
  node,
  startFit,
  endFit,
  duration = 460,
  delay = 0,
  pulse = false,
}: Flight): void {
  const source = node ?? from
  if (!from || !to || !source) return
  // Absent under jsdom, and unwanted by a reader who has asked for less motion.
  if (typeof source.animate !== 'function') return
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return

  const a = from.getBoundingClientRect()
  const b = to.getBoundingClientRect()
  const own = source.getBoundingClientRect()
  if (!a.width || !b.width || !own.width) return

  // Laid out at the larger end and scaled down to the other, never up: a clone
  // scaled past its layout size is rasterised small and arrives blurred.
  const startWidth = startFit ? a.width * startFit : own.width
  const endWidth = endFit ? b.width * endFit : own.width
  const width = Math.max(startWidth, endWidth)
  const height = width * (own.height / own.width)

  const ghost = document.createElement('div')
  ghost.append(source.cloneNode(true))
  ghost.style.cssText =
    `position:fixed;margin:0;pointer-events:none;z-index:60;transform-origin:center;` +
    `left:${a.left + a.width / 2 - width / 2}px;top:${a.top + a.height / 2 - height / 2}px;` +
    `width:${width}px;height:${height}px;`
  // The clone carries pixel sizes from wherever it was copied, which would leave
  // it its old size inside a ghost laid out for the board.
  for (const el of [ghost.firstElementChild, ...ghost.querySelectorAll('svg')]) {
    if (el instanceof HTMLElement || el instanceof SVGElement) {
      el.style.width = '100%'
      el.style.height = '100%'
    }
  }
  document.body.append(ghost)

  const dx = b.left + b.width / 2 - (a.left + a.width / 2)
  const dy = b.top + b.height / 2 - (a.top + a.height / 2)
  const start = startWidth / width
  const end = endWidth / width
  // Thrown rather than dragged: the arc rises with the distance covered.
  const lift = -Math.min(150, 40 + Math.hypot(dx, dy) * 0.14)
  const near = 'drop-shadow(0 1px 2px rgba(58, 42, 24, 0.35))'

  const flight = ghost.animate(
    [
      { transform: `translate(0, 0) scale(${start})`, filter: near },
      {
        transform: `translate(${dx / 2}px, ${dy / 2 + lift}px) scale(${Math.max(start, end) * 1.15})`,
        filter: 'drop-shadow(0 16px 14px rgba(58, 42, 24, 0.4))',
        offset: 0.55,
      },
      { transform: `translate(${dx}px, ${dy}px) scale(${end})`, filter: near, opacity: 1, offset: 0.88 },
      { transform: `translate(${dx}px, ${dy}px) scale(${end * 0.9})`, opacity: 0 },
    ],
    { duration, delay, easing: 'cubic-bezier(0.34, 0.7, 0.3, 1)', fill: 'both' },
  )

  flight.onfinish = () => {
    ghost.remove()
    if (!pulse || typeof to.animate !== 'function') return
    to.animate(
      [{ transform: 'scale(1)' }, { transform: 'scale(1.45)', offset: 0.35 }, { transform: 'scale(1)' }],
      { duration: 340, easing: 'ease-out' },
    )
  }
}
