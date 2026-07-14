import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { splitByGuard } from '../../atoms/testing/css';
import { ConversationStage, type ConversationStageProps } from './conversation-stage';
import stageCss from './conversation-stage.css?raw';

function baseProps(over: Partial<ConversationStageProps> = {}): ConversationStageProps {
  return {
    question: 'O que aconteceu nesta parte da história?',
    recorderState: 'idle',
    progress: { total: 4, answered: new Set([0]), current: 1 },
    ...over,
  };
}

/**
 * Marcador de papel (§8.7): perguntas conduzidas pela facilitadora carregam um
 * glifo SEM palavras ("nunca preencha por conta própria") — distingue papel sem
 * texto.
 */
describe('ConversationStage — marcador de papel (§8.7)', () => {
  it('quando facilitatorLed, mostra o glifo sem nenhuma linha de texto', () => {
    render(<ConversationStage {...baseProps({ facilitatorLed: true })} />);
    const marker = screen.getByRole('img', { name: 'conduzida pela facilitadora' });
    expect(marker.textContent).toBe('');
  });

  it('sem facilitatorLed, não há marcador', () => {
    render(<ConversationStage {...baseProps({ facilitatorLed: false })} />);
    expect(screen.queryByRole('img', { name: 'conduzida pela facilitadora' })).toBeNull();
  });
});

/**
 * Fio de progresso (§8.7): uma conta por pergunta, respondida e atual distintas,
 * jamais um número (§9.2) — é conversa, não formulário.
 */
describe('ConversationStage — fio de progresso', () => {
  it('rende uma conta por pergunta, respondida e atual distintas, sem dígitos', () => {
    const { container } = render(
      <ConversationStage
        {...baseProps({ progress: { total: 4, answered: new Set([0]), current: 1 } })}
      />,
    );
    const thread = container.querySelector('.cds-conversation-stage-progress');
    expect(thread).not.toBeNull();
    expect(thread!.querySelectorAll('.cds-pearl')).toHaveLength(4);
    expect(thread!.querySelectorAll('.cds-pearl[data-state="head"]')).toHaveLength(1);
    expect(thread!.querySelectorAll('.cds-pearl[data-state="lit"]')).toHaveLength(1);
    expect(thread!.textContent ?? '').not.toMatch(/\d/);
  });
});

/**
 * "Ouvir a pergunta" (§6.6): a afordância de fala só aparece quando há uma porta
 * de fala fornecida (TTS ausente antes da ENG-251 simplesmente esconde o botão).
 */
describe('ConversationStage — "Ouvir a pergunta" condicional', () => {
  it('rende o botão só quando onSpeakQuestion é fornecido', () => {
    const { rerender } = render(<ConversationStage {...baseProps()} />);
    expect(screen.queryByText('Ouvir a pergunta')).toBeNull();
    rerender(<ConversationStage {...baseProps({ onSpeakQuestion: vi.fn() })} />);
    expect(screen.getByText('Ouvir a pergunta')).toBeTruthy();
  });
});

/**
 * Canal digitado (§8.7): opcional e sempre acompanhado da cópia contratual — a
 * facilitadora escreve depois, "nunca por você". Só aparece quando há o slot.
 */
describe('ConversationStage — canal digitado opcional', () => {
  it('mostra o slot e a cópia "nunca por você" só quando typedAnswer é fornecido', () => {
    const hint = 'A facilitadora pode escrever depois — nunca por você.';
    const { rerender } = render(<ConversationStage {...baseProps()} />);
    expect(screen.queryByText(hint)).toBeNull();

    rerender(
      <ConversationStage {...baseProps({ typedAnswer: <textarea aria-label="observação" /> })} />,
    );
    expect(screen.getByText(hint)).toBeTruthy();
    expect(screen.getByLabelText('observação')).toBeTruthy();
  });
});

describe('ConversationStage — convite e gravação por voz (protótipo §9.2)', () => {
  it('idle: convida a falar', () => {
    render(<ConversationStage {...baseProps({ recorderState: 'idle' })} />);
    expect(screen.getByText('Toque e fale a sua resposta')).toBeTruthy();
  });

  it('gravando: o botão redondo vira Parar e anuncia a gravação', () => {
    const { container } = render(
      <ConversationStage {...baseProps({ recorderState: 'recording' })} />,
    );
    const stopButton = screen.getByRole('button', { name: 'Parar' });
    expect(stopButton.classList.contains('cds-conversation-stage-mic')).toBe(true);
    expect(screen.getByText('Gravando…')).toBeTruthy();
    expect(container.textContent ?? '').not.toMatch(/\d/);
  });
});

describe('ConversationStage — movimento respeita prefers-reduced-motion (§4.5)', () => {
  it('nenhuma animação vive fora da guarda de movimento', () => {
    const guard = /@media\s*\(prefers-reduced-motion:\s*no-preference\)/;
    const { outside } = splitByGuard(stageCss, guard);
    expect(outside).not.toMatch(/animation|@keyframes/);
  });
});
