import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import html from '../../index.html?raw';

/**
 * O ícone da aba mora em `public/` e é declarado no index.html — duas metades que
 * nada em tempo de execução costura. Um `<link>` apontando para arquivo que não
 * existe é PIOR que nenhum ícone: o navegador cai no default em branco e nada
 * reclama, nem no build. Este é o único teste que vê as duas metades juntas.
 *
 * `public/` chega à raiz do site sem configuração: o vite.config.ts não define
 * `publicDir`, então vale o default — o conteúdo é copiado para `dist/`.
 */

/** Os `<link rel="icon">` do documento, com o href já extraído. */
function iconHrefs(): string[] {
  return (html.match(/<link\b[^>]*>/g) ?? [])
    .filter((tag) => /\brel=["'](?:shortcut\s+)?icon["']/i.test(tag))
    .map((tag) => /\bhref=["']([^"']+)["']/.exec(tag)?.[1] ?? '');
}

describe('ícone da aba (favicon)', () => {
  it('o ícone declarado no index.html existe em public/', () => {
    const hrefs = iconHrefs();

    expect(hrefs, 'o index.html precisa declarar um <link rel="icon">').toHaveLength(1);
    const href = hrefs[0]!;
    expect(
      href,
      'caminho absoluto: href relativo resolve contra a rota atual e quebra em /session/…',
    ).toMatch(/^\//);
    // SVG não é preferência de formato: a faixa de abas escura é atendida por uma
    // regra `prefers-color-scheme` DENTRO do arquivo, e um PNG não sabe carregá-la.
    expect(href, 'o ícone precisa ser um SVG para poder se adaptar à aba escura').toMatch(/\.svg$/);
    // resolve() a partir do arquivo, e não `new URL(...)`: em jsdom o `URL` global é
    // o do jsdom, e `fileURLToPath` recusa a instância dele.
    const publicDir = resolve(fileURLToPath(import.meta.url), '../../../public');
    const onDisk = join(publicDir, href);
    expect(existsSync(onDisk), `${href} não existe em public/`).toBe(true);
    // e a regra que justifica exigir SVG está mesmo lá dentro: sem ela o arquivo
    // continua um SVG válido, o teste acima continua verde e o cordão some na aba
    // escura — falha que só aparece na máquina de quem usa tema escuro.
    expect(
      readFileSync(onDisk, 'utf8'),
      'o ícone precisa levar a própria regra de aba escura',
    ).toContain('prefers-color-scheme: dark');
  });
});
