import { defineConfig, devices } from '@playwright/test'

/**
 * Browser tests for the board games app, in `e2e/`.
 *
 * The specs are named `*.e2e.ts` rather than `*.spec.ts` for one specific
 * reason: the app runs Vitest from the repository root, and Vitest's default
 * include pattern takes every `.test.` and `.spec.` file under it. A file named
 * `samurai.spec.ts` anywhere in the repo would be swept into that suite and run
 * under jsdom, where `@playwright/test` cannot even be imported. Keep the
 * extension.
 */

/** Point at an app that is already running, and no server is started here. */
const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:5173'

export default defineConfig({
  testDir: './e2e/tests',
  testMatch: '**/*.e2e.ts',

  /* A table is two browser contexts talking over a websocket, so a test is
     slower than a unit test and much slower than a page load. */
  timeout: 90_000,
  expect: { timeout: 15_000 },

  /* One worker, deliberately.
     Tables are independent — each test makes its own room — but the whole suite
     is served by one Vite dev server and one game server, and two workers means
     four browser contexts, several of them holding a WebGL context for the 3D
     dice. Under that load a page load through Vite can stall long enough to
     time a test out: a flake with no bug behind it, which is the worst kind.
     Pass `--workers=2` to trade that back for speed. */
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  forbidOnly: !!process.env.CI,

  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  /*
   * Three shapes, the ones the app is actually laid out for: a phone, a tablet
   * and a desktop. `isMobile` is what makes a browser answer `pointer: coarse`
   * and `hover: none`, which is how the touch-sized controls are chosen.
   *
   * The phone is Playwright's iPhone 13, which is WebKit — the browser several
   * of the mobile fixes exist for: `dvh` for a viewport a toolbar changes the
   * height of, `env(safe-area-inset-*)` for a notch, and the fullscreen button
   * that hides itself because Safari on an iPhone keeps the API for video.
   *
   * The shapes this once also ran — a larger phone, a smaller one, both of them
   * on their side, and a tablet in landscape — were a whole pass of the suite
   * each for layouts the three below already cross. Add one back when a bug
   * turns up that only it catches.
   */
  projects: [
    {
      name: 'mobile',
      use: { ...devices['iPhone 13'] },
    },
    {
      name: 'tablet',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 768, height: 1024 },
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],

  /*
   * `bun run dev` is both halves of the app: Vite on 5173 and the game server on
   * 8787, which Vite proxies `/ws` to. Set E2E_BASE_URL to test something that
   * is already running (a built server, a deployment) and this is skipped.
   */
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'bun run dev',
        url: BASE_URL,
        reuseExistingServer: true,
        timeout: 120_000,
        stdout: 'ignore',
        stderr: 'pipe',
      },
})
