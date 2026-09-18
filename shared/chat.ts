import type { PlayerColour } from './types'

/**
 * Table talk. One line is either something a player typed or something the room
 * did — a seat filling, a player dropping out — and both are kept in the same
 * list so they read in the order they happened.
 */
export type ChatKind = 'said' | 'joined' | 'left' | 'away' | 'back'

export interface ChatEntry {
  /** Monotonic within a room, so a client can key a list and count what is new. */
  id: number
  kind: ChatKind
  /**
   * The seat this came from, or the one it is about — as numbered *now*. Seat
   * ids are indices and are renumbered whenever the seating changes, so the
   * room carries these along with it; -1 is a speaker who has since left.
   */
  seat: number
  name: string
  colour: PlayerColour
  /** What was typed. Empty for system lines, which each client words itself. */
  text: string
  /** Epoch milliseconds, stamped by the server — never by the sender. */
  at: number
}

/** As many characters as a line of table talk needs, and no more. */
export const CHAT_MAX = 200

/**
 * How much of a room's talk is kept. Lines old enough to have scrolled away are
 * of no use to anyone, and a room is written to the database whole, so the list
 * is not allowed to grow without limit.
 */
export const CHAT_KEEP = 100

/**
 * Characters that are invisible or that change the order the rest renders in:
 * zero-width spaces and joiners, the bidirectional marks, overrides and
 * isolates, and the byte-order mark. They are dropped rather than replaced,
 * because none of them is anything a person meant to type.
 *
 * Written as code points rather than as a regular expression of escapes so that
 * this file stays plain ASCII and says what it means.
 */
const HIDDEN = new Set([
  0x200b, 0x200c, 0x200d, 0x200e, 0x200f, 0x2028, 0x2029, 0x202a, 0x202b, 0x202c, 0x202d, 0x202e,
  0x2066, 0x2067, 0x2068, 0x2069, 0xfeff,
])

/**
 * Clean a message on the way in.
 *
 * This is deliberately *not* HTML escaping, and it does not strip `<` or `>`:
 * "5 < 6" is a thing someone might reasonably type, and the reason a message
 * cannot inject markup is that every client renders it as text — Vue's `{{ }}`
 * escapes it, and nothing in this app puts chat through `v-html`. What is
 * removed here is what plain text can still do on its own: control characters,
 * newlines included, so that one message cannot become ten lines; and the
 * hidden characters above.
 */
export function sanitiseChat(raw: unknown): string {
  const text = typeof raw === 'string' ? raw : ''
  let out = ''
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0
    if (code < 0x20 || code === 0x7f) out += ' '
    else if (!HIDDEN.has(code)) out += ch
  }
  return out.replace(/\s+/g, ' ').trim().slice(0, CHAT_MAX)
}
