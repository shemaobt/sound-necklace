/**
 * Implementação real do VoiceRecorder sobre MediaRecorder + Web Audio.
 * Grava `audio/webm;codecs=opus` (feature-detect → VoiceUnsupportedError);
 * mede o nível via AnalyserNode num loop de frames (só enquanto grava); toca
 * respostas via um <audio>. As dependências de plataforma são injetáveis p/ os
 * testes de nó (sem microfone real no CI); os caminhos de erro (sem suporte,
 * permissão negada) são exercitados por stubs.
 */

import type { ResourcePath } from '../../contracts';

import type {
  Recording,
  RecordedAnswer,
  Unsubscribe,
  VoiceRecorder,
  VoiceResourceStore,
} from './types';
import { MicPermissionError, VoiceUnsupportedError } from './types';

const MIME = 'audio/webm;codecs=opus';

export interface WebVoiceDeps {
  store: VoiceResourceStore;
  getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  isTypeSupported?: (type: string) => boolean;
  MediaRecorderCtor?: typeof MediaRecorder;
  AudioContextCtor?: typeof AudioContext;
  createAudio?: (blob: Blob) => HTMLAudioElement;
}

function defaultGetUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia(constraints);
}

function defaultCreateAudio(blob: Blob): HTMLAudioElement {
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  // libera a URL quando a reprodução termina ou é pausada (evita fuga por sessão)
  const revoke = () => URL.revokeObjectURL(url);
  audio.addEventListener('ended', revoke, { once: true });
  audio.addEventListener('pause', revoke, { once: true });
  return audio;
}

function stopTracks(stream: MediaStream): void {
  for (const track of stream.getTracks()) track.stop();
}

export class WebVoiceRecorder implements VoiceRecorder {
  readonly #store: VoiceResourceStore;
  readonly #getUserMedia: (c: MediaStreamConstraints) => Promise<MediaStream>;
  readonly #isTypeSupported?: (type: string) => boolean;
  readonly #MediaRecorderCtor?: typeof MediaRecorder;
  readonly #AudioContextCtor?: typeof AudioContext;
  readonly #createAudio: (blob: Blob) => HTMLAudioElement;
  #playing: HTMLAudioElement | null = null;

  constructor(deps: WebVoiceDeps) {
    this.#store = deps.store;
    this.#getUserMedia = deps.getUserMedia ?? defaultGetUserMedia;
    this.#MediaRecorderCtor =
      deps.MediaRecorderCtor ?? (typeof MediaRecorder !== 'undefined' ? MediaRecorder : undefined);
    this.#isTypeSupported =
      deps.isTypeSupported ??
      (typeof MediaRecorder !== 'undefined' ? (t) => MediaRecorder.isTypeSupported(t) : undefined);
    this.#AudioContextCtor =
      deps.AudioContextCtor ?? (typeof AudioContext !== 'undefined' ? AudioContext : undefined);
    this.#createAudio = deps.createAudio ?? defaultCreateAudio;
  }

  async start(path: ResourcePath): Promise<Recording> {
    if (!this.#MediaRecorderCtor || !this.#isTypeSupported || !this.#isTypeSupported(MIME)) {
      throw new VoiceUnsupportedError('gravação WebM/Opus indisponível neste navegador');
    }

    let stream: MediaStream;
    try {
      stream = await this.#getUserMedia({ audio: true });
    } catch (cause) {
      throw new MicPermissionError('acesso ao microfone negado', { cause });
    }

    // se a montagem do recorder/metering falhar, o microfone NÃO pode ficar aberto
    let recorder: MediaRecorder;
    let meter: ReturnType<WebVoiceRecorder['startMetering']>;
    const chunks: Blob[] = [];
    try {
      recorder = new this.#MediaRecorderCtor(stream, { mimeType: MIME });
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      meter = this.startMetering(stream);
    } catch (cause) {
      stopTracks(stream);
      throw cause;
    }

    const startedAt = this.now();
    recorder.start();

    let settled = false;
    const finish = (persist: boolean): Promise<RecordedAnswer> =>
      new Promise<RecordedAnswer>((resolve, reject) => {
        if (settled) {
          reject(new Error('gravação já finalizada'));
          return;
        }
        settled = true;
        recorder.onstop = () => {
          meter.stop();
          stopTracks(stream);
          const blob = new Blob(chunks, { type: MIME });
          const durationSec = (this.now() - startedAt) / 1000;
          if (!persist) {
            resolve({ blob, durationSec });
            return;
          }
          blob
            .arrayBuffer()
            .then((buf) => this.#store.put(path, new Uint8Array(buf)))
            .then(() => resolve({ blob, durationSec }))
            .catch(reject);
        };
        try {
          recorder.stop();
        } catch (cause) {
          reject(cause);
        }
      });

    return {
      onLevel: meter.onLevel,
      stop: () => finish(true),
      cancel: () => void finish(false).catch(() => {}),
    };
  }

  async play(path: ResourcePath): Promise<void> {
    const bytes = await this.#store.get(path);
    this.stopPlayback();
    const audio = this.#createAudio(new Blob([bytes as BlobPart], { type: MIME }));
    this.#playing = audio;
    audio.addEventListener(
      'ended',
      () => {
        if (this.#playing === audio) this.#playing = null;
      },
      { once: true },
    );
    await audio.play();
  }

  stopPlayback(): void {
    this.#playing?.pause();
    this.#playing = null;
  }

  async has(path: ResourcePath): Promise<boolean> {
    return this.#store.has(path);
  }

  async delete(path: ResourcePath): Promise<void> {
    await this.#store.delete(path);
  }

  private now(): number {
    return typeof performance !== 'undefined' ? performance.now() : Date.now();
  }

  private startMetering(stream: MediaStream): {
    onLevel: (cb: (level: number) => void) => Unsubscribe;
    stop: () => void;
  } {
    const subs = new Set<(level: number) => void>();
    let active = true;
    let ctx: AudioContext | null = null;

    if (this.#AudioContextCtor) {
      ctx = new this.#AudioContextCtor();
      void ctx.resume();
      const analyser = ctx.createAnalyser();
      ctx.createMediaStreamSource(stream).connect(analyser);
      const data = new Uint8Array(analyser.fftSize);
      const loop = (): void => {
        if (!active) return;
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (const v of data) {
          const centered = (v - 128) / 128;
          sum += centered * centered;
        }
        const level = Math.min(1, Math.sqrt(sum / data.length));
        for (const cb of subs) cb(level);
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    }

    return {
      onLevel: (cb) => {
        subs.add(cb);
        return () => subs.delete(cb);
      },
      stop: () => {
        active = false;
        void ctx?.close();
      },
    };
  }
}

export { MIME as VOICE_MIME };
