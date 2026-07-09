import { describe, expect, it } from 'vitest';

import { createAppStore } from './app-store';

describe('app store — som da UI', () => {
  it('nasce com som ligado e alterna o mudo', () => {
    const store = createAppStore();
    expect(store.getState().muted).toBe(false);

    store.getState().toggleMuted();
    expect(store.getState().muted).toBe(true);

    store.getState().toggleMuted();
    expect(store.getState().muted).toBe(false);
  });
});
