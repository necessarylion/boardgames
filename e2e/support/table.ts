import { expect, type Browser, type Page, test } from '@playwright/test'

/**
 * Seating a table, which every game does the same way: pick the game, name
 * yourself, create a room, have a second browser join it by code, start.
 *
 * Everything below is written against the app's own class names and its English
 * copy. Both are stable — the classes carry the layout and the strings are the
 * catalogue in `src/i18n/en` — and between them they need no test ids added to
 * the app, which is the point: these tests are not allowed to change the game.
 */

export type GameKind =
  | 'samurai'
  | 'halligalli'
  | 'coup'
  | 'carnivals'
  | 'cop'
  | 'snake'
  | 'ladders'
  | 'monopoly'

/**
 * Each game's name on the shelf in the lobby, anchored so that one name cannot
 * match another: "Snake" is a prefix of "Snakes & Ladders".
 */
const GAME_NAME: Record<GameKind, RegExp> = {
  samurai: /^Samurai$/,
  halligalli: /^Halli Galli$/,
  coup: /^Coup$/,
  carnivals: /^Carnivals$/,
  cop: /^COP$/,
  snake: /^Snake$/,
  ladders: /^Snakes & Ladders$/,
  monopoly: /^Monopoly$/,
}

/**
 * Host a room and return its four-letter code.
 *
 * The room comes first and the game second — the front door only asks whether
 * you are hosting or joining, and the shelf of games is in the lobby, where
 * only the host is offered it.
 *
 * The opening roll-off is turned off on the way through. It decides nothing —
 * the engine has already drawn the seat and the ceremony is a replay of it —
 * but it is a two-second overlay over the table, and a test that has to wait it
 * out is a test that flakes. Games that do not offer it simply have no
 * checkbox.
 */
export async function hostRoom(page: Page, kind: GameKind, name: string): Promise<string> {
  await page.goto('/')
  await page.locator('input.field:not(.code)').first().fill(name)
  await page.getByRole('button', { name: 'Create room' }).click()

  const code = page.locator('.lobby-split .code')
  await expect(code).toBeVisible()

  await pickGame(page, kind)

  const diceStart = page.locator('label.check', { hasText: 'Roll for who starts' }).locator('input')
  if (await diceStart.count()) await diceStart.uncheck()

  // Four tiles, one letter each, so the text comes back spaced.
  const text = (await code.innerText()).replace(/\s+/g, '')
  expect(text, 'a room code is four letters').toHaveLength(4)
  return text
}

/**
 * Point the room at a game. The host only: the shelf is not rendered for anyone
 * else, so this fails loudly rather than quietly if handed a guest's page.
 */
export async function pickGame(host: Page, kind: GameKind) {
  const option = host
    .locator('.game-option')
    .filter({ has: host.locator('.option-name', { hasText: GAME_NAME[kind] }) })
  await option.click()
  // The card marks itself as the table's, which is how we know it landed.
  await expect(option).toHaveClass(/chosen/)
}

/**
 * Join an existing room. The invite link is used rather than the code box: it
 * is the way a guest actually arrives, and arriving on one collapses the front
 * door to the single action that applies.
 */
export async function joinRoom(page: Page, kind: GameKind, code: string, name: string) {
  await page.goto(`/?room=${code}&g=${kind}`)
  await page.locator('input.field:not(.code)').first().fill(name)
  await page.getByRole('button', { name: 'Join room' }).click()
  await expect(page.locator('.lobby-split')).toBeVisible()
}

/** A second player, in their own browser context and so with their own seat. */
export async function secondSeat(browser: Browser) {
  const project = test.info().project.use
  const context = await browser.newContext({
    viewport: project.viewport,
    isMobile: project.isMobile,
    hasTouch: project.hasTouch,
    deviceScaleFactor: project.deviceScaleFactor,
    userAgent: project.userAgent,
  })
  const page = await context.newPage()
  return {
    page,
    close: () => context.close().catch(() => undefined),
  }
}

/** Deal, once everyone is seated. The host is the only one who can. */
export async function startGame(host: Page, others: Page[]) {
  // The button is dead until the table has two players, so wait for the guest's
  // seat to arrive rather than racing the websocket.
  await expect(host.locator('.seat:not(.empty)')).toHaveCount(others.length + 1)
  await host.getByRole('button', { name: 'Start game' }).click()

  for (const page of [host, ...others]) {
    // Samurai deals into its draft first; every other game goes to the table.
    await expect(page.locator('.game, .draft')).toBeVisible()
  }
}

/**
 * Skip a test unless the window is narrow enough for the compact layout — the
 * sheets, the tab bar, the docked prompt.
 *
 * Keyed off the width rather than off `isMobile`, because they are different
 * questions: a tablet held sideways at 1024px is a touch screen laid out in
 * three columns, and a mobile-only assertion run there is a false failure.
 * Samurai crosses over at 900px and Monopoly at 960px; each caller says which.
 */
export function compactOnly(breakpoint = 900) {
  const width = test.info().project.use.viewport?.width ?? 0
  test.skip(width > breakpoint, `the compact layout only exists at or below ${breakpoint}px`)
}

/** Nothing on any screen may reach past the right edge of the viewport. */
export async function expectNoSideScroll(page: Page) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }))
  expect(scrollWidth, 'the page must not scroll sideways').toBeLessThanOrEqual(clientWidth + 1)
}

/**
 * Two floors, not one, because the app draws two kinds of button.
 *
 * 44px is the usual guideline and the primary controls are drawn to it — the
 * docked prompt, the tab bar, the sheet buttons. The secondary ones (`.btn
 * .small`: Rules, Pause, Table) are 2.3rem on a touch screen by design, which
 * is 36.8px, and asserting 44 there would be asserting something the design
 * deliberately does not do. So the two are checked separately and the number
 * that is claimed is the number that is true.
 */
export const TOUCH_TARGET = 44
export const SECONDARY_TARGET = 36

/** The two things every table owes a phone: a legible turn and hittable controls. */
export async function expectTouchReady(page: Page) {
  await expect(page.locator('.topbar .turn')).toBeVisible()
  await expectNoSideScroll(page)

  const buttons = page.locator('.game .btn:visible')
  const count = await buttons.count()
  for (let i = 0; i < Math.min(count, 10); i++) {
    const button = buttons.nth(i)
    if (!(await button.boundingBox())) continue
    const secondary = (await button.getAttribute('class'))?.includes('small')
    const floor = secondary ? SECONDARY_TARGET : TOUCH_TARGET
    const label = (await button.innerText()).trim().split('\n')[0] || `button ${i}`

    // Polled rather than measured once. Tables deal, cards fly and sheets
    // slide, and a single measurement can catch a button mid-animation and
    // report a height it does not settle at — which is a flake, not a finding.
    // What matters for a thumb is the size it comes to rest at.
    await expect
      .poll(async () => Math.round((await button.boundingBox())?.height ?? 0), {
        message: `"${label}" must settle at ${floor}px or taller`,
        timeout: 3_000,
      })
      .toBeGreaterThanOrEqual(floor)
  }
}

/** The seat whose turn it is, of the two pages given. */
export async function seatOnTurn(pages: Page[], yours: RegExp): Promise<Page> {
  for (const page of pages) {
    if (await page.locator('.topbar').getByText(yours).count()) return page
  }
  throw new Error('no seat is on turn')
}
