import type { Unsubscribe } from './types';

/** Emissor de evento sem payload (auth-expired). Mesmo padrão de subscribe/Set do ConnectivityMonitor. */
export class Emitter {
  readonly #subs = new Set<() => void>();

  subscribe(cb: () => void): Unsubscribe {
    this.#subs.add(cb);
    return () => {
      this.#subs.delete(cb);
    };
  }

  emit(): void {
    for (const cb of this.#subs) cb();
  }
}
