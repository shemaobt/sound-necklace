import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { parseRules, splitByGuard } from '../testing/css';
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

  // Nota: `transition` fica fora da guarda de propósito — base.css já zera
  // toda transition/animation globalmente sob `prefers-reduced-motion: reduce`.
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

describe('Pearl — a cabeça sobre a conta final mantém o destaque (cascade)', () => {
  it('a regra combinada head+fim-de-cena preserva a escala e o anel da cabeça', () => {
    const rule = parseRules(pearlCss).find(
      (r) => r.selector.includes("data-state='head'") && r.selector.includes('data-scene-end'),
    );
    expect(rule, 'regra combinada head + scene-end').toBeDefined();
    expect(rule?.body).toContain('scale(1.18)');
    expect(rule?.body).toContain('box-shadow');
  });
});

/**
 * O fim de FRASE (ENG-725): o desenho da Rever distingue "acabou uma frase" de
 * "acabou uma cena" — as duas são quadradas no tom profundo, mas a de frase é
 * encolhida e sem anel. Na mesma conta, o fim de cena ganha.
 */
describe('Pearl — fim de frase, distinto do fim de cena (ENG-725)', () => {
  it('marca fim de frase como variante própria; na mesma conta, o fim de cena ganha', () => {
    const { container, rerender } = render(<Pearl state="lit" tint={telha} phraseEnd />);
    const pearl = getPearl(container);
    expect(pearl.getAttribute('data-phrase-end')).toBe('true');
    expect(pearl.hasAttribute('data-scene-end')).toBe(false);
    expect(pearl.getAttribute('data-state')).toBe('lit');

    rerender(<Pearl state="lit" tint={telha} sceneEnd phraseEnd />);
    expect(pearl.getAttribute('data-scene-end')).toBe('true');
    expect(pearl.hasAttribute('data-phrase-end')).toBe(false);
  });

  it('o css encolhe o fim de frase e não lhe dá anel; o fim de cena tem anel', () => {
    const rules = parseRules(pearlCss);
    const last = (r: { selector: string }) => r.selector.split('\n').pop()?.trim() ?? '';
    const phrase = rules.find((r) => last(r) === ".cds-pearl[data-phrase-end='true']");
    const scene = rules.find((r) => last(r) === ".cds-pearl[data-scene-end='true']");
    expect(phrase, 'regra do fim de frase').toBeDefined();
    expect(scene, 'regra do fim de cena').toBeDefined();
    expect(phrase?.body).toContain('border-radius');
    expect(phrase?.body).toMatch(/scale\(0\.\d+\)/);
    // anel = uma sombra de espalhamento sem desfoque (`0 0 0 Npx cor`)
    const ring = /0 0 0 [\d.]+px/;
    expect(phrase?.body ?? '').not.toMatch(ring);
    expect(scene?.body ?? '').toMatch(ring);
  });
});
