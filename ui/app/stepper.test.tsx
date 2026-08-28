import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Stepper } from './stepper';
import type { StepperStationView } from './stepper-model';

const stations: StepperStationView[] = [
  { key: 'listen', labelKey: 'stations.listen', state: 'done', reachable: true },
  { key: 'triage', labelKey: 'stations.triage', state: 'current', reachable: true },
  { key: 'phrases', labelKey: 'stations.phrases', state: 'future', reachable: false },
];

describe('Stepper — fio de contas (redesign §5.1)', () => {
  it('rende cada estação e marca a atual com aria-current', () => {
    render(<Stepper stations={stations} onNavigate={() => {}} />);
    expect(screen.getByText('Ouvir')).toBeDefined();
    // o nome visível da etapa mora na faixa da barra da história (ENG-648); aqui
    // 'Triagem' vem do rótulo sr-only do li
    const atual = screen
      .getAllByText('Triagem')
      .find((el) => el.closest('li'))!
      .closest('li')!;
    expect(atual.getAttribute('aria-current')).toBe('step');
  });

  it('clicar numa estação alcançável navega para ela', () => {
    const onNavigate = vi.fn();
    render(<Stepper stations={stations} onNavigate={onNavigate} />);
    fireEvent.click(screen.getByText('Ouvir'));
    expect(onNavigate).toHaveBeenCalledWith('listen');
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
