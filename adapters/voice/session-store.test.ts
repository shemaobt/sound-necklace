import { describe, expect, it } from 'vitest';

import type { ResourcePath } from '../../contracts';
import { FixtureSessionBackend, FixtureSessionStore } from '../sessions';
import { SessionVoiceStore } from './session-store';

const PATH = 'respostas/level1/recontar.webm' as ResourcePath;

async function makeSession() {
  const store = new FixtureSessionStore({ backend: new FixtureSessionBackend() });
  const summary = await store.create({
    projectId: 'proj-1',
    storyName: 'A lenda do rio',
    storySlug: 'a-lenda-do-rio',
    audioId: 'aud-1',
    granularityLevel: 'medium',
    beadSec: 0.25,
    manifestId: 'fnv1a32:5a1b22f1',
    pipelineConsent: true,
  });
  return { store, id: summary.id };
}

describe('SessionVoiceStore — as respostas de voz vivem nos recursos da sessão (§10.4/O5)', () => {
  it('put/get/has/delete delegam aos recursos da sessão ligada', async () => {
    const { store, id } = await makeSession();
    const voice = new SessionVoiceStore(store, id);

    expect(await voice.has(PATH)).toBe(false);
    await voice.put(PATH, new Uint8Array([1, 2, 3]));
    expect(await voice.has(PATH)).toBe(true);
    expect(await voice.get(PATH)).toEqual(new Uint8Array([1, 2, 3]));

    await voice.delete(PATH);
    expect(await voice.has(PATH)).toBe(false);
  });

  it('duas sessões não dividem gravação — o namespace é a sessão (§10.4)', async () => {
    const backend = new FixtureSessionBackend();
    const store = new FixtureSessionStore({ backend });
    const a = await store.create({
      projectId: 'proj-1',
      storyName: 'A',
      storySlug: 'a',
      audioId: 'aud-1',
      granularityLevel: 'medium',
      beadSec: 0.25,
      manifestId: 'fnv1a32:5a1b22f1',
      pipelineConsent: true,
    });
    const b = await store.create({
      projectId: 'proj-1',
      storyName: 'B',
      storySlug: 'b',
      audioId: 'aud-1',
      granularityLevel: 'medium',
      beadSec: 0.25,
      manifestId: 'fnv1a32:5a1b22f1',
      pipelineConsent: true,
    });

    await new SessionVoiceStore(store, a.id).put(PATH, new Uint8Array([9]));

    expect(await new SessionVoiceStore(store, b.id).has(PATH)).toBe(false);
    expect(await new SessionVoiceStore(store, a.id).has(PATH)).toBe(true);
  });
});
