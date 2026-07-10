import { describe, expect, it, vi } from 'vitest';

import type { ResourcePath } from '../../contracts';

import { MemoryVoiceStore } from './memory-store';
import { WebVoiceRecorder } from './web';
import { MicPermissionError, VoiceUnsupportedError } from './types';

const P1 = 'respostas/level1/recontar.webm' as ResourcePath;

const fakeStream = () => ({ getTracks: () => [{ stop: vi.fn() }] }) as unknown as MediaStream;

describe('WebVoiceRecorder — caminhos de erro (stubs injetados, sem microfone)', () => {
  it('sem MediaRecorder no ambiente → VoiceUnsupportedError', async () => {
    const rec = new WebVoiceRecorder({ store: new MemoryVoiceStore() });
    await expect(rec.start(P1)).rejects.toBeInstanceOf(VoiceUnsupportedError);
  });

  it('WebM/Opus não suportado → VoiceUnsupportedError e não pede o microfone', async () => {
    const getUserMedia = vi.fn(async () => fakeStream());
    const rec = new WebVoiceRecorder({
      store: new MemoryVoiceStore(),
      isTypeSupported: () => false,
      MediaRecorderCtor: class {} as unknown as typeof MediaRecorder,
      getUserMedia,
    });
    await expect(rec.start(P1)).rejects.toBeInstanceOf(VoiceUnsupportedError);
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it('permissão de microfone negada → MicPermissionError', async () => {
    const rec = new WebVoiceRecorder({
      store: new MemoryVoiceStore(),
      isTypeSupported: () => true,
      MediaRecorderCtor: class {} as unknown as typeof MediaRecorder,
      getUserMedia: async () => {
        throw new DOMException('denied', 'NotAllowedError');
      },
    });
    await expect(rec.start(P1)).rejects.toBeInstanceOf(MicPermissionError);
  });
});

describe('WebVoiceRecorder — persistência delega ao store (sem microfone)', () => {
  it('has/delete refletem o store injetado', async () => {
    const store = new MemoryVoiceStore();
    await store.put(P1, Uint8Array.of(1, 2, 3));
    const rec = new WebVoiceRecorder({ store });

    expect(await rec.has(P1)).toBe(true);
    await rec.delete(P1);
    expect(await rec.has(P1)).toBe(false);
  });

  it('play toca uma resposta existente; ausente → lança', async () => {
    const store = new MemoryVoiceStore();
    const play = vi.fn(async () => {});
    const audio = {
      play,
      pause: vi.fn(),
      addEventListener: vi.fn(),
    } as unknown as HTMLAudioElement;
    const rec = new WebVoiceRecorder({ store, createAudio: () => audio });

    await expect(rec.play(P1)).rejects.toThrow();

    await store.put(P1, Uint8Array.of(9, 9));
    await rec.play(P1);
    expect(play).toHaveBeenCalledOnce();
    rec.stopPlayback();
  });
});

/** MediaRecorder falso: stop() emite um chunk e dispara onstop (sem microfone). */
class FakeMediaRecorder {
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  constructor(
    readonly stream: MediaStream,
    readonly options: MediaRecorderOptions,
  ) {}
  start(): void {}
  stop(): void {
    this.ondataavailable?.({ data: new Blob([Uint8Array.of(1, 2, 3)], { type: 'audio/webm' }) });
    this.onstop?.();
  }
}

describe('WebVoiceRecorder — gravar → parar (fakes, sem AudioContext)', () => {
  const okDeps = (store: MemoryVoiceStore) => ({
    store,
    isTypeSupported: () => true,
    MediaRecorderCtor: FakeMediaRecorder as unknown as typeof MediaRecorder,
    getUserMedia: async () => fakeStream(),
  });

  it('parar persiste no caminho exato e devolve o blob', async () => {
    const store = new MemoryVoiceStore();
    const rec = new WebVoiceRecorder(okDeps(store));

    const recording = await rec.start(P1);
    const answer = await recording.stop();

    expect(answer.blob.size).toBeGreaterThan(0);
    expect(await store.has(P1)).toBe(true);
    expect((await store.get(P1)).byteLength).toBe(answer.blob.size);
  });

  it('cancelar não persiste', async () => {
    const store = new MemoryVoiceStore();
    const rec = new WebVoiceRecorder(okDeps(store));

    const recording = await rec.start(P1);
    recording.cancel();

    expect(await store.has(P1)).toBe(false);
  });

  it('stop() rejeita (sem pendurar) se a persistência falhar', async () => {
    const store = new MemoryVoiceStore();
    vi.spyOn(store, 'put').mockRejectedValueOnce(new Error('quota'));
    const rec = new WebVoiceRecorder(okDeps(store));

    const recording = await rec.start(P1);
    await expect(recording.stop()).rejects.toThrow('quota');
  });
});

describe('WebVoiceRecorder — nível via AudioContext e limpeza (fakes)', () => {
  it('emite um nível 0..1 por quadro e fecha o contexto ao parar', async () => {
    const close = vi.fn();
    const analyser = {
      fftSize: 4,
      getByteTimeDomainData: (arr: Uint8Array) => arr.set([210, 40, 210, 40]),
    };
    const ctx = {
      resume: vi.fn(),
      createAnalyser: () => analyser,
      createMediaStreamSource: () => ({ connect: vi.fn() }),
      close,
    };
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb));

    const store = new MemoryVoiceStore();
    const rec = new WebVoiceRecorder({
      store,
      isTypeSupported: () => true,
      MediaRecorderCtor: FakeMediaRecorder as unknown as typeof MediaRecorder,
      getUserMedia: async () => fakeStream(),
      AudioContextCtor: function AudioContextCtor(this: unknown) {
        return ctx;
      } as unknown as typeof AudioContext,
    });

    const recording = await rec.start(P1);
    const levels: number[] = [];
    recording.onLevel((l) => levels.push(l));

    frames.shift()?.(0); // roda um quadro de medição

    expect(levels).toHaveLength(1);
    expect(levels[0]).toBeGreaterThan(0);
    expect(levels[0]).toBeLessThanOrEqual(1);

    await recording.stop();
    expect(close).toHaveBeenCalled();

    vi.unstubAllGlobals();
  });
});
