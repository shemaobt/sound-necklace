import type { ConnectivityMonitor, Unsubscribe } from './types';

/** O subconjunto do navegador de que o monitor depende (injetável p/ teste). */
export interface OnlineFlag {
  readonly onLine: boolean;
}
export interface EventTargetLike {
  addEventListener(type: string, cb: () => void): void;
  removeEventListener(type: string, cb: () => void): void;
}

/**
 * Monitor real: `navigator.onLine` + os eventos `online`/`offline` da `window`
 * (PRD §13). O modo real liga por configuração de ambiente (ENG-247); no MVP a
 * fixture é o default. `nav`/`target` são injetáveis para testar sem `window`.
 */
export class BrowserConnectivityMonitor implements ConnectivityMonitor {
  readonly #nav: OnlineFlag;
  readonly #target: EventTargetLike;

  constructor(nav: OnlineFlag = globalThis.navigator, target: EventTargetLike = globalThis.window) {
    this.#nav = nav;
    this.#target = target;
  }

  isOnline(): boolean {
    return this.#nav.onLine;
  }

  subscribe(cb: (online: boolean) => void): Unsubscribe {
    const onOnline = () => cb(true);
    const onOffline = () => cb(false);
    this.#target.addEventListener('online', onOnline);
    this.#target.addEventListener('offline', onOffline);
    return () => {
      this.#target.removeEventListener('online', onOnline);
      this.#target.removeEventListener('offline', onOffline);
    };
  }
}
