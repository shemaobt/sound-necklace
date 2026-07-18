/**
 * FixtureAudioEngine — decode determinístico a partir do spec de PCM dourado
 * (bytes = JSON de PcmSpec → LCG de tests/golden/pcm.ts), sem AudioContext.
 * Erros de decodificação saem tipados pela porta (AudioDecodeError).
 */

import { describe, expect, it } from 'vitest';

import { hashPCM } from '../../domain';
import { makePcm, type PcmSpec } from '../../tests/golden/pcm';
import { FixtureAudioEngine, pcmSpecBytes } from './fixture';

const SPEC: PcmSpec = { seed: 42, sampleRate: 8000, samples: 20000, channels: 1 };

describe('FixtureAudioEngine.decode — DecodedAudio sintetizado do spec dourado', () => {
  it('duração = samples/sampleRate e pcm alimenta a grade/hash do domínio', async () => {
    const engine = new FixtureAudioEngine();
    const decoded = await engine.decode(pcmSpecBytes(SPEC));
    expect(decoded.duration).toBe(2.5);
    expect(decoded.pcm.numberOfChannels).toBe(1);
    expect(decoded.pcm.sampleRate).toBe(8000);
    // byte-identidade com o PCM dourado: mesmo manifest_id que o LCG puro
    const oracle = {
      numberOfChannels: 1,
      sampleRate: 8000,
      getChannelData: () => makePcm(42, 20000),
    };
    expect(hashPCM(decoded.pcm, 0.25)).toBe(hashPCM(oracle, 0.25));
  });

  it('multicanal: todos os canais servem o mesmo LCG (hashPCM lê só o canal 0)', async () => {
    const engine = new FixtureAudioEngine();
    const decoded = await engine.decode(pcmSpecBytes({ ...SPEC, channels: 2 }));
    expect(decoded.pcm.numberOfChannels).toBe(2);
    expect(decoded.pcm.getChannelData(1)).toEqual(decoded.pcm.getChannelData(0));
  });

  it('bytes que não são um PcmSpec rejeitam com AudioDecodeError', async () => {
    const engine = new FixtureAudioEngine();
    const garbage = new TextEncoder().encode('RIFF????WAVEfmt ').buffer as ArrayBuffer;
    await expect(engine.decode(garbage)).rejects.toMatchObject({ name: 'AudioDecodeError' });
  });

  it('JSON válido mas com campos inválidos rejeita com AudioDecodeError', async () => {
    const engine = new FixtureAudioEngine();
    const bad = new TextEncoder().encode('{"seed":1,"sampleRate":0,"samples":-3}')
      .buffer as ArrayBuffer;
    await expect(engine.decode(bad)).rejects.toMatchObject({ name: 'AudioDecodeError' });
  });

  it('JSON "null" REJEITA (nunca lança síncrono — contrato de Promise da porta)', async () => {
    const engine = new FixtureAudioEngine();
    const bytes = new TextEncoder().encode('null').buffer as ArrayBuffer;
    await expect(engine.decode(bytes)).rejects.toMatchObject({ name: 'AudioDecodeError' });
  });

  it('samples não-inteiro rejeita com AudioDecodeError (Float32Array exige inteiro)', async () => {
    const engine = new FixtureAudioEngine();
    const bytes = new TextEncoder().encode(
      '{"seed":1,"sampleRate":8000,"samples":1.5,"channels":1}',
    ).buffer as ArrayBuffer;
    await expect(engine.decode(bytes)).rejects.toMatchObject({ name: 'AudioDecodeError' });
  });

  it('createPlayer devolve um player funcional dirigido pelo transport da fixture', async () => {
    const engine = new FixtureAudioEngine();
    const decoded = await engine.decode(pcmSpecBytes(SPEC));
    const player = engine.createPlayer(decoded, 0.25);
    const heads: (number | null)[] = [];
    player.onHead((h) => heads.push(h));
    player.toggle('all', 0, 9);
    engine.transport.advance(0.1);
    expect(player.state.playing).toBe(true);
    expect(heads[0]).toBe(0);
  });
});

describe('FixtureAudioEngine — volume master (ENG-314)', () => {
  it('setGain guarda o reforço pedido (hook de teste do wiring)', () => {
    const engine = new FixtureAudioEngine();
    expect(engine.gain).toBe(1);
    engine.setGain(1.8);
    expect(engine.gain).toBe(1.8);
  });
});
