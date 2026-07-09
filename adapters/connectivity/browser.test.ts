import { describe, expect, it, vi } from 'vitest';

import { BrowserConnectivityMonitor } from './browser';

/** EventTarget mínimo injetável — evita depender de `window` no runner node. */
function fakeTarget() {
  const listeners = new Map<string, Set<() => void>>();
  return {
    addEventListener: (type: string, cb: () => void) => {
      (listeners.get(type) ?? listeners.set(type, new Set()).get(type)!).add(cb);
    },
    removeEventListener: (type: string, cb: () => void) => {
      listeners.get(type)?.delete(cb);
    },
    emit: (type: string) => listeners.get(type)?.forEach((cb) => cb()),
  };
}

describe('BrowserConnectivityMonitor', () => {
  it('lê o estado do navegador injetado', () => {
    const mon = new BrowserConnectivityMonitor({ onLine: false }, fakeTarget());
    expect(mon.isOnline()).toBe(false);
  });

  it('traduz os eventos online/offline do alvo em transições', () => {
    const target = fakeTarget();
    const nav = { onLine: true };
    const mon = new BrowserConnectivityMonitor(nav, target);
    const seen: boolean[] = [];
    mon.subscribe((online) => seen.push(online));

    nav.onLine = false;
    target.emit('offline');
    nav.onLine = true;
    target.emit('online');

    expect(seen).toEqual([false, true]);
  });

  it('remove os listeners ao cancelar', () => {
    const target = fakeTarget();
    const mon = new BrowserConnectivityMonitor({ onLine: true }, target);
    const cb = vi.fn();
    const off = mon.subscribe(cb);

    off();
    target.emit('offline');

    expect(cb).not.toHaveBeenCalled();
  });
});
