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
  return new Audio(URL.createObjectURL(blob));
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

    const recorder = new this.#MediaRecorderCtor(stream, { mimeType: MIME });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    const meter = this.#startMetering(stream);
    const startedAt = this.#now();
    recorder.start();

    const finish = (persist: boolean) =>
      new Promise<RecordedAnswer>((resolve) => {
        recorder.onstop = () => {
          meter.stop();
          for (const track of stream.getTracks()) track.stop();
          const blob = new Blob(chunks, { type: MIME });
          const durationSec = (this.#now() - startedAt) / 1000;
          if (!persist) {
            resolve({ blob, durationSec });
            return;
          }
          void blob.arrayBuffer().then(async (buf) => {
            await this.#store.put(path, new Uint8Array(buf));
            resolve({ blob, durationSec });
          });
        };
        recorder.stop();
      });

    return {
      onLevel: meter.onLevel,
      stop: () => finish(true),
      cancel: () => void finish(false),
    };
  }

  async play(path: ResourcePath): Promise<void> {
    const bytes = await this.#store.get(path);
    this.stopPlayback();
    const audio = this.#createAudio(new Blob([bytes as BlobPart], { type: MIME }));
    this.#playing = audio;
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

  #now(): number {
    return typeof performance !== 'undefined' ? performance.now() : Date.now();
  }

  #startMetering(stream: MediaStream): {
    onLevel: (cb: (level: number) => void) => Unsubscribe;
    stop: () => void;
  } {
    const subs = new Set<(level: number) => void>();
    let active = true;
    let ctx: AudioContext | null = null;

    if (this.#AudioContextCtor) {
      ctx = new this.#AudioContextCtor();
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
