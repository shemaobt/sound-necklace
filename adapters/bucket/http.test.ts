/**
 * Esqueleto HTTP do BucketSource — mapeia a porta às superfícies de endpoint
 * (PROVISÓRIAS até ENG-211/247) com `fetch` injetado (sem rede no CI). Os bytes
 * do áudio são opacos (§10.5): a porta devolve o ArrayBuffer cru tal como veio.
 */

import { describe, expect, it } from 'vitest';

import { HttpBucketSource } from './http';

interface Call {
  url: string;
  method: string;
  headers: Headers;
}

function recordingFetch(response: () => Response) {
  const calls: Call[] = [];
  const fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    calls.push({
      url: String(input),
      method: init?.method ?? 'GET',
      headers: new Headers(init?.headers),
    });
    return Promise.resolve(response());
  };
  return { calls, fetch: fetch as typeof globalThis.fetch };
}

const LIST_BODY = {
  audios: [
    {
      id: 'aud_x',
      filename: 'x.wav',
      duration_sec: 12.5,
      consent_present: true,
      acousteme: { version: 1, data: { anything: 'opaque' } },
    },
  ],
};

describe('HttpBucketSource.list', () => {
  it('busca a listagem do bucket e devolve os áudios validados pelo contrato', async () => {
    const { calls, fetch } = recordingFetch(() => new Response(JSON.stringify(LIST_BODY)));
    const source = new HttpBucketSource({ baseUrl: 'https://api.test', fetch });

    const audios = await source.list();

    expect(audios).toHaveLength(1);
    expect(audios[0]!.id).toBe('aud_x');
    expect(calls[0]!.method).toBe('GET');
    expect(calls[0]!.url).toContain('/bucket/audios');
  });

  it('injeta o Bearer quando um token é fornecido', async () => {
    const { calls, fetch } = recordingFetch(() => new Response(JSON.stringify(LIST_BODY)));
    const source = new HttpBucketSource({
      baseUrl: 'https://api.test',
      fetch,
      token: () => 'tok-123',
    });

    await source.list();

    expect(calls[0]!.headers.get('authorization')).toBe('Bearer tok-123');
  });
});

describe('HttpBucketSource.fetchBytes', () => {
  it('devolve os bytes crus do áudio sem re-serializar (custódia opaca)', async () => {
    const raw = new Uint8Array([1, 2, 3, 4, 5]);
    const { calls, fetch } = recordingFetch(() => new Response(raw));
    const source = new HttpBucketSource({ baseUrl: 'https://api.test/', fetch });

    const bytes = new Uint8Array(await source.fetchBytes('aud_x'));

    expect([...bytes]).toEqual([...raw]);
    expect(calls[0]!.url).toContain('/bucket/audios/aud_x');
  });
});
