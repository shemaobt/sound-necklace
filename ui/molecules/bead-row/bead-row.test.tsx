import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { BeadRow } from './bead-row';

const telha = { base: '#BE4A01', lit: '#E8813E', deep: '#8F3701' };

describe('BeadRow — fileira de pérolas sobre o fio (redesign §4.3)', () => {
  it('rende uma pérola por conta, na ordem recebida', () => {
    const { container } = render(
      <BeadRow
        beads={[
          { key: 'a', state: 'lit', tint: telha },
          { key: 'b', state: 'head' },
          { key: 'c', state: 'unplayed', sceneEnd: true },
        ]}
      />,
    );
    const pearls = container.querySelectorAll('.cds-pearl');
    expect(pearls).toHaveLength(3);
    expect(pearls[0]?.getAttribute('data-state')).toBe('lit');
    expect(pearls[1]?.getAttribute('data-state')).toBe('head');
    expect(pearls[2]?.getAttribute('data-scene-end')).toBe('true');
  });

  it('repassa a tinta do segmento para a conta', () => {
    const { container } = render(<BeadRow beads={[{ key: 'a', state: 'lit', tint: telha }]} />);
    const pearl = container.querySelector<HTMLElement>('.cds-pearl');
    expect(pearl?.style.getPropertyValue('--cds-pearl-base')).toBe(telha.base);
  });

  it('desenha o fio atrás das contas', () => {
    const { container } = render(<BeadRow beads={[{ key: 'a' }]} />);
    expect(container.querySelector('.cds-cord')).not.toBeNull();
  });

  it('fileira vazia rende só o fio, sem contas', () => {
    const { container } = render(<BeadRow beads={[]} />);
    expect(container.querySelectorAll('.cds-pearl')).toHaveLength(0);
    expect(container.querySelector('.cds-cord')).not.toBeNull();
  });
});
