import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  createPlayer,
  type DecodedAudio,
  FixtureTransport,
  type Player,
} from '../../../adapters/audio';
import { buildBeads, createSession, type Frase, type SessionState } from '../../../domain';
import { sessionStore } from '../../state';
import Phrases from './index';

/**
 * Modelo de clique na cena EM JANELA, em Chromium real (a geometria do colar só
 * existe com layout): fraseando a cena, o 1º toque fixa o início e toca só aquela
 * conta, o 2º toca o intervalo; confirmar trava a frase na cena — provando a
 * fiação colar↔domínio↔áudio de §8.2/§8.6 que o jsdom não alcança.
 */

const WIDTH = 500; // slot 25 → 20 contas por linha
const DURATION = 2.5;
const BEAD_SEC = 0.25; // 10 contas (0…9); cena {0,6} ⇒ janela começa na conta 0

/** Espião: serve às asserções de DESPACHO. Quem afirma pausa usa o `realPlayer`. */
type Call =
  { m: 'play' | 'playEdge'; args: number[] } | { m: 'toggle'; key: string; args: number[] };
function spyPlayer(): { player: Player; calls: Call[] } {
  const calls: Call[] = [];
  const player: Player = {
    toggle: (k, s, e) => calls.push({ m: 'toggle', key: k, args: [s, e] }),
    play: (s, e) => calls.push({ m: 'play', args: [s, e] }),
    playEdge: (b) => calls.push({ m: 'playEdge', args: [b] }),
    stop: () => {},
    state: { key: null, playing: false, paused: false },
    onHead: () => () => {},
  };
  return { player, calls };
}

function segmenting(): SessionState {
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
    mode: 'segmentacao',
    parts: [
      {
        part_id: 'PT1',
        span: { s: 0, e: 6 },
        locked: true,
        scene_kind: 'BIRTH_SCENE',
        scene_kind_confidence: 'alta',
        tag_state: 'tagged',
      },
    ],
    frases: [
      {
        prop_id: 'P1',
        statement_pt: '',
        qa: [],
        span: null,
        part_link: null,
        locked: false,
      },
    ],
    current: { layer: 'frases', index: 0 },
    activeSceneId: 'PT1',
    selection: null,
    pendingStart: null,
  };
}

function mount(player: Player): { host: HTMLDivElement; root: Root; el: HTMLElement } {
  const host = document.createElement('div');
  host.style.width = `${WIDTH}px`;
  document.body.appendChild(host);
  const root = createRoot(host);
  flushSync(() => root.render(<Phrases player={player} />));
  const el = host.querySelector('.cds-necklace') as HTMLElement;
  return { host, root, el };
}

function firePointer(el: HTMLElement, index: number): void {
  // centro do PRÓPRIO elemento da conta — imune a tamanho/offset de centralização
  const bead = el.querySelector(`.cds-necklace-bead[data-idx="${index}"]`);
  if (!bead) throw new Error(`conta ${index} não renderizada`);
  const r = bead.getBoundingClientRect();
  const x = r.left + r.width / 2;
  const y = r.top + r.height / 2;
  // um TAP real: down + up no mesmo ponto. O up só importa quando a conta é um
  // punho de arrasto (ENG-342), onde o toque só se confirma sem movimento.
  const at = (type: string) =>
    el.dispatchEvent(
      new PointerEvent(type, {
        pointerId: 1,
        pointerType: 'mouse',
        isPrimary: true,
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
        buttons: type === 'pointerdown' ? 1 : 0,
      }),
    );
  at('pointerdown');
  at('pointerup');
}

beforeEach(() => {
  sessionStore.setState({ session: null, review: false, lock: null, online: true });
});
afterEach(() => {
  sessionStore.setState({ session: null, review: false, lock: null, online: true });
});

function frase(over: Partial<Frase>): Frase {
  return {
    prop_id: 'P1',
    statement_pt: '',
    qa: [],
    span: null,
    part_link: null,
    locked: false,
    ...over,
  };
}

/** Frase um travada em 1…3, com a próxima aberta — a cena PT1 vai de 0 a 6. */
function withLockedPhrase(): SessionState {
  const base = segmenting();
  return {
    ...base,
    frases: [
      frase({ prop_id: 'P1', span: { s: 1, e: 3 }, part_link: 'PT1', locked: true }),
      frase({ prop_id: 'P2' }),
    ],
    current: { layer: 'frases', index: 1 },
  };
}

/** Player REAL sobre transport manual — a pausa mora no adapter; espião provaria o fake. */
const DECODED: DecodedAudio = {
  duration: DURATION,
  pcm: { numberOfChannels: 1, sampleRate: 8000, getChannelData: () => new Float32Array(20000) },
};
function realPlayer(): { player: Player; transport: FixtureTransport } {
  const transport = new FixtureTransport();
  return { player: createPlayer(transport, DECODED, BEAD_SEC), transport };
}
function advanceBy(transport: FixtureTransport, seconds: number, step = 0.05): void {
  let left = seconds;
  while (left > 1e-12) {
    const dt = Math.min(step, left);
    flushSync(() => transport.advance(dt));
    left -= dt;
  }
}

describe('Segmentação — uma frase travada pode ser ouvida (ENG-296)', () => {
  it('tocar numa conta da frase travada toca a FRASE inteira e deixa o corte quieto', () => {
    const { player, calls } = spyPlayer();
    sessionStore.getState().load(withLockedPhrase());
    const { root, el } = mount(player);

    firePointer(el, 2); // conta no meio da frase um (1…3)

    expect(calls).toEqual([{ m: 'toggle', key: 'P1', args: [1, 3] }]);
    expect(sessionStore.getState().session!.selection).toBeNull();
    expect(sessionStore.getState().session!.pendingStart).toBeNull();
    root.unmount();
  });

  it('a conta ainda livre continua cortando a próxima frase', () => {
    const { player, calls } = spyPlayer();
    sessionStore.getState().load(withLockedPhrase());
    const { root, el } = mount(player);

    firePointer(el, 5); // fora da frase travada, dentro da cena

    expect(calls.at(-1)).toEqual({ m: 'play', args: [5, 5] });
    expect(sessionStore.getState().session!.selection).toEqual({ s: 5, e: 5 });
    root.unmount();
  });

  it('a conta acesa pausa a frase pela chave própria — e não é clique morto', () => {
    const { player, transport } = realPlayer();
    sessionStore.getState().load(withLockedPhrase());
    const { root, el } = mount(player);

    firePointer(el, 2); // toca a frase travada
    advanceBy(transport, 0.3);
    expect(player.state).toEqual({ key: 'P1', playing: true, paused: false });

    const acesa = el.querySelector('.cds-necklace-bead[data-play="head"]');
    firePointer(el, Number(acesa!.getAttribute('data-idx')));

    expect(player.state).toEqual({ key: 'P1', playing: true, paused: true });
    root.unmount();
  });

  it('a conta acesa numa prévia de borda PARA — a estação não herda o bug da ENG-297', () => {
    const { player, transport } = realPlayer();
    sessionStore.getState().load(withLockedPhrase());
    const { root, el } = mount(player);

    // esta estação tem `onEdgeHover` → `playEdge`, que é SEM chave: sem o mesmo
    // guard da Escuta 2, a cabeça acesa aqui reiniciaria a frase em vez de parar
    flushSync(() => player.playEdge(2));
    advanceBy(transport, 0.3);
    const acesa = el.querySelector('.cds-necklace-bead[data-play="head"]');

    firePointer(el, Number(acesa!.getAttribute('data-idx')));

    expect(player.state.playing).toBe(false);
    root.unmount();
  });
});

describe('Segmentação — modelo de clique com áudio na cena em janela (PRD v2 §8.2/§8.6)', () => {
  it('1º toque fixa o início e toca a conta; 2º toca o intervalo; confirmar trava a frase', () => {
    const { player, calls } = spyPlayer();
    sessionStore.getState().load(segmenting());
    const { host, root, el } = mount(player);

    firePointer(el, 1);
    expect(calls.at(-1)).toEqual({ m: 'play', args: [1, 1] });
    expect(sessionStore.getState().session!.selection).toEqual({ s: 1, e: 1 });

    firePointer(el, 4);
    expect(calls.at(-1)).toEqual({ m: 'play', args: [1, 4] });
    expect(sessionStore.getState().session!.selection).toEqual({ s: 1, e: 4 });

    const confirm = [...host.querySelectorAll('button')].find(
      (b) => b.textContent === '✓ Confirmar esta frase',
    ) as HTMLButtonElement;
    flushSync(() => confirm.click());

    const locked = sessionStore.getState().session!.frases.find((f) => f.prop_id === 'P1')!;
    expect(locked.locked).toBe(true);
    expect(locked.span).toEqual({ s: 1, e: 4 });
    expect(locked.part_link).toBe('PT1');

    root.unmount();
  });
});
