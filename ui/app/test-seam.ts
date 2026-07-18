/**
 * Seam de teste DEV-ONLY (ENG-277 → acceptance-6 ENG-257): dá ao Playwright os dois
 * gatilhos de resiliência (§7.1/§7.3) que NÃO têm caminho natural de UI nem de
 * localStorage — a expiração de auth e a trava consultiva por outra pessoa. Instalado
 * só em DEV pelo composition root (main.tsx); nunca vai ao bundle de produção.
 *
 * O terceiro seam (offline) não precisa disto: o Playwright dirige por
 * `context.setOffline`, que a window reflete direto no gate (App.tsx `useOnline`).
 */

import { FixtureAuthProvider } from '../../adapters/api';
import { type LockHolder } from '../../adapters/sessions';
import { appAuth } from './auth-adapter';
import { appSessionBackend } from './session-adapter';

const OTHER_HOLDER: LockHolder = { user_id: 'outra-facilitadora', display_name: 'Ana' };

export interface TestSeam {
  /** Caduca o token do servidor (§7.1) — o app volta ao login sem perder o estado. */
  expireAuth(): void;
  /** Semeia a trava da sessão por outra pessoa no MESMO backend (§7.3). */
  seedForeignLock(sessionId: string, holder?: LockHolder): Promise<void>;
}

export function installTestSeam(
  target: { __cds?: TestSeam } = globalThis as { __cds?: TestSeam },
): void {
  target.__cds = {
    expireAuth: () => {
      // só o fixture tem expiração simulável; no modo real (ENG-247) quem caduca é o servidor
      const auth = appAuth();
      if (auth instanceof FixtureAuthProvider) auth.simulateExpiry();
    },
    seedForeignLock: async (sessionId, holder = OTHER_HOLDER) => {
      // FORÇA a posse direto no backend: com o useEditorLock (ENG-247) o editor
      // detém a trava DE VERDADE enquanto a sessão está aberta, então um acquire
      // da Ana seria honestamente recusado. O seam semeia o estado-alvo ("sessão
      // em uso por outra pessoa"), não disputa o lease.
      const backend = appSessionBackend();
      const rec = backend.sessions.get(sessionId);
      if (!rec) throw new Error(`seam: sessão desconhecida ${sessionId}`);
      rec.lock = { holder, expires_at: new Date(Date.now() + 60_000).toISOString() };
      backend.persist();
    },
  };
}
