/**
 * Dispara o job de transcrição+tradução ao ABRIR o relatório e acompanha até
 * terminar (PRD v2 §8.7, emenda ENG-326). O rascunho que volta é sugestão: fica
 * no cartão até um humano confirmar o inglês — este hook nunca escreve resposta.
 *
 * Consulta em `setTimeout` recursivo, não `setInterval`: com `setInterval` uma
 * consulta lenta não segura a próxima e elas se empilham. Pausa com a aba
 * escondida (o navegador estrangula o timer para ~1/min de qualquer jeito) e
 * consulta NA HORA ao voltar — é o que faz "sair e voltar" parecer instantâneo.
 *
 * Chegada tardia: um job disparado antes de uma regravação pode responder depois
 * dela. Cada resposta é conferida contra o pedido corrente (`requestId`) e a
 * atrasada é descartada, senão sobrescreveria o estado mais novo em silêncio.
 */

import { useEffect, useRef, useState } from 'react';

import type { AnswerDraft, Transcriber } from '../../../adapters/stt/types';

const FIRST_DELAY_MS = 2000;
const MAX_DELAY_MS = 10000;
/** Teto: passou disto, oferece tentar de novo em vez de girar para sempre. */
const GIVE_UP_MS = 5 * 60 * 1000;

export type SttPhase = 'idle' | 'running' | 'done' | 'failed';

export interface SttDrafts {
  phase: SttPhase;
  drafts: Record<string, AnswerDraft>;
  /** Re-dispara o job descartando os rascunhos atuais (regravação, ou falha). */
  retry: () => void;
}

/**
 * Chave estável de "este conjunto de gravações, NESTAS versões". A versão entra na
 * chave porque regravar reusa o mesmo caminho: sem ela o job não seria redisparado
 * e o rascunho da gravação antiga continuaria de pé.
 */
function keyOf(paths: readonly string[], versions: Record<string, number>): string {
  return [...paths]
    .sort()
    .map((p) => `${p}@${versions[p] ?? 0}`)
    .join('|');
}

/** Só os caminhos, sem a versão — é o que o job recebe. */
function pathsOf(key: string): string[] {
  return key ? key.split('|').map((e) => e.slice(0, e.lastIndexOf('@'))) : [];
}

/** Resultado de UM job, carimbado com a chave do pedido que o produziu. */
interface JobResult {
  key: string;
  status: 'done' | 'failed';
  drafts: Record<string, AnswerDraft>;
}

export function useSttDrafts(
  stt: Transcriber | null | undefined,
  sessionId: string | null,
  paths: readonly string[],
  versions: Record<string, number> = {},
): SttDrafts {
  const pathsKey = keyOf(paths, versions);
  const [result, setResult] = useState<JobResult | null>(null);
  const [attempt, setAttempt] = useState(0);
  // identifica o pedido corrente: resposta de pedido velho é descartada
  const requestId = useRef(0);
  // já disparamos algum job nesta montagem? (o 2º em diante reprocessa)
  const started = useRef(false);

  const active = Boolean(stt && sessionId && pathsKey !== '');
  const jobKey = `${pathsKey}#${attempt}`;

  useEffect(() => {
    if (!stt || !sessionId || pathsKey === '') return;
    const mine = ++requestId.current;
    const list = pathsOf(pathsKey);
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let delay = FIRST_DELAY_MS;
    const startedAt = Date.now();

    const stop = (): void => {
      cancelled = true;
      if (timer !== undefined) clearTimeout(timer);
    };

    const tick = async (): Promise<void> => {
      let p;
      try {
        p = await stt.progress(sessionId);
      } catch {
        // a consulta falhou: não é o fim do mundo, tenta de novo no próximo passo
        p = null;
      }
      // guarda DEPOIS do await: o efeito pode ter sido limpo enquanto voava
      if (cancelled || requestId.current !== mine) return;
      if (p?.done) {
        setResult({ key: jobKey, status: 'done', drafts: p.drafts });
        return;
      }
      if (Date.now() - startedAt > GIVE_UP_MS) {
        setResult({ key: jobKey, status: 'failed', drafts: {} });
        return;
      }
      delay = Math.min(delay * 2, MAX_DELAY_MS);
      timer = setTimeout(() => void tick(), delay);
    };

    const run = async (): Promise<void> => {
      try {
        // `force` sempre que este pedido não é o primeiro desta montagem: ou a
        // pessoa pediu de novo, ou regravou. Nos dois casos o rascunho guardado
        // no servidor é de um áudio que não vale mais.
        await stt.start(sessionId, list, started.current ? { force: true } : undefined);
        started.current = true;
      } catch {
        if (!cancelled && requestId.current === mine) {
          setResult({ key: jobKey, status: 'failed', drafts: {} });
        }
        return;
      }
      if (cancelled || requestId.current !== mine) return;
      await tick();
    };

    // aba escondida: nem dispara o laço; o visibilitychange abaixo religa o efeito
    if (typeof document !== 'undefined' && document.hidden) {
      const onVisible = (): void => {
        if (!document.hidden) {
          document.removeEventListener('visibilitychange', onVisible);
          void run();
        }
      };
      document.addEventListener('visibilitychange', onVisible);
      return () => {
        document.removeEventListener('visibilitychange', onVisible);
        stop();
      };
    }

    void run();
    return stop;
  }, [stt, sessionId, pathsKey, attempt, jobKey]);

  // Derivado, nunca escrito num efeito (regra react-hooks da casa): um resultado
  // de outro pedido — chave diferente — lê-se como "ainda rodando".
  const current = result?.key === jobKey ? result : null;
  return {
    phase: !active ? 'idle' : (current?.status ?? 'running'),
    drafts: current?.status === 'done' ? current.drafts : {},
    retry: () => setAttempt((n) => n + 1),
  };
}
