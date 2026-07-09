import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { StationHost } from './station-host';

describe('StationHost', () => {
  it('renderiza a estação registrada', () => {
    const Setup = () => <p>tela de setup</p>;
    render(<StationHost stationKey="setup" registry={{ setup: Setup }} />);
    expect(screen.getByText('tela de setup')).toBeDefined();
  });

  it('estação ausente cai no fallback "estação em construção"', () => {
    render(<StationHost stationKey="triagem" registry={{}} />);
    expect(screen.getByText('estação em construção')).toBeDefined();
  });
});
