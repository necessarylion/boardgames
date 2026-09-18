import { expect, test } from '@playwright/test'

import {
  compactOnly,
  expectNoSideScroll,
  expectTouchReady,
  hostRoom,
  joinRoom,
  seatOnTurn,
  secondSeat,
  startGame,
} from '../support/table'

/**
 * Snakes & Ladders: a die, a track, and a token per seat. The die is a three.js
 * one loaded with the table rather than with the app, so the first thing worth
 * proving is that it arrives at all.
 */
test.describe('Snakes and Ladders', () => {
  test('lays out the track and lets the seat on turn roll', async ({ page, browser }) => {
    const code = await hostRoom(page, 'ladders', 'Ada')
    const guest = await secondSeat(browser)

    try {
      await joinRoom(guest.page, 'ladders', code, 'Bo')
      await startGame(page, [guest.page])

      for (const seat of [page, guest.page]) {
        await expect(seat.locator('.game')).toBeVisible()
        await expect(seat.locator('.board')).toBeVisible()
        await expectNoSideScroll(seat)
      }

      const roller = await seatOnTurn([page, guest.page], /Your turn/)
      const waiting = roller === page ? guest.page : page

      // The button is on both screens; only one of them may press it.
      const roll = (seat: typeof page) => seat.getByRole('button', { name: 'Roll', exact: true })
      await expect(roll(roller)).toBeEnabled()
      await expect(roll(waiting)).toBeDisabled()

      await roll(roller).click()
      // The die tumbles, the token walks, and only then does the turn pass. The
      // budget is for the animation, not for the server, which settled the
      // throw before any of it started.
      await expect(waiting.locator('.topbar')).toContainText('Your turn', { timeout: 60_000 })
    } finally {
      await guest.close()
    }
  })

  test('keeps the roll within a thumb of the board on a phone', async ({ page, browser }) => {
    compactOnly()

    const code = await hostRoom(page, 'ladders', 'Ada')
    const guest = await secondSeat(browser)

    try {
      await joinRoom(guest.page, 'ladders', code, 'Bo')
      await startGame(page, [guest.page])
      await expectTouchReady(page)
    } finally {
      await guest.close()
    }
  })
  /*
   * The widths the brief names, plus the tablet. Run in one table rather than
   * one per size: seating two browsers is the slow part, and the board is laid
   * out by CSS, so resizing the same page tests the same thing.
   */
  test('fits the board to every common phone width, upright and sideways', async ({
    page,
    browser,
  }) => {
    const code = await hostRoom(page, 'ladders', 'Ada')
    const guest = await secondSeat(browser)

    try {
      await joinRoom(guest.page, 'ladders', code, 'Bo')
      await startGame(page, [guest.page])

      const board = page.locator('.board')
      await expect(board).toBeVisible()

      // Real device shapes, not one height for all of them: at 768x720 the
      // window is landscape, which is a different layout and a different test.
      const shapes = [
        { width: 320, height: 568 },
        { width: 375, height: 667 },
        { width: 390, height: 844 },
        { width: 414, height: 896 },
        { width: 768, height: 1024 },
      ]

      for (const { width, height } of shapes) {
        await page.setViewportSize({ width, height })
        await expectNoSideScroll(page)

        const box = (await board.boundingBox())!
        expect(box, `a board at ${width}px`).not.toBeNull()
        expect(box.width, `the board must fit ${width}px`).toBeLessThanOrEqual(width)
        expect(box.width, `the board must be worth looking at ${width}px`).toBeGreaterThan(
          Math.min(width, 700) * 0.5,
        )

        // The track is square-ish — ten rows and ten columns, plus the start
        // lane — so a box far off that ratio means it has been stretched.
        const ratio = box.width / box.height
        expect(ratio, `the board keeps its shape at ${width}px`).toBeGreaterThan(0.85)
        expect(ratio, `the board keeps its shape at ${width}px`).toBeLessThan(1.25)

        // The roll is the whole of what a player does here, so it has to be
        // reachable without hunting for it.
        await expect(page.getByRole('button', { name: 'Roll', exact: true })).toBeVisible()
        await expect(page.locator('.topbar .turn')).toBeVisible()
      }

      // Held sideways, the height is what is scarce: the board must fit it
      // rather than running off the bottom of a page that has to be scrolled.
      await page.setViewportSize({ width: 844, height: 390 })
      await expectNoSideScroll(page)

      const sideways = (await board.boundingBox())!
      expect(sideways.height, 'the board fits a landscape phone').toBeLessThanOrEqual(390)
      await expect(page.getByRole('button', { name: 'Roll', exact: true })).toBeInViewport()
      await expect(page.locator('.topbar .turn')).toBeInViewport()
    } finally {
      await guest.close()
    }
  })
})
