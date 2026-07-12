import { describe, expect, it } from 'vitest';

import { appSessionStore } from './session-adapter';
import { installTestSeam, type TestSeam } from './test-seam';

describe('test-seam (dev-only)', () => {
  it('instala os gatilhos e a trava alheia aparece no backend app-global', async () => {
    const target: { __cds?: TestSeam } = {};
    installTestSeam(target);
    expect(typeof target.__cds?.expireAuth).toBe('function');

    const store = appSessionStore();
    const summary = await store.create({
      projectId: 'p1',
      storyName: 'H',
      storySlug: 'h',
      audioId: 'a1',
      granularityLevel: 'media',
      beadSec: 0.25,
      manifestId: 'fnv1a32:deadbeef',
      pipelineConsent: true,
    });

    await target.__cds!.seedForeignLock(summary.id);

    const status = await store.lockStatus(summary.id);
    expect(status.held).toBe(true);
    expect(status.holder?.display_name).toBe('Ana');
  });
});
