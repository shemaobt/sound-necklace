import { describe, expect, it } from 'vitest';

/**
 * Smoke do Vitest Browser Mode (Chromium real via Playwright).
 * Prova o pipeline que os organismos de interação crítica usarão
 * (colar ENG-220, modal da costura ENG-228, palco da conversa ENG-221):
 * testes `*.browser.test.tsx` rodam com `pnpm test:browser`.
 */
describe('pipeline de testes em browser real', () => {
  it('roda em um browser de verdade', () => {
    expect(typeof window).toBe('object');
    expect(navigator.userAgent).toContain('Chrome');
  });
});
