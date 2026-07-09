/**
 * Núcleo de playback — port 1:1 de docs/reference/index.html:
 * stopPlayback L639, playRange L640–648, togglePlay L649–656,
 * startProgress L614–625, playEdge L600–605. O backend de áudio e o relógio
 * entram por um PlaybackTransport injetado: a implementação real fala com
 * AudioContext/rAF (web-audio.ts) e a fixture avança tempo manualmente
 * (fixture.ts) — o núcleo é idêntico nos dois modos.
 */

import { beadAtTime, buildBeads } from '../../domain';
import type { DecodedAudio, HeadListener, Player, PlayerState, Unsubscribe } from './types';

export interface PlaybackHandle {
  stop(): void;
}

export interface PlaybackTransport {
  /** Relógio do contexto de áudio — congela durante suspend (spec Web Audio). */
  now(): number;
  /**
   * Agenda a reprodução de [t0, t0+dur] no áudio; onEnded dispara ao terminar
   * (inclusive via stop). Contrato: onEnded é SEMPRE assíncrono em relação a
   * start() — como o evento ended do Web Audio real (o núcleo captura o handle
   * na closure antes do primeiro disparo possível).
   */
  start(t0: number, dur: number, onEnded: () => void): PlaybackHandle;
  suspend(): void;
  resume(): void;
  requestFrame(cb: () => void): number;
  cancelFrame(id: number): void;
}

/** Janela de borda do §8.2: max(1, round(1/beadSec)) contas por lado, clampada à grade. */
export function edgeWindow(
  edgeBead: number,
  beadSec: number,
  totalBeads: number,
): { s: number; e: number } {
  const half = Math.max(1, Math.round(1.0 / beadSec));
  return { s: Math.max(0, edgeBead - half), e: Math.min(totalBeads - 1, edgeBead + half) };
}

export function createPlayer(
  transport: PlaybackTransport,
  decoded: DecodedAudio,
  beadSec: number,
): Player {
  const beads = buildBeads(decoded.duration, beadSec);
  const totalBeads = beads.length;
  // a referência nunca recebe índice fora da grade (a UI clampa os cliques);
  // como API pública, um span inválido (ex.: sessão restaurada contra outra
  // grade) falha descritivo em vez de TypeError — mesmo padrão de spanDur
  const beadAt = (i: number): { startTime: number; endTime: number } => {
    const bead = beads[i];
    if (!bead) throw new Error(`conta fora da grade: ${i} (grade tem ${totalBeads})`);
    return bead;
  };
  const beadStart = (i: number): number => beadAt(i).startTime;
  const beadEnd = (i: number): number => beadAt(i).endTime;

  let playing: PlaybackHandle | null = null;
  let paused = false;
  let key: string | null = null;
  let rafId: number | null = null;
  let lastHead: number | null = null;
  const listeners = new Set<HeadListener>();

  function emit(head: number | null): void {
    if (head === lastHead) return;
    lastHead = head;
    listeners.forEach((cb) => cb(head));
  }

  function clearProgress(): void {
    if (rafId !== null) {
      transport.cancelFrame(rafId);
      rafId = null;
    }
    emit(null);
  }

  function stopPlayback(): void {
    if (playing) {
      playing.stop();
      playing = null;
    }
    paused = false;
    clearProgress();
    key = null;
  }

  function startProgress(t0: number, t1: number, ctxStart: number): void {
    const frame = (): void => {
      if (!playing) {
        clearProgress();
        return;
      }
      const now = t0 + (transport.now() - ctxStart);
      if (now >= t1) {
        clearProgress();
        return;
      }
      emit(beadAtTime(now, beadSec, totalBeads));
      rafId = transport.requestFrame(frame);
    };
    rafId = transport.requestFrame(frame);
  }

  function playRange(s: number, e: number): void {
    stopPlayback();
    transport.resume();
    const t0 = beadStart(s);
    const t1 = beadEnd(e);
    const ctxStart = transport.now();
    const handle = transport.start(t0, Math.max(0.02, t1 - t0), () => {
      // guarda da referência (L646): o onended do nó descartado não limpa o novo
      if (playing === handle) {
        playing = null;
        paused = false;
        clearProgress();
        key = null;
      }
    });
    playing = handle;
    startProgress(t0, t1, ctxStart);
  }

  return {
    toggle(k: string, sBead: number, eBead: number): void {
      if (key === k && playing) {
        if (paused) {
          transport.resume();
          paused = false;
        } else {
          transport.suspend();
          paused = true;
        }
        return;
      }
      playRange(sBead, eBead);
      key = k;
    },
    play(sBead: number, eBead: number): void {
      playRange(sBead, eBead);
    },
    playEdge(edgeBead: number): void {
      const { s, e } = edgeWindow(edgeBead, beadSec, totalBeads);
      playRange(s, e);
    },
    stop(): void {
      stopPlayback();
    },
    get state(): PlayerState {
      return { key, playing: playing !== null, paused };
    },
    onHead(cb: HeadListener): Unsubscribe {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };
}
