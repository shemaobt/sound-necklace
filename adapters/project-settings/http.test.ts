import { describe, expect, it, vi } from 'vitest';

import { HttpProjectSettings } from './http';
import { GranularityLockedError } from './types';

/**
 * O modo REAL contra o contrato da ENG-361. `fetch` é injetado — nada aqui toca a
 * rede; o que se prova é a forma da requisição e o que cada resposta vira.
 */

const SETTINGS = {
  project_id: 'proj-1',
  granularity_level: 'medium',
  bead_sec: 0.5,
  locked: true,
  updated_at: '2026-07-24T00:00:00+00:00',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function store(fetchImpl: typeof globalThis.fetch, token?: () => string | null) {
  return new HttpProjectSettings({ baseUrl: 'https://api.test/api', fetch: fetchImpl, token });
}

describe('HttpProjectSettings.get', () => {
  it('lê as settings do projeto e devolve o DTO validado', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(SETTINGS));

    const settings = await store(fetchMock).get('proj-1');

    expect(settings).toEqual(SETTINGS);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.test/api/sound-necklace/projects/proj-1/settings');
    expect(init.method).toBe('GET');
  });

  it('manda o Bearer quando há sessão', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(SETTINGS));

    await store(fetchMock, () => 'tok-1').get('proj-1');

    expect(fetchMock.mock.calls[0]![1].headers.authorization).toBe('Bearer tok-1');
  });

  it('escapa o id do projeto na URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ...SETTINGS, project_id: 'a/b' }));

    await store(fetchMock).get('a/b');

    expect(fetchMock.mock.calls[0]![0]).toContain('/projects/a%2Fb/settings');
  });

  it('projeto sem configuração alguma lê como nulos, não como erro', async () => {
    const unset = {
      project_id: 'proj-2',
      granularity_level: null,
      bead_sec: null,
      locked: false,
      updated_at: null,
    };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(unset));

    await expect(store(fetchMock).get('proj-2')).resolves.toEqual(unset);
  });

  it('erro de rede vira erro, não settings inventadas', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 500 }));

    await expect(store(fetchMock).get('proj-1')).rejects.toThrow('HTTP 500');
  });

  it('resposta fora do schema é recusada — grade errada é pior que tela quebrada', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ...SETTINGS, bead_sec: -1 }));

    await expect(store(fetchMock).get('proj-1')).rejects.toThrow();
  });
});

describe('HttpProjectSettings.setLevel', () => {
  it('manda só o nível — bead_sec nunca sai daqui', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(SETTINGS));

    await store(fetchMock).setLevel('proj-1', 'small');

    const [, init] = fetchMock.mock.calls[0]!;
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body)).toEqual({ granularity_level: 'small' });
  });

  it('409 PROJECT_GRANULARITY_LOCKED vira o erro tipado que a tela explica', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ detail: 'já cortado', code: 'PROJECT_GRANULARITY_LOCKED' }, 409),
      );

    await expect(store(fetchMock).setLevel('proj-1', 'small')).rejects.toBeInstanceOf(
      GranularityLockedError,
    );
  });

  it('409 de outra natureza NÃO é lido como congelado', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ detail: 'outra coisa', code: 'CONFLICT' }, 409));

    const failure = store(fetchMock).setLevel('proj-1', 'small');

    await expect(failure).rejects.toThrow('HTTP 409');
    await expect(failure).rejects.not.toBeInstanceOf(GranularityLockedError);
  });

  it('403 (não é admin do projeto) sobe como erro', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 403 }));

    await expect(store(fetchMock).setLevel('proj-1', 'small')).rejects.toThrow('HTTP 403');
  });
});
