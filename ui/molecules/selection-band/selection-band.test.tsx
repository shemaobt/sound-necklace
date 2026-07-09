import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SelectionBand } from './selection-band';

const sage = { base: '#89AAA3', lit: '#B2CCC6', deep: '#5F827B' };

describe('SelectionBand — banda sob um intervalo + contas de borda (redesign §4.3, §9.3)', () => {
  it('um intervalo que quebra em duas linhas rende dois segmentos de banda', () => {
    const { container } = render(
      <SelectionBand
        tint={sage}
        rows={[
          { key: 'r1', beadCount: 3 },
          { key: 'r2', beadCount: 2 },
        ]}
      />,
    );
    expect(container.querySelectorAll('.cds-selection-band-row')).toHaveLength(2);
    expect(container.querySelectorAll('.cds-pearl')).toHaveLength(5);
  });

  it('enfatiza exatamente a primeira e a última conta do intervalo', () => {
    const { container } = render(
      <SelectionBand
        tint={sage}
        rows={[
          { key: 'r1', beadCount: 3 },
          { key: 'r2', beadCount: 2 },
        ]}
      />,
    );
    const edges = container.querySelectorAll('[data-edge="true"]');
    expect(edges).toHaveLength(2);
    // as contas do meio não recebem ênfase
    const allBeadSlots = container.querySelectorAll('.cds-selection-band-bead');
    expect(allBeadSlots).toHaveLength(5);
    const emphasized = [...allBeadSlots].filter((el) => el.getAttribute('data-edge') === 'true');
    expect(emphasized).toHaveLength(2);
  });

  it('intervalo de uma conta só marca essa conta como borda', () => {
    const { container } = render(
      <SelectionBand tint={sage} rows={[{ key: 'r1', beadCount: 1 }]} />,
    );
    expect(container.querySelectorAll('[data-edge="true"]')).toHaveLength(1);
  });

  it('a tinta do segmento chega às contas', () => {
    const { container } = render(
      <SelectionBand tint={sage} rows={[{ key: 'r1', beadCount: 2 }]} />,
    );
    const tinted = [...container.querySelectorAll<HTMLElement>('.cds-pearl')].filter(
      (el) => el.style.getPropertyValue('--cds-pearl-base') === sage.base,
    );
    expect(tinted).toHaveLength(2);
  });
});
