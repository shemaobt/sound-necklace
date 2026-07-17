/**
 * Modo fixture do VoiceRecorder — roda headless (sem getUserMedia/MediaRecorder):
 * níveis pseudo-aleatórios DETERMINÍSTICOS (LCG, mesma família do harness
 * dourado) avançados por um hook `tick()`, e um blob WebM estático de
 * placeholder. Persiste no VoiceResourceStore injetado (default: MemoryVoiceStore).
 *
 * NÃO É O ADAPTER DO APP (ENG-298). Ele é convincente demais para isso: o medidor de
 * nível se mexe, o "Parar" aparece, o caminho é salvo — e o que fica no disco são 9
 * bytes de cabeçalho sem uma amostra de som. O app ficou mudo uma semana atrás dele,
 * com a suíte verde, porque os testes afirmavam o CAMINHO da resposta e nunca o
 * conteúdo. Só monte este dublê onde não existe microfone (jsdom), e prefira testes
 * que pesem o áudio a testes que confiem no medidor.
 */

import type { ResourcePath } from '../../contracts';

import { MemoryVoiceStore } from './memory-store';
import type {
  Recording,
  RecordedAnswer,
  Unsubscribe,
  VoiceRecorder,
  VoiceResourceStore,
} from './types';

/** Cabeçalho EBML mínimo e ESTÁVEL — os bytes WebM de placeholder do fixture. */
const FIXTURE_WEBM = Uint8Array.of(0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01);

/** Quantos segundos cada quadro de nível representa (relógio falso do fixture). */
const FRAME_SEC = 0.1;

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

export class FixtureRecording implements Recording {
  readonly #subs = new Set<(level: number) => void>();
  readonly #next: () => number;
  #frames = 0;
  #active = true;

  constructor(
    private readonly path: ResourcePath,
    private readonly store: VoiceResourceStore,
    seed: number,
    private readonly onPersist: (durationSec: number) => void = () => {},
  ) {
    this.#next = lcg(seed);
  }

  onLevel(cb: (level: number) => void): Unsubscribe {
    this.#subs.add(cb);
    return () => this.#subs.delete(cb);
  }

  /** Hook de teste: avança um quadro e emite o nível — só enquanto grava. */
  tick(): void {
    if (!this.#active) return;
    this.#frames += 1;
    const level = this.#next();
    for (const cb of this.#subs) cb(level);
  }

  async stop(): Promise<RecordedAnswer> {
    this.#active = false;
    await this.store.put(this.path, FIXTURE_WEBM);
    const durationSec = this.#frames * FRAME_SEC;
    this.onPersist(durationSec);
    return {
      blob: new Blob([FIXTURE_WEBM], { type: 'audio/webm' }),
      durationSec,
    };
  }

  cancel(): void {
    this.#active = false;
  }
}

export class FixtureVoiceRecorder implements VoiceRecorder {
  #playing: ResourcePath | null = null;
  readonly #durations = new Map<string, number>();

  constructor(
    private readonly store: VoiceResourceStore = new MemoryVoiceStore(),
    private readonly seed = 0x9e3779b9,
  ) {}

  async start(path: ResourcePath): Promise<FixtureRecording> {
    return new FixtureRecording(path, this.store, this.seed, (sec) =>
      this.#durations.set(path, sec),
    );
  }

  async duration(path: ResourcePath): Promise<number> {
    if (!(await this.store.has(path))) throw new Error(`sem gravação: ${path}`);
    return this.#durations.get(path) ?? 0;
  }

  async play(path: ResourcePath): Promise<void> {
    if (!(await this.store.has(path))) throw new Error(`sem gravação para tocar: ${path}`);
    this.#playing = path;
  }

  stopPlayback(): void {
    this.#playing = null;
  }

  /** Caminho em reprodução (hook de teste); null quando nada toca. */
  get playing(): ResourcePath | null {
    return this.#playing;
  }

  async has(path: ResourcePath): Promise<boolean> {
    return this.store.has(path);
  }

  async delete(path: ResourcePath): Promise<void> {
    if (this.#playing === path) this.#playing = null;
    this.#durations.delete(path);
    await this.store.delete(path);
  }
}
