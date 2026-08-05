import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ConversationStage, type ConversationStageProps } from './conversation-stage';

/**
 * Testes de interação em Chromium real (Vitest browser mode) — obrigatórios para
 * o gravador da conversa (uma das três superfícies interaction-critical do
 * CLAUDE.md). Como não há vitest-browser-react no repo, seguimos o padrão do
 * colar: render por createRoot/flushSync e clique nativo. O organismo é
 * apresentacional — o MediaRecorder vive no adapter; aqui provamos a máquina de
 * estados dirigida por props e a ordem dos callbacks.
 */

let root: Root | null = null;
let host: HTMLDivElement | null = null;

function mount(props: ConversationStageProps): HTMLElement {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  flushSync(() => root!.render(<ConversationStage {...props} />));
  return host;
}

function update(props: ConversationStageProps): void {
  flushSync(() => root!.render(<ConversationStage {...props} />));
}

afterEach(() => {
  flushSync(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

function base(over: Partial<ConversationStageProps> = {}): ConversationStageProps {
  return {
    question: 'O que aconteceu aqui?',
    recorderState: 'idle',
    progress: { total: 3, current: 0 },
    trechos: [
      {
        count: 3,
        color: { base: '#a9a06a', lit: '#a9a06a', deep: '#a9a06a' },
        label: 'A história',
      },
    ],
    ...over,
  };
}

function byText(el: HTMLElement, text: string): HTMLButtonElement {
  // nome acessível: texto visível OU aria-label (o "Parar" vive no botão redondo)
  const found = [...el.querySelectorAll('button')].find(
    (b) => b.textContent?.trim() === text || b.getAttribute('aria-label') === text,
  );
  if (!found) throw new Error(`botão "${text}" não encontrado`);
  return found;
}

describe('ConversationStage — fluxo do gravador (Chromium real; CLAUDE.md gate 4)', () => {
  it('idle→gravando→gravado→gravar de novo, callbacks na ordem, forma de onda pelos níveis', async () => {
    const calls: string[] = [];
    const handlers = {
      onRecord: vi.fn(() => calls.push('record')),
      onStop: vi.fn(() => calls.push('stop')),
      onPlay: vi.fn(() => calls.push('play')),
      onRerecord: vi.fn(() => calls.push('rerecord')),
    };

    const el = mount(base({ recorderState: 'idle', ...handlers }));

    // idle → toca o microfone
    const mic = el.querySelector('.cds-conversation-stage-mic') as HTMLButtonElement;
    expect(mic).not.toBeNull();
    mic.click();
    expect(handlers.onRecord).toHaveBeenCalledTimes(1);

    // gravando → a forma de onda reflete os níveis por prop
    update(base({ recorderState: 'recording', levels: [5, 12, 7], ...handlers }));
    // sempre 46 barras (protótipo recBars); os níveis reais dirigem as primeiras
    const bars = el.querySelectorAll<HTMLElement>('.cds-waveform-bar');
    expect(bars).toHaveLength(46);
    expect(bars[1]!.style.getPropertyValue('--cds-bar-height')).toBe('12px');

    // parar
    byText(el, 'Parar').click();
    expect(handlers.onStop).toHaveBeenCalledTimes(1);

    // gravado → ouvir a resposta / gravar de novo
    update(base({ recorderState: 'recorded', answerLength: 'cerca de um minuto', ...handlers }));
    byText(el, 'ouvir a resposta').click();
    byText(el, 'gravar de novo').click();
    // regravar passa pela confirmação (ENG-392): abrir ainda não apaga nada
    expect(handlers.onRerecord).not.toHaveBeenCalled();
    // o portal do Radix monta num segundo passe — esperar é o contrato, não flake
    const apagar = await vi.waitFor(() => byText(document.body, 'Apagar e gravar de novo'));
    apagar.click();
    expect(handlers.onPlay).toHaveBeenCalledTimes(1);
    expect(handlers.onRerecord).toHaveBeenCalledTimes(1);

    expect(calls).toEqual(['record', 'stop', 'play', 'rerecord']);
  });

  /**
   * ENG-392 — foco inicial na ação SEGURA. Fica no Chromium real porque é foco de
   * verdade dentro do focus scope do Radix: no jsdom isso não é a mesma coisa.
   */
  it('a confirmação de regravar abre com o foco em "Manter a gravação"', async () => {
    const onRerecord = vi.fn();
    const el = mount(
      base({ recorderState: 'recorded', answerLength: 'cerca de um minuto', onRerecord }),
    );

    byText(el, 'gravar de novo').click();

    const dialog = await vi.waitFor(() => {
      const found = document.body.querySelector<HTMLElement>('[role="alertdialog"]');
      expect(found).not.toBeNull();
      return found!;
    });
    const manter = byText(dialog, 'Manter a gravação');
    const apagar = byText(dialog, 'Apagar e gravar de novo');

    await vi.waitFor(() => expect(document.activeElement).toBe(manter));
    expect(document.activeElement).not.toBe(apagar);
    expect(onRerecord).not.toHaveBeenCalled();
  });

  it('a navegação dispara prev/próxima', () => {
    const onPrev = vi.fn();
    const onNext = vi.fn();
    const el = mount(base({ onPrev, onNext }));
    byText(el, '← anterior').click();
    byText(el, 'Próxima pergunta').click();
    expect(onPrev).toHaveBeenCalledTimes(1);
    expect(onNext).toHaveBeenCalledTimes(1);
  });
});
