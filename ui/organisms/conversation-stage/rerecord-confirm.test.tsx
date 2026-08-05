import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ConversationStage, type ConversationStageProps } from './conversation-stage';

/**
 * ENG-392 — regravar por cima de uma resposta pergunta antes.
 *
 * Hoje "de novo" descarta a resposta gravada em silêncio. Uma pessoa de cultura
 * oral acabou de contar uma história naquele microfone, e um toque errado apaga
 * — é o erro mais caro que o app permite, e os rótulos nem diziam o que os
 * botões faziam.
 *
 * O foco cai na ação SEGURA (decisão do dono, 2026-08-04): é a convenção do
 * seam-modal e do §9.5 "guiar, nunca punir". Um Enter distraído preserva a
 * gravação em vez de apagá-la.
 */

function recordedStage(props: Partial<ConversationStageProps> = {}) {
  const onRerecord = vi.fn();
  const view = render(
    <ConversationStage
      question="Sobre o que é essa história?"
      recorderState="recorded"
      answerLength="cerca de um minuto"
      progress={{ total: 11, current: 1 }}
      trechos={[]}
      onRerecord={onRerecord}
      {...props}
    />,
  );
  return { ...view, onRerecord };
}

const abrirRegravar = () => userEvent.click(screen.getByRole('button', { name: 'gravar de novo' }));

describe('pedir para regravar', () => {
  it('os botões da resposta dizem o que fazem', () => {
    recordedStage();

    expect(screen.getByRole('button', { name: 'ouvir a resposta' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'gravar de novo' })).toBeTruthy();
  });

  it('abrir a confirmação ainda não apaga nada', async () => {
    const { onRerecord } = recordedStage();

    await abrirRegravar();

    expect(screen.getByRole('alertdialog')).toBeTruthy();
    expect(onRerecord).not.toHaveBeenCalled();
  });

  it('a confirmação diz quanto tempo de resposta está em risco', async () => {
    recordedStage();

    await abrirRegravar();

    expect(screen.getByRole('alertdialog').textContent).toContain('cerca de um minuto');
  });

  it('e diz isso sem um único dígito — é tela de ouvinte (§9.2)', async () => {
    /* O diálogo abre num portal, fora da raiz que o scanner de minimalismo do e2e
       varre, então nenhuma das guardas o alcança. Esta é a que alcança. */
    recordedStage();

    await abrirRegravar();

    expect(screen.getByRole('alertdialog').textContent ?? '').not.toMatch(/\d/);
  });
});

describe('decidir', () => {
  it('confirmar apaga e já começa a gravar — uma intenção, um toque', async () => {
    const { onRerecord } = recordedStage();
    await abrirRegravar();

    await userEvent.click(screen.getByRole('button', { name: /apagar e gravar de novo/i }));

    expect(onRerecord).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('"manter a gravação" fecha sem apagar', async () => {
    const { onRerecord } = recordedStage();
    await abrirRegravar();

    await userEvent.click(screen.getByRole('button', { name: /manter a gravação/i }));

    expect(onRerecord).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('Esc mantém a gravação', async () => {
    const { onRerecord } = recordedStage();
    await abrirRegravar();

    await userEvent.keyboard('{Escape}');

    expect(onRerecord).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
});

describe('a confirmação não vira imposto no caminho normal', () => {
  it('sem resposta gravada, gravar começa direto e não abre diálogo nenhum', async () => {
    const onRecord = vi.fn();
    render(
      <ConversationStage
        question="Sobre o que é essa história?"
        recorderState="idle"
        progress={{ total: 11, current: 1 }}
        trechos={[]}
        onRecord={onRecord}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'gravar a resposta' }));

    expect(onRecord).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
});
