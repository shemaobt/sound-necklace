import { defineConfig } from '@playwright/test';

/**
 * Config E2E (ENG-252): dirige o app REAL em modo fixture. O webServer sobe o Vite
 * (SPA fallback serve o index.html em qualquer rota → History API funciona), e as
 * specs de `tests/e2e/**` rodam num Chromium headless. Não é um required check
 * (CLAUDE.md); o job `e2e` do CI é adicional. Vitest não vê estas specs (`*.spec.ts`
 * fora dos globs de unit/dom/browser).
 */

/** Sobrescrevível: uma árvore cujo 5173 já está ocupado sobe o e2e noutra porta. */
const PORT = Number(process.env.CDS_E2E_PORT ?? 5173);
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
    // o app respeita prefers-reduced-motion; forçá-lo tira a duração de animação
    // da equação → o clique de conta por geometria não corre com uma transição.
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `vite --host ${HOST} --port ${PORT} --strictPort`,
    url: `http://${HOST}:${PORT}`,
    // NUNCA reusar um servidor já no ar. Este repo trabalha em worktrees: um Vite de
    // OUTRA árvore atende nesta mesma porta e o e2e passa a testar o código ERRADO —
    // verde falso, o pior tipo de falha de gate. (Aconteceu de verdade na ENG-279: a
    // suíte passava 10/10 contra a `main`.) Com `--strictPort`, porta ocupada falha
    // ALTO em vez de mentir; use CDS_E2E_PORT para escolher outra.
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
