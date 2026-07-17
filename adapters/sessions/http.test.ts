import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  CreateSessionRequest,
  LockStatus,
  SessionStateDto,
  SessionSummary,
} from '../../contracts';
import { FixtureConnectivityMonitor } from '../connectivity/fixture';
import { HttpSessionStore, type HttpSessionStoreOptions } from './http';
import type { CreateSessionInput } from './types';

const input: CreateSessionInput = {
  projectId: 'proj-1',
  storyName: 'A lenda do rio',
  storySlug: 'a-lenda-do-rio',
  audioId: 'aud-1',
  granularityLevel: 'medium',
  beadSec: 0.25,
  manifestId: 'fnv1a32:5a1b22f1',
  pipelineConsent: true,
};

const summary: SessionSummary = {
  id: 'sess-9',
  project_id: 'proj-1',
  story_name: 'A lenda do rio',
  story_slug: 'a-lenda-do-rio',
  status: 'in_progress',
  last_modified: '2026-07-10T00:00:00.000Z',
  progress: { current_step: 'listen' },
};

const ME = { user_id: 'u-henok', display_name: 'Henok' };

const FREE_LOCK: LockStatus = { held: false, holder: null, expires_at: null };

/** Estado opaco — a store não olha a forma interna (§10.5). */
const dto = (tag: string): SessionStateDto =>
  ({ schema_version: 1, tag }) as unknown as SessionStateDto;

/** Store sobre um `fetch` roteado por método+caminho, com o resto nos defaults. */
function storeWith(
  fetchStub: typeof fetch,
  extra: Partial<HttpSessionStoreOptions> = {},
): HttpSessionStore {
  return new HttpSessionStore({
    baseUrl: 'https://api.test',
    fetch: fetchStub,
    monitor: new FixtureConnectivityMonitor(true),
    user: ME,
    ...extra,
  });
}

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('HttpSessionStore', () => {
  it('create POSTs the CreateSessionRequest body and parses the summary', async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetchStub: typeof fetch = async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify(summary), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };

    const store = new HttpSessionStore({
      baseUrl: 'https://api.test',
      fetch: fetchStub,
      monitor: new FixtureConnectivityMonitor(true),
      user: { user_id: 'u', display_name: 'U' },
    });

    const out = await store.create(input);

    expect(calls).toHaveLength(1);
    const call = calls[0];
    if (!call) throw new Error('esperava uma chamada de fetch');
    expect(call.url).toBe('https://api.test/sessions');
    expect(call.init?.method).toBe('POST');
    const body = JSON.parse(String(call.init?.body)) as CreateSessionRequest;
    expect(body.audio_id).toBe('aud-1');
    expect(body.granularity_level).toBe('medium');
    expect(body.pipeline_consent).toBe(true);
    expect(out.id).toBe('sess-9');
  });

  it('acquireLock uses PUT — the backend serves acquire and renew with the same verb', async () => {
    const calls: { url: string; method?: string }[] = [];
    const store = storeWith(async (url, init) => {
      calls.push({ url: String(url), method: init?.method });
      return json(FREE_LOCK);
    });

    await store.acquireLock('sess-9');

    // um POST aqui é 405 no tripod-api (ENG-262): acquire e renew são o mesmo PUT.
    expect(calls).toEqual([{ url: 'https://api.test/sessions/sess-9/lock', method: 'PUT' }]);
  });

  it('exposes the configured editor as `me` — the caller compares it against the holder', () => {
    expect(storeWith(async () => json(FREE_LOCK)).me).toEqual(ME);
  });

  describe('autosave fencing', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('a 409 reports the lost lock once and never retries the rejected write', async () => {
      const lost: string[] = [];
      let attempts = 0;
      const store = storeWith(
        async () => {
          attempts++;
          return json({ error: 'lock held by someone else' }, 409);
        },
        { onLockLost: (id) => lost.push(id), debounceMs: 10 },
      );

      store.autosave('sess-9', dto('A'));
      await vi.advanceTimersByTimeAsync(5_000);

      // o 409 é veredito, não falha transitória: retentar só repete o 409, e segurar
      // o estado em memória perde a escrita quando a aba fecha.
      expect(attempts).toBe(1);
      expect(lost).toEqual(['sess-9']);
    });

    it('still retries a transient 500 — only the 409 is terminal', async () => {
      const lost: string[] = [];
      let attempts = 0;
      const store = storeWith(
        async () => {
          attempts++;
          return attempts < 3 ? json({ error: 'upstream' }, 500) : json({});
        },
        { onLockLost: (id) => lost.push(id), debounceMs: 10 },
      );

      store.autosave('sess-9', dto('A'));
      await vi.advanceTimersByTimeAsync(5_000);

      expect(attempts).toBe(3);
      expect(lost).toEqual([]);
    });
  });
});
