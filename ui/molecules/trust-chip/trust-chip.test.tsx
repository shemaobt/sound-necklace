import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { TrustChip } from './trust-chip';

describe('TrustChip — âncora de confiança com cadeado (redesign §6.1)', () => {
  it('rende a linha fixada passada como slot', () => {
    render(<TrustChip>Nada sai do seu navegador.</TrustChip>);
    expect(screen.getByText('Nada sai do seu navegador.')).toBeDefined();
  });

  it('carrega um glifo de cadeado decorativo', () => {
    const { container } = render(<TrustChip>Nada sai do seu navegador.</TrustChip>);
    const glyph = container.querySelector('svg');
    expect(glyph?.getAttribute('aria-hidden')).toBe('true');
  });

  it('é uma afirmação estática, não um botão', () => {
    render(<TrustChip>Nada sai do seu navegador.</TrustChip>);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
