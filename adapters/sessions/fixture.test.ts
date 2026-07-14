import { describe, expect, it } from 'vitest';

import type { ArtifactTriple, ResourcePath, SessionStateDto } from '../../contracts';
import { FixtureConnectivityMonitor } from '../connectivity/fixture';
import { FixtureSessionBackend, FixtureSessionStore, type KeyValueStorage } from './fixture';
import type { CreateSessionInput } from './types';
import { SessionNotFoundError } from './types';

const input = (over: Partial<CreateSessionInput> = {}): CreateSessionInput => ({
  projectId: 'proj-1',
  storyName: 'A lenda do rio',
  storySlug: 'a-lenda-do-rio',
  audioId: 'aud-1',
  granularityLevel: 'medium',
  beadSec: 0.25,
  manifestId: 'fnv1a32:5a1b22f1',
  pipelineConsent: true,
  ...over,
});

/** Estado com só os campos que a store lê (mode + whole p/ derivar o passo). */
const dto = (
  over: Partial<{ mode: string; confirmed: boolean; tag: string }> = {},
): SessionStateDto =>
  ({
    schema_version: 1,
    mode: over.mode ?? 'triagem',
    whole: { id: 'S1', span: { s: 0, e: 9 }, confirmed: over.confirmed ?? true },
    tag: over.tag ?? 'x',
  }) as unknown as SessionStateDto;

const fakeStorage = (): KeyValueStorage => {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
  };
};

describe('FixtureSessionStore — autosave & resume', () => {
  it('resumes the exact saved DTO after autosave + flush', async () => {
    const store = new FixtureSessionStore();
    const s = await store.create(input());
    const state = dto({ mode: 'segmentacao', tag: 'work' });

    store.autosave(s.id, state);
    await store.flush(s.id);

    expect(await store.load(s.id)).toEqual(state);
  });

  it('load of a never-saved session throws SessionNotFoundError', async () => {
    const store = new FixtureSessionStore();
    await expect(store.load('nope')).rejects.toBeInstanceOf(SessionNotFoundError);
  });

  it('derives the dashboard step from the saved state mode', async () => {
    const store = new FixtureSessionStore();
    const s = await store.create(input());

    store.autosave(s.id, dto({ mode: 'triagem' }));
    await store.flush(s.id);
    expect((await store.get(s.id)).progress.current_step).toBe('triage');

    store.autosave(s.id, dto({ mode: 'escuta', confirmed: false }));
    await store.flush(s.id);
    expect((await store.get(s.id)).progress.current_step).toBe('listen');
  });
});

describe('FixtureSessionStore — lifecycle & artifact custody', () => {
  const artifacts: ArtifactTriple = {
    manifest: '{"channels":1,"rate":48000}',
    anchoring: '{"parts":[]}',
    report: '# Relatório\n\nlinha\n',
  };

  it('completes → concluída and returns the artifacts byte-identical', async () => {
    const store = new FixtureSessionStore();
    const s = await store.create(input());

    await store.complete(s.id, dto(), artifacts);

    expect((await store.get(s.id)).status).toBe('completed');
    const got = await store.getArtifacts(s.id);
    expect(got).toEqual(artifacts);
    expect(got.manifest).toBe(artifacts.manifest);
    expect(got.anchoring).toBe(artifacts.anchoring);
    expect(got.report).toBe(artifacts.report);
  });

  it('reopen returns a completed session to em_progresso', async () => {
    const store = new FixtureSessionStore();
    const s = await store.create(input());
    await store.complete(s.id, dto(), artifacts);

    await store.reopen(s.id);

    expect((await store.get(s.id)).status).toBe('in_progress');
  });
});

describe('FixtureSessionStore — advisory lock', () => {
  it('a second holder gets the current holder info without an exception', async () => {
    const backend = new FixtureSessionBackend();
    const alice = new FixtureSessionStore({
      backend,
      user: { user_id: 'a', display_name: 'Alice' },
    });
    const bob = new FixtureSessionStore({ backend, user: { user_id: 'b', display_name: 'Bob' } });
    const s = await alice.create(input());

    const first = await alice.acquireLock(s.id);
    expect(first.held).toBe(true);
    expect(first.holder?.user_id).toBe('a');

    const second = await bob.acquireLock(s.id);
    expect(second.held).toBe(true);
    expect(second.holder?.user_id).toBe('a'); // ainda Alice → Bob abre em revisão
  });

  it('release frees the lock so another user can take it; renew keeps it', async () => {
    const backend = new FixtureSessionBackend();
    const alice = new FixtureSessionStore({
      backend,
      user: { user_id: 'a', display_name: 'Alice' },
    });
    const bob = new FixtureSessionStore({ backend, user: { user_id: 'b', display_name: 'Bob' } });
    const s = await alice.create(input());

    await alice.acquireLock(s.id);
    expect((await alice.renewLock(s.id)).holder?.user_id).toBe('a');

    await alice.releaseLock(s.id);
    const taken = await bob.acquireLock(s.id);
    expect(taken.holder?.user_id).toBe('b');
  });
});

describe('FixtureSessionStore — voice resources', () => {
  it('round-trips bytes by their respostas/ path and lists by prefix', async () => {
    const store = new FixtureSessionStore();
    const s = await store.create(input());
    const p1 = 'respostas/level1/quem.webm' as ResourcePath;
    const p3 = 'respostas/level3/P2/sentido.webm' as ResourcePath;
    const bytes = new Uint8Array([9, 8, 7, 6]);

    await store.putResource(s.id, p1, bytes);
    await store.putResource(s.id, p3, new Uint8Array([1]));

    expect(await store.getResource(s.id, p1)).toEqual(bytes);
    expect(await store.listResources(s.id, 'respostas/level1/')).toEqual([p1]);
    expect((await store.listResources(s.id, 'respostas/')).sort()).toEqual([p1, p3].sort());
  });
});

describe('FixtureSessionStore — persistence across reload', () => {
  it('a new backend over the same storage recovers sessions and state', async () => {
    const storage = fakeStorage();
    const monitor = new FixtureConnectivityMonitor(true);
    const before = new FixtureSessionStore({
      backend: new FixtureSessionBackend(storage),
      monitor,
    });
    const s = await before.create(input());
    const state = dto({ mode: 'mapeamento', tag: 'saved' });
    before.autosave(s.id, state);
    await before.flush(s.id);

    // "reload": novo backend hidratando o mesmo storage
    const after = new FixtureSessionStore({ backend: new FixtureSessionBackend(storage) });
    expect((await after.list()).map((x) => x.id)).toContain(s.id);
    expect(await after.load(s.id)).toEqual(state);
  });
});
