import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ConnectionGate } from './connection-gate';

describe('ConnectionGate (PRD §7.3/§13 — online-only)', () => {
  it('offline: mostra o aviso e a cobertura de bloqueio, mantendo o conteúdo montado', () => {
    render(
      <ConnectionGate online={false}>
        <p data-testid="conteudo">a história</p>
      </ConnectionGate>,
    );

    expect(screen.getByRole('status').textContent).toMatch(/sem conexão/i);
    expect(screen.getByTestId('conteudo')).toBeDefined();
    expect(document.querySelector('.cds-connection-gate-overlay')).not.toBeNull();
  });

  it('online: sem aviso e sem cobertura, conteúdo visível', () => {
    render(
      <ConnectionGate online={true}>
        <p data-testid="conteudo">a história</p>
      </ConnectionGate>,
    );

    expect(screen.queryByRole('status')).toBeNull();
    expect(document.querySelector('.cds-connection-gate-overlay')).toBeNull();
    expect(screen.getByTestId('conteudo')).toBeDefined();
  });
});
