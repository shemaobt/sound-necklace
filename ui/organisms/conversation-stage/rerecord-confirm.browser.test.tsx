import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { page } from 'vitest/browser';
import { afterEach, describe, expect, it, vi } from 'vitest';

import '../../tokens/fonts';
import '../../tokens/tokens.css';
import '../../tokens/base.css';

import i18n from '../../i18n';
import { ConversationStage } from './conversation-stage';

/**
 * ENG-507 — as duas ações do diálogo de regravar dividem uma linha, também em PT.
 *
 * Em português os rótulos são longos ("Apagar e gravar de novo" / "Manter a
 * gravação") e a linha quebrava: a segunda ação caía sozinha embaixo. É medida
 * no Chromium de verdade porque a pergunta é de layout — jsdom não mede nada.
 */

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  flushSync(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

function byLabel(scope: HTMLElement, label: string): HTMLButtonElement {
  const found = [...scope.querySelectorAll('button')].find((b) => b.textContent?.includes(label));
  if (!found) throw new Error(`botão "${label}" não encontrado`);
  return found;
}

/**
 * Janela de trabalho: larga o bastante para o painel ficar na largura de desenho
 * (520px), que é onde o dono viu a linha quebrada. O iframe padrão do vitest é
 * estreito demais — lá empilhar é a saída honesta, e não é o caso desta issue.
 */
async function abrirConfirmacao(lang: 'pt' | 'en'): Promise<HTMLElement> {
  await page.viewport(1024, 768);
  await i18n.changeLanguage(lang);
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  flushSync(() =>
    root!.render(
      <ConversationStage
        question="O que aconteceu aqui?"
        recorderState="recorded"
        answerLength="cerca de um minuto"
        progress={{ total: 3, current: 0 }}
        trechos={[]}
      />,
    ),
  );

  byLabel(host, i18n.t('conversationStage.again')).click();

  const dialog = await vi.waitFor(() => {
    const found = document.body.querySelector<HTMLElement>('[role="alertdialog"]');
    expect(found).not.toBeNull();
    return found!;
  });
  // Montserrat é servida do bundle: medir antes de a fonte assentar mede outra tipografia
  await document.fonts.ready;
  return dialog;
}

function dividemUmaLinha(a: Element, b: Element): boolean {
  const um = a.getBoundingClientRect();
  const outro = b.getBoundingClientRect();
  return um.bottom > outro.top && outro.bottom > um.top;
}

describe('as ações da confirmação de regravar', () => {
  it('dividem uma linha em português, sem estourar o diálogo', async () => {
    const dialog = await abrirConfirmacao('pt');

    const manter = byLabel(dialog, 'Manter a gravação');
    const apagar = byLabel(dialog, 'Apagar e gravar de novo');

    expect(dividemUmaLinha(manter, apagar)).toBe(true);
    expect(dialog.scrollWidth).toBeLessThanOrEqual(dialog.clientWidth);
  });

  it('dividem uma linha em inglês, sem estourar o diálogo', async () => {
    const dialog = await abrirConfirmacao('en');

    const manter = byLabel(dialog, 'Keep the recording');
    const apagar = byLabel(dialog, 'Erase and record again');

    expect(dividemUmaLinha(manter, apagar)).toBe(true);
    expect(dialog.scrollWidth).toBeLessThanOrEqual(dialog.clientWidth);
  });
});
