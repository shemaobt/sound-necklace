/**
 * BucketSource HTTP real (ENG-247): listagem por projeto e bytes em DOIS saltos
 * (URL assinada), com `fetch` injetado (sem rede no CI).
 */

import { describe, expect, it } from 'vitest';

import { HttpBucketSource } from './http';
import { BucketAudioNotFoundError } from './types';

interface Call {
  url: string;
  method: string;
  headers: Headers;
}

function recordingFetch(respond: (url: string) => Response) {
  const calls: Call[] = [];
  const fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    calls.push({
      url: String(input),
      method: init?.method ?? 'GET',
      headers: new Headers(init?.headers),
    });
    return Promise.resolve(respond(String(input)));
  };
  return { calls, fetch: fetch as typeof globalThis.fetch };
}

const LIST_BODY = {
  audios: [
    {
      id: 'ruth-1-promessa-da-vida-real',
      filename: '1 - promessa da vida real',
      duration_sec: 575.39,
      consent_present: true,
      acousteme: {
        codebook_version: 'terena-xlsr53-k100-v1',
        hop_sec: 0.02,
        granularity_frames: { small: 10, medium: 25, large: 50 },
      },
    },
    {
      id: 'ruth-cicatriz',
      filename: 'cicatriz',
      duration_sec: null,
      consent_present: true,
      acousteme: null,
    },
  ],
};

function source(respond: (url: string) => Response, projectId = () => 'proj-1') {
  const { calls, fetch } = recordingFetch(respond);
  return {
    calls,
    source: new HttpBucketSource({
      baseUrl: 'https://api.test',
      fetch,
      projectId,
      token: () => 'tok-123',
    }),
  };
}

describe('HttpBucketSource.list', () => {
  it('lista os áudios do PROJETO com o Bearer, validados pelo contrato', async () => {
    const { calls, source: src } = source(() => new Response(JSON.stringify(LIST_BODY)));

    const audios = await src.list();

    expect(audios).toHaveLength(2);
    expect(audios[0]!.id).toBe('ruth-1-promessa-da-vida-real');
    expect(audios[1]!.duration_sec).toBeNull();
    expect(calls[0]!.method).toBe('GET');
    expect(calls[0]!.url).toBe('https://api.test/sound-necklace/projects/proj-1/audios');
    expect(calls[0]!.headers.get('authorization')).toBe('Bearer tok-123');
  });

  it('aceita projectId assíncrono (resolvido pelo wiring de my-project-roles)', async () => {
    const { calls, source: src } = source(
      () => new Response(JSON.stringify(LIST_BODY)),
      () => Promise.resolve('proj-async') as never,
    );

    await src.list();

    expect(calls[0]!.url).toContain('/projects/proj-async/audios');
  });
});

describe('HttpBucketSource.fetchBytes', () => {
  const raw = new Uint8Array([73, 68, 51, 4, 0]);

  it('busca em dois saltos: assina na API (com Bearer) e baixa da URL assinada SEM Bearer', async () => {
    const { calls, source: src } = source((url) =>
      url.includes('/audios/')
        ? new Response(JSON.stringify({ url: 'https://storage.test/signed?sig=abc' }))
        : new Response(raw),
    );

    const bytes = new Uint8Array(await src.fetchBytes('ruth-cicatriz'));

    expect([...bytes]).toEqual([...raw]);
    expect(calls[0]!.url).toBe('https://api.test/sound-necklace/audios/ruth-cicatriz/url');
    expect(calls[0]!.headers.get('authorization')).toBe('Bearer tok-123');
    // URL assinada: o GCS autentica pela assinatura na query — Authorization extra
    // invalidaria a requisição
    expect(calls[1]!.url).toBe('https://storage.test/signed?sig=abc');
    expect(calls[1]!.headers.get('authorization')).toBeNull();
  });

  it('404 na assinatura vira BucketAudioNotFoundError (contrato da porta)', async () => {
    const { source: src } = source(() => new Response('{"detail":"x"}', { status: 404 }));

    await expect(src.fetchBytes('nao-existe')).rejects.toBeInstanceOf(BucketAudioNotFoundError);
  });
});
