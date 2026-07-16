import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { Player } from '../../../adapters/audio';
import { buildBeads, createSession, type SessionState } from '../../../domain';
import { sessionStore } from '../../state';
import Escuta2 from './index';

/**
 * Modelo de clique em Chromium real (a geometria do colar só existe com layout):
 * cortando uma cena, o 1º toque fixa o início e toca só aquela conta, o 2º toca o
 * intervalo, e um 3º aproxima a borda mais próxima e toca SÓ a janela da fronteira
 * — provando a fiação colar↔domínio↔áudio de §8.2 que jsdom não alcança.
 */

const WIDTH = 500; // slot 25 → 20 contas por linha
const DURATION = 2.5;
const BEAD_SEC = 0.25; // 10 contas (0…9)

/** Player-espião: registra as chamadas de reprodução sem tocar áudio real. */
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

function cutting(): SessionState {
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
    mode: 'escuta',
    parts: [
      {
        part_id: 'PT1',
        span: null,
        locked: false,
        scene_kind: null,
        scene_kind_confidence: null,
        tag_state: 'pending',
      },
    ],
    current: { layer: 'parts', index: 0 },
    selection: null,
    pendingStart: null,
  };
}

function mount(player: Player): { host: HTMLDivElement; root: Root; el: HTMLElement } {
  const host = document.createElement('div');
  host.style.width = `${WIDTH}px`;
  document.body.appendChild(host);
  const root = createRoot(host);
  flushSync(() => root.render(<Escuta2 player={player} />));
  const el = host.querySelector('.cds-necklace') as HTMLElement;
  return { host, root, el };
}

function firePointer(el: HTMLElement, index: number): void {
  // centro do PRÓPRIO elemento da conta — imune a tamanho/offset de centralização
  const bead = el.querySelector(`.cds-necklace-bead[data-idx="${index}"]`);
  if (!bead) throw new Error(`conta ${index} não renderizada`);
  const r = bead.getBoundingClientRect();
  el.dispatchEvent(
    new PointerEvent('pointerdown', {
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
      bubbles: true,
      cancelable: true,
      clientX: r.left + r.width / 2,
      clientY: r.top + r.height / 2,
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

describe('Escuta 2 — modelo de clique com áudio na hora (PRD v2 §8.2/§8.4)', () => {
  it('1º toque fixa o início e toca a conta; 2º toca o intervalo; 3º toca só a fronteira', () => {
    const { player, calls } = spyPlayer();
    sessionStore.getState().load(cutting());
    const { root, el } = mount(player);

    // 1º toque: fixa o início e toca só aquela conta
    firePointer(el, 3);
    expect(calls.at(-1)).toEqual({ m: 'play', args: [3, 3] });
    expect(sessionStore.getState().session!.pendingStart).toBe(3);
    expect(sessionStore.getState().session!.selection).toEqual({ s: 3, e: 3 });

    // 2º toque: fecha o intervalo e toca o pedaço inteiro
    firePointer(el, 6);
    expect(calls.at(-1)).toEqual({ m: 'play', args: [3, 6] });
    expect(sessionStore.getState().session!.selection).toEqual({ s: 3, e: 6 });
    expect(sessionStore.getState().session!.pendingStart).toBeNull();

    // 3º toque: aproxima a borda mais próxima e toca SÓ a janela dela
    firePointer(el, 5);
    expect(calls.at(-1)).toEqual({ m: 'playEdge', args: [5] });
    expect(sessionStore.getState().session!.selection).toEqual({ s: 3, e: 5 });

    root.unmount();
  });
});
