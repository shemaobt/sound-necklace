/**
 * Porta VoiceRecorder — respostas de voz do Mapeamento (PRD v2 §8.7 + O5):
 * gravar → blob WebM/Opus, nível de entrada ao vivo p/ as barras de forma de
 * onda, tocar uma resposta gravada, re-gravar (substitui no mesmo caminho) e
 * apagar. Cada resposta é UM arquivo, chaveado pelo caminho canônico
 * `respostas/level{1,2,3}/…/<k>.webm` (§10.4). Implementações: real sobre
 * MediaRecorder (web.ts) e fixture headless determinística (fixture.ts).
 *
 * A gravação NUNCA sai do pipeline (§12): a persistência é injetada como um
 * `VoiceResourceStore` (em produção, os recursos do SessionStore ligados à
 * sessão ativa; em fixture/teste, o MemoryVoiceStore).
 */

import type { ResourcePath } from '../../contracts';

export type Unsubscribe = () => void;

/** Resposta de voz finalizada — o blob WebM/Opus + a duração em segundos. */
export interface RecordedAnswer {
  blob: Blob;
  durationSec: number;
}

/**
 * Persistência das respostas de UMA sessão, chaveada pelo caminho canônico
 * `respostas/…` (§10.4/O5). `put` SOBRESCREVE — re-gravar substitui no mesmo
 * caminho (§8.7). Em produção o app liga isto ao SessionStore (recursos da
 * sessão ativa, ENG-249); em fixture/teste é o MemoryVoiceStore.
 */
export interface VoiceResourceStore {
  put(path: ResourcePath, bytes: Uint8Array): Promise<void>;
  get(path: ResourcePath): Promise<Uint8Array>;
  has(path: ResourcePath): Promise<boolean>;
  delete(path: ResourcePath): Promise<void>;
}

/**
 * Uma gravação em curso. `onLevel` emite o nível de entrada 0..1 (barras de
 * forma de onda) SÓ enquanto grava; `stop` finaliza e persiste no caminho de
 * `start`; `cancel` descarta sem persistir.
 */
export interface Recording {
  onLevel(cb: (level: number) => void): Unsubscribe;
  stop(): Promise<RecordedAnswer>;
  cancel(): void;
}

export interface VoiceRecorder {
  /** Começa a gravar a resposta desta pergunta (caminho canônico §10.4). */
  start(path: ResourcePath): Promise<Recording>;
  /** Toca a resposta já gravada deste caminho. Lança se não houver. */
  play(path: ResourcePath): Promise<void>;
  /** Duração em segundos de uma gravação já salva. Lança se não houver. */
  duration(path: ResourcePath): Promise<number>;
  /** Para qualquer reprodução em curso. */
  stopPlayback(): void;
  /** Há gravação para esta pergunta? */
  has(path: ResourcePath): Promise<boolean>;
  /**
   * Aquece a resposta deste caminho (baixa os bytes para um cache local), para o
   * play/duration seguintes não pagarem rede (ENG-339). Opcional: recorders de
   * teste e ambientes sem rede não precisam dele — chamar via `prefetch?.()`.
   */
  prefetch?(path: ResourcePath): Promise<void>;
  /**
   * Assina o que está tocando AGORA (o caminho; `null` = nada). Vem dos eventos
   * reais de reprodução — alimenta o feedback tocando/pausado da UI (ENG-322/323).
   */
  onPlayback(cb: (path: ResourcePath | null) => void): Unsubscribe;
  /** Apaga a gravação desta pergunta. */
  delete(path: ResourcePath): Promise<void>;
}

/**
 * Ambiente sem MediaRecorder ou sem WebM/Opus — erro tipado da porta (a estação
 * mostra a cópia PT-BR; o adapter nunca conhece UI).
 */
export class VoiceUnsupportedError extends Error {
  override readonly name = 'VoiceUnsupportedError';
}

/** Permissão de microfone negada (ou indisponível). */
export class MicPermissionError extends Error {
  override readonly name = 'MicPermissionError';

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
  }
}
