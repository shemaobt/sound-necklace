/**
 * Porta AudioEngine — decode (bytes → PCM p/ grade/hash do domínio) + player
 * com a semântica exata da referência (PRD v2 §8.2; docs/reference/index.html
 * L599–659). Consumida por pages/organisms via props; implementações: Web Audio
 * real (web-audio.ts) e fixture headless determinística (fixture.ts).
 */

import type { PcmLike } from '../../domain';

export interface DecodedAudio {
  /** Duração em segundos (entrada de buildBeads). */
  duration: number;
  /** Alimenta hashPCM/manifest_id do domínio. */
  pcm: PcmLike;
}

/**
 * Falha de decodificação — erro tipado da porta (a estação Setup mostra a
 * cópia PT-BR do §8.1; o adapter nunca conhece UI).
 */
export class AudioDecodeError extends Error {
  override readonly name = 'AudioDecodeError';

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
  }
}

export interface PlayerState {
  /** Dono do playback corrente (botão toggle); null em play direto (clique de conta, borda). */
  key: string | null;
  playing: boolean;
  paused: boolean;
}

/** Índice da conta sob a cabeça de reprodução; null quando nada toca. */
export type HeadListener = (beadIndex: number | null) => void;

export type Unsubscribe = () => void;

export interface Player {
  /** Toggle da referência: mesma key alterna pausa/continua; key nova troca a faixa. */
  toggle(key: string, sBead: number, eBead: number): void;
  /** playRange direto (cliques de conta/seleção) — sem key, sem affordance de pausa. */
  play(sBead: number, eBead: number): void;
  /** Janela curta em torno de uma fronteira: max(1, round(1/beadSec)) contas por lado. */
  playEdge(edgeBead: number): void;
  stop(): void;
  readonly state: PlayerState;
  onHead(cb: HeadListener): Unsubscribe;
}

export interface AudioEngine {
  decode(bytes: ArrayBuffer): Promise<DecodedAudio>;
  /**
   * No máximo UM player vivo por engine (o backend — AudioContext/relógio — é
   * compartilhado): chame stop() antes de descartar um player. Espelha o
   * player global único da referência e o "traveling player" do PRD §8.
   */
  createPlayer(decoded: DecodedAudio, beadSec: number): Player;
}
