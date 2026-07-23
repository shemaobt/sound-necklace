import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { Transcriber, TranscriptionProgress } from '../../../adapters/stt/types';

import { useSttDrafts } from './use-stt-drafts';

const P1 = 'respostas/level1/recontar.webm';
const P2 = 'respostas/level2/PT1/quem.webm';

const draft = (en: string): TranscriptionProgress => ({
  done: true,
  drafts: { [P1]: { source: 'origem', en } },
});

/**
 * Transcritor cujo `progress` só responde quando o teste soltar — é o que permite
 * segurar a resposta de UM pedido e soltá-la DEPOIS do pedido seguinte, que é a
 * corrida real: regravar dispara um job novo enquanto o antigo ainda voa.
 */
function deferredTranscriber(): {
  stt: Transcriber;
  answer: (p: TranscriptionProgress) => Promise<void>;
  starts: { paths: readonly string[]; force: boolean }[];
} {
  const starts: { paths: readonly string[]; force: boolean }[] = [];
  const pending: ((p: TranscriptionProgress) => void)[] = [];
  return {
    starts,
    // espera a consulta chegar antes de respondê-la: `progress` só é chamada
    // alguns microtasks depois do `start`, e responder antes disso seria no-op.
    // Responde sempre a MAIS ANTIGA em aberto — é assim que se encena o atraso.
    answer: async (p) => {
      for (let i = 0; i < 50 && pending.length === 0; i++) await Promise.resolve();
      pending.shift()?.(p);
    },
    stt: {
      start: (_id, paths, opts) => {
        starts.push({ paths, force: Boolean(opts?.force) });
        return Promise.resolve();
      },
      progress: () => new Promise<TranscriptionProgress>((res) => pending.push(res)),
    },
  };
}

describe('useSttDrafts — o job de rascunhos do relatório', () => {
  it('entrega os rascunhos do job quando ele termina', async () => {
    const { stt, answer } = deferredTranscriber();
    const { result } = renderHook(() => useSttDrafts(stt, 's-1', [P1]));

    expect(result.current.phase).toBe('running');
    await act(async () => answer(draft('first')));

    await waitFor(() => expect(result.current.phase).toBe('done'));
    expect(result.current.drafts[P1]?.en).toBe('first');
  });

  it('a resposta ATRASADA de um job antigo não sobrescreve o pedido novo', async () => {
    const { stt, answer } = deferredTranscriber();
    const { result } = renderHook(() => useSttDrafts(stt, 's-1', [P1]));

    // regravou: novo pedido enquanto o antigo ainda voa
    await act(async () => result.current.retry());
    // ...e só AGORA o antigo responde
    await act(async () => answer(draft('rascunho velho')));

    // o velho é descartado: o cartão segue esperando o job corrente
    expect(result.current.phase).toBe('running');
    expect(result.current.drafts).toEqual({});

    await act(async () => answer(draft('rascunho novo')));
    await waitFor(() => expect(result.current.drafts[P1]?.en).toBe('rascunho novo'));
  });

  it('regravar reprocessa: o novo pedido vai com force', async () => {
    const { stt, starts } = deferredTranscriber();
    const { result } = renderHook(() => useSttDrafts(stt, 's-1', [P1]));

    await act(async () => result.current.retry());

    expect(starts.map((s) => s.force)).toEqual([false, true]);
  });

  it('quando a página sinaliza reprocessar (force), o pedido vai com force — mesmo o 1º', async () => {
    const { stt, starts } = deferredTranscriber();
    // é o que a página envia numa remontagem após regravar: a versão nova ainda
    // não foi transcrita, então força já no primeiro start desta montagem
    renderHook(() => useSttDrafts(stt, 's-1', [P1], { [P1]: 2 }, true));

    await waitFor(() => expect(starts.length).toBe(1));
    expect(starts[0]?.force).toBe(true);
  });

  it('sem sinal de reprocessar, o primeiro pedido reusa o job (sem force)', async () => {
    const { stt, starts } = deferredTranscriber();
    renderHook(() => useSttDrafts(stt, 's-1', [P1], {}, false));

    await waitFor(() => expect(starts.length).toBe(1));
    expect(starts[0]?.force).toBe(false);
  });

  it('mudar o conjunto de gravações dispara um pedido com as novas', async () => {
    const { stt, starts } = deferredTranscriber();
    const { rerender } = renderHook(({ paths }) => useSttDrafts(stt, 's-1', paths), {
      initialProps: { paths: [P1] },
    });

    await act(async () => rerender({ paths: [P1, P2] }));

    expect([...(starts.at(-1)?.paths ?? [])].sort()).toEqual([P1, P2].sort());
  });

  it('sem gravação nenhuma, o job nem começa', () => {
    const { stt, starts } = deferredTranscriber();
    const { result } = renderHook(() => useSttDrafts(stt, 's-1', []));

    expect(result.current.phase).toBe('idle');
    expect(starts).toEqual([]);
  });

  it('sem transcritor, fica ocioso — o relatório segue só com digitação', () => {
    const { result } = renderHook(() => useSttDrafts(null, 's-1', [P1]));

    expect(result.current.phase).toBe('idle');
  });

  it('o job que falha ao começar vira "failed" — a saída é digitar à mão', async () => {
    const stt: Transcriber = {
      start: () => Promise.reject(new Error('API fora')),
      progress: () => Promise.resolve({ done: false, drafts: {} }),
    };
    const { result } = renderHook(() => useSttDrafts(stt, 's-1', [P1]));

    await waitFor(() => expect(result.current.phase).toBe('failed'));
  });
});
