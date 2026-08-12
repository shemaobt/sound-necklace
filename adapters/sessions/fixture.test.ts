import { describe, expect, it } from 'vitest';

import type { ArtifactTriple, ResourcePath, SessionStateDto } from '../../contracts';
import { FixtureConnectivityMonitor } from '../connectivity/fixture';
import {
  FixtureSessionBackend,
  FixtureSessionStore,
  type FixtureSessionStoreOptions,
  type KeyValueStorage,
} from './fixture';
import type { CreateSessionInput } from './types';
import { LockLostError, SessionNotFoundError } from './types';

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

describe('FixtureSessionStore — rename & remove (ENG-281)', () => {
  /** Two stores over one backend = two editors on one server. */
  const twoEditors = (over: FixtureSessionStoreOptions = {}) => {
    const backend = new FixtureSessionBackend();
    return {
      alice: new FixtureSessionStore({
        backend,
        user: { user_id: 'a', display_name: 'Alice' },
        ...over,
      }),
      bob: new FixtureSessionStore({
        backend,
        user: { user_id: 'b', display_name: 'Bob' },
        ...over,
      }),
    };
  };

  const artifacts: ArtifactTriple = { manifest: '{}', anchoring: '{}', report: '# r' };

  it('rename swaps the display name and keeps the story_slug byte-identical', async () => {
    const store = new FixtureSessionStore();
    const s = await store.create(input());

    const renamed = await store.rename(s.id, 'O canto da noite');

    expect(renamed.story_name).toBe('O canto da noite');
    const got = await store.get(s.id);
    expect(got.story_name).toBe('O canto da noite');
    const listed = (await store.list()).find((x) => x.id === s.id);
    expect(listed?.story_name).toBe('O canto da noite');
    // the slug names the three artifacts (§10.6): renaming never touches it
    expect(renamed.story_slug).toBe(s.story_slug);
    expect(got.story_slug).toBe(s.story_slug);
    expect(listed?.story_slug).toBe(s.story_slug);
  });

  it('rename trims the edges and refuses a blank name, as the server does', async () => {
    const store = new FixtureSessionStore();
    const s = await store.create(input());

    // the server's StringConstraints strips before it measures; storing "  Oi  " here
    // while the real mode stores "Oi" is the fixture/real divergence to avoid
    expect((await store.rename(s.id, '  O canto  ')).story_name).toBe('O canto');
    await expect(store.rename(s.id, '   ')).rejects.toThrow();
    expect((await store.get(s.id)).story_name).toBe('O canto');
  });

  it('remove deletes the session: gone from the listing, get throws SessionNotFoundError', async () => {
    const store = new FixtureSessionStore();
    const s = await store.create(input());
    const other = await store.create(input({ storyName: 'Outra', storySlug: 'outra' }));

    await store.remove(s.id);

    expect((await store.list()).map((x) => x.id)).toEqual([other.id]);
    await expect(store.get(s.id)).rejects.toBeInstanceOf(SessionNotFoundError);
  });

  it('remove takes the session voice answers with it', async () => {
    const store = new FixtureSessionStore();
    const s = await store.create(input());
    const path = 'respostas/level1/recontar.webm' as ResourcePath;
    await store.putResource(s.id, path, new Uint8Array([1, 2, 3]));

    await store.remove(s.id);

    // the server does this by cascade; the fixture must not be the one store where a
    // removed session leaves its recordings reachable
    await expect(store.getResource(s.id, path)).rejects.toThrow();
    expect(await store.listResources(s.id, 'respostas/')).toEqual([]);
  });

  it('rename and remove work on a COMPLETED session — the owner allows both at any time', async () => {
    const store = new FixtureSessionStore();
    const kept = await store.create(input());
    const doomed = await store.create(input({ storyName: 'Outra', storySlug: 'outra' }));
    await store.complete(kept.id, dto(), artifacts);
    await store.complete(doomed.id, dto(), artifacts);

    expect((await store.rename(kept.id, 'Renomeada depois de concluir')).story_name).toBe(
      'Renomeada depois de concluir',
    );
    await store.remove(doomed.id);

    expect((await store.get(kept.id)).status).toBe('completed');
    await expect(store.get(doomed.id)).rejects.toBeInstanceOf(SessionNotFoundError);
  });

  it('renaming a session another editor holds is refused, and the name stands', async () => {
    const { alice, bob } = twoEditors();
    const s = await alice.create(input());
    await alice.acquireLock(s.id);

    await expect(bob.rename(s.id, 'Nome do Bob')).rejects.toBeInstanceOf(LockLostError);

    expect((await alice.get(s.id)).story_name).toBe(s.story_name);
  });

  it('removing a session another editor holds is refused, and the session stands', async () => {
    const { alice, bob } = twoEditors();
    const s = await alice.create(input());
    await alice.acquireLock(s.id);

    await expect(bob.remove(s.id)).rejects.toBeInstanceOf(LockLostError);

    expect((await alice.get(s.id)).id).toBe(s.id);
  });

  it('an EXPIRED lock fences nobody — the holder walked away', async () => {
    const { alice, bob } = twoEditors({ lockTtlMs: 1 });
    const s = await alice.create(input());
    await alice.acquireLock(s.id);
    await new Promise((r) => setTimeout(r, 5));

    // the server's guard is "nobody ELSE holds it" — a lapsed lease holds nothing
    expect((await bob.rename(s.id, 'Nome do Bob')).story_name).toBe('Nome do Bob');
    await expect(bob.remove(s.id)).resolves.toBeUndefined();
  });

  it('rename and remove of an unknown session throw SessionNotFoundError', async () => {
    const store = new FixtureSessionStore();

    await expect(store.rename('nope', 'Qualquer')).rejects.toBeInstanceOf(SessionNotFoundError);
    await expect(store.remove('nope')).rejects.toBeInstanceOf(SessionNotFoundError);
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

  it('a rename survives the reload and a removed session does not come back', async () => {
    const storage = fakeStorage();
    const before = new FixtureSessionStore({ backend: new FixtureSessionBackend(storage) });
    const kept = await before.create(input());
    const doomed = await before.create(input({ storyName: 'Outra', storySlug: 'outra' }));

    await before.rename(kept.id, 'O canto da noite');
    await before.remove(doomed.id);

    // both writes have to reach the snapshot, or a reload resurrects the deleted
    // session and forgets the new name
    const after = new FixtureSessionStore({ backend: new FixtureSessionBackend(storage) });
    expect((await after.get(kept.id)).story_name).toBe('O canto da noite');
    expect((await after.list()).map((x) => x.id)).toEqual([kept.id]);
  });
});
