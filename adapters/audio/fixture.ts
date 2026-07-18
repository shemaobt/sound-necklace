/**
 * Modo fixture do engine de áudio — roda headless (sem AudioContext):
 * o "áudio" é o PCM sintético do harness dourado (tests/golden/pcm.ts) e o
 * relógio é falso, avançado manualmente por advance(dt) — onHead/onended
 * ficam determinísticos em teste. Bytes de entrada do decode = JSON de PcmSpec.
 */

import { makePcm, type PcmSpec } from '../../tests/golden/pcm';
import type { PlaybackHandle, PlaybackTransport } from './player';
import { createPlayer } from './player';
import type { AudioEngine, DecodedAudio, Player } from './types';
import { AudioDecodeError } from './types';

/** Codifica um PcmSpec como os bytes que FixtureAudioEngine.decode aceita. */
export function pcmSpecBytes(spec: PcmSpec): ArrayBuffer {
  return new TextEncoder().encode(JSON.stringify(spec)).buffer as ArrayBuffer;
}

interface ScheduledSource {
  startedAt: number;
  dur: number;
  onEnded: () => void;
  stopped: boolean;
  ended: boolean;
}

export class FixtureTransport implements PlaybackTransport {
  private t = 0;
  private suspended = false;
  private frames = new Map<number, () => void>();
  private nextFrameId = 1;
  private sources: ScheduledSource[] = [];

  now(): number {
    return this.t;
  }

  start(_t0: number, dur: number, onEnded: () => void): PlaybackHandle {
    const src: ScheduledSource = { startedAt: this.t, dur, onEnded, stopped: false, ended: false };
    this.sources.push(src);
    // como no Web Audio real, o onended de um nó parado chega assíncrono —
    // aqui, no próximo advance() (a guarda do núcleo depende disso)
    return { stop: () => (src.stopped = true) };
  }

  suspend(): void {
    this.suspended = true;
  }

  resume(): void {
    this.suspended = false;
  }

  requestFrame(cb: () => void): number {
    const id = this.nextFrameId++;
    this.frames.set(id, cb);
    return id;
  }

  cancelFrame(id: number): void {
    this.frames.delete(id);
  }

  /** Avança o relógio (se não suspenso), dispara onended vencidos e roda um frame. */
  advance(dtSeconds: number): void {
    if (!this.suspended) {
      this.t += dtSeconds;
    }
    for (const src of this.sources) {
      if (src.ended) continue;
      // divergência assumida do Web Audio real: o onended de um nó PARADO
      // dispara mesmo com o contexto suspenso (o real adia até o resume) —
      // inofensivo porque a guarda playing===handle do núcleo o ignora
      const expired = !this.suspended && this.t - src.startedAt >= src.dur;
      if (src.stopped || expired) {
        src.ended = true;
        src.onEnded();
      }
    }
    this.sources = this.sources.filter((src) => !src.ended);
    const pending = [...this.frames.values()];
    this.frames.clear();
    pending.forEach((cb) => cb());
  }
}

export class FixtureAudioEngine implements AudioEngine {
  readonly transport = new FixtureTransport();
  /** Volume master (hook de teste): a fixture não soa — guarda o valor pedido. */
  gain = 1;

  setGain(value: number): void {
    this.gain = value;
  }

  // async: qualquer falha vira rejeição — o contrato da porta é Promise,
  // nunca throw síncrono (o caller só instala .catch)
  async decode(bytes: ArrayBuffer): Promise<DecodedAudio> {
    let spec: PcmSpec;
    try {
      spec = JSON.parse(new TextDecoder().decode(bytes)) as PcmSpec;
    } catch (cause) {
      throw new AudioDecodeError('bytes não são um PcmSpec JSON da fixture', { cause });
    }
    if (
      typeof spec !== 'object' ||
      spec === null ||
      !Number.isInteger(spec.seed) ||
      !(spec.sampleRate > 0) ||
      !Number.isInteger(spec.samples) ||
      !(spec.samples > 0) ||
      !(spec.channels >= 1)
    ) {
      throw new AudioDecodeError('PcmSpec inválido: campos ausentes ou fora de faixa');
    }
    const data = makePcm(spec.seed, spec.samples);
    return {
      duration: spec.samples / spec.sampleRate,
      pcm: {
        numberOfChannels: spec.channels,
        sampleRate: spec.sampleRate,
        // hashPCM só lê o canal 0; a fixture serve o mesmo LCG para todos
        getChannelData: () => data,
      },
    };
  }

  createPlayer(decoded: DecodedAudio, beadSec: number): Player {
    return createPlayer(this.transport, decoded, beadSec);
  }
}
