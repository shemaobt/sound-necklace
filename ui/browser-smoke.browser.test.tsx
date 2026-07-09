import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';

import { App } from './app/App';

/**
 * Smoke do Vitest Browser Mode (Chromium real via Playwright).
 * Prova o pipeline completo que os organismos de interação crítica usarão
 * (colar ENG-220, modal da costura ENG-228, palco da conversa ENG-221):
 * transform de JSX + render React em browser real, via `pnpm test:browser`.
 */
describe('pipeline de testes em browser real', () => {
  it('renderiza JSX React em um browser de verdade', () => {
    expect(navigator.userAgent).toContain('Chrome');

    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    flushSync(() => root.render(<App />));

    expect(host.textContent).toContain('Colar de Sons');

    root.unmount();
    host.remove();
  });
});
