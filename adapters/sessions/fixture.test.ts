import { describe, expect, it } from 'vitest';

import type { ArtifactTriple, ResourcePath, SessionStateDto } from '../../contracts';
import { FixtureConnectivityMonitor } from '../connectivity/fixture';
import { FixtureSessionBackend, FixtureSessionStore, type KeyValueStorage } from './fixture';
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

describe('FixtureSessionStore — rename & remove (§7.2)', () => {
  /** Duas stores sobre um backend = dois editores no mesmo servidor. */
  const twoEditors = () => {
    const backend = new FixtureSessionBackend();
    return {
      alice: new FixtureSessionStore({ backend, user: { user_id: 'a', display_name: 'Alice' } }),
      bob: new FixtureSessionStore({ backend, user: { user_id: 'b', display_name: 'Bob' } }),
    };
  };

  it('rename troca o nome de exibição e mantém o story_slug byte-idêntico', async () => {
    const store = new FixtureSessionStore();
    const s = await store.create(input());

    const renamed = await store.rename(s.id, 'O canto da noite');

    expect(renamed.story_name).toBe('O canto da noite');
    const got = await store.get(s.id);
    expect(got.story_name).toBe('O canto da noite');
    const listed = (await store.list()).find((x) => x.id === s.id);
    expect(listed?.story_name).toBe('O canto da noite');
    // o slug nomeia os três artefatos (§10.5): renomear nunca o toca
    expect(renamed.story_slug).toBe(s.story_slug);
    expect(got.story_slug).toBe(s.story_slug);
    expect(listed?.story_slug).toBe(s.story_slug);
  });

  it('remove apaga a sessão: some da listagem e o get lança SessionNotFoundError', async () => {
    const store = new FixtureSessionStore();
    const s = await store.create(input());
    const other = await store.create(input({ storyName: 'Outra', storySlug: 'outra' }));

    await store.remove(s.id);

    expect((await store.list()).map((x) => x.id)).toEqual([other.id]);
    await expect(store.get(s.id)).rejects.toBeInstanceOf(SessionNotFoundError);
  });

  it('remove leva junto as respostas de voz da sessão', async () => {
    const store = new FixtureSessionStore();
    const s = await store.create(input());
    const path = 'respostas/level1/recontar.webm' as ResourcePath;
    await store.putResource(s.id, path, new Uint8Array([1, 2, 3]));

    await store.remove(s.id);

    // o servidor faz isso por cascata; a fixture não pode ser a única store onde
    // uma sessão apagada deixa as gravações alcançáveis
    await expect(store.getResource(s.id, path)).rejects.toThrow();
    expect(await store.listResources(s.id, 'respostas/')).toEqual([]);
  });

  it('rename de sessão travada por outra pessoa é recusado e o nome fica de pé', async () => {
    const { alice, bob } = twoEditors();
    const s = await alice.create(input());
    await alice.acquireLock(s.id);

    await expect(bob.rename(s.id, 'Nome do Bob')).rejects.toBeInstanceOf(LockLostError);

    expect((await alice.get(s.id)).story_name).toBe(s.story_name);
  });

  it('remove de sessão travada por outra pessoa é recusado e a sessão fica de pé', async () => {
    const { alice, bob } = twoEditors();
    const s = await alice.create(input());
    await alice.acquireLock(s.id);

    await expect(bob.remove(s.id)).rejects.toBeInstanceOf(LockLostError);

    expect((await alice.get(s.id)).id).toBe(s.id);
  });

  it('rename e remove de sessão desconhecida lançam SessionNotFoundError', async () => {
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
});
