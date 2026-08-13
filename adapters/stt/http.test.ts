import { describe, expect, it, vi } from 'vitest';

import { HttpTranscriber } from './http';
import { TranscriptSuperseded } from './types';

const SESSION = 'sess-1';
const P1 = 'respostas/level1/recontar.webm';
const P2 = 'respostas/level2/PT1/quem.webm';
const URL = `/api/sound-necklace/sessions/${SESSION}/transcriptions`;

/** Uma resposta JSON pronta, como a API real devolve. */
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function make(
  fetchImpl: typeof globalThis.fetch,
  over: Partial<Parameters<typeof buildDeps>[0]> = {},
) {
  return new HttpTranscriber(buildDeps({ fetch: fetchImpl, ...over }));
}

function buildDeps(over: {
  fetch: typeof globalThis.fetch;
  language?: () => string;
  token?: () => string | null;
  onUnauthorized?: () => void;
}) {
  return {
    baseUrl: '/api',
    language: () => 'pt-BR',
    ...over,
  };
}

describe('HttpTranscriber — o modo real fala com o job da ENG-325', () => {
  it('start dispara POST no caminho da sessão com {language, force} e o Bearer', async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return json({ total: 1, ready: 0, failed: 0, pending: 1, answers: [] }, 202);
    }) as unknown as typeof globalThis.fetch;

    const stt = make(fetchImpl, { token: () => 'tok-42' });
    await stt.start(SESSION, [P1], { force: true });

    expect(calls[0]?.url).toBe(URL);
    expect(calls[0]?.init?.method).toBe('POST');
    // `paths: null` = a sessão inteira, o alcance que o servidor sempre entendeu
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      language: 'pt-BR',
      force: true,
      paths: null,
    });
    expect((calls[0]?.init?.headers as Record<string, string>)['authorization']).toBe(
      'Bearer tok-42',
    );
  });

  it('sem force explícito, o corpo leva force:false', async () => {
    let sentBody: unknown;
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      sentBody = JSON.parse(String(init?.body));
      return json({ total: 0, ready: 0, failed: 0, pending: 0, answers: [] }, 202);
    }) as unknown as typeof globalThis.fetch;

    await make(fetchImpl).start(SESSION, [P1]);

    expect(sentBody).toEqual({ language: 'pt-BR', force: false, paths: null });
  });

  it('o force nomeado leva SÓ as respostas regravadas — as outras não são refeitas', async () => {
    let sentBody: unknown;
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      sentBody = JSON.parse(String(init?.body));
      return json({ total: 0, ready: 0, failed: 0, pending: 0, answers: [] }, 202);
    }) as unknown as typeof globalThis.fetch;

    await make(fetchImpl).start(SESSION, [P1], { force: true, paths: [P1] });

    expect(sentBody).toEqual({ language: 'pt-BR', force: true, paths: [P1] });
  });

  it('progress mapeia a resposta: prontas viram rascunho {source, en}, o resto fica de fora', async () => {
    const body = {
      total: 3,
      ready: 1,
      failed: 1,
      pending: 1,
      answers: [
        {
          path: P1,
          status: 'ready',
          transcript_verbatim: 'Ele, ele contou do boto.',
          transcript_source: 'Ele contou do boto.',
          translation_en: 'He told of the dolphin.',
          error: null,
          generation: 3,
        },
        {
          path: P2,
          status: 'failed',
          transcript_verbatim: null,
          transcript_source: null,
          translation_en: null,
          error: 'boom',
          generation: 1,
        },
        {
          path: 'respostas/level1/lugar.webm',
          status: 'pending',
          transcript_verbatim: null,
          transcript_source: null,
          translation_en: null,
          error: null,
          generation: 0,
        },
      ],
    };
    const stt = make(vi.fn(async () => json(body)) as unknown as typeof globalThis.fetch);

    const { done, drafts } = await stt.progress(SESSION);

    expect(done).toBe(false); // ainda há uma pendente
    expect(drafts).toEqual({
      [P1]: {
        source: 'Ele contou do boto.',
        en: 'He told of the dolphin.',
        // A geração vem junto, e é o que distingue um rascunho refeito de um velho: uma
        // re-transcrição no servidor não toca na gravação, então a versão da gravação
        // diz "igual" mesmo quando o texto mudou por inteiro.
        generation: 3,
      },
    });
  });

  it('done fica true quando nada está pendente (prontas + falhas, zero pending)', async () => {
    const body = {
      total: 2,
      ready: 1,
      failed: 1,
      pending: 0,
      answers: [
        {
          path: P1,
          status: 'ready',
          transcript_verbatim: 's',
          transcript_source: 's',
          translation_en: 'en',
          error: null,
          generation: 1,
        },
        {
          path: P2,
          status: 'failed',
          transcript_verbatim: null,
          transcript_source: null,
          translation_en: null,
          error: 'x',
          generation: 1,
        },
      ],
    };
    const stt = make(vi.fn(async () => json(body)) as unknown as typeof globalThis.fetch);

    expect((await stt.progress(SESSION)).done).toBe(true);
  });

  it('progress usa GET no mesmo caminho, com o Bearer', async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return json({ total: 0, ready: 0, failed: 0, pending: 0, answers: [] });
    }) as unknown as typeof globalThis.fetch;

    await make(fetchImpl, { token: () => 'tok-9' }).progress(SESSION);

    expect(calls[0]?.url).toBe(URL);
    expect(calls[0]?.init?.method ?? 'GET').toBe('GET');
    expect((calls[0]?.init?.headers as Record<string, string>)['authorization']).toBe(
      'Bearer tok-9',
    );
  });

  it('401 avisa o wiring (onUnauthorized) nos dois verbos', async () => {
    const onUnauthorized = vi.fn();
    const fetchImpl = vi.fn(async () =>
      json({ detail: 'nope' }, 401),
    ) as unknown as typeof globalThis.fetch;
    const stt = make(fetchImpl, { onUnauthorized });

    await stt.start(SESSION, [P1]).catch(() => {});
    await stt.progress(SESSION).catch(() => {});

    expect(onUnauthorized).toHaveBeenCalledTimes(2);
  });

  it('confirm faz PUT no caminho da resposta, mandando só a língua falada e a geração', async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return json({
        path: P2,
        status: 'ready',
        transcript_verbatim: 'Ela, ela mudou de ideia.',
        transcript_source: 'Ela mudou de ideia.',
        translation_en: 'She changed her mind.',
        error: null,
        generation: 8,
      });
    }) as unknown as typeof globalThis.fetch;

    const confirmed = await make(fetchImpl).confirm(SESSION, P2, 'Ela mudou de ideia.', 7);

    // as barras do caminho SÃO o caminho (segmento `:path` no servidor): escapá-las
    // inteiras faria a rota não casar
    expect(calls[0]?.url).toBe(`${URL}/${P2}`);
    expect(calls[0]?.init?.method).toBe('PUT');
    // o inglês nunca sobe: é derivado lá a partir do que foi confirmado
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      transcript_source: 'Ela mudou de ideia.',
      generation: 7,
    });
    expect(confirmed).toEqual({ en: 'She changed her mind.', generation: 8 });
  });

  /**
   * Os três 409 da rota pedem reações OPOSTAS, e só o `code` os separa. Tratar uma trava
   * de sessão como conflito recarregaria o rascunho à toa; tratar o conflito como trava
   * mandaria a mesma geração vencida de novo, para sempre.
   */
  it('o 409 de conflito vira TranscriptSuperseded; o de trava, não', async () => {
    const conflito = make(
      vi.fn(async () =>
        json({ detail: 'redone', code: 'CONFLICT' }, 409),
      ) as unknown as typeof globalThis.fetch,
    );
    const travada = make(
      vi.fn(async () =>
        json({ detail: 'busy', code: 'SESSION_LOCKED' }, 409),
      ) as unknown as typeof globalThis.fetch,
    );

    await expect(conflito.confirm(SESSION, P1, 'texto', 1)).rejects.toBeInstanceOf(
      TranscriptSuperseded,
    );
    const outro = await travada.confirm(SESSION, P1, 'texto', 1).catch((e: unknown) => e);
    expect(outro).toBeInstanceOf(Error);
    expect(outro).not.toBeInstanceOf(TranscriptSuperseded);
  });

  /**
   * Sem inglês não há o que o artefato emita, e cair para a célula publicaria português
   * em silêncio num documento que é inglês por contrato. Recusar deixa a resposta por
   * confirmar, que é a verdade.
   */
  it('confirm sem tradução na resposta REJEITA em vez de deixar o inglês vazio', async () => {
    const stt = make(
      vi.fn(async () =>
        json({
          path: P1,
          status: 'ready',
          transcript_verbatim: null,
          transcript_source: 'texto',
          translation_en: null,
          error: null,
          generation: 2,
        }),
      ) as unknown as typeof globalThis.fetch,
    );

    await expect(stt.confirm(SESSION, P1, 'texto', 1)).rejects.toThrow();
  });

  it('progress num erro transitório REJEITA (o hook re-tenta em vez de tratar lixo como pronto)', async () => {
    const stt = make(
      vi.fn(async () => json({ detail: 'oops' }, 500)) as unknown as typeof globalThis.fetch,
    );

    await expect(stt.progress(SESSION)).rejects.toThrow();
  });
});
