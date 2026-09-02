import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';

import {
  buildBeads,
  createSession,
  type Frase,
  type ScenePart,
  type SessionState,
  type Span,
} from '../../../domain';
// as MESMAS folhas globais que ui/app/main.tsx carrega (precedente:
// ui/pages/setup/setup.browser.test.tsx) — sem elas faltam os tokens --cds- e o
// `--cds-shell-inset` que o app.css calcula, e a medida abaixo mediria uma
// estação que não existe em produção.
import '../../app/app.css';
import '../../tokens/base.css';
import '../../tokens/tokens.css';
import { NavFooterOutlet, NavFooterProvider } from '../../organisms/nav-footer/nav-footer';
import { sessionStore } from '../../state';
import Review from './index';

/**
 * ENG-730, em Chromium de verdade: jsdom não tem layout, e o que falta provar
 * aqui não é só "a página não rola" (isso o teto do colar já garante, ver
 * review.test.tsx) — é que a Rever se comporta como Escuta/Cortar/Triagem/
 * Frases também no eixo vertical: com uma história curta, o conteúdo fica
 * CENTRADO na área útil, não grudado no topo com o vazio inteiro caindo
 * embaixo. O mecanismo é o mesmo `justify-content: center` que as outras
 * quatro já tinham no próprio seletor de raiz — não um cálculo novo.
 *
 * Montagem fiel à composição real do shell (`ui/app/App.tsx`): `.cds-app` >
 * cabeçalho (aqui, um espaçador de 110px = 64 do cabeçalho + 46 da barra da
 * história, `app.css`) > `<main class="cds-app-main">` > a estação > o slot do
 * rodapé. É essa composição que faz `--cds-shell-inset` (a variável que
 * `.cds-review` usa no `min-height`) resolver para o valor de verdade
 * (`:has(.cds-nav-footer)`, 184px), em vez do fallback isolado do seletor.
 */

const CABECALHO_DO_SHELL = 110; // header 64px + barra da história 46px
const BEAD_SEC = 0.25;

function scene(id: string, span: Span, over: Partial<ScenePart> = {}): ScenePart {
  return {
    part_id: id,
    span,
    locked: true,
    scene_kind: 'BIRTH_SCENE',
    scene_kind_confidence: 'high',
    tag_state: 'tagged',
    ...over,
  };
}

function phrase(id: string, span: Span, part: string): Frase {
  return { prop_id: id, statement: '', qa: [], span, part_link: part, locked: true };
}

function concluded(parts: ScenePart[], frases: Frase[], durationSec: number): SessionState {
  const base = createSession({
    durationSec,
    beadSec: BEAD_SEC,
    beads: buildBeads(durationSec, BEAD_SEC),
    manifestId: 'fnv1a32:00000000',
    audioFilename: 'historia.wav',
    slug: 'historia',
  });
  return {
    ...base,
    whole: { ...base.whole, confirmed: true },
    partsConfirmed: true,
    mode: 'concluida',
    parts,
    frases,
    current: { layer: 'frases', index: -1 },
  };
}

/** Uma única cena curta, sem dúvida e sem linha de contexto — o caso "cabe de sobra". */
function shortStory(): SessionState {
  return concluded([scene('PT1', { s: 0, e: 9 })], [phrase('P1', { s: 0, e: 9 }, 'PT1')], 2.5);
}

/** 400 contas — bem mais do que o teto de fileiras do colar (ENG-730). */
function longStory(): SessionState {
  return concluded([scene('PT1', { s: 0, e: 399 })], [phrase('P1', { s: 0, e: 399 }, 'PT1')], 100);
}

let montado: { root: Root; host: HTMLElement } | null = null;

function desmontar(): void {
  if (!montado) return;
  const { root, host } = montado;
  montado = null;
  flushSync(() => root.unmount());
  host.remove();
  sessionStore.setState({ session: null, review: false, lock: null, online: true });
}
afterEach(desmontar);

async function montar(session: SessionState, altura = 900): Promise<void> {
  desmontar();
  await page.viewport(1280, altura);
  sessionStore.getState().load(session);

  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  montado = { root, host };

  flushSync(() =>
    root.render(
      <NavFooterProvider>
        <div className="cds-app">
          <div style={{ height: `${CABECALHO_DO_SHELL}px` }} />
          <main className="cds-app-main">
            <Review />
          </main>
          <NavFooterOutlet />
        </div>
      </NavFooterProvider>,
    ),
  );
}

describe('Rever — o conteúdo se comporta como as outras estações no eixo vertical (ENG-730)', () => {
  it('história curta: a folga sobra dos dois lados do conteúdo, não só embaixo', async () => {
    await montar(shortStory());

    const caixa = document.querySelector('.cds-review')!.getBoundingClientRect();
    const topoDoConteudo = document.querySelector('.cds-review-header')!.getBoundingClientRect();
    const fimDoConteudo = document.querySelector('.cds-review-scenes')!.getBoundingClientRect();

    const folgaAcima = topoDoConteudo.top - caixa.top;
    const folgaAbaixo = caixa.bottom - fimDoConteudo.bottom;
    const folgaTotal = folgaAcima + folgaAbaixo;

    // o bug relatado: quase toda a folga (o vazio da tela) caía embaixo, com o
    // conteúdo grudado no topo (só o padding). Centrado de verdade divide a
    // folga; a tolerância cobre a diferença de padding (16px/48px) entre topo e
    // rodapé da própria caixa, que nunca é o grosso da folga numa janela comum.
    expect(
      folgaTotal,
      'a história curta precisa deixar vazio para provar centralização',
    ).toBeGreaterThan(200);
    expect(folgaAcima / folgaTotal).toBeGreaterThan(0.35);
    expect(folgaAbaixo / folgaTotal).toBeGreaterThan(0.35);
  });

  it('história longa: o colar continua rolando por dentro, e centralizar não virou corte', async () => {
    await montar(longStory());

    const janela = document.querySelector<HTMLElement>('.cds-necklace-window')!;
    expect(
      janela.scrollHeight,
      'o colar tem de ter mais conteúdo do que a janela mostra',
    ).toBeGreaterThan(janela.clientHeight);

    // nada ficou de fora da tela: nem o rodapé, nem o resto do conteúdo
    const rodape = document.querySelector('.cds-nav-footer')!.getBoundingClientRect();
    expect(Math.round(rodape.bottom), 'o rodapé saiu da janela').toBeLessThanOrEqual(900);
    expect(
      Math.round(document.documentElement.scrollHeight - window.innerHeight),
      'a página inteira precisou rolar',
    ).toBe(0);
  });
});
