/**
 * PCM sintético determinístico — o "áudio" do modo fixture.
 *
 * Morava em `tests/golden/pcm.ts` e veio para cá quando o harness dourado saiu
 * (ENG-691): quem o usa é o FixtureAudioEngine (fixture.ts) e a lista de áudios
 * do bucket em fixtures/bucket, não o harness.
 *
 *   x_{n+1} = (1103515245 * x_n + 12345) mod 2^31
 *   amostra_n = x_n / 2^30 - 1        (faixa [-1, 1))
 *
 * A aritmética roda em BigInt: 1103515245 * x excede 2^53 e perderia precisão
 * em double — BigInt garante o MESMO inteiro em Node e no Chromium, que é o que
 * faz o mesmo PcmSpec render a mesma grade e o mesmo hash nos dois. Proibido
 * Math.random/Math.sin: não são bit-idênticos entre engines.
 */
const A = 1103515245n;
const C = 12345n;
const M = 2147483648n; // 2^31

export function lcgSequence(seed: bigint, count: number): bigint[] {
  const out: bigint[] = [];
  let x = seed % M;
  for (let i = 0; i < count; i++) {
    x = (A * x + C) % M;
    out.push(x);
  }
  return out;
}

export function makePcm(seed: number, samples: number): Float32Array {
  const pcm = new Float32Array(samples);
  let x = BigInt(seed) % M;
  for (let i = 0; i < samples; i++) {
    x = (A * x + C) % M;
    pcm[i] = Number(x) / 2 ** 30 - 1;
  }
  return pcm;
}

export interface PcmSpec {
  seed: number;
  sampleRate: number;
  samples: number;
  channels: number;
}
