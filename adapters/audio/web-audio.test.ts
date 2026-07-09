/**
 * WebAudioEngine — smoke atrás de feature detection: o projeto `unit` roda em
 * node (sem AudioContext — jsdom #2900 idem), então os testes reais aparecem
 * como PULADOS no reporter, com a razão no próprio nome (DoD da ENG-217).
 */

import { describe, expect, it } from 'vitest';

import { WebAudioEngine } from './web-audio';

const HAS_AUDIO = typeof AudioContext !== 'undefined';

/** WAV PCM16 mono mínimo — 200 amostras de rampa a 8 kHz. */
function tinyWav(): ArrayBuffer {
  const samples = 200;
  const rate = 8000;
  const data = new DataView(new ArrayBuffer(44 + samples * 2));
  const ascii = (off: number, s: string): void => {
    for (let i = 0; i < s.length; i++) data.setUint8(off + i, s.charCodeAt(i));
  };
  ascii(0, 'RIFF');
  data.setUint32(4, 36 + samples * 2, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  data.setUint32(16, 16, true);
  data.setUint16(20, 1, true); // PCM
  data.setUint16(22, 1, true); // mono
  data.setUint32(24, rate, true);
  data.setUint32(28, rate * 2, true);
  data.setUint16(32, 2, true);
  data.setUint16(34, 16, true);
  ascii(36, 'data');
  data.setUint32(40, samples * 2, true);
  for (let i = 0; i < samples; i++) data.setInt16(44 + i * 2, (i % 100) * 300 - 15000, true);
  return data.buffer;
}

describe('WebAudioEngine — implementação real', () => {
  it('constrói sem AudioContext (contexto é lazy) — sempre roda, inclusive em CI', () => {
    expect(() => new WebAudioEngine()).not.toThrow();
  });

  it.skipIf(!HAS_AUDIO)(
    'smoke: decodifica WAV PCM e cria player (pulado sem AudioContext, ex.: CI node)',
    async () => {
      const engine = new WebAudioEngine();
      const decoded = await engine.decode(tinyWav());
      expect(decoded.duration).toBeCloseTo(200 / 8000, 3);
      expect(decoded.pcm.numberOfChannels).toBe(1);
      expect(decoded.pcm.getChannelData(0)).toBeInstanceOf(Float32Array);
      const player = engine.createPlayer(decoded, 0.005);
      expect(player.state).toEqual({ key: null, playing: false, paused: false });
    },
  );

  it.skipIf(!HAS_AUDIO)(
    'smoke: bytes corrompidos rejeitam com AudioDecodeError (pulado sem AudioContext, ex.: CI node)',
    async () => {
      const engine = new WebAudioEngine();
      const garbage = new TextEncoder().encode('não sou áudio').buffer as ArrayBuffer;
      await expect(engine.decode(garbage)).rejects.toMatchObject({ name: 'AudioDecodeError' });
    },
  );
});
