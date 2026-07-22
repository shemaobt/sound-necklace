import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { splitByGuard } from '../../atoms/testing/css';
import { PreparingSession } from './preparing-session';
import preparingCss from './preparing-session.css?raw';

describe('PreparingSession (ENG-312)', () => {
  it('anuncia a espera (role=status) com o eyebrow + a linha da casa e o cordão decorativo', () => {
    const { container } = render(<PreparingSession />);
    const status = screen.getByRole('status').textContent ?? '';
    expect(status).toContain('Um momento');
    expect(status).toContain('Preparando o colar da sua história…');
    const beads = container.querySelector('.cds-preparing-beads');
    expect(beads?.getAttribute('aria-hidden')).toBe('true');
    expect(beads?.querySelectorAll('.cds-preparing-bead').length).toBeGreaterThan(0);
  });

  it('eyebrow e linha vêm por prop quando fornecidos', () => {
    render(<PreparingSession eyebrow="Guardando" line="Reunindo os documentos…" />);
    const status = screen.getByRole('status').textContent ?? '';
    expect(status).toContain('Guardando');
    expect(status).toContain('Reunindo os documentos…');
  });

  it('todo movimento vive dentro da guarda de prefers-reduced-motion (§4.5)', () => {
    const { outside } = splitByGuard(
      preparingCss,
      /@media[^{]*prefers-reduced-motion:\s*no-preference[^{]*/,
    );
    expect(outside).not.toMatch(/animation|@keyframes/);
  });
});
