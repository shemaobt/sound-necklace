import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  FixtureAudioEngine,
  type PcmSpec,
  pcmSpecBytes,
  type Player,
} from '../../../adapters/audio';
import { buildBeads, createSession, type SessionState } from '../../../domain';
import { sessionStore } from '../../state';
import Listen from './index';

/**
 * Interação em Chromium real: o colar da Escuta 1 tem geometria de verdade, então
 * o toque por coordenada mapeia para a conta certa e dirige o player de fixture.
 * Prova a fiação colar↔estação↔áudio que jsdom (sem layout) não alcança: tocar
 * uma conta toca a partir dela; tocar a cabeça brilhante pausa.
 */

const WIDTH = 500; // slot 25 → 20 contas por linha
const DURATION = 2.5;
const BEAD_SEC = 0.25; // 10 contas (0…9)
const SPEC: PcmSpec = { seed: 42, sampleRate: 8000, samples: 20000, channels: 1 };

function makeSession(): SessionState {
  return createSession({
    durationSec: DURATION,
    beadSec: BEAD_SEC,
    beads: buildBeads(DURATION, BEAD_SEC),
    manifestId: 'fnv1a32:00000000',
    audioFilename: 'historia.wav',
    slug: 'historia',
  });
}

async function makePlayer(): Promise<{ engine: FixtureAudioEngine; player: Player }> {
  const engine = new FixtureAudioEngine();
  const decoded = await engine.decode(pcmSpecBytes(SPEC));
  return { engine, player: engine.createPlayer(decoded, BEAD_SEC) };
}

function mount(player: Player): { host: HTMLDivElement; root: Root; el: HTMLElement } {
  const host = document.createElement('div');
  host.style.width = `${WIDTH}px`;
  document.body.appendChild(host);
  const root = createRoot(host);
  flushSync(() => root.render(<Listen player={player} />));
  const el = host.querySelector('.cds-necklace') as HTMLElement;
  return { host, root, el };
}

function firePointer(el: HTMLElement, clientX: number, clientY: number): void {
  el.dispatchEvent(
    new PointerEvent('pointerdown', {
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
      bubbles: true,
      cancelable: true,
      clientX,
      clientY,
      buttons: 1,
    }),
  );
}

function beadClient(el: HTMLElement, index: number): { x: number; y: number } {
  // centro do PRÓPRIO elemento da conta — imune a tamanho/offset de centralização
  const bead = el.querySelector(`.cds-necklace-bead[data-idx="${index}"]`);
  if (!bead) throw new Error(`conta ${index} não renderizada`);
  const r = bead.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

beforeEach(() => {
  sessionStore.setState({ session: null, review: false, lock: null, online: true });
});
afterEach(() => {
  sessionStore.setState({ session: null, review: false, lock: null, online: true });
});

describe('Escuta 1 — o colar como transporte (PRD v2 §8.2/§8.3)', () => {
  it('tocar numa conta toca a história a partir dela', async () => {
    const { engine, player } = await makePlayer();
    const heads: (number | null)[] = [];
    player.onHead((h) => heads.push(h));
    sessionStore.getState().load(makeSession());
    const { el, root } = mount(player);

    const { x, y } = beadClient(el, 4);
    firePointer(el, x, y);
    engine.transport.advance(0.05);

    expect(heads[0]).toBe(4);
    root.unmount();
  });

  it('tocar a cabeça brilhante pausa o playback', async () => {
    const { engine, player } = await makePlayer();
    sessionStore.getState().load(makeSession());
    const { el, host, root } = mount(player);

    const start = beadClient(el, 0);
    firePointer(el, start.x, start.y);
    engine.transport.advance(0.5); // cabeça avança até a conta 2

    await vi.waitFor(() => {
      expect(
        host.querySelector('.cds-necklace-bead[data-idx="2"]')?.getAttribute('data-play'),
      ).toBe('head');
    });

    const head = beadClient(el, 2);
    firePointer(el, head.x, head.y);

    expect(player.state.paused).toBe(true);
    root.unmount();
  });
});
