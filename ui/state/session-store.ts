import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';

import type { SessionState } from '../../domain';

/**
 * Ponte de estado da sessão para as telas (ui/state, PRD §7.3): embrulha o
 * estado puro do domínio e as portas de UI que decidem se a edição está liberada
 * — modo de revisão (§8.10), trava de editor único (§7.3) e o gate online-only
 * (§13). O domínio decide O QUE muda; este store decide SE a mudança acontece.
 *
 * Toda mutação passa por `apply(reducer)`: só corre quando `canEdit`, e então
 * chama a porta `autosave` injetada (no-op até o SessionStore da ENG-240). Offline
 * / revisão / trava por outro NÃO limpam o estado — apenas pausam a edição.
 */

/** Trava consultiva: presença = a sessão está aberta por outra pessoa. */
export interface EditorLock {
  holder: string;
}

export interface SessionStore {
  session: SessionState | null;
  review: boolean;
  lock: EditorLock | null;
  online: boolean;
  /** Edição liberada ⇔ online, fora de revisão, sem trava alheia, com sessão. */
  canEdit(): boolean;
  load(session: SessionState): void;
  apply(reducer: (s: SessionState) => SessionState): void;
  setReview(on: boolean): void;
  /** Sai da revisão — a menos que uma trava alheia a esteja forçando. */
  unlock(): void;
  setLock(lock: EditorLock | null): void;
  setOnline(online: boolean): void;
}

export interface SessionStoreDeps {
  /** Persistência de estado completo (ENG-240). Default: no-op. */
  autosave?: (state: SessionState) => void;
}

export function createSessionStore(deps: SessionStoreDeps = {}) {
  return createStore<SessionStore>((set, get) => ({
    session: null,
    review: false,
    lock: null,
    online: true,
    canEdit() {
      const s = get();
      return s.online && !s.review && s.lock === null && s.session !== null;
    },
    load(session) {
      set({ session });
    },
    apply(reducer) {
      const s = get();
      if (!s.canEdit() || !s.session) return;
      const next = reducer(s.session);
      set({ session: next });
      deps.autosave?.(next);
    },
    setReview(on) {
      set({ review: on });
    },
    unlock() {
      if (get().lock === null) set({ review: false });
    },
    setLock(lock) {
      set(lock ? { lock, review: true } : { lock });
    },
    setOnline(online) {
      set({ online });
    },
  }));
}

/** Store singleton do app (o shell injeta o autosave real quando ele existir). */
export const sessionStore = createSessionStore();

export function useSessionStore<T>(selector: (s: SessionStore) => T): T {
  return useStore(sessionStore, selector);
}
