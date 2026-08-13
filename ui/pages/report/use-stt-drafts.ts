/**
 * Dispara o job de transcrição+tradução ao ABRIR o relatório e acompanha até
 * terminar (PRD v2 §8.7, emenda ENG-326). O rascunho que volta é sugestão: fica
 * no cartão até um humano confirmar a transcrição — este hook nunca escreve resposta.
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
  /**
   * Relê os rascunhos SEM reprocessar nada — a reação a uma confirmação recusada por
   * conflito, onde repetir manda a mesma geração vencida e perde de novo.
   *
   * Não é `retry`: aquele força, e forçar aqui pagaria de novo pela transcrição inteira
   * para descobrir um texto que o servidor já tem. E não mexe na `jobKey`, de propósito:
   * o resultado corrente continua válido enquanto a releitura voa, então a tela não
   * volta para a espera por causa de uma resposta.
   */
  refresh: () => void;
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
  /**
   * The answers whose stored draft is of a take that no longer exists. Empty means
   * reuse whatever the server already has. The page decides (@/ui/pages/report),
   * because it holds the durable record of which version of each answer was
   * transcribed; the hook persists nothing between mounts and could not know.
   *
   * A LIST rather than a flag: the force it produces resets exactly these answers,
   * so redoing one re-recorded take no longer discards the drafts of all the others.
   */
  stale: readonly string[] = [],
): SttDrafts {
  const pathsKey = keyOf(paths, versions);
  const [result, setResult] = useState<JobResult | null>(null);
  const [attempt, setAttempt] = useState(0);
  // releitura: entra nas dependências do efeito, mas NÃO na `jobKey` — o resultado que
  // já está na tela segue casando com a chave corrente enquanto a consulta nova voa
  const [reread, setReread] = useState(0);
  // identifica o pedido corrente: resposta de pedido velho é descartada
  const requestId = useRef(0);
  // lido no start via ref (não é dep do laço): quando o force muda SEM mudar o
  // jobKey — o caso normal, force cai para falso quando o rascunho é semeado — o
  // laço não deve reiniciar. Todo caso que EXIGE reprocessar (regravação, nova
  // gravação, retry) já muda o pathsKey ou o attempt e re-roda por si, lendo o ref
  // já atualizado. Ref escrito em efeito, nunca no render (regra da casa).
  // A lista vira string ordenada para o ref ter uma dependência PRIMITIVA: um array
  // é novo a cada render e faria o efeito abaixo disparar sem parar.
  const staleKey = [...stale].sort().join('|');
  const staleRef = useRef(staleKey);
  useEffect(() => {
    staleRef.current = staleKey;
  }, [staleKey]);

  const active = Boolean(stt && sessionId && pathsKey !== '');
  const jobKey = `${pathsKey}#${attempt}`;

  useEffect(() => {
    if (!stt || !sessionId || pathsKey === '') return;
    const mine = ++requestId.current;
    const list = pathsOf(pathsKey);
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let delay = FIRST_DELAY_MS;
    // conta a partir de quando o poll REALMENTE começa (em run), não da montagem
    // do efeito: com a aba escondida, run é adiado pelo visibilitychange, e medir
    // daqui gastaria o teto de 5 min com a aba dormindo e falharia na volta
    let startedAt = Date.now();

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
      startedAt = Date.now();
      try {
        // force when the page names a stale draft, or on an explicit retry; otherwise
        // the server's idempotent job is reused as-is.
        //
        // A retry carries no paths, so it stays session-wide. The button that raises
        // `attempt` sits on a failed card but tells us nothing about WHICH — narrowing
        // it needs the caller to say, and that is not this change.
        const stalePaths = staleRef.current ? staleRef.current.split('|') : [];
        const reprocess = attempt > 0 || stalePaths.length > 0;
        const scope = attempt > 0 ? undefined : stalePaths;
        await stt.start(sessionId, list, reprocess ? { force: true, paths: scope } : undefined);
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
  }, [stt, sessionId, pathsKey, attempt, jobKey, reread]);

  // Derivado, nunca escrito num efeito (regra react-hooks da casa): um resultado
  // de outro pedido — chave diferente — lê-se como "ainda rodando".
  const current = result?.key === jobKey ? result : null;
  return {
    phase: !active ? 'idle' : (current?.status ?? 'running'),
    drafts: current?.status === 'done' ? current.drafts : {},
    retry: () => setAttempt((n) => n + 1),
    refresh: () => setReread((n) => n + 1),
  };
}
