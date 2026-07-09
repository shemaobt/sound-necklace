import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { splitByGuard } from '../../atoms/testing/css';
import necklaceCss from './necklace.css?raw';
import { Necklace } from './necklace';

const sage = { base: '#89AAA3', lit: '#B2CCC6', deep: '#5F827B' };

/**
 * Vocabulário de estado do colar (redesign §4.3) — asserções de presença/atributo
 * que não dependem de layout real (jsdom zera medidas; interações e geometria
 * quebrada por linha vivem no *.browser.test.tsx).
 */
describe('Necklace — vocabulário de estado (redesign §4.3)', () => {
  it('a conta final de cena travada rende quadrada no fio', () => {
    const { container } = render(<Necklace totalBeads={20} beadSec={0.25} lockedEndBeads={[3]} />);
    const end = container.querySelector('.cds-necklace-bead[data-idx="3"] .cds-pearl');
    expect(end?.getAttribute('data-scene-end')).toBe('true');
    // uma conta comum não é quadrada
    const plain = container.querySelector('.cds-necklace-bead[data-idx="4"] .cds-pearl');
    expect(plain?.getAttribute('data-scene-end')).toBeNull();
  });

  it('na janela de uma cena, as contas da margem ficam esmaecidas e há banda tracejada', () => {
    const { container } = render(
      <Necklace totalBeads={30} beadSec={0.25} window={{ s: 10, e: 14 }} />,
    );
    // banda tracejada sobre a cena
    expect(container.querySelector('.cds-necklace-scene-band')).not.toBeNull();
    // uma conta fora da cena (dentro da janela) está dim; uma dentro da cena não
    const outside = container.querySelector('.cds-necklace-bead[data-idx="6"] .cds-pearl');
    const inside = container.querySelector('.cds-necklace-bead[data-idx="12"] .cds-pearl');
    expect(outside?.getAttribute('data-state')).toBe('dim');
    expect(inside?.getAttribute('data-state')).not.toBe('dim');
  });

  it('a seleção enfatiza exatamente a primeira e a última conta do intervalo', () => {
    const { container } = render(
      <Necklace totalBeads={30} beadSec={0.25} selection={{ s: 2, e: 6 }} />,
    );
    const edges = container.querySelectorAll('[data-sel-edge="true"]');
    expect(edges).toHaveLength(2);
    expect(
      container.querySelector('.cds-necklace-bead[data-idx="2"]')?.getAttribute('data-sel-edge'),
    ).toBe('true');
    expect(
      container.querySelector('.cds-necklace-bead[data-idx="6"]')?.getAttribute('data-sel-edge'),
    ).toBe('true');
    // banda de seleção presente
    expect(container.querySelector('.cds-necklace-selection-band')).not.toBeNull();
  });

  it('contas de um segmento recebem a tinta da paleta', () => {
    const { container } = render(
      <Necklace totalBeads={20} beadSec={0.25} segments={[{ span: { s: 0, e: 3 }, tint: sage }]} />,
    );
    const tinted = [
      ...container.querySelectorAll<HTMLElement>('.cds-necklace-bead .cds-pearl'),
    ].filter((el) => el.style.getPropertyValue('--cds-pearl-base') === sage.base);
    expect(tinted).toHaveLength(4);
  });
});

describe('Necklace — movimento respeita prefers-reduced-motion (§4.5)', () => {
  it('nenhuma animação vive fora da guarda de movimento', () => {
    const guard = /@media\s*\(prefers-reduced-motion:\s*no-preference\)/;
    const { outside } = splitByGuard(necklaceCss, guard);
    expect(outside).not.toMatch(/animation|@keyframes/);
  });
});
