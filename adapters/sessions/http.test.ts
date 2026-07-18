import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  CreateSessionRequest,
  LockStatus,
  ResourcePath,
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

const PATH = 'respostas/level1/recontar.webm' as ResourcePath;

/** Recibo íntegro do upload multipart — um por kind (§10.5). */
const FULL_RECEIPT = (['manifest', 'anchoring', 'report'] as const).map((kind) => ({
  kind,
  size: 1,
  crc32c: 'c',
  sha256: 's',
}));

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

interface Call {
  url: string;
  method: string;
  init?: RequestInit;
}

/** Grava toda chamada e responde pela tabela `routes` (método + sufixo de URL). */
function recordingFetch(
  calls: Call[],
  routes: (call: Call) => Response | Promise<Response>,
): typeof fetch {
  return async (url, init) => {
    const call: Call = { url: String(url), method: init?.method ?? 'GET', init };
    calls.push(call);
    return routes(call);
  };
}

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('HttpSessionStore', () => {
  it('create POSTs the CreateSessionRequest body to /sound-necklace and parses the summary', async () => {
    const calls: Call[] = [];
    const store = storeWith(recordingFetch(calls, () => json(summary)));

    const out = await store.create(input);

    expect(calls).toHaveLength(1);
    const call = calls[0];
    if (!call) throw new Error('esperava uma chamada de fetch');
    expect(call.url).toBe('https://api.test/sound-necklace/sessions');
    expect(call.method).toBe('POST');
    const body = JSON.parse(String(call.init?.body)) as CreateSessionRequest;
    expect(body.audio_id).toBe('aud-1');
    expect(body.granularity_level).toBe('medium');
    expect(body.pipeline_consent).toBe(true);
    expect(out.id).toBe('sess-9');
  });

  it('awaits an async token thunk before sending — the boot race gate lives in the thunk', async () => {
    const calls: Call[] = [];
    const store = storeWith(
      recordingFetch(calls, () => json(summary)),
      {
        token: async () => 'tok-1',
      },
    );

    await store.get('sess-9');

    const headers = calls[0]?.init?.headers as Record<string, string>;
    expect(headers['authorization']).toBe('Bearer tok-1');
    expect(calls[0]?.url).toBe('https://api.test/sound-necklace/sessions/sess-9');
  });

  it('list pagina até esgotar — a 201ª sessão não some do Dashboard', async () => {
    const calls: Call[] = [];
    const pageOf = (n: number, from: number) =>
      Array.from({ length: n }, (_, i) => ({ ...summary, id: `sess-${from + i}` }));
    const store = storeWith(
      recordingFetch(calls, (call) => {
        const offset = Number(new URL(call.url).searchParams.get('offset'));
        return json({ sessions: offset === 0 ? pageOf(200, 0) : pageOf(3, 200) });
      }),
    );

    const all = await store.list();

    expect(all).toHaveLength(203);
    expect(calls.map((c) => new URL(c.url).search)).toEqual([
      '?offset=0&limit=200',
      '?offset=200&limit=200',
    ]);
  });

  it('acquireLock uses PUT — the backend serves acquire and renew with the same verb', async () => {
    const calls: Call[] = [];
    const store = storeWith(recordingFetch(calls, () => json(FREE_LOCK)));

    await store.acquireLock('sess-9');

    // um POST aqui é 405 no tripod-api (ENG-262): acquire e renew são o mesmo PUT.
    expect(calls.map((c) => ({ url: c.url, method: c.method }))).toEqual([
      { url: 'https://api.test/sound-necklace/sessions/sess-9/lock', method: 'PUT' },
    ]);
  });

  it('exposes the configured editor as `me` — accepting a thunk for a user known only after login', () => {
    expect(storeWith(async () => json(FREE_LOCK)).me).toEqual(ME);
    expect(storeWith(async () => json(FREE_LOCK), { user: () => ME }).me).toEqual(ME);
  });

  describe('complete — a ordem do fio real (§8.8/§10.5)', () => {
    it('recibo PARCIAL do upload (kind faltando) recusa a conclusão — nada de /complete', async () => {
      const calls: Call[] = [];
      const store = storeWith(
        recordingFetch(calls, (call) =>
          call.url.endsWith('/artifacts')
            ? json(FULL_RECEIPT.slice(0, 2), 201) // sem o report
            : json({ saved_at: 't', schema_version: 1 }),
        ),
      );

      await expect(
        store.complete('sess-9', dto('final'), { manifest: 'm', anchoring: 'a', report: 'r' }),
      ).rejects.toThrow(/recibo de artefatos sem o kind report/);
      expect(calls.some((c) => c.url.endsWith('/complete'))).toBe(false);
    });

    it('se o POST /artifacts falha, o POST /complete não sai — a ordem é invariante', async () => {
      const calls: Call[] = [];
      const store = storeWith(
        recordingFetch(calls, (call) =>
          call.url.endsWith('/artifacts')
            ? json({ detail: 'boom' }, 500)
            : json({ saved_at: '2026-07-17T00:00:00Z', schema_version: 1 }),
        ),
      );

      await expect(
        store.complete('sess-9', dto('final'), { manifest: 'm', anchoring: 'a', report: 'r' }),
      ).rejects.toThrow();

      // concluir sem os artefatos guardados deixaria a sessão "completed" vazia
      expect(calls.some((c) => c.url.endsWith('/complete'))).toBe(false);
    });

    it('espera o autosave EM VOO aterrissar antes do PUT final — nada regride o estado', async () => {
      vi.useFakeTimers();
      try {
        const calls: string[] = [];
        let releaseAutosave!: () => void;
        let firstStatePut = true;
        const store = storeWith(
          async (url, init) => {
            const u = String(url);
            const method = init?.method ?? 'GET';
            if (method === 'PUT' && u.endsWith('/state') && firstStatePut) {
              firstStatePut = false;
              calls.push('autosave');
              await new Promise<void>((r) => {
                releaseAutosave = r;
              });
              return json({ saved_at: 't', schema_version: 1 });
            }
            calls.push(`${method} ${u.split('/sessions/sess-9')[1] ?? u}`);
            if (u.endsWith('/artifacts')) return json(FULL_RECEIPT, 201);
            return json({ saved_at: 't', schema_version: 1 });
          },
          { debounceMs: 10 },
        );

        store.autosave('sess-9', dto('velho'));
        await vi.advanceTimersByTimeAsync(20); // o PUT do autosave despacha e fica em voo

        const done = store.complete('sess-9', dto('final'), {
          manifest: 'm',
          anchoring: 'a',
          report: 'r',
        });
        await vi.advanceTimersByTimeAsync(0);
        // o PUT final ainda NÃO saiu: um estado velho aterrissando depois dele
        // regrediria o documento salvo (o servidor aceita — só o lock o guarda)
        expect(calls).toEqual(['autosave']);

        releaseAutosave();
        await done;
        expect(calls).toEqual(['autosave', 'PUT /state', 'POST /artifacts', 'POST /complete']);
      } finally {
        vi.useRealTimers();
      }
    });

    it('PUT state → POST /artifacts multipart (bytes crus) → POST /complete sem corpo', async () => {
      const calls: Call[] = [];
      const store = storeWith(
        recordingFetch(calls, (call) => {
          if (call.url.endsWith('/artifacts')) return json(FULL_RECEIPT, 201);
          return json({ saved_at: '2026-07-17T00:00:00Z', schema_version: 1 });
        }),
      );

      await store.complete('sess-9', dto('final'), {
        manifest: '{"m":1}',
        anchoring: '{"a":1}',
        report: '# r',
      });

      expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
        'PUT https://api.test/sound-necklace/sessions/sess-9/state',
        'POST https://api.test/sound-necklace/sessions/sess-9/artifacts',
        'POST https://api.test/sound-necklace/sessions/sess-9/complete',
      ]);

      const upload = calls[1]?.init;
      const form = upload?.body as FormData;
      expect(form).toBeInstanceOf(FormData);
      // custódia §10.5: os três campos com os FILENAMES congelados do PRD §10
      const manifest = form.get('manifest') as File;
      const anchoring = form.get('anchoring') as File;
      const report = form.get('report') as File;
      expect(manifest.name).toBe('manifesto-contas.json');
      expect(anchoring.name).toBe('retorno-ancoragem.json');
      expect(report.name).toBe('relatorio-mapeamento.md');
      expect(await manifest.text()).toBe('{"m":1}');
      expect(await report.text()).toBe('# r');
      // multipart: o content-type (com boundary) é do runtime, nunca nosso
      const headers = (upload?.headers ?? {}) as Record<string, string>;
      expect(headers['content-type']).toBeUndefined();

      // o complete em si não tem corpo — os artefatos já subiram na rota própria
      expect(calls[2]?.init?.body).toBeUndefined();
    });
  });

  describe('getArtifacts — download por kind (307 → URL assinada)', () => {
    it('busca os três kinds e monta o trio', async () => {
      const calls: Call[] = [];
      const bodies: Record<string, string> = {
        manifest: '{"m":1}',
        anchoring: '{"a":1}',
        report: '# r',
      };
      const store = storeWith(
        recordingFetch(calls, (call) => {
          const kind = call.url.split('/').pop() ?? '';
          const body = bodies[kind];
          return new Response(body, { status: 200 });
        }),
      );

      const triple = await store.getArtifacts('sess-9');

      expect(calls.map((c) => c.url)).toEqual([
        'https://api.test/sound-necklace/sessions/sess-9/artifacts/manifest',
        'https://api.test/sound-necklace/sessions/sess-9/artifacts/anchoring',
        'https://api.test/sound-necklace/sessions/sess-9/artifacts/report',
      ]);
      expect(triple).toEqual({ manifest: '{"m":1}', anchoring: '{"a":1}', report: '# r' });
    });
  });

  describe('resources — respostas de voz (§10.4/O5, fio real ?path=)', () => {
    it('putResource PUT com ?path= e content-type audio/webm', async () => {
      const calls: Call[] = [];
      const store = storeWith(recordingFetch(calls, () => json({ path: PATH, size: 3 }, 201)));

      await store.putResource('sess-9', PATH, new Uint8Array([1, 2, 3]));

      expect(calls[0]?.method).toBe('PUT');
      expect(calls[0]?.url).toBe(
        `https://api.test/sound-necklace/sessions/sess-9/resources?path=${encodeURIComponent(PATH)}`,
      );
      const headers = calls[0]?.init?.headers as Record<string, string>;
      expect(headers['content-type']).toBe('audio/webm');
    });

    it('getResource faz o 2º salto SEM Bearer (URL assinada recusa Authorization)', async () => {
      const calls: Call[] = [];
      const store = storeWith(
        recordingFetch(calls, (call) =>
          call.url.includes('/resources/url')
            ? json({ url: 'https://signed.test/obj?sig=1' })
            : new Response(new Uint8Array([7, 8]), { status: 200 }),
        ),
        { token: () => 'tok-1' },
      );

      const bytes = await store.getResource('sess-9', PATH);

      expect(bytes).toEqual(new Uint8Array([7, 8]));
      expect(calls[0]?.url).toBe(
        `https://api.test/sound-necklace/sessions/sess-9/resources/url?path=${encodeURIComponent(PATH)}`,
      );
      const first = calls[0]?.init?.headers as Record<string, string>;
      expect(first['authorization']).toBe('Bearer tok-1');
      expect(calls[1]?.url).toBe('https://signed.test/obj?sig=1');
      const second = (calls[1]?.init?.headers ?? {}) as Record<string, string>;
      expect(second['authorization']).toBeUndefined();
    });

    it('listResources lista a sessão inteira e filtra o prefixo no cliente', async () => {
      const store = storeWith(async () =>
        json({
          resources: [
            { path: 'respostas/level1/recontar.webm', size: 3 },
            { path: 'respostas/level2/PT1/descrever.webm', size: 5 },
          ],
        }),
      );

      expect(await store.listResources('sess-9', 'respostas/level2/')).toEqual([
        'respostas/level2/PT1/descrever.webm',
      ]);
      expect(await store.listResources('sess-9', 'respostas/')).toHaveLength(2);
    });

    it('deleteResource DELETE com ?path= (no-op no servidor se nunca gravado)', async () => {
      const calls: Call[] = [];
      const store = storeWith(recordingFetch(calls, () => new Response(null, { status: 204 })));

      await store.deleteResource('sess-9', PATH);

      expect(calls[0]?.method).toBe('DELETE');
      expect(calls[0]?.url).toBe(
        `https://api.test/sound-necklace/sessions/sess-9/resources?path=${encodeURIComponent(PATH)}`,
      );
    });
  });

  describe('autosave fencing', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('um 409 SESSION_LOCKED reporta a trava perdida (com o nome) e nunca retenta', async () => {
      const lost: { id: string; holder: string | null }[] = [];
      let attempts = 0;
      const store = storeWith(
        async () => {
          attempts++;
          return json(
            {
              detail: 'This session is being edited by Alice.',
              code: 'SESSION_LOCKED',
              holder_name: 'Alice',
              expires_at: '2026-07-17T10:31:00+00:00',
            },
            409,
          );
        },
        { onLockLost: (id, holder) => lost.push({ id, holder }), debounceMs: 10 },
      );

      store.autosave('sess-9', dto('A'));
      await vi.advanceTimersByTimeAsync(5_000);

      // o 409 é veredito, não falha transitória: retentar só repete o 409, e segurar
      // o estado em memória perde a escrita quando a aba fecha.
      expect(attempts).toBe(1);
      expect(lost).toEqual([{ id: 'sess-9', holder: 'Alice' }]);
    });

    it('um 409 SESSION_LOCK_CHANGED retenta — o lease caducou, ninguém detém', async () => {
      const lost: unknown[] = [];
      let attempts = 0;
      const store = storeWith(
        async () => {
          attempts++;
          return attempts < 2
            ? json({ detail: 'lease lapsed mid-write', code: 'SESSION_LOCK_CHANGED' }, 409)
            : json({ saved_at: '2026-07-17T00:00:00Z', schema_version: 1 });
        },
        { onLockLost: (id) => lost.push(id), debounceMs: 10 },
      );

      store.autosave('sess-9', dto('A'));
      await vi.advanceTimersByTimeAsync(5_000);

      expect(attempts).toBe(2);
      expect(lost).toEqual([]);
    });

    it('still retries a transient 500 — only the SESSION_LOCKED 409 is terminal', async () => {
      const lost: unknown[] = [];
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
