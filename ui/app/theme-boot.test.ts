import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import csp from '../../security-headers.conf?raw';
import html from '../../index.html?raw';
import { THEME_ATTRIBUTE, THEME_STORAGE_KEY } from './theme';

/**
 * O script de boot do tema (ENG-391) mora no index.html e é o único inline do app.
 * A CSP de produção é `script-src 'self'` mais o hash DESTE conteúdo — sem o hash
 * certo o nginx bloqueia o script, e a falha aparece só em produção: o app abre no
 * claro e pisca ao hidratar. Nenhum teste de comportamento vê isso; este vê.
 */

/** Conteúdo exato entre <script> e </script> — o vite copia byte a byte no build. */
function bootScript(): string {
  const found = /<script>([\s\S]*?)<\/script>/.exec(html);
  expect(found, 'index.html não tem script inline de boot').not.toBeNull();
  return found![1]!;
}

describe('boot do tema no index.html', () => {
  it('a CSP libera exatamente o script inline que está no index.html', () => {
    const digest = createHash('sha256').update(bootScript(), 'utf8').digest('base64');

    expect(csp).toContain(`'sha256-${digest}'`);
    expect(csp).not.toContain("script-src 'self' 'unsafe-inline'");
  });

  it('usa o mesmo atributo e a mesma chave que theme.ts (duplicação deliberada)', () => {
    const script = bootScript();

    expect(script).toContain(THEME_ATTRIBUTE);
    expect(script).toContain(THEME_STORAGE_KEY);
    expect(script).toContain('prefers-color-scheme: dark');
  });

  it('roda antes do bundle: um efeito do React pintaria o tema errado primeiro', () => {
    expect(html.indexOf('<script>')).toBeLessThan(html.indexOf('type="module"'));
  });
});
