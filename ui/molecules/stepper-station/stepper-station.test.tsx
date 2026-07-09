import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { StepperStation } from './stepper-station';

function station(props: Parameters<typeof StepperStation>[0]) {
  // uma estação é um <li>; envolve num <ol> para HTML válido
  return render(
    <ol>
      <StepperStation {...props} />
    </ol>,
  );
}

describe('StepperStation — conta-etapa do fio de contas (redesign §5.1)', () => {
  it('os três estados são visualmente distintos', () => {
    const { container: cur } = station({ label: 'Ouvir', state: 'current' });
    const { container: done } = station({ label: 'Cortar', state: 'done' });
    const { container: fut } = station({ label: 'Frases', state: 'future' });
    const states = [cur, done, fut].map((c) =>
      c.querySelector('.cds-stepper-station')?.getAttribute('data-state'),
    );
    expect(new Set(states).size).toBe(3);
    expect(states).toEqual(['current', 'done', 'future']);
  });

  it('cada estado é dito por extenso para leitores de tela', () => {
    expect(station({ label: 'Ouvir', state: 'current' }).getByText('etapa atual')).toBeDefined();
    expect(station({ label: 'Cortar', state: 'done' }).getByText('concluído')).toBeDefined();
    expect(station({ label: 'Frases', state: 'future' }).getByText('não concluído')).toBeDefined();
  });

  it('a estação atual é anunciada com aria-current="step"; as outras não', () => {
    const { container: cur } = station({ label: 'Ouvir', state: 'current' });
    const { container: fut } = station({ label: 'Frases', state: 'future' });
    expect(cur.querySelector('.cds-stepper-station')?.getAttribute('aria-current')).toBe('step');
    expect(fut.querySelector('.cds-stepper-station')?.getAttribute('aria-current')).toBeNull();
  });

  it('mostra o nome da etapa e nunca rende um número', () => {
    const { container } = station({ label: 'Conversa', state: 'current' });
    const station_ = container.querySelector('.cds-stepper-station');
    expect(station_?.textContent).toContain('Conversa');
    expect(station_?.textContent ?? '').not.toMatch(/\d/);
  });
});
