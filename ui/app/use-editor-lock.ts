/**
 * Ciclo de vida da trava consultiva de editor único (§7.3), do lado do cliente: adquire
 * ao abrir a sessão, RENOVA enquanto ela fica aberta, e solta ao sair. O tripod-api
 * (ENG-262) serve a trava como um lease de 60 s — adquirir e renovar são o mesmo PUT
 * idempotente, e conflito nunca é erro (200 com o `holder` de quem detém). Sem alguém
 * batendo o coração, o lease caduca sozinho e a sessão fica livre com o editor ainda
 * dentro dela: é isso que este hook impede.
 *
 * É o DONO ÚNICO do `setLock` (ENG-247): o App o chama por rota de sessão, nos dois
 * modos (a fixture também serve trava), e a hidratação não toca mais na trava — as
 * duas competiriam pelo mesmo `setLock`/`setReview`.
 */

import { useEffect } from 'react';

import type { LockStatus } from '../../contracts';
import { sessionStore } from '../state';
import { appSessionStore } from './session-adapter';

/**
 * Intervalo entre renovações. O TTL do backend é 60 s = 4× este valor — a razão do
 * kubelet (renova a 10 s, lease de 40 s), que tolera 3 batidas perdidas.
 */
export const HEARTBEAT_MS = 15_000;

/**
 * Sem NENHUMA renovação bem-sucedida por este tempo, o cliente prova o isolamento com
 * uma última tentativa — e só então se demite. É o `RenewDeadline` do client-go: aos
 * ~45 s este cliente já parou de agir, enquanto outra pessoa só consegue tomar a sessão
 * aos 60 s. Esperar um 409 para descobrir seria tarde — e chega por um caminho
 * (autosave) que pode nem estar em uso no momento.
 *
 * A demissão NÃO pode ser cega (ENG-331): com a aba em background ou o display do Mac
 * dormindo, beat e deadline congelam JUNTOS e disparam em rajada ao acordar — o beat
 * põe uma renovação em voo e o prazo vencido chegava antes da resposta, demitindo um
 * editor com o servidor saudável. Demitido, toda edição vira no-op silencioso.
 */
export const RENEW_DEADLINE_MS = 45_000;

/**
 * Espalhamento do heartbeat: cada cliente bate em [15 s, 18 s). Sem isso, uma frota
 * que reconecta junto depois de um deploy bate em uníssono no pooler do Neon.
 *
 * Deliberadamente NÃO é o `JitterFactor = 1.2` do client-go: lá o fator multiplica um
 * `RetryPeriod` de 2 s, e aplicá-lo a um heartbeat de 15 s daria batidas de até 33 s —
 * duas perdidas já estourariam o TTL de 60 s. O prazo abaixo é um relógio próprio, então
 * o jitter não afeta a garantia de demissão; mas 20% mantém 2 tentativas dentro dele.
 */
const JITTER_FACTOR = 0.2;

export function useEditorLock(routeId: string | null): void {
  useEffect(() => {
    if (routeId === null) return;
    // Estabelece a trava DESTA sessão do zero: sem isto, a trava da sessão anterior
    // fica visível até o acquire responder (flash de "em uso") — e para sempre se o
    // acquire falhar (rede), porque o catch abaixo não escreve nada.
    sessionStore.getState().setLock(null);
    const store = appSessionStore();
    let alive = true;
    /** Detemos a trava e ainda estamos agindo sobre ela. */
    let acting = false;
    let beatTimer: ReturnType<typeof setTimeout> | undefined;
    let deadlineTimer: ReturnType<typeof setTimeout> | undefined;

    const stopTimers = (): void => {
      if (beatTimer !== undefined) clearTimeout(beatTimer);
      if (deadlineTimer !== undefined) clearTimeout(deadlineTimer);
      beatTimer = deadlineTimer = undefined;
    };

    /** Quem detém a trava, se não formos nós. `null` = é nossa, ou está livre. */
    const otherHolder = (status: LockStatus): string | null =>
      status.held && status.holder && status.holder.user_id !== store.me.user_id
        ? status.holder.display_name
        : null;

    /**
     * Para de agir. `holder` nomeia quem tomou a sessão; `null` quando não sabemos
     * (o prazo estourou sem resposta) — a trava presente força a revisão e, sem nome,
     * o aviso é de reconexão, sem oferecer "Destravar para editar". `otherTab` é a
     * variante da MESMA conta noutra aba (ENG-328): cópia própria no banner.
     */
    const demote = (holder: string | null, otherTab = false): void => {
      acting = false;
      stopTimers();
      sessionStore.getState().setLock(otherTab ? { holder, otherTab: true } : { holder });
    };

    const armDeadline = (): void => {
      if (deadlineTimer !== undefined) clearTimeout(deadlineTimer);
      // O prazo não demite por si: dispara a última chance (tick abaixo). Só se
      // demite quem tenta falar com o servidor AGORA e falha — nunca um editor cujo
      // relógio simplesmente dormiu junto com a aba (ENG-331).
      deadlineTimer = setTimeout(() => {
        if (alive) void tick(true);
      }, RENEW_DEADLINE_MS);
    };

    const armBeat = (): void => {
      // clear antes de armar: na rajada pós-sono, beat e última chance re-armam em
      // paralelo — sem isto ficariam DOIS heartbeats vivos para sempre
      if (beatTimer !== undefined) clearTimeout(beatTimer);
      beatTimer = setTimeout(() => void tick(), HEARTBEAT_MS * (1 + Math.random() * JITTER_FACTOR));
    };

    const tick = async (lastChance = false): Promise<void> => {
      if (!alive || !acting) return;
      try {
        const status = await store.renewLock(routeId);
        if (!alive || !acting) return;
        // O PUT devolve quem detém: se virou outra pessoa (ou ninguém), a trava não é
        // mais nossa e paramos aqui — sem esperar uma escrita ser recusada.
        const other = otherHolder(status);
        if (other !== null || !status.held) {
          demote(other);
          return;
        }
        armDeadline(); // só uma renovação BEM-SUCEDIDA estende o prazo
      } catch {
        // falha isolada não decide nada — salvo na última chance do prazo: tentamos
        // falar com o servidor agora mesmo e não deu; sem lease não se edita.
        if (lastChance) {
          demote(null);
          return;
        }
      }
      if (alive && acting) armBeat();
    };

    // ENG-328: a MESMA conta numa segunda aba. A trava do backend é por conta — a
    // outra aba adquire "a própria" trava e as duas editariam em silêncio (o 409 do
    // ETag só chega numa escrita conflitante). Um canal por sessão detecta a colisão
    // no mesmo browser: quem MONTA anuncia; quem recebe o anúncio se demite para
    // revisão. A aba nova vence — é onde o usuário está agindo; recarregar a antiga
    // (ou reentrar nela) anuncia de novo e toma de volta. O id é por montagem: não
    // há o que persistir. Browser sem BroadcastChannel: segue como hoje (409 cobre).
    let claimed = false;
    const tabId = crypto.randomUUID();
    const channel =
      typeof BroadcastChannel === 'undefined'
        ? null
        : new BroadcastChannel(`cds-session-${routeId}`);
    channel?.addEventListener('message', (ev: MessageEvent) => {
      const claim = ev.data as { tabId?: unknown } | null | undefined;
      if (!alive || typeof claim?.tabId !== 'string' || claim.tabId === tabId) return;
      claimed = true;
      demote(null, true);
    });
    channel?.postMessage({ tabId });

    void (async () => {
      try {
        const status = await store.acquireLock(routeId);
        if (!alive || claimed) return; // outra aba reivindicou no meio do acquire
        const other = otherHolder(status);
        if (other !== null) {
          sessionStore.getState().setLock({ holder: other }); // sessão em uso: revisão
          return;
        }
        acting = true;
        sessionStore.getState().setLock(null);
        armDeadline();
        armBeat();
      } catch {
        // não deu para adquirir (rede caída, sessão inexistente): sem lease não se
        // edita — revisão com aviso de reconexão (holder desconhecido), como na
        // demissão por prazo. Editar sem lease abriria a janela de dois editores.
        if (alive && !claimed) sessionStore.getState().setLock({ holder: null });
      }
    })();

    // Fechar a aba não roda o cleanup do efeito. ponytail: é best-effort — um DELETE
    // disparado no pagehide costuma ser cortado com a página, e quem realmente cobre
    // esse caso é o TTL de 60 s do lease. O cleanup abaixo é que pega o caminho comum
    // (trocar de sessão / voltar ao dashboard, sem reload).
    //
    // Soltar é sempre best-effort, então a falha morre aqui: sair de uma sessão com a
    // rede caída não pode virar rejeição não tratada, e o TTL solta a trava de todo jeito.
    const release = (): void => void store.releaseLock(routeId).catch(() => undefined);
    window.addEventListener('pagehide', release);

    return () => {
      alive = false;
      acting = false;
      stopTimers();
      channel?.close();
      window.removeEventListener('pagehide', release);
      release();
    };
  }, [routeId]);
}
