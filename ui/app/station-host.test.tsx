import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { StationComponent } from './registries';
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

  it('repassa stationProps à estação resolvida (wiring da Export)', () => {
    const Export = (props: { sessionId?: string }) => <p>sessão {props.sessionId}</p>;
    render(
      <StationHost
        stationKey="export"
        registry={{ export: Export as StationComponent }}
        stationProps={{ sessionId: 's-42' }}
      />,
    );
    expect(screen.getByText('sessão s-42')).toBeDefined();
  });
});
