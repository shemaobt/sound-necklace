import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { splitByGuard } from '../../atoms/testing/css';
import { PreparingSession } from './preparing-session';
import preparingCss from './preparing-session.css?raw';

describe('PreparingSession (ENG-312)', () => {
  it('anuncia a espera (role=status) com a linha da casa e o fio decorativo', () => {
    const { container } = render(<PreparingSession />);
    expect(screen.getByRole('status').textContent).toContain('Preparando tudo para a sua sessão…');
    const beads = container.querySelector('.cds-preparing-beads');
    expect(beads?.getAttribute('aria-hidden')).toBe('true');
    expect(beads?.querySelectorAll('.cds-pearl').length).toBeGreaterThan(0);
  });

  it('todo movimento vive dentro da guarda de prefers-reduced-motion (§4.5)', () => {
    const { outside } = splitByGuard(
      preparingCss,
      /@media[^{]*prefers-reduced-motion:\s*no-preference[^{]*/,
    );
    expect(outside).not.toMatch(/animation|@keyframes/);
  });
});
