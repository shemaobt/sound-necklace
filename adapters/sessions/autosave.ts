/**
 * Autosaver — o mecanismo de autosave do §7.3, reusado pela fixture e pelo HTTP
 * real: debounce (agrupa rajadas), coalescing (o último estado por sessão vence),
 * retry com backoff exponencial em falha transitória, e PAUSA enquanto offline
 * (o estado fica em memória; ao voltar a conexão, faz flush do pendente — nada se
 * perde). O alvo de persistência é injetado (`persist`); a conectividade vem da
 * porta ConnectivityMonitor (§13).
 */

import type { SessionStateDto } from '../../contracts';
import type { ConnectivityMonitor } from '../connectivity/types';
import { type AutosaveStatus, LockLostError, type Unsubscribe } from './types';

export interface AutosaverOptions {
  /** Escreve o estado no armazenamento (fixture ou PUT real). Pode falhar (retry). */
  persist: (id: string, state: SessionStateDto) => Promise<void>;
  monitor: ConnectivityMonitor;
  /** Janela de debounce (ms). */
  debounceMs?: number;
  /** Tentativas máximas por escrita antes de re-enfileirar o pendente. */
  maxRetries?: number;
  /** Backoff base (ms), dobrado a cada tentativa. */
  backoffMs?: number;
}

export interface Autosaver {
  /** Enfileira o estado para persistir (debounced/coalescente/pausável). */
  schedule(id: string, state: SessionStateDto): void;
  /** Persiste o pendente desta sessão já (com retry). No-op se offline. */
  flush(id: string): Promise<void>;
  /** Descarta o pendente desta sessão (usado antes de complete/reopen). */
  cancel(id: string): void;
  /**
   * Aguarda a escrita EM VOO desta sessão aterrissar (resolve já se não há).
   * `cancel` só descarta o pendente na fila — um PUT já despachado não é abortável,
   * e um `complete`/`reopen` que não o espere pode ter o estado final sobrescrito
   * pelo estado velho que chega depois.
   */
  settle(id: string): Promise<void>;
  /** Observa saving/saved; chama já com o estado corrente ao assinar. */
  onStatus(cb: (status: AutosaveStatus) => void): Unsubscribe;
  /** Cancela o timer e para de observar a conectividade. */
  dispose(): void;
}

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export function createAutosaver(opts: AutosaverOptions): Autosaver {
  const { persist, monitor, debounceMs = 800, maxRetries = 5, backoffMs = 300 } = opts;

  // pendente por sessão — Map.set coalesce (o último estado vence).
  const pending = new Map<string, SessionStateDto>();
  // escrita em curso por sessão — evita drains reentrantes e dá ao `settle` o que aguardar
  const inFlight = new Map<string, Promise<void>>();
  let timer: ReturnType<typeof setTimeout> | undefined;

  // Estado agregado para o selo: há algo por salvar (pendente ou em voo) → saving.
  const statusListeners = new Set<(s: AutosaveStatus) => void>();
  let status: AutosaveStatus = 'saved';
  const notify = (): void => {
    const next: AutosaveStatus = pending.size > 0 || inFlight.size > 0 ? 'saving' : 'saved';
    if (next === status) return;
    status = next;
    for (const cb of statusListeners) cb(status);
  };

  const arm = (): void => {
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      void drain();
    }, debounceMs);
  };

  const drain = async (): Promise<void> => {
    if (!monitor.isOnline()) return; // pausado — retoma no reconnect
    for (const id of [...pending.keys()]) await persistOne(id);
  };

  const persistOne = (id: string): Promise<void> => {
    const running = inFlight.get(id);
    if (running) return running; // já persistindo esta sessão
    if (!pending.has(id)) return Promise.resolve();
    const run = (async (): Promise<void> => {
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        if (!monitor.isOnline()) return; // caiu no meio → mantém pendente
        const state = pending.get(id); // relê o mais novo a cada tentativa (cancel esvazia)
        if (state === undefined) return;
        try {
          await persist(id, state);
          // só descarta se ninguém coalesceu um estado mais novo nesse meio-tempo
          if (pending.get(id) === state) pending.delete(id);
          return;
        } catch (err) {
          // Trava perdida é veredito, não falha transitória: o backend recusou a escrita
          // e vai recusar de novo. Descarta o pendente — segurá-lo em memória à espera de
          // um reconnect que nunca autoriza perde a escrita quando a aba fecha.
          if (err instanceof LockLostError) {
            pending.delete(id);
            return;
          }
          if (attempt < maxRetries - 1) await delay(backoffMs * 2 ** attempt);
        }
      }
      // esgotou as tentativas: mantém pendente p/ o próximo schedule/reconnect
    })().finally(() => {
      inFlight.delete(id);
      notify();
    });
    inFlight.set(id, run);
    return run;
  };

  // ao voltar a conexão, esvazia o que ficou pendente
  const unsubscribe = monitor.subscribe((online) => {
    if (online && pending.size > 0) arm();
  });

  return {
    schedule(id, state) {
      pending.set(id, state);
      notify();
      if (monitor.isOnline()) arm();
    },
    async flush(id) {
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
      if (monitor.isOnline()) await persistOne(id);
      // não deixa órfãs as outras sessões que estavam na mesma janela de debounce
      if (monitor.isOnline() && pending.size > 0) arm();
    },
    cancel(id) {
      pending.delete(id);
      if (pending.size === 0 && timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
      notify();
    },
    onStatus(cb) {
      statusListeners.add(cb);
      cb(status);
      return () => statusListeners.delete(cb);
    },
    async settle(id) {
      await inFlight.get(id);
    },
    dispose() {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
      unsubscribe();
    },
  };
}
