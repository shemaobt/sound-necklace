/**
 * Implementação real da porta AudioEngine sobre Web Audio.
 * decode: decodeAudioData destaca o ArrayBuffer de entrada (passo do spec) —
 * por isso o slice(0), como a referência (L461). Playback: um
 * AudioBufferSourceNode novo por play (nós são one-shot), pausa via
 * ctx.suspend/resume — currentTime congela, então o progresso do núcleo
 * para sozinho (referência L426, L640–655).
 */

import type { PlaybackHandle, PlaybackTransport } from './player';
import { createPlayer } from './player';
import type { AudioEngine, DecodedAudio, Player } from './types';
import { AudioDecodeError } from './types';

export class WebAudioEngine implements AudioEngine {
  private ctx: AudioContext | null = null;
  private gainNode: GainNode | null = null;
  /** Guardado fora do contexto: setGain antes do 1º decode vale para o próximo (lazy). */
  private gainValue = 1;

  private ensureCtx(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      // o master da cadeia (ENG-314): todo source passa por aqui — o reforço
      // vale para contas, cenas e frases igualmente
      this.gainNode = this.ctx.createGain();
      this.gainNode.gain.value = this.gainValue;
      this.gainNode.connect(this.ctx.destination);
    }
    return this.ctx;
  }

  setGain(value: number): void {
    this.gainValue = value;
    if (this.gainNode) this.gainNode.gain.value = value;
  }

  /**
   * Encerra o AudioContext (os navegadores limitam quantos vivem por aba). O engine
   * segue utilizável: o próximo decode/play abre um context novo.
   */
  close(): void {
    void this.ctx?.close().catch(() => undefined);
    this.ctx = null;
    this.gainNode = null;
  }

  async decode(bytes: ArrayBuffer): Promise<DecodedAudio> {
    const ctx = this.ensureCtx();
    let buffer: AudioBuffer;
    try {
      buffer = await ctx.decodeAudioData(bytes.slice(0));
    } catch (cause) {
      // EncodingError (bytes corrompidos) e afins saem tipados pela porta
      throw new AudioDecodeError('não foi possível decodificar o áudio', { cause });
    }
    return { duration: buffer.duration, pcm: buffer };
  }

  createPlayer(decoded: DecodedAudio, beadSec: number): Player {
    // typeof primeiro: sem Web Audio no ambiente, o instanceof lançaria ReferenceError
    if (typeof AudioBuffer === 'undefined' || !(decoded.pcm instanceof AudioBuffer)) {
      throw new Error('WebAudioEngine.createPlayer exige um DecodedAudio do próprio decode');
    }
    return createPlayer(this.makeTransport(decoded.pcm), decoded, beadSec);
  }

  private makeTransport(buffer: AudioBuffer): PlaybackTransport {
    const ctx = this.ensureCtx();
    return {
      now: () => ctx.currentTime,
      start: (t0: number, dur: number, onEnded: () => void): PlaybackHandle => {
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        src.connect(this.gainNode ?? ctx.destination);
        src.onended = onEnded;
        src.start(0, t0, dur);
        return {
          stop: () => {
            try {
              src.stop();
            } catch {
              // nó já parado/terminado — inofensivo (fronteira de sistema)
            }
          },
        };
      },
      suspend: () => {
        void ctx.suspend();
      },
      resume: () => {
        void ctx.resume();
      },
      requestFrame: (cb) => requestAnimationFrame(cb),
      cancelFrame: (id) => cancelAnimationFrame(id),
    };
  }
}
