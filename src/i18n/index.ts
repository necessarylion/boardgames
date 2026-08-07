import { computed, ref, watch } from 'vue'

import type { Caste, TileDef } from '@shared/types'
import { en } from './en'
import { my } from './my'

export const LOCALES = ['en', 'my'] as const
export type Locale = (typeof LOCALES)[number]

/** Every message key. English is the catalogue of record; `my` has to match it. */
export type MessageKey = keyof typeof en

/** Endonyms, so the picker reads the same whichever language is active. */
export const LOCALE_NAME: Record<Locale, string> = { en: 'English', my: 'မြန်မာ' }

/** Namespaced next to `samurai.token`, which is where the identity lives. */
const STORAGE_KEY = 'samurai.lang'

const CATALOGUES: Record<Locale, Record<MessageKey, string>> = { en, my }

function isLocale(value: string | null): value is Locale {
  return value !== null && (LOCALES as readonly string[]).includes(value)
}

function stored(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    return isLocale(saved) ? saved : 'en'
  } catch {
    // A browser with storage denied still has to render something.
    return 'en'
  }
}

const current = ref<Locale>(stored())

export const locale = computed<Locale>(() => current.value)

export function setLocale(next: Locale) {
  current.value = next
  try {
    localStorage.setItem(STORAGE_KEY, next)
  } catch {
    // Not being able to remember the choice is not a reason to refuse it.
  }
}

/**
 * Components import `t` directly rather than being handed one through a plugin,
 * so the reactive locale they read is this module's. That is what lets a single
 * component be mounted on its own — as the render tests do — with nothing to
 * install first, and it keeps the whole language layer to one small module.
 */
export function t(key: MessageKey, params?: Record<string, string | number>): string {
  const message = CATALOGUES[current.value][key] ?? en[key] ?? key
  if (!params) return message
  return message.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in params ? String(params[name]) : whole,
  )
}

/**
 * The caste names and the words for their pieces live in `shared/types.ts` in
 * English, because the rules layer is shared with the server. They are mapped to
 * a message here instead, at the point of display.
 */
export const casteName = (caste: Caste): string => t(`caste.name.${caste}`)
export const castePiece = (caste: Caste): string => t(`caste.piece.${caste}`)

/** Sides are named by letter — A, B — so the label reads the same everywhere. */
export const teamName = (team: number): string =>
  t('team.label', { name: String.fromCharCode(65 + team) })

/** A side's custom name if its leader set one, else its letter (Team A, Team B). */
export const teamLabel = (team: number, names?: string[]): string =>
  names?.[team]?.trim() || teamName(team)
/** English wants a lower-case form mid-sentence; Burmese has no such distinction. */
export const casteNameLower = (caste: Caste): string => t(`caste.lower.${caste}`)

/**
 * The hover label for a tile. `tileLabel()` in shared/ words the same thing for
 * the server's play log, which nothing here can translate; this is its display
 * twin, and it keeps that function's `value-name` shape.
 */
export function tileTitle(tile: TileDef): string {
  if (tile.kind === 'switch') return t('tiles.switch.name')
  if (tile.kind === 'move') return t('tiles.move.name')
  if (tile.kind === 'caste') {
    return tile.caste ? `${tile.value}-${castePiece(tile.caste)}` : `${tile.value}`
  }
  return `${tile.value}-${t(`tiles.${tile.kind}.name`)}`
}

/**
 * Just the kind of a tile, with no value attached — what the hand prints under
 * each tile so the pictograms can be learnt. A caste tile is named for its
 * caste's piece, since that is the word the board and the rules both use.
 */
export function tileKindLabel(tile: TileDef): string {
  if (tile.kind === 'caste') return tile.caste ? castePiece(tile.caste) : ''
  return t(`tiles.${tile.kind}.name`)
}

export function useI18n() {
  return { t, locale, setLocale, locales: LOCALES, localeName: LOCALE_NAME }
}

/** Screen readers and line-breaking both key off this. */
watch(
  current,
  (value) => {
    if (typeof document !== 'undefined') document.documentElement.lang = value
  },
  { immediate: true },
)
