import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SessionStateDto } from '../../contracts';
import { FixtureConnectivityMonitor } from '../connectivity/fixture';
import { createAutosaver } from './autosave';

/** Estado opaco distinguível — a store/autosaver não olham a forma interna. */
const dto = (tag: string): SessionStateDto =>
  ({ schema_version: 1, tag }) as unknown as SessionStateDto;

describe('createAutosaver', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('coalesces a burst into a single write carrying the last state', async () => {
    const writes: SessionStateDto[] = [];
    const saver = createAutosaver({
      persist: async (_id, state) => {
        writes.push(state);
      },
      monitor: new FixtureConnectivityMonitor(true),
      debounceMs: 100,
    });

    saver.schedule('s1', dto('A'));
    saver.schedule('s1', dto('B'));
    saver.schedule('s1', dto('C'));
    await vi.advanceTimersByTimeAsync(100);

    expect(writes).toEqual([dto('C')]);
  });

  it('pauses while offline and flushes the latest on reconnect with zero loss', async () => {
    const writes: SessionStateDto[] = [];
    const monitor = new FixtureConnectivityMonitor(false);
    const saver = createAutosaver({
      persist: async (_id, state) => {
        writes.push(state);
      },
      monitor,
      debounceMs: 100,
    });

    saver.schedule('s1', dto('A'));
    saver.schedule('s1', dto('B'));
    await vi.advanceTimersByTimeAsync(1000);
    expect(writes).toEqual([]); // nada persiste enquanto offline

    monitor.setOnline(true);
    await vi.advanceTimersByTimeAsync(100);
    expect(writes).toEqual([dto('B')]); // só o último, nada perdido
  });

  it('retries a transient failure with backoff until it persists', async () => {
    let attempts = 0;
    const writes: SessionStateDto[] = [];
    const saver = createAutosaver({
      persist: async (_id, state) => {
        attempts++;
        if (attempts < 3) throw new Error('flaky');
        writes.push(state);
      },
      monitor: new FixtureConnectivityMonitor(true),
      debounceMs: 100,
      backoffMs: 50,
      maxRetries: 5,
    });

    saver.schedule('s1', dto('A'));
    await vi.advanceTimersByTimeAsync(2000);

    expect(attempts).toBe(3);
    expect(writes).toEqual([dto('A')]);
  });

  it('flush() persists the pending state immediately, bypassing the debounce', async () => {
    const writes: SessionStateDto[] = [];
    const saver = createAutosaver({
      persist: async (_id, state) => {
        writes.push(state);
      },
      monitor: new FixtureConnectivityMonitor(true),
      debounceMs: 10_000,
    });

    saver.schedule('s1', dto('A'));
    await saver.flush('s1');

    expect(writes).toEqual([dto('A')]);
  });

  it('flush() is a no-op while offline (state stays pending)', async () => {
    const writes: SessionStateDto[] = [];
    const monitor = new FixtureConnectivityMonitor(false);
    const saver = createAutosaver({
      persist: async (_id, state) => {
        writes.push(state);
      },
      monitor,
      debounceMs: 100,
    });

    saver.schedule('s1', dto('A'));
    await saver.flush('s1');
    expect(writes).toEqual([]);

    monitor.setOnline(true);
    await vi.advanceTimersByTimeAsync(100);
    expect(writes).toEqual([dto('A')]); // recuperado no reconnect
  });

  it('flush of one session does not drop another session pending in the same window', async () => {
    const writes: { id: string; state: SessionStateDto }[] = [];
    const saver = createAutosaver({
      persist: async (id, state) => {
        writes.push({ id, state });
      },
      monitor: new FixtureConnectivityMonitor(true),
      debounceMs: 100,
    });

    saver.schedule('s1', dto('A'));
    saver.schedule('s2', dto('B'));
    await saver.flush('s1');
    expect(writes).toEqual([{ id: 's1', state: dto('A') }]);

    await vi.advanceTimersByTimeAsync(100);
    expect(writes).toEqual([
      { id: 's1', state: dto('A') },
      { id: 's2', state: dto('B') },
    ]);
  });

  it('cancel discards a pending autosave so it never persists', async () => {
    const writes: SessionStateDto[] = [];
    const saver = createAutosaver({
      persist: async (_id, state) => {
        writes.push(state);
      },
      monitor: new FixtureConnectivityMonitor(true),
      debounceMs: 100,
    });

    saver.schedule('s1', dto('A'));
    saver.cancel('s1');
    await vi.advanceTimersByTimeAsync(200);

    expect(writes).toEqual([]);
  });
});
