/**
 * Ciclo de vida da trava consultiva de editor único (§7.3), do lado do cliente: adquire
 * ao abrir a sessão, RENOVA enquanto ela fica aberta, e solta ao sair. O tripod-api
 * (ENG-262) serve a trava como um lease de 60 s — adquirir e renovar são o mesmo PUT
 * idempotente, e conflito nunca é erro (200 com o `holder` de quem detém). Sem alguém
 * batendo o coração, o lease caduca sozinho e a sessão fica livre com o editor ainda
 * dentro dela: é isso que este hook impede.
 *
 * NÃO ESTÁ LIGADO AINDA (ENG-299 / ENG-247). O composition root monta hoje a
 * `FixtureSessionStore` direto (`session-adapter.ts`), e é `useSessionHydration`
 * (App.tsx) quem lê a trava, uma vez, ao hidratar. Quando a ENG-247 ligar o modo real
 * por ambiente, chame `useEditorLock(routeId)` no App e REMOVA de lá a leitura de
 * trava — as duas competiriam pelo mesmo `setLock`/`setReview`.
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
 * Sem NENHUMA renovação bem-sucedida por este tempo, o cliente se demite sozinho. É o
 * `RenewDeadline` do client-go, e é o que de fato fecha a janela de dois editores: aos
 * 45 s este cliente já parou de agir, enquanto outra pessoa só consegue tomar a sessão
 * aos 60 s. Esperar um 409 para descobrir seria tarde — e chega por um caminho
 * (autosave) que pode nem estar em uso no momento.
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
     * o aviso é de reconexão, sem oferecer "Destravar para editar".
     */
    const demote = (holder: string | null): void => {
      acting = false;
      stopTimers();
      sessionStore.getState().setLock({ holder });
    };

    const armDeadline = (): void => {
      if (deadlineTimer !== undefined) clearTimeout(deadlineTimer);
      deadlineTimer = setTimeout(() => {
        if (alive) demote(null);
      }, RENEW_DEADLINE_MS);
    };

    const armBeat = (): void => {
      beatTimer = setTimeout(() => void tick(), HEARTBEAT_MS * (1 + Math.random() * JITTER_FACTOR));
    };

    const tick = async (): Promise<void> => {
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
        // falha isolada não decide nada: quem desiste é o prazo, e ele segue correndo
      }
      if (alive && acting) armBeat();
    };

    void (async () => {
      try {
        const status = await store.acquireLock(routeId);
        if (!alive) return;
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
        // não deu para adquirir (rede/sessão inexistente): sem trava nossa, sem batidas
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
      window.removeEventListener('pagehide', release);
      release();
    };
  }, [routeId]);
}
