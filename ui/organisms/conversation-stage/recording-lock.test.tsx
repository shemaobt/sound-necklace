import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ConversationStage, type ConversationStageProps } from './conversation-stage';

/**
 * ENG-393 — gravou, o resto espera.
 *
 * Com o microfone aberto, todo o resto da tela ainda funcionava: avançar a
 * pergunta, voltar, reouvir a pergunta ou o trecho. Qualquer um deles no meio de
 * uma resposta corrompe ou perde o que a pessoa está dizendo — e nada na tela
 * dizia que o resto deveria esperar.
 *
 * O que se testa aqui é o que o usuário sente: o clique não faz nada e o
 * controle se anuncia indisponível. A trava é cinto E suspensório de propósito —
 * o `inert` do container não existe no jsdom, então a recusa dos próprios
 * handlers é o que sobrevive fora de um navegador de verdade, e é justamente ela
 * que salva a gravação quando o DOM está no meio de uma transição.
 */

function stage(props: Partial<ConversationStageProps> = {}) {
  const handlers = {
    onPrev: vi.fn(),
    onNext: vi.fn(),
    onSpeakQuestion: vi.fn(),
    onStop: vi.fn(),
    onRecord: vi.fn(),
  };
  const view = render(
    <ConversationStage
      question="Sobre o que é essa história?"
      recorderState="recording"
      progress={{ total: 11, current: 1 }}
      trechos={[]}
      {...handlers}
      {...props}
    />,
  );
  return { ...view, ...handlers };
}

describe('gravando: os outros controles esperam', () => {
  it('voltar uma pergunta não acontece durante a gravação', async () => {
    const { onPrev } = stage();

    await userEvent.click(screen.getByRole('button', { name: /anterior|voltar/i }));

    expect(onPrev).not.toHaveBeenCalled();
  });

  it('avançar a pergunta não acontece durante a gravação', async () => {
    const { onNext } = stage();

    await userEvent.click(screen.getByRole('button', { name: /próxima|seguinte/i }));

    expect(onNext).not.toHaveBeenCalled();
  });

  it('reouvir a pergunta não acontece durante a gravação', async () => {
    const { onSpeakQuestion } = stage();

    await userEvent.click(screen.getByRole('button', { name: /ouvir a pergunta/i }));

    expect(onSpeakQuestion).not.toHaveBeenCalled();
  });

  it('o trecho da história/cena/frase também espera', async () => {
    const onPlaySpan = vi.fn();
    stage({
      header: (
        <button type="button" onClick={onPlaySpan}>
          Ouvir esta cena
        </button>
      ),
    });

    await userEvent.click(screen.getByRole('button', { name: 'Ouvir esta cena' }));

    expect(onPlaySpan).not.toHaveBeenCalled();
  });

  it('os controles travados se anunciam indisponíveis, não apenas apagados', () => {
    stage();

    for (const nome of [/anterior|voltar/i, /próxima|seguinte/i, /ouvir a pergunta/i]) {
      const botao = screen.getByRole('button', { name: nome });
      expect(
        botao.getAttribute('aria-disabled') === 'true' || botao.hasAttribute('disabled'),
        `${botao.textContent} não se anuncia indisponível durante a gravação`,
      ).toBe(true);
    }
  });

  it('marcar a pergunta como sem resposta também espera', async () => {
    // Registrar a recusa avança a pergunta, que é exatamente o que a trava impede:
    // a resposta em curso morreria no meio de si mesma.
    const onToggleSkip = vi.fn();
    stage({ onToggleSkip });

    await userEvent.click(screen.getByRole('button', { name: 'sem resposta' }));

    expect(onToggleSkip).not.toHaveBeenCalled();
  });

  it('parar continua vivo — é o único caminho de saída', async () => {
    const { onStop } = stage();

    await userEvent.click(screen.getByRole('button', { name: /parar/i }));

    expect(onStop).toHaveBeenCalledTimes(1);
  });
});

describe('parou a gravação: tudo volta', () => {
  it('voltar e avançar respondem de novo assim que a resposta está guardada', async () => {
    const { onPrev, onNext } = stage({ recorderState: 'recorded' });

    await userEvent.click(screen.getByRole('button', { name: /anterior|voltar/i }));
    await userEvent.click(screen.getByRole('button', { name: /próxima|seguinte/i }));

    expect(onPrev).toHaveBeenCalledTimes(1);
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('sem gravação nenhuma em curso, nada está travado', async () => {
    const { onSpeakQuestion } = stage({ recorderState: 'idle' });

    await userEvent.click(screen.getByRole('button', { name: /ouvir a pergunta/i }));

    expect(onSpeakQuestion).toHaveBeenCalledTimes(1);
  });
});
