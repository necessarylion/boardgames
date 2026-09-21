import { expect, test } from '@playwright/test'

import {
  TOUCH_TARGET,
  expectNoSideScroll,
  hostRoom,
  joinRoom,
  pickGame,
  secondSeat,
} from '../support/table'

/**
 * The room, rather than any one game: hosting, joining, choosing what to play
 * and choosing a colour. It is the only part of the app two people use at the
 * same time before a game exists, and the only part where what one player does
 * has to show up on someone else's screen within the second.
 *
 * Every game shares this screen, so a break here breaks all eight at once —
 * which is why it is worth a spec of its own rather than a line in each.
 */
test.describe('the room', () => {
  test('asks for host or join before it asks for a game', async ({ page }) => {
    await page.goto('/')

    await expect(page.getByRole('button', { name: 'Create room' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Join room' })).toBeVisible()
    // Nothing on the front door names a game, let alone offers one.
    await expect(page.locator('.game-option')).toHaveCount(0)
    await expect(page.locator('.seal')).toHaveCount(0)
    await expectNoSideScroll(page)
  })

  test('lets the host pick the game, and shows it to everyone', async ({ page, browser }) => {
    const code = await hostRoom(page, 'ladders', 'Ada')
    const guest = await secondSeat(browser)

    try {
      await joinRoom(guest.page, 'ladders', code, 'Bo')
      await expect(guest.page.locator('.chosen-name')).toHaveText('Snakes & Ladders')

      // The host changes their mind with the table already seated.
      await pickGame(page, 'monopoly')
      await expect(guest.page.locator('.chosen-name')).toHaveText('Monopoly')
      // Announced, not merely swapped — the guest's whole lobby was replaced
      // underneath them, so the line has to outlive the component.
      await expect(guest.page.locator('.notice')).toContainText('now playing Monopoly')
      // The seats and the room survive the change.
      await expect(guest.page.locator('.code')).toContainText(code.split('').join(''))
      await expect(guest.page.locator('.seat:not(.empty)')).toHaveCount(2)
    } finally {
      await guest.close()
    }
  })

  test('offers the game and the start to the host alone', async ({ page, browser }) => {
    const code = await hostRoom(page, 'coup', 'Ada')
    const guest = await secondSeat(browser)

    try {
      await joinRoom(guest.page, 'coup', code, 'Bo')

      // The shelf is the host's and nobody else's.
      await expect(page.locator('.game-option.chosen')).toHaveCount(1)
      await expect(guest.page.locator('.game-option')).toHaveCount(0)
      await expect(guest.page.locator('.host-picks')).toBeVisible()

      // The guest is shown the button rather than left guessing, and it is dead.
      const start = guest.page.locator('.actions button')
      await expect(start).toContainText('Waiting for the host')
      await expect(start).toBeDisabled()
      await expect(page.getByRole('button', { name: 'Start game' })).toBeEnabled()
    } finally {
      await guest.close()
    }
  })

  test('counts the seats, and counts them again when one leaves', async ({ page, browser }) => {
    const code = await hostRoom(page, 'carnivals', 'Ada')
    const guest = await secondSeat(browser)

    try {
      await expect(page.locator('.count')).toHaveText(/1\s*\/\s*8/)

      await joinRoom(guest.page, 'carnivals', code, 'Bo')
      await expect(page.locator('.count')).toHaveText(/2\s*\/\s*8/)
      await expect(page.locator('.notice')).toContainText('Bo joined')

      await guest.page.getByRole('button', { name: 'Leave' }).click()
      await expect(page.locator('.count')).toHaveText(/1\s*\/\s*8/)
      await expect(page.locator('.notice')).toContainText('Bo left')
    } finally {
      await guest.close()
    }
  })

  test('gives both players a colour of their own, and only their own', async ({ page, browser }) => {
    const code = await hostRoom(page, 'snake', 'Ada')
    const guest = await secondSeat(browser)

    try {
      await joinRoom(guest.page, 'snake', code, 'Bo')

      // One palette per screen: the row you are sitting in.
      for (const seat of [page, guest.page]) {
        await expect(seat.locator('.palette')).toHaveCount(1)
        await expect(seat.locator('.seat.mine .palette')).toBeVisible()
      }

      // The guest takes a colour nobody is wearing; the host sees it arrive.
      const free = guest.page.locator('.pick:not(.taken):not(.worn)').first()
      const colour = await free.getAttribute('aria-label')
      await free.click()
      await expect(guest.page.locator('.pick.worn')).toHaveAttribute('aria-label', colour!)
      await expect(page.locator(`.pick.taken[aria-label="${colour}"]`)).toBeVisible()

      // And the host cannot take it from them.
      await expect(page.locator(`.pick[aria-label="${colour}"]`)).toBeDisabled()
    } finally {
      await guest.close()
    }
  })

  test('gives each player a turn position, and only their own to change', async ({
    page,
    browser,
  }) => {
    const code = await hostRoom(page, 'ladders', 'Ada')
    const guest = await secondSeat(browser)

    try {
      await joinRoom(guest.page, 'ladders', code, 'Bo')

      // One picker per screen — the row you are sitting in — and eight in it.
      for (const seat of [page, guest.page]) {
        await expect(seat.locator('.positions')).toHaveCount(1)
        await expect(seat.locator('.seat.mine .pos')).toHaveCount(8)
      }

      // Seated in the order they arrived.
      await expect(page.locator('.seat', { hasText: 'Ada' }).locator('.pos-chip')).toHaveText('1')
      await expect(page.locator('.seat', { hasText: 'Bo' }).locator('.pos-chip')).toHaveText('2')

      // What the other player holds is shown and dead; the rest are live.
      const hostPos = (n: number) => page.locator('.seat.mine .pos').nth(n - 1)
      await expect(hostPos(1)).toHaveClass(/mine/)
      await expect(hostPos(2)).toBeDisabled()
      await expect(hostPos(5)).toBeEnabled()

      // The guest moves to 5; the host sees it, and 2 falls vacant for them.
      await guest.page.locator('.seat.mine .pos').nth(4).click()
      await expect(page.locator('.seat', { hasText: 'Bo' }).locator('.pos-chip')).toHaveText('5')
      await expect(hostPos(2), 'the position they left is free again').toBeEnabled()
      await expect(hostPos(5), 'and the one they took is not').toBeDisabled()

      // Nobody else moved.
      await expect(page.locator('.seat', { hasText: 'Ada' }).locator('.pos-chip')).toHaveText('1')
    } finally {
      await guest.close()
    }
  })

  test('closes a position on the other screen the moment it is taken', async ({ page, browser }) => {
    const code = await hostRoom(page, 'ladders', 'Ada')
    const guest = await secondSeat(browser)

    try {
      await joinRoom(guest.page, 'ladders', code, 'Bo')

      // Whoever asks first holds it — that race is settled on the server, and
      // `tests/lobby.test.ts` puts the two requests in order to prove it. What
      // matters here is that the other screen stops offering it at once, which
      // is what keeps the race rare in the first place.
      await expect(guest.page.locator('.seat.mine .pos').nth(5)).toBeEnabled()
      await page.locator('.seat.mine .pos').nth(5).click()

      await expect(page.locator('.seat', { hasText: 'Ada' }).locator('.pos-chip')).toHaveText('6')
      await expect(guest.page.locator('.seat.mine .pos').nth(5)).toBeDisabled()
      await expect(guest.page.locator('.seat.mine .pos').nth(5)).toHaveClass(/taken/)
      // And the guest was not moved by any of it.
      await expect(guest.page.locator('.seat', { hasText: 'Bo' }).locator('.pos-chip')).toHaveText(
        '2',
      )
    } finally {
      await guest.close()
    }
  })

  test('shows eight colours nobody can confuse, each one claimable once', async ({
    page,
    browser,
  }) => {
    const code = await hostRoom(page, 'coup', 'Ada')
    const guest = await secondSeat(browser)

    try {
      await joinRoom(guest.page, 'coup', code, 'Bo')

      const swatches = page.locator('.seat.mine .pick')
      await expect(swatches).toHaveCount(8)

      // Every one is named, so the palette is not colour alone.
      const names = await swatches.evaluateAll((els) =>
        els.map((el) => el.getAttribute('aria-label')),
      )
      expect(new Set(names).size, 'eight distinct names').toBe(8)
      expect(names).toEqual(
        expect.arrayContaining(['Red', 'Blue', 'Green', 'Yellow', 'Purple', 'Orange', 'Cyan', 'Pink']),
      )

      // And no two of them are the same colour on screen.
      const fills = await swatches.evaluateAll((els) =>
        els.map((el) => getComputedStyle(el).backgroundColor),
      )
      expect(new Set(fills).size, 'eight distinct fills').toBe(8)

      // The one you wear carries a tick, not just a hue.
      await expect(page.locator('.seat.mine .pick.worn .tick')).toBeVisible()

      // What the other player wears is visible and dead.
      const theirs = await guest.page.locator('.seat.mine .pick.worn').getAttribute('aria-label')
      const sameOnHost = page.locator(`.seat.mine .pick[aria-label="${theirs}"]`)
      await expect(sameOnHost).toBeDisabled()
      await expect(sameOnHost).toHaveClass(/taken/)
    } finally {
      await guest.close()
    }
  })

  test('keeps every lobby control reachable on a phone', async ({ page, browser }) => {
    const code = await hostRoom(page, 'monopoly', 'Ada')
    const guest = await secondSeat(browser)

    try {
      await joinRoom(guest.page, 'monopoly', code, 'Bo')

      for (const seat of [page, guest.page]) {
        await expectNoSideScroll(seat)
        // The four things a lobby is for, all on screen at once. The game shows
        // as a shelf to the host and as a card to everyone else, so the section
        // is what is asserted rather than either shape.
        await expect(seat.locator('.code')).toBeVisible()
        await expect(seat.locator('.game-section')).toBeVisible()
        await expect(seat.locator('.count')).toBeVisible()
        await expect(seat.locator('.seat.mine')).toBeVisible()
        // The start bar is pinned, so it is visible without scrolling for it.
        await expect(seat.locator('.actions button')).toBeInViewport()
      }

      await expect(page.locator('.game-option.chosen')).toBeVisible()
      await expect(guest.page.locator('.chosen-game')).toBeVisible()

      // A colour swatch is a drawn control rather than a written one, so it has
      // to earn its own touch target.
      const swatch = await guest.page.locator('.pick').first().boundingBox()
      expect(swatch, 'a colour swatch is rendered').not.toBeNull()
      const isTouch = test.info().project.use.hasTouch ?? false
      if (isTouch) {
        expect(
          Math.round(Math.min(swatch!.width, swatch!.height)),
          'a colour swatch must be thumb-sized on a touch screen',
        ).toBeGreaterThanOrEqual(TOUCH_TARGET)
      }
    } finally {
      await guest.close()
    }
  })
})

/**
 * The front door on its own. It is the first thing anyone sees and the only
 * screen in the app with nothing behind it, so what it must not do is as
 * important as what it does: no games, no horizontal scroll, and no silent
 * refusals.
 */
test.describe('the landing page', () => {
  test('shows a name, two actions and nothing else, at every phone width', async ({ page }) => {
    await page.goto('/')

    const shapes = [
      { width: 320, height: 568 },
      { width: 375, height: 667 },
      { width: 390, height: 844 },
      { width: 414, height: 896 },
      { width: 768, height: 1024 },
    ]

    for (const size of shapes) {
      await page.setViewportSize(size)
      await expectNoSideScroll(page)

      await expect(page.locator('#player-name')).toBeVisible()
      await expect(page.getByRole('button', { name: 'Create room' })).toBeVisible()
      await expect(page.locator('#room-code')).toBeVisible()
      await expect(page.getByRole('button', { name: 'Join room' })).toBeVisible()

      // Nothing about games reaches this screen.
      await expect(page.locator('.game-option')).toHaveCount(0)
      await expect(page.locator('.seal')).toHaveCount(0)

      // Nothing sticks out of the viewport either.
      const overflow = await page.evaluate(() => {
        const width = document.documentElement.clientWidth
        return [...document.querySelectorAll('.start *')]
          .map((el) => el.getBoundingClientRect())
          .filter((r) => r.width > 0 && (r.left < -1 || r.right > width + 1)).length
      })
      expect(overflow, `nothing may hang off the edge at ${size.width}px`).toBe(0)
    }
  })

  test('is built for a thumb', async ({ page }) => {
    await page.goto('/')
    await page.setViewportSize({ width: 390, height: 844 })

    const isTouch = test.info().project.use.hasTouch ?? false
    test.skip(!isTouch, 'the touch floors only apply to a touch screen')

    for (const name of ['Create room', 'Join room']) {
      const box = (await page.getByRole('button', { name }).boundingBox())!
      expect(Math.round(box.height), `"${name}" must be thumb-sized`).toBeGreaterThanOrEqual(44)
    }
    const field = (await page.locator('#player-name').boundingBox())!
    expect(Math.round(field.height), 'the name box too').toBeGreaterThanOrEqual(44)
  })

  test('says what is wrong, beside the thing that is wrong', async ({ page }) => {
    await page.goto('/')

    // A name is the one thing the screen cannot do without.
    await page.getByRole('button', { name: 'Create room' }).click()
    await expect(page.locator('.error')).toContainText('Enter a name first')
    await expect(page.locator('#player-name')).toHaveAttribute('aria-invalid', 'true')

    await page.locator('#player-name').fill('Ada')
    await expect(page.locator('.error')).toHaveCount(0)

    // A code of the wrong shape is caught before the server is troubled.
    await page.locator('#room-code').fill('AB')
    await page.getByRole('button', { name: 'Join room' }).click()
    await expect(page.locator('.error')).toContainText('four characters')

    // And a room that does not exist is the server's answer, shown in the same
    // place rather than as a toast that has come and gone by the time you look.
    await page.locator('#room-code').fill('ZZZZ')
    await page.getByRole('button', { name: 'Join room' }).click()
    await expect(page.locator('.error')).toContainText('No room with that code')
    await expect(page.locator('.lobby-split')).toHaveCount(0)
  })
})
