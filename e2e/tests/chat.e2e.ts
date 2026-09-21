import { expect, test, type Page } from '@playwright/test'

import { hostRoom, joinRoom, secondSeat, startGame } from '../support/table'

/**
 * Monopoly's table talk, which is the only thing in the app one player types
 * and another reads. Two browsers is the whole point: a message that only ever
 * appears in the tab that sent it would pass every unit test there is.
 */

/** The chat lives behind a tab on a phone and beside the log on a desktop. */
async function openChat(page: Page) {
  const tab = page.locator('.tabs .tab', { hasText: 'Chat' })
  if (await tab.count()) await tab.click()
  else await page.locator('.switch-tab', { hasText: 'Chat' }).click()
  await expect(page.locator('.chat .composer')).toBeVisible()
}

async function say(page: Page, text: string) {
  await page.locator('#chat-input').fill(text)
  await page.locator('.chat .send').click()
}

test.describe('Monopoly chat', () => {
  test('carries a message from one seat to the other', async ({ page, browser }) => {
    const code = await hostRoom(page, 'monopoly', 'Ada')
    const guest = await secondSeat(browser)

    try {
      await joinRoom(guest.page, 'monopoly', code, 'Bo')
      await startGame(page, [guest.page])

      await openChat(page)
      await openChat(guest.page)

      await say(page, 'Trade you Orange for a station?')
      // The sender sees it because the server sent it back, not because the
      // page put it there — both screens read the same broadcast.
      for (const seat of [page, guest.page]) {
        const line = seat.locator('.chat .said').last()
        await expect(line).toContainText('Trade you Orange for a station?')
        await expect(line).toContainText('Ada')
        // Stamped by the server, and shown as a clock.
        await expect(line.locator('time')).toHaveText(/^\d{2}:\d{2}$/)
      }

      await say(guest.page, 'Not a chance.')
      await expect(page.locator('.chat .said').last()).toContainText('Not a chance.')
    } finally {
      await guest.close()
    }
  })

  test('says who arrived, and will not send an empty line', async ({ page, browser }) => {
    const code = await hostRoom(page, 'monopoly', 'Ada')
    const guest = await secondSeat(browser)

    try {
      await joinRoom(guest.page, 'monopoly', code, 'Bo')
      await startGame(page, [guest.page])
      await openChat(page)

      // The room speaks for itself when a seat fills — once per seat, so the
      // line wanted is named rather than being the only one there.
      await expect(page.locator('.chat .system', { hasText: 'Bo joined the table' })).toBeVisible()
      await expect(page.locator('.chat .system', { hasText: 'Ada joined the table' })).toBeVisible()

      const send = page.locator('.chat .send')
      await expect(send, 'nothing typed, nothing to send').toBeDisabled()
      await page.locator('#chat-input').fill('   ')
      await expect(send, 'whitespace is not a message').toBeDisabled()

      await page.locator('#chat-input').fill('real')
      await expect(send).toBeEnabled()
    } finally {
      await guest.close()
    }
  })

  test('renders a message as text, never as markup', async ({ page, browser }) => {
    const code = await hostRoom(page, 'monopoly', 'Ada')
    const guest = await secondSeat(browser)

    try {
      await joinRoom(guest.page, 'monopoly', code, 'Bo')
      await startGame(page, [guest.page])
      await openChat(page)
      await openChat(guest.page)

      const attack = '<img src=x onerror="window.__owned = true"><b>bold?</b>'
      await say(page, attack)

      const line = guest.page.locator('.chat .said').last()
      // Shown exactly as typed, and as characters rather than elements.
      await expect(line).toContainText('<b>bold?</b>')
      expect(await line.locator('b').count(), 'no element was created').toBe(0)
      expect(await line.locator('img').count(), 'no element was created').toBe(0)
      expect(await guest.page.evaluate(() => '__owned' in window)).toBe(false)
    } finally {
      await guest.close()
    }
  })

  test('counts what arrives behind a shut panel', async ({ page, browser }) => {
    const code = await hostRoom(page, 'monopoly', 'Ada')
    const guest = await secondSeat(browser)

    try {
      await joinRoom(guest.page, 'monopoly', code, 'Bo')
      await startGame(page, [guest.page])

      // The host leaves the chat shut; the guest talks into it.
      await openChat(guest.page)
      await say(guest.page, 'anyone there?')

      const badge = page.locator('.tab-count.unread').last()
      await expect(badge).toBeVisible()
      await expect(badge).toHaveText('1')

      // Opening it reads it, and the badge goes.
      await openChat(page)
      await expect(page.locator('.tab-count.unread')).toHaveCount(0)
    } finally {
      await guest.close()
    }
  })

  test('leaves the board and the turn controls alone', async ({ page, browser }) => {
    const code = await hostRoom(page, 'monopoly', 'Ada')
    const guest = await secondSeat(browser)

    try {
      await joinRoom(guest.page, 'monopoly', code, 'Bo')
      await startGame(page, [guest.page])
      await openChat(page)

      // Whatever the layout, the chat does not take the board or the prompt
      // with it: both are still there to be seen and used.
      await expect(page.locator('.board')).toBeVisible()
      await expect(page.locator('.prompt')).toBeVisible()

      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }))
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1)
    } finally {
      await guest.close()
    }
  })
})
