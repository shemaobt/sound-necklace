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
 * Fio de progresso (§8.7): uma conta por pergunta, respondida e atual distintas,
 * jamais um número (§9.2) — é conversa, não formulário.
 */
describe('ConversationStage — fio de progresso janelado (roteiro real de 41)', () => {
  const pearls = (el: HTMLElement) =>
    el.querySelectorAll('.cds-conversation-stage-progress .cds-pearl');
  const headCount = (el: HTMLElement) =>
    el.querySelectorAll('.cds-conversation-stage-progress .cds-pearl[data-state="head"]').length;

  it('com 41 perguntas mostra no máximo 23 contas e a atual SEMPRE visível (início/meio/fim)', () => {
    for (const current of [0, 20, 40]) {
      const { container, unmount } = render(
        <ConversationStage
          {...baseProps({ progress: { total: 41, answered: new Set(), current } })}
        />,
      );
      expect(pearls(container).length).toBe(23);
      expect(headCount(container)).toBe(1);
      unmount();
    }
  });

  it('com poucas perguntas o fio mostra todas (sem janela)', () => {
    const { container } = render(
      <ConversationStage
        {...baseProps({ progress: { total: 11, answered: new Set(), current: 5 } })}
      />,
    );
    expect(pearls(container).length).toBe(11);
    expect(headCount(container)).toBe(1);
  });
});

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
 * Entrevista só-voz (design parity): o palco do Mapeamento não tem mais canal
 * digitado — a digitação passou a viver só no relatório (já editável, ver
 * ui/pages/relatorio). A cópia contratual "nunca por você" permanece, mas
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

/**
 * O fio conta A CONVERSA PERCORRIDA, não só o que ficou gravado (protótipo:
 * `i < qIndex || answers[i]` acende). A entrevista é só-voz e `answered` hoje só
 * enumera respostas de TEXTO — sem contar as perguntas já passadas, nenhuma conta
 * acendia nunca e o fio virava enfeite.
 */
describe('ConversationStage — o fio acende o caminho já andado', () => {
  const lit = (el: HTMLElement) =>
    el.querySelectorAll('.cds-conversation-stage-progress .cds-pearl[data-state="lit"]').length;

  it('as perguntas já passadas acendem, mesmo sem nenhuma resposta de texto', () => {
    const { container } = render(
      <ConversationStage
        {...baseProps({ progress: { total: 6, answered: new Set(), current: 3 } })}
      />,
    );

    expect(lit(container)).toBe(3); // 0,1,2 andadas · 3 é a cabeça · 4,5 por vir
  });

  it('uma pergunta respondida à frente da atual também acende (voltar não apaga)', () => {
    const { container } = render(
      <ConversationStage
        {...baseProps({ progress: { total: 6, answered: new Set([5]), current: 1 } })}
      />,
    );

    expect(lit(container)).toBe(2); // a 0 (andada) + a 5 (respondida)
  });
});
