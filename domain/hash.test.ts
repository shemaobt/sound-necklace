import { describe, expect, it } from 'vitest';

import { hashPCM, type PcmLike } from './hash';

/**
 * Gerador local de PCM sintético (LCG do contrato do harness,
 * tests/golden/README.md) — duplicado aqui de propósito: domain/ (inclusive
 * testes) não pode importar de tests/ (regra domain-nao-importa-camadas).
 */
function makePcm(seed: number, samples: number): Float32Array {
  const A = 1103515245n;
  const C = 12345n;
  const M = 2147483648n; // 2^31
  const pcm = new Float32Array(samples);
  let x = BigInt(seed) % M;
  for (let i = 0; i < samples; i++) {
    x = (A * x + C) % M;
    pcm[i] = Number(x) / 2 ** 30 - 1;
  }
  return pcm;
}

function pcmOf(data: Float32Array, channels = 1, sampleRate = 8000): PcmLike {
  return {
    numberOfChannels: channels,
    sampleRate,
    getChannelData: (ch: number) => {
      if (ch !== 0) throw new Error(`hashPCM só pode ler o canal 0 (leu ${ch})`);
      return data;
    },
  };
}

/**
 * Vetores conhecidos computados por emulação INDEPENDENTE em Python
 * (float32 via struct + Math.round de empate-para-+∞ via floor(x+0.5),
 * válido aqui porque todos os produtos amostra×32767 são doubles exatos):
 *
 *   def f32(x): return struct.unpack('<f', struct.pack('<f', x))[0]
 *   def js_round(x): return math.floor(x + 0.5)
 *   h=0x811c9dc5; mix: h^=b; h=(h*0x01000193)&0xffffffff
 *   bytes: [ch, rate&255, rate>>8&255, N&255, N>>8&255, N>>16&255, N>>24&255],
 *   depois amostras (stride=max(1,N//100000)) como int16 LE em complemento de
 *   dois, depois round(beadSec*1000) em 3 bytes LE.
 */
describe('hashPCM — vetores conhecidos (oráculo independente)', () => {
  it('arredondamento de empates e clamp: 0.5→16384, −0.5→−16383, ±1.5→32767/−32768', () => {
    const data = new Float32Array([0.5, -0.5, 1.0, -1.0, 1.5, -1.5, 0]);
    expect(hashPCM(pcmOf(data), 0.25)).toBe('fnv1a32:4684f298');
  });

  it('PCM LCG seed=1, 100 amostras (stride 1)', () => {
    expect(hashPCM(pcmOf(makePcm(1, 100)), 0.5)).toBe('fnv1a32:6d4432e1');
  });

  it('PCM LCG seed=42, 64 amostras, sampleRate 48000, beadSec 1.0', () => {
    expect(hashPCM(pcmOf(makePcm(42, 64), 1, 48000), 1.0)).toBe('fnv1a32:c1186961');
  });

  it('numberOfChannels entra no hash (mesmo PCM, 2 canais ≠ 1 canal)', () => {
    expect(hashPCM(pcmOf(makePcm(1, 100), 2), 0.5)).toBe('fnv1a32:74ab4ef2');
  });
});

describe('hashPCM — vetores derivados da referência (goldens comitados)', () => {
  it('N=441000 > 100k: stride 4, hash do caso golden manifest-only', () => {
    expect(hashPCM(pcmOf(makePcm(42, 441000), 1, 44100), 0.25)).toBe('fnv1a32:5a1b22f1');
  });

  it('N=455000: hash do caso golden partial-bead', () => {
    expect(hashPCM(pcmOf(makePcm(7, 455000), 1, 44100), 0.3)).toBe('fnv1a32:1a884f38');
  });
});

describe('hashPCM — propriedades estruturais', () => {
  it('sampleRate mistura SÓ os 2 bytes baixos: 44100 e 44100+65536 colidem', () => {
    const data = makePcm(1, 100);
    const a = hashPCM(pcmOf(data, 1, 44100), 0.5);
    const b = hashPCM(pcmOf(data, 1, 44100 + 65536), 0.5);
    expect(a).toBe(b);
  });

  it('só o canal 0 influencia o hash (canal 1 diferente ⇒ hash igual)', () => {
    const ch0 = makePcm(3, 50);
    const stereoA: PcmLike = {
      numberOfChannels: 2,
      sampleRate: 8000,
      getChannelData: (ch) => (ch === 0 ? ch0 : makePcm(99, 50)),
    };
    const stereoB: PcmLike = {
      numberOfChannels: 2,
      sampleRate: 8000,
      getChannelData: (ch) => (ch === 0 ? ch0 : makePcm(1234, 50)),
    };
    expect(hashPCM(stereoA, 0.5)).toBe(hashPCM(stereoB, 0.5));
  });
});
