/**
 * manifest_id — port 1:1 de hashPCM (docs/reference/index.html L427–436).
 * FNV-1a 32 bits sobre: canais (1 byte), 2 bytes baixos do sampleRate,
 * N em 4 bytes LE, amostras com stride quantizadas int16 (2 bytes LE,
 * complemento de dois), beadSec*1000 em 3 bytes LE (PRD v2 §6.2).
 * Math.imul é obrigatório: o produto h*prime excede 2^53 e o `*` ingênuo
 * erra silenciosamente.
 */

export interface PcmLike {
  numberOfChannels: number;
  sampleRate: number;
  getChannelData(channel: number): Float32Array;
}

export function hashPCM(buf: PcmLike, beadSec: number): string {
  const data = buf.getChannelData(0);
  const N = data.length;
  let h = 0x811c9dc5 >>> 0;
  const mix = (x: number): void => {
    h ^= x & 0xff;
    h = Math.imul(h, 0x01000193) >>> 0;
  };
  [
    buf.numberOfChannels,
    buf.sampleRate & 0xff,
    (buf.sampleRate >> 8) & 0xff,
    N & 0xff,
    (N >> 8) & 0xff,
    (N >> 16) & 0xff,
    (N >> 24) & 0xff,
  ].forEach(mix);
  const stride = Math.max(1, Math.floor(N / 100000));
  for (let i = 0; i < N; i += stride) {
    // i < N: leitura sempre em faixa; o ! satisfaz noUncheckedIndexedAccess
    const q = Math.max(-32768, Math.min(32767, Math.round(data[i]! * 32767)));
    mix(q & 0xff);
    mix((q >> 8) & 0xff);
  }
  const bs = Math.round(beadSec * 1000);
  mix(bs & 0xff);
  mix((bs >> 8) & 0xff);
  mix((bs >> 16) & 0xff);
  return 'fnv1a32:' + (h >>> 0).toString(16).padStart(8, '0');
}
