import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { splitByGuard } from '../../atoms/testing/css';
import type { ConversationTrecho } from '../../molecules';
import { ConversationStage, type ConversationStageProps } from './conversation-stage';
import stageCss from './conversation-stage.css?raw';

const tint = (base: string) => ({ base, lit: base, deep: base });
const TRECHOS: ConversationTrecho[] = [
  { count: 11, color: tint('#a9a06a'), label: 'A história' },
  { count: 5, color: tint('#be4a01'), label: 'Chegada' },
];

function baseProps(over: Partial<ConversationStageProps> = {}): ConversationStageProps {
  return {
    question: 'O que aconteceu nesta parte da história?',
    recorderState: 'idle',
    progress: { total: 4, current: 1 },
    trechos: [{ count: 4, color: tint('#a9a06a'), label: 'A história' }],
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

/** Reproduzindo a resposta gravada: ouvir ⇄ pausar + as barras acesas (ENG-322). */
describe('ConversationStage — feedback de reprodução da resposta (ENG-322)', () => {
  it("tocando, 'ouvir' vira 'pausar' e a forma de onda acende", () => {
    const { container, rerender } = render(
      <ConversationStage
        {...baseProps({ recorderState: 'recorded', answerPlaying: true, onStopPlay: vi.fn() })}
      />,
    );
    expect(screen.getByRole('button', { name: 'pausar' })).toBeTruthy();
    expect(
      container.querySelectorAll('.cds-waveform-bar[data-state="active"]').length,
    ).toBeGreaterThan(0);

    rerender(<ConversationStage {...baseProps({ recorderState: 'recorded' })} />);
    expect(screen.getByRole('button', { name: 'ouvir' })).toBeTruthy();
    expect(container.querySelectorAll('.cds-waveform-bar[data-state="active"]').length).toBe(0);
  });
});

/** Parar → guardar: o estado vive no botão (ENG-318) — spinner, desabilitado, sem texto novo. */
describe('ConversationStage — guardando a resposta (ENG-318)', () => {
  it("em 'saving', o microfone vira 'guardando a resposta' e não aceita clique", () => {
    render(<ConversationStage {...baseProps({ recorderState: 'saving' })} />);
    const btn = screen.getByRole('button', { name: 'guardando a resposta' });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });
});

/** O botão da pergunta segue o estado REAL da fala (ENG-317): falando ⇄ pausado. */
describe('ConversationStage — botão da pergunta pelo estado da fala (ENG-317)', () => {
  it('falando, oferece "Pausar a pergunta"; calado, "Ouvir a pergunta"', () => {
    const onSpeakQuestion = vi.fn();
    const { rerender } = render(
      <ConversationStage {...baseProps({ onSpeakQuestion, speaking: true })} />,
    );
    expect(screen.getByRole('button', { name: 'Pausar a pergunta' })).toBeTruthy();

    rerender(<ConversationStage {...baseProps({ onSpeakQuestion, speaking: false })} />);
    expect(screen.getByRole('button', { name: 'Ouvir a pergunta' })).toBeTruthy();
  });
});

/**
 * Barra de progresso por trecho (§8.7, ENG-350): substitui as contas por-pergunta
 * no rodapé — uma barra segmentada história · cenas · frases, com o marcador na
 * posição atual e a legenda do trecho, jamais um número (§9.2).
 */
describe('ConversationStage — barra de progresso por trecho (ENG-350)', () => {
  const footer = (el: HTMLElement) => el.querySelector('.cds-conversation-stage-progress')!;

  it('rende a barra por trecho no rodapé, com a legenda do trecho atual e sem dígitos', () => {
    const { container } = render(
      <ConversationStage
        {...baseProps({
          trechos: TRECHOS,
          progress: { total: 16, current: 3 },
        })}
      />,
    );
    const rodape = footer(container);
    expect(rodape.querySelector('.cds-conv-progress')).not.toBeNull();
    expect(rodape.querySelectorAll('.cds-conv-progress-seg')).toHaveLength(2);
    expect(rodape.querySelector('.cds-conv-progress-caption')?.textContent).toBe('A história');
    expect(rodape.textContent ?? '').not.toMatch(/\d/);
    // nenhuma conta do modelo antigo sobrou
    expect(rodape.querySelectorAll('.cds-pearl')).toHaveLength(0);
  });

  it('entrar numa cena troca a legenda — o marcador de transição de trecho', () => {
    const { container } = render(
      <ConversationStage
        {...baseProps({
          trechos: TRECHOS,
          progress: { total: 16, current: 13 },
        })}
      />,
    );
    expect(container.querySelector('.cds-conv-progress-caption')?.textContent).toBe('Chegada');
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
 * Entrevista só-voz (design parity): o palco do Conversation não tem mais canal
 * digitado — a digitação passou a viver só no relatório (já editável, ver
 * ui/pages/report). A cópia contratual "nunca por você" permanece, mas
 * agora é permanente (idle), não condicionada a um slot de texto.
 */
describe('ConversationStage — entrevista só-voz (design parity)', () => {
  it('a cópia "A facilitadora pode escrever depois — nunca por você." está SEMPRE visível (idle) e NÃO há textarea no palco', () => {
    const hint = 'A facilitadora pode escrever depois — nunca por você.';
    render(<ConversationStage {...baseProps({ recorderState: 'idle' })} />);

    expect(screen.getByText(hint)).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull();
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
