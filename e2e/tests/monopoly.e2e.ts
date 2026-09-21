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
 * Monopoly: forty spaces on an 11x11 ring, two dice in the middle, and a table
 * that reorganises itself completely below 960px.
 */
test.describe('Monopoly', () => {
  test('the board is dealt whole and the seat on turn can throw', async ({ page, browser }) => {
    const code = await hostRoom(page, 'monopoly', 'Ada')
    const guest = await secondSeat(browser)

    try {
      await joinRoom(guest.page, 'monopoly', code, 'Bo')
      await startGame(page, [guest.page])

      for (const seat of [page, guest.page]) {
        await expect(seat.locator('.board .space')).toHaveCount(40)
        await expect(seat.locator('.centre-panel .dice')).toBeVisible()
        await expectNoSideScroll(seat)
      }

      // Only one seat is offered the throw, and it is the one on turn.
      const thrower = await seatOnTurn([page, guest.page], /Your turn/)
      const waiting = thrower === page ? guest.page : page
      await expect(waiting.getByRole('button', { name: 'Throw the dice' })).toHaveCount(0)

      await thrower.getByRole('button', { name: 'Throw the dice' }).click()
      // Two dice, two seconds of tumbling and then a walk round the board, with
      // three.js loading cold the first time a context sees it. The budget is
      // for that, not for the server.
      await expect(thrower.locator('.topbar')).toContainText(/threw \d and \d/, { timeout: 60_000 })
    } finally {
      await guest.close()
    }
  })

  test('a phone gets the board, the action and the four tabs', async ({ page, browser }) => {
    compactOnly(960)

    const code = await hostRoom(page, 'monopoly', 'Ada')
    const guest = await secondSeat(browser)

    try {
      await joinRoom(guest.page, 'monopoly', code, 'Bo')
      await startGame(page, [guest.page])

      // Every seat and its cash, above the board.
      await expect(page.locator('.now .now-seat')).toHaveCount(2)
      await expect(page.locator('.now-seat.current')).toHaveCount(1)

      // The prompt has left the middle of the board for the bar beneath it.
      await expect(page.locator('.actions-slot .prompt')).toBeVisible()
      await expect(page.locator('.centre-panel .prompt')).toHaveCount(0)

      // The side columns and the chat, behind four tabs.
      const tabs = page.locator('.tabs .tab')
      await expect(tabs).toHaveCount(4)
      await tabs.nth(1).click()
      await expect(page.locator('.manage.open')).toBeVisible()
      // Near the top of the scrim: its centre is under the open sheet once the
      // sheet has finished sliding up, and a click there is intercepted.
      await page.locator('.sheet-scrim').click({ position: { x: 5, y: 5 } })
      // Hidden, not merely un-opened: the sheet takes a fifth of a second to
      // slide back down, and until it has it is still over the bottom of the
      // board — where the next tap is aimed.
      await expect(page.locator('.manage')).toBeHidden()

      // A tap on a space opens the card a desktop opens on hover.
      await page.locator('.board .space').nth(1).click()
      await expect(page.locator('.detail-sheet')).toBeVisible()
      await page.locator('.detail-scrim').click({ position: { x: 5, y: 5 } })
      await expect(page.locator('.detail-sheet')).toHaveCount(0)

      await expectTouchReady(page)
    } finally {
      await guest.close()
    }
  })

  test('the board keeps its square whatever the screen', async ({ page, browser }) => {
    const code = await hostRoom(page, 'monopoly', 'Ada')
    const guest = await secondSeat(browser)

    try {
      await joinRoom(guest.page, 'monopoly', code, 'Bo')
      await startGame(page, [guest.page])

      const box = await page.locator('.board').boundingBox()
      expect(box).not.toBeNull()
      expect(Math.abs(box!.width - box!.height), 'the board is square').toBeLessThan(2)
      // And it is inside the window, not spilling out of it.
      expect(box!.width).toBeLessThanOrEqual(page.viewportSize()!.width)
    } finally {
      await guest.close()
    }
  })
  test('runs a shot clock when the host asks for one', async ({ page, browser }) => {
    const code = await hostRoom(page, 'monopoly', 'Ada')
    const guest = await secondSeat(browser)

    try {
      // Off by default, and the lobby is the only place to turn it on. There
      // are two periods to set here — a turn's and a bid's — so each is reached
      // through the group it belongs to rather than by its number alone.
      const group = (name: string) => page.locator('.clock-pick', { hasText: name })

      const clock = group('Turn timer').locator('.clock-option', { hasText: '45s' })
      await expect(clock).toBeVisible()
      await clock.click()
      await expect(clock).toHaveClass(/chosen/)

      // An auction runs on its own, shorter window.
      const bids = group('Time to answer a bid')
      await expect(bids).toBeVisible()
      const shorter = bids.locator('.clock-option', { hasText: '15s' })
      await shorter.click()
      await expect(shorter).toHaveClass(/chosen/)

      await joinRoom(guest.page, 'monopoly', code, 'Bo')
      await startGame(page, [guest.page])

      // Both screens count the same period down, in the top bar, the way
      // Samurai's does — it is the same composable behind both.
      for (const seat of [page, guest.page]) {
        const label = seat.locator('.topbar .clock')
        await expect(label).toBeVisible()
        await expect(label).toHaveText(/^0:\d{2}$/)
      }

      // And it is counting, not just showing a number.
      const first = await page.locator('.topbar .clock').innerText()
      await expect
        .poll(async () => page.locator('.topbar .clock').innerText(), { timeout: 5_000 })
        .not.toBe(first)
    } finally {
      await guest.close()
    }
  })
  test('offers a trade from any seat, and needs no end-turn button', async ({ page, browser }) => {
    const code = await hostRoom(page, 'monopoly', 'Ada')
    const guest = await secondSeat(browser)

    try {
      await joinRoom(guest.page, 'monopoly', code, 'Bo')
      await startGame(page, [guest.page])

      // The offer lives with the deeds now, which on a phone means behind the
      // property tab — the same way the chat lives behind its own.
      // Idempotent on purpose: the tab *toggles*, so calling this twice would
      // shut the sheet again and leave the button unclickable.
      const openProperty = async (seat: typeof page) => {
        const tab = seat.locator('.tabs .tab').nth(1)
        if (!(await tab.count())) return
        if (await seat.locator('.manage.open').count()) return
        await tab.click()
        await expect(seat.locator('.manage.open')).toBeVisible()
      }

      // Trading is a conversation, not a move: both seats are offered it,
      // whosever turn it is.
      for (const seat of [page, guest.page]) {
        await openProperty(seat)
        await expect(seat.locator('.manage .trade-open')).toBeVisible()
      }

      // And nothing anywhere ends a turn by hand any more.
      for (const seat of [page, guest.page]) {
        await expect(seat.getByRole('button', { name: 'End turn' })).toHaveCount(0)
      }

      // The seat off turn can open the offer and name the other player.
      const waiting = (await page.locator('.topbar').innerText()).includes('Your turn')
        ? guest.page
        : page
      await openProperty(waiting)
      await waiting.locator('.manage .trade-open').click()
      await expect(waiting.locator('.dialog[role="dialog"]')).toBeVisible()
    } finally {
      await guest.close()
    }
  })
})
