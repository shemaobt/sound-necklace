import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AddonsLayer } from './addons-layer';

describe('AddonsLayer', () => {
  it('renderiza cada addon injetado na camada de overlay', () => {
    const Dica = () => <p>dica da facilitadora</p>;
    render(<AddonsLayer addons={[Dica]} />);
    expect(screen.getByText('dica da facilitadora')).toBeDefined();
  });

  it('sem addons não renderiza nada', () => {
    const { container } = render(<AddonsLayer addons={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
