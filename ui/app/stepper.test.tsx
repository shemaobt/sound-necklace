import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Stepper } from './stepper';
import type { StepperStationView } from './stepper-model';

const stations: StepperStationView[] = [
  { key: 'escuta1', labelKey: 'stations.listen', state: 'done', reachable: true },
  { key: 'triagem', labelKey: 'stations.triage', state: 'current', reachable: true },
  { key: 'segmentacao', labelKey: 'stations.phrases', state: 'future', reachable: false },
];

describe('Stepper — fio de contas (redesign §5.1)', () => {
  it('rende cada estação e marca a atual com aria-current', () => {
    render(<Stepper stations={stations} onNavigate={() => {}} />);
    expect(screen.getByText('Ouvir')).toBeDefined();
    const atual = screen.getByText('Triagem').closest('li')!;
    expect(atual.getAttribute('aria-current')).toBe('step');
  });

  it('clicar numa estação alcançável navega para ela', () => {
    const onNavigate = vi.fn();
    render(<Stepper stations={stations} onNavigate={onNavigate} />);
    fireEvent.click(screen.getByText('Ouvir'));
    expect(onNavigate).toHaveBeenCalledWith('escuta1');
  });

  it('clicar numa estação travada não faz nada', () => {
    const onNavigate = vi.fn();
    render(<Stepper stations={stations} onNavigate={onNavigate} />);
    fireEvent.click(screen.getByText('Frases'));
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('não exibe nenhum dígito (§9.2)', () => {
    const { container } = render(<Stepper stations={stations} onNavigate={() => {}} />);
    expect(container.textContent).not.toMatch(/\d/);
  });
});
