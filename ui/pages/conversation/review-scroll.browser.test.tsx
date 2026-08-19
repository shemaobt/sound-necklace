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
  ensureMapping,
  type Frase,
  questionSequence,
  type ScenePart,
  type SessionState,
  setAnswer,
  type Span,
} from '../../../domain';
import { Header } from '../../app/header';
import { Stepper } from '../../app/stepper';
import { stepperStations } from '../../app/stepper-model';
import i18n from '../../i18n';
import { questionTextFor } from '../../i18n/conversation-questions';
import { NavFooterOutlet, NavFooterProvider } from '../../organisms/nav-footer/nav-footer';
import { sessionStore } from '../../state';
import Conversation from './index';

/**
 * ENG-509 — na revisão, quem rola são os cartões; o rodapé fica.
 *
 * A revisão é a única fase da conversa que passa da janela: são dezenas de cartões.
 * A estação crescia junto, o documento inteiro rolava, e o rodapé de navegação —
 * que mora no shell, DEPOIS da estação — descia com ele: para alcançar "guardar os
 * documentos" era preciso rolar por toda a entrevista.
 *
 * Medido em Chromium de verdade, com o chrome real do shell (cabeçalho + fio de
 * contas) montado em volta: a pergunta é onde as coisas caem na janela, e jsdom não
 * mede nada. Nenhuma asserção lê `overflow`, `min-height` ou classe — só onde a
 * pessoa vê e alcança as duas ações, e quem se moveu quando ela rolou.
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

function part(overrides: Partial<ScenePart>): ScenePart {
  return {
    part_id: 'PT1',
    span: null,
    locked: false,
    scene_kind: null,
    scene_kind_confidence: null,
    tag_state: 'pending',
    ...overrides,
  };
}

function tagged(id: string, span: Span): ScenePart {
  return part({
    part_id: id,
    span,
    locked: true,
    scene_kind: 'BIRTH_SCENE',
    scene_kind_confidence: 'high',
    tag_state: 'tagged',
  });
}

function frase(id: string, span: Span): Frase {
  return { prop_id: id, statement: '', qa: [], span, part_link: 'PT1', locked: true };
}

/**
 * Uma sessão com a conversa INTEIRA respondida: 11 de nível 1 + 5 por cena travada
 * + 5 por frase produtiva. Com a última pergunta respondida, montar a estação cai
 * direto na revisão (ENG-367) — sem os 31 cliques de percorrer a entrevista.
 */
function revisada(): SessionState {
  const base = createSession({
    durationSec: DURATION,
    beadSec: BEAD_SEC,
    beads: buildBeads(DURATION, BEAD_SEC),
    manifestId: 'fnv1a32:00000000',
    audioFilename: 'historia.wav',
    slug: 'historia',
  });
  const state = ensureMapping({
    ...base,
    whole: { ...base.whole, confirmed: true },
    partsConfirmed: true,
    mode: 'mapeamento',
    parts: [tagged('PT1', { s: 2, e: 8 }), tagged('PT2', { s: 9, e: 15 })],
    frases: [frase('P1', { s: 2, e: 4 }), frase('P2', { s: 5, e: 8 })],
  });
  return questionSequence(state).reduce(
    (s, slot) => setAnswer(s, slot, 'O golfinho levou a história para o outro lado da baía.'),
    state,
  );
}

interface Revisao {
  /** As duas ações do rodapé, como a facilitadora as procura: pelo rótulo. */
  voltar: HTMLElement;
  guardar: HTMLElement;
  /** As perguntas na ordem em que aparecem na revisão. */
  perguntas: HTMLElement[];
}

/** Monta a revisão dentro do shell real — chrome em cima, rodapé embaixo. */
async function abrirRevisao(largura: number, altura: number): Promise<Revisao> {
  await page.viewport(largura, altura);
  const state = revisada();
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

  const acoes = await vi.waitFor(() => {
    const rotulo = (texto: string): HTMLElement | undefined =>
      [...document.body.querySelectorAll('button')].find((b) => b.textContent?.includes(texto));
    const voltar = rotulo(i18n.t('conversation.prev'));
    const guardar = rotulo(i18n.t('conversation.toExport'));
    expect(voltar, 'a revisão não publicou "anterior"').toBeTruthy();
    expect(guardar, 'a revisão não publicou "guardar os documentos"').toBeTruthy();
    return { voltar: voltar!, guardar: guardar! };
  });

  // as fontes do bundle mudam a altura dos cartões: medir antes delas assentarem
  // mede outra tipografia
  await document.fonts.ready;

  const textos = new Set(questionSequence(state).map((s) => questionTextFor(s, i18n.language)));
  const perguntas = [...document.body.querySelectorAll('p')].filter((p) =>
    textos.has(p.textContent ?? ''),
  );
  expect(perguntas.length, 'a revisão não trouxe as perguntas').toBeGreaterThan(20);

  return { ...acoes, perguntas };
}

/** Está inteiramente dentro da janela — nem cortado embaixo, nem acima da dobra. */
function naJanela(el: HTMLElement): boolean {
  const r = el.getBoundingClientRect();
  return r.top >= 0 && r.bottom <= window.innerHeight;
}

describe('a revisão rola por dentro e o rodapé fica', () => {
  it('depois de ir até a última pergunta, as duas ações continuam na janela', async () => {
    const { voltar, guardar, perguntas } = await abrirRevisao(1024, 768);

    perguntas.at(-1)!.scrollIntoView({ block: 'end' });

    expect(naJanela(guardar), '"guardar os documentos" saiu da janela').toBe(true);
    expect(naJanela(voltar), '"anterior" saiu da janela').toBe(true);
  });

  it('quem rolou foi a lista de cartões, não o documento', async () => {
    const { perguntas } = await abrirRevisao(1024, 768);
    const documento = document.scrollingElement!;
    const antesDoDocumento = documento.scrollTop;
    const antesDaPrimeira = perguntas[0]!.getBoundingClientRect().top;

    perguntas.at(-1)!.scrollIntoView({ block: 'end' });

    expect(documento.scrollTop, 'o documento inteiro rolou junto').toBe(antesDoDocumento);
    expect(
      perguntas[0]!.getBoundingClientRect().top,
      'nada se moveu: a última pergunta já estava à vista, o cenário não transborda',
    ).toBeLessThan(antesDaPrimeira - 100);
  });
});
