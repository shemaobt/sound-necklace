import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { Player } from '../../../adapters/audio';
import { buildBeads, createSession, type SessionState } from '../../../domain';
import { beadPosition, SIZE_SEG, beadsPerRow } from '../../organisms/necklace/geometry';
import { sessionStore } from '../../state';
import Segmentacao from './index';

/**
 * Modelo de clique na cena EM JANELA, em Chromium real (a geometria do colar só
 * existe com layout): fraseando a cena, o 1º toque fixa o início e toca só aquela
 * conta, o 2º toca o intervalo; confirmar trava a frase na cena — provando a
 * fiação colar↔domínio↔áudio de §8.2/§8.6 que o jsdom não alcança.
 */

const WIDTH = 500; // slot 25 → 20 contas por linha
const DURATION = 2.5;
const BEAD_SEC = 0.25; // 10 contas (0…9); cena {0,6} ⇒ janela começa na conta 0

type Call = { m: 'play' | 'playEdge' | 'toggle'; args: number[] };
function spyPlayer(): { player: Player; calls: Call[] } {
  const calls: Call[] = [];
  const player: Player = {
    toggle: (_k, s, e) => calls.push({ m: 'toggle', args: [s, e] }),
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
        flagged: false,
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
  flushSync(() => root.render(<Segmentacao player={player} />));
  const el = host.querySelector('.cds-necklace') as HTMLElement;
  return { host, root, el };
}

function firePointer(el: HTMLElement, index: number): void {
  const rect = el.getBoundingClientRect();
  const pos = beadPosition(index, 0, beadsPerRow(rect.width, SIZE_SEG), SIZE_SEG);
  el.dispatchEvent(
    new PointerEvent('pointerdown', {
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
      bubbles: true,
      cancelable: true,
      clientX: rect.left + pos.left,
      clientY: rect.top + pos.top,
      buttons: 1,
    }),
  );
}

beforeEach(() => {
  sessionStore.setState({ session: null, review: false, lock: null, online: true });
});
afterEach(() => {
  sessionStore.setState({ session: null, review: false, lock: null, online: true });
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
