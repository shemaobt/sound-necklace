import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ConfidenceDisc } from './confidence-disc';

describe('ConfidenceDisc — a forma carrega o significado (redesign §4.4)', () => {
  it('disco cheio (Certeza)', () => {
    render(<ConfidenceDisc variant="filled" label="Certeza" />);
    const disc = screen.getByRole('img', { name: 'Certeza' });
    expect(disc.getAttribute('data-variant')).toBe('filled');
  });

  it('meio disco (Quase)', () => {
    render(<ConfidenceDisc variant="half" label="Quase" />);
    const disc = screen.getByRole('img', { name: 'Quase' });
    expect(disc.getAttribute('data-variant')).toBe('half');
  });

  it('anel tracejado (Na dúvida)', () => {
    render(<ConfidenceDisc variant="dashed" label="Na dúvida" />);
    const disc = screen.getByRole('img', { name: 'Na dúvida' });
    expect(disc.getAttribute('data-variant')).toBe('dashed');
  });

  it('sem rótulo é decorativo (o texto ao lado assume a semântica)', () => {
    const { container } = render(<ConfidenceDisc variant="filled" />);
    const disc = container.querySelector('.cds-confidence-disc');
    expect(disc?.getAttribute('aria-hidden')).toBe('true');
    expect(disc?.hasAttribute('role')).toBe(false);
  });
});
