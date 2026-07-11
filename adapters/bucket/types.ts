/**
 * Porta BucketSource — o bucket do projeto é a ÚNICA fonte de áudio do MVP (§7.4):
 * lista os áudios (com o envelope de acousteme e a flag de consentimento de coleta)
 * e busca os bytes de um áudio por id. Os bytes são OPACOS (§10.5): a porta devolve
 * o ArrayBuffer cru e não conhece o formato — em modo fixture são o PcmSpec-JSON que
 * o FixtureAudioEngine decodifica; no modo real, o WAV que o servidor entrega ao Web
 * Audio. Implementações: fixture headless (default) e o esqueleto HTTP real.
 */

import type { BucketAudio } from '../../contracts';

/** Erro tipado — `fetchBytes` de um id fora do bucket (a UI mostra a cópia). */
export class BucketAudioNotFoundError extends Error {
  override readonly name = 'BucketAudioNotFoundError';

  constructor(readonly audioId: string) {
    super(`áudio desconhecido no bucket: ${audioId}`);
  }
}

export interface BucketSource {
  /** Lista os áudios do bucket do projeto (a Setup escolhe um). */
  list(): Promise<BucketAudio[]>;
  /** Bytes de áudio opacos de um id — entrada do AudioEngine.decode. Lança se ausente. */
  fetchBytes(id: string): Promise<ArrayBuffer>;
}
