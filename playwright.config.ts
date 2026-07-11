import { defineConfig } from '@playwright/test';

/**
 * Config E2E (ENG-252): dirige o app REAL em modo fixture. O webServer sobe o Vite
 * (SPA fallback serve o index.html em qualquer rota → History API funciona), e as
 * specs de `tests/e2e/**` rodam num Chromium headless. Não é um required check
 * (CLAUDE.md); o job `e2e` do CI é adicional. Vitest não vê estas specs (`*.spec.ts`
 * fora dos globs de unit/dom/browser).
 */

const PORT = 5173;
const HOST = '127.0.0.1';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: 'list',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: `http://${HOST}:${PORT}`,
    browserName: 'chromium',
    headless: true,
    viewport: { width: 1280, height: 900 },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `vite --host ${HOST} --port ${PORT} --strictPort`,
    url: `http://${HOST}:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
