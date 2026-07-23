import { describe, expect, it } from 'vitest';

import registration from './register';

const P1 = 'respostas/level1/recontar.webm';

describe('registro do adapter de transcrição', () => {
  it('expõe a porta "stt"', () => {
    expect(registration.port).toBe('stt');
  });

  it('o fixture é um Transcriber utilizável de imediato', async () => {
    const stt = registration.fixture();
    await stt.start('s-1', [P1]);
    for (let i = 0; i < 20 && !(await stt.progress('s-1')).done; i++);
    expect((await stt.progress('s-1')).drafts[P1]?.en.trim()).not.toBe('');
  });

  it('o modo real compõe o HttpTranscriber contra o job da API (ENG-325)', async () => {
    const calls: string[] = [];
    const fetchImpl = (async (url: string) => {
      calls.push(url);
      return new Response(
        JSON.stringify({ total: 0, ready: 0, failed: 0, pending: 0, answers: [] }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      );
    }) as unknown as typeof globalThis.fetch;

    const stt = registration.real({ baseUrl: '/api', fetch: fetchImpl, language: () => 'pt-BR' });
    await stt.progress('s-1');

    expect(calls[0]).toBe('/api/sound-necklace/sessions/s-1/transcriptions');
  });
});
