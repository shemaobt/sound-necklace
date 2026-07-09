import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { CordLine } from './cord';

describe('CordLine — o fio atrás das contas (referência .rowline)', () => {
  it('renderiza decorativa, sem texto e invisível para leitores de tela', () => {
    const { container } = render(<CordLine />);
    const cord = container.querySelector('.cds-cord');
    expect(cord).not.toBeNull();
    expect(cord?.getAttribute('aria-hidden')).toBe('true');
    expect(cord?.textContent).toBe('');
  });
});
