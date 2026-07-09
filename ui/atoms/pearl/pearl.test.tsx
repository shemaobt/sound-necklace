import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Pearl } from './pearl';
import pearlCss from './pearl.css?raw';

const telha = { base: '#BE4A01', lit: '#E8813E', deep: '#8F3701' };

function getPearl(container: HTMLElement): HTMLElement {
  const el = container.querySelector('.cds-pearl');
  if (!(el instanceof HTMLElement)) throw new Error('pearl não renderizou');
  return el;
}

describe('Pearl — estados do vocabulário do colar (redesign §4.3)', () => {
  it('renderiza não tocada (pérola-aveia) por padrão, decorativa', () => {
    const { container } = render(<Pearl />);
    const pearl = getPearl(container);
    expect(pearl.getAttribute('data-state')).toBe('unplayed');
    expect(pearl.getAttribute('aria-hidden')).toBe('true');
    expect(pearl.textContent).toBe('');
  });

  it('renderiza acesa (trilha) com a cor do segmento via {base, lit, deep}', () => {
    const { container } = render(<Pearl state="lit" tint={telha} />);
    const pearl = getPearl(container);
    expect(pearl.getAttribute('data-state')).toBe('lit');
    expect(pearl.style.getPropertyValue('--cds-pearl-base')).toBe(telha.base);
    expect(pearl.style.getPropertyValue('--cds-pearl-lit')).toBe(telha.lit);
    expect(pearl.style.getPropertyValue('--cds-pearl-deep')).toBe(telha.deep);
  });

  it('sem tint não injeta custom properties (o css cai nos tokens de pérola)', () => {
    const { container } = render(<Pearl state="lit" />);
    expect(getPearl(container).style.getPropertyValue('--cds-pearl-base')).toBe('');
  });

  it('renderiza a cabeça (tocando agora) como estado distinto', () => {
    const { container } = render(<Pearl state="head" tint={telha} />);
    expect(getPearl(container).getAttribute('data-state')).toBe('head');
  });

  it('renderiza apagada (fora da janela na Segmentação)', () => {
    const { container } = render(<Pearl state="dim" />);
    expect(getPearl(container).getAttribute('data-state')).toBe('dim');
  });

  it('marca fim de cena como variante quadrada, combinável com qualquer estado', () => {
    const { container } = render(<Pearl state="lit" tint={telha} sceneEnd />);
    const pearl = getPearl(container);
    expect(pearl.getAttribute('data-scene-end')).toBe('true');
    expect(pearl.getAttribute('data-state')).toBe('lit');
  });

  it('não marca fim de cena por padrão', () => {
    const { container } = render(<Pearl state="lit" tint={telha} />);
    expect(getPearl(container).hasAttribute('data-scene-end')).toBe(false);
  });

  it('dispara o ping (pulso curto de escala) sob demanda', () => {
    const { container } = render(<Pearl ping />);
    expect(getPearl(container).getAttribute('data-ping')).toBe('true');
  });

  it('aceita tamanho por prop (as estações usam contas de 15 a 38 px)', () => {
    const { container } = render(<Pearl size={38} />);
    expect(getPearl(container).style.getPropertyValue('--cds-pearl-size')).toBe('38px');
  });
});

describe('Pearl — motion decorativo atrás de prefers-reduced-motion (§4.5)', () => {
  const guard = /@media\s*\(prefers-reduced-motion:\s*no-preference\)/;

  it('toda animação/keyframes do css vive dentro da guarda de opt-in', () => {
    expect(pearlCss).toMatch(guard);
    expect(splitByGuard(pearlCss, guard).outside).not.toMatch(/animation|@keyframes/);
  });

  it('os estados animados documentados (head, ping) têm animação dentro da guarda', () => {
    const { inside } = splitByGuard(pearlCss, guard);
    expect(inside).toMatch(/data-state=["']head["'][^}]*\{[^}]*animation/);
    expect(inside).toMatch(/data-ping=["']true["'][^}]*\{[^}]*animation/);
  });
});

/** Separa o css em conteúdo dentro/fora dos blocos `@media <guard> { … }` (chaves balanceadas). */
function splitByGuard(css: string, guard: RegExp): { inside: string; outside: string } {
  let outside = css;
  let inside = '';
  let match = outside.match(guard);
  while (match?.index !== undefined) {
    const open = outside.indexOf('{', match.index);
    let depth = 1;
    let i = open + 1;
    while (i < outside.length && depth > 0) {
      if (outside[i] === '{') depth += 1;
      if (outside[i] === '}') depth -= 1;
      i += 1;
    }
    inside += outside.slice(open + 1, i);
    outside = outside.slice(0, match.index) + outside.slice(i);
    match = outside.match(guard);
  }
  return { inside, outside };
}
