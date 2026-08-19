// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { flyGhost } from '../src/composables/useFlight'

/**
 * jsdom has neither layout nor the Web Animations API, so both are stood in for
 * here — the arithmetic between them is the whole of what this file guards.
 */
function box(rect: { x: number; y: number; w: number; h: number }): HTMLElement {
  const el = document.createElement('div')
  el.getBoundingClientRect = () =>
    ({ left: rect.x, top: rect.y, width: rect.w, height: rect.h }) as DOMRect
  document.body.append(el)
  return el
}

interface FakeAnimation {
  frames: Keyframe[]
  onfinish: (() => void) | null
}

const animations: FakeAnimation[] = []

Element.prototype.animate = function (frames: Keyframe[] | PropertyIndexedKeyframes | null) {
  const animation: FakeAnimation = { frames: frames as Keyframe[], onfinish: null }
  animations.push(animation)
  return animation as unknown as Animation
}

afterEach(() => {
  document.body.innerHTML = ''
  animations.length = 0
  vi.unstubAllGlobals()
})

describe('flyGhost', () => {
  it('flies a clone between the two centres and clears up after itself', () => {
    const from = box({ x: 0, y: 200, w: 50, h: 50 })
    from.append(document.createElement('span'))
    const to = box({ x: 300, y: 0, w: 20, h: 20 })

    flyGhost({ from, to })

    const ghost = document.body.lastElementChild as HTMLElement
    expect(ghost.querySelector('span')).not.toBeNull()
    // Laid over the source: 0 + 50/2 - 50/2, 200 + 50/2 - 50/2.
    expect(ghost.style.left).toBe('0px')
    expect(ghost.style.top).toBe('200px')

    // Centre to centre: (300 + 10) - (0 + 25), (0 + 10) - (200 + 25).
    expect(animations[0].frames.at(-1)!.transform).toContain('translate(285px, -215px)')

    animations[0].onfinish!()
    expect(document.body.contains(ghost)).toBe(false)
  })

  it('lays the ghost out at the larger end, so it only ever scales down', () => {
    // A 20px clone starting at two fifths of a 100px hex, landing at its own size.
    const from = box({ x: 0, y: 0, w: 100, h: 100 })
    const to = box({ x: 0, y: 0, w: 20, h: 20 })
    const node = box({ x: 0, y: 0, w: 20, h: 20 })

    flyGhost({ from, to, node, startFit: 0.4 })

    expect((document.body.lastElementChild as HTMLElement).style.width).toBe('40px')
    const frames = animations[0].frames
    expect(frames[0].transform).toContain('scale(1)') // 40 of 40
    expect(frames.at(-1)!.transform).toContain('scale(0.45)') // 20 of 40, less the landing drop
  })

  it('does nothing without a target or without layout', () => {
    flyGhost({ from: box({ x: 0, y: 0, w: 10, h: 10 }), to: null })
    flyGhost({ from: box({ x: 0, y: 0, w: 0, h: 0 }), to: box({ x: 0, y: 0, w: 10, h: 10 }) })
    expect(animations).toHaveLength(0)
  })

  it('stays still for a reader who has asked for less motion', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    flyGhost({ from: box({ x: 0, y: 0, w: 10, h: 10 }), to: box({ x: 9, y: 9, w: 10, h: 10 }) })
    expect(animations).toHaveLength(0)
  })
})
