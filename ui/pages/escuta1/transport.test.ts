import { describe, expect, it } from 'vitest';

import {
  FixtureAudioEngine,
  type PcmSpec,
  pcmSpecBytes,
  type Player,
} from '../../../adapters/audio';
import { makeTransportHandlers } from './transport';

/**
 * O transporte da Escuta 1 espelha o §8.2 (o colar é o transporte): o botão
 * grande toca a partir do começo, tocar numa conta toca a partir dela, e tocar a
 * cabeça brilhante pausa/retoma. Dirigido com áudio de fixture (relógio falso),
 * afirmado pela saída observável (head emitido, player.state) — nunca por dentro.
 */

const SPEC: PcmSpec = { seed: 42, sampleRate: 8000, samples: 20000, channels: 1 }; // duração 2.5 s
const BEAD_SEC = 0.25; // 10 contas (0…9)
const TOTAL = 10;

async function setup(): Promise<{
  engine: FixtureAudioEngine;
  player: Player;
  heads: (number | null)[];
  handlers: ReturnType<typeof makeTransportHandlers>;
}> {
  const engine = new FixtureAudioEngine();
  const decoded = await engine.decode(pcmSpecBytes(SPEC));
  const player = engine.createPlayer(decoded, BEAD_SEC);
  const heads: (number | null)[] = [];
  player.onHead((h) => heads.push(h));
  const handlers = makeTransportHandlers(player, TOTAL);
  return { engine, player, heads, handlers };
}

describe('transporte da Escuta 1 (PRD v2 §8.2)', () => {
  it('o botão grande toca a história a partir do começo', async () => {
    const { engine, player, heads, handlers } = await setup();
    handlers.onBig();
    engine.transport.advance(0.05);
    expect(player.state.playing).toBe(true);
    expect(heads[0]).toBe(0);
  });

  it('tocar numa conta toca a partir dela', async () => {
    const { engine, heads, handlers } = await setup();
    handlers.onBead(4);
    engine.transport.advance(0.05);
    expect(heads[0]).toBe(4);
  });

  it('tocar a cabeça brilhante pausa; tocar de novo retoma', async () => {
    const { engine, player, handlers } = await setup();
    handlers.onBig();
    engine.transport.advance(0.05);
    expect(player.state.paused).toBe(false);

    handlers.onHead();
    expect(player.state.paused).toBe(true);

    handlers.onHead();
    expect(player.state.paused).toBe(false);
  });

  it('tocar numa nova conta durante o playback reinicia dali (não pausa)', async () => {
    const { engine, player, heads, handlers } = await setup();
    handlers.onBig();
    engine.transport.advance(0.5); // cabeça na conta 2
    handlers.onBead(6);
    engine.transport.advance(0.05);
    expect(player.state.playing).toBe(true);
    expect(player.state.paused).toBe(false);
    expect(heads.at(-1)).toBe(6);
  });
});
