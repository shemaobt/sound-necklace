import type { ConnectivityMonitor, Unsubscribe } from './types';

/**
 * Monitor de conectividade fixture (default): toggle manual, sem rede. É o que o
 * app e os testes usam — a estação/composição alterna `setOnline` para exercer o
 * gate online-only sem depender do navegador.
 */
export class FixtureConnectivityMonitor implements ConnectivityMonitor {
  #online: boolean;
  readonly #subs = new Set<(online: boolean) => void>();

  constructor(initial = true) {
    this.#online = initial;
  }

  isOnline(): boolean {
    return this.#online;
  }

  /** Alterna o estado; notifica só quando o valor de fato muda. */
  setOnline(online: boolean): void {
    if (online === this.#online) return;
    this.#online = online;
    for (const cb of this.#subs) cb(online);
  }

  subscribe(cb: (online: boolean) => void): Unsubscribe {
    this.#subs.add(cb);
    return () => {
      this.#subs.delete(cb);
    };
  }
}
