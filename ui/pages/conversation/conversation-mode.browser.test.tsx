import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { page } from 'vitest/browser';
import { afterEach, describe, expect, it, vi } from 'vitest';

import '../../tokens/fonts';
import '../../tokens/tokens.css';
import '../../tokens/base.css';
import '../../app/app.css';

import {
  buildBeads,
  createSession,
  type ScenePart,
  type SessionState,
  type Span,
} from '../../../domain';
import { Header } from '../../app/header';
import { Stepper } from '../../app/stepper';
import { stepperStations } from '../../app/stepper-model';
import i18n from '../../i18n';
import { NavFooterOutlet, NavFooterProvider } from '../../organisms/nav-footer/nav-footer';
import { sessionStore } from '../../state';
import Conversation from './index';

/**
 * ENG-649 no Chromium de verdade — só as duas perguntas que jsdom não sabe responder.
 *
 * O resto do modo (falar ao chegar, abrir o microfone, a próxima chegando sozinha,
 * o cancelamento por um toque) é lógica com relógio, e está provado em
 * `hands-free.test.tsx` com um relógio controlado. Trazê-lo para cá custaria esperas
 * reais de 2,6 s dentro de uma suíte que este repositório já viu ficar intermitente
 * por correr contra o tempo — pior teste, mesma garantia.
 *
 * O que só um navegador decide é ONDE as coisas caem e o que um toque alcança:
 *   1. o pedido do modo de fato cobre a entrevista — um toque mirado no microfone
 *      não chega nele, ele para no véu;
 *   2. a pílula que devolve ao "toque a toque" está alcançável enquanto o mãos
 *      livres corre — inteira na janela e sem nada por cima.
 * A segunda é a saída de emergência do modo em que ninguém está olhando para a
 * tela; se ela estiver coberta ou fora da janela, o modo é uma armadilha.
 */

const DURATION = 7.5;
const BEAD_SEC = 0.25;

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  flushSync(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

function tagged(id: string, span: Span): ScenePart {
  return {
    part_id: id,
    span,
    locked: true,
    scene_kind: 'BIRTH_SCENE',
    scene_kind_confidence: 'high',
    tag_state: 'tagged',
  };
}

function emEntrevista(): SessionState {
  const base = createSession({
    durationSec: DURATION,
    beadSec: BEAD_SEC,
    beads: buildBeads(DURATION, BEAD_SEC),
    manifestId: 'fnv1a32:00000000',
    audioFilename: 'historia.wav',
    slug: 'historia',
  });
  return {
    ...base,
    whole: { ...base.whole, confirmed: true },
    partsConfirmed: true,
    mode: 'mapeamento',
    parts: [tagged('PT1', { s: 2, e: 8 })],
    frases: [],
  };
}

function botao(rotulo: string | RegExp): HTMLElement | undefined {
  return [...document.body.querySelectorAll('button')].find((b) => {
    const texto = `${b.textContent ?? ''} ${b.getAttribute('aria-label') ?? ''}`;
    return typeof rotulo === 'string' ? texto.includes(rotulo) : rotulo.test(texto);
  });
}

/** Monta a conversa dentro do shell real — chrome em cima, rodapé embaixo. */
async function abrirConversa(): Promise<void> {
  await page.viewport(1024, 768);
  const state = emEntrevista();
  sessionStore.getState().load(state);

  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  flushSync(() =>
    root!.render(
      <NavFooterProvider>
        <div className="cds-app">
          <Header muted={false} onToggleMuted={() => {}} onBack={() => {}} />
          <Stepper stations={stepperStations(state)} onNavigate={() => {}} />
          <main className="cds-app-main">
            <Conversation onGoToExport={() => {}} />
          </main>
          <NavFooterOutlet />
        </div>
      </NavFooterProvider>,
    ),
  );
  await document.fonts.ready;
}

/** O que um toque no CENTRO deste elemento realmente alcança. */
function oQueOToqueAlcanca(el: HTMLElement): Element | null {
  const r = el.getBoundingClientRect();
  return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
}

function naJanela(el: HTMLElement): boolean {
  const r = el.getBoundingClientRect();
  return (
    r.top >= 0 && r.bottom <= window.innerHeight && r.left >= 0 && r.right <= window.innerWidth
  );
}

describe('ENG-649 — o modo da conversa, medido no navegador', () => {
  it('o pedido do modo cobre a entrevista: um toque no microfone para no véu', async () => {
    await abrirConversa();

    const cartao = await vi.waitFor(() => {
      const achado = botao(i18n.t('conversationMode.handsFree'));
      expect(achado, 'o pedido do modo não apareceu').toBeTruthy();
      return achado!;
    });
    // o cartão é alcançável…
    expect(oQueOToqueAlcanca(cartao)).toBeTruthy();
    expect(cartao.contains(oQueOToqueAlcanca(cartao))).toBe(true);

    // …e o microfone atrás dele não é: existe no documento, e o toque não chega
    const microfone = botao(i18n.t('conversationStage.record'));
    expect(microfone, 'a entrevista não foi montada atrás do pedido').toBeTruthy();
    expect(microfone!.contains(oQueOToqueAlcanca(microfone!))).toBe(false);
  });

  it('em mãos livres, a volta ao modo quieto continua alcançável', async () => {
    await abrirConversa();

    const maosLivres = await vi.waitFor(() => {
      const achado = botao(i18n.t('conversationMode.handsFree'));
      expect(achado).toBeTruthy();
      return achado!;
    });
    maosLivres.click();

    const pilula = await vi.waitFor(() => {
      const achado = botao(i18n.t('conversationMode.pillHandsFree'));
      expect(achado, 'a pílula do modo não apareceu').toBeTruthy();
      return achado!;
    });

    // que ela TROCA o modo é jsdom quem prova; aqui a pergunta é outra — ela está
    // inteira na janela, e nada foi desenhado por cima dela
    expect(naJanela(pilula), 'a saída do mãos livres caiu fora da janela').toBe(true);
    expect(pilula.contains(oQueOToqueAlcanca(pilula)), 'algo cobre a saída do mãos livres').toBe(
      true,
    );
  });
});
