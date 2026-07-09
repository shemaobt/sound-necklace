import { describe, expect, it, vi } from 'vitest';

import { FixtureConnectivityMonitor } from './fixture';

describe('FixtureConnectivityMonitor', () => {
  it('nasce online e reflete o toggle manual', () => {
    const mon = new FixtureConnectivityMonitor();
    expect(mon.isOnline()).toBe(true);

    mon.setOnline(false);
    expect(mon.isOnline()).toBe(false);

    mon.setOnline(true);
    expect(mon.isOnline()).toBe(true);
  });

  it('respeita o estado inicial passado', () => {
    expect(new FixtureConnectivityMonitor(false).isOnline()).toBe(false);
  });

  it('notifica os inscritos em cada transição, com o novo valor', () => {
    const mon = new FixtureConnectivityMonitor();
    const seen: boolean[] = [];
    mon.subscribe((online) => seen.push(online));

    mon.setOnline(false);
    mon.setOnline(true);

    expect(seen).toEqual([false, true]);
  });

  it('não emite quando o estado não muda', () => {
    const mon = new FixtureConnectivityMonitor(true);
    const cb = vi.fn();
    mon.subscribe(cb);

    mon.setOnline(true);

    expect(cb).not.toHaveBeenCalled();
  });

  it('para de notificar após o cancelamento', () => {
    const mon = new FixtureConnectivityMonitor();
    const cb = vi.fn();
    const off = mon.subscribe(cb);

    off();
    mon.setOnline(false);

    expect(cb).not.toHaveBeenCalled();
  });
});
