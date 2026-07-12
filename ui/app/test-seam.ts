/**
 * Seam de teste DEV-ONLY (ENG-277 → acceptance-6 ENG-257): dá ao Playwright os dois
 * gatilhos de resiliência (§7.1/§7.3) que NÃO têm caminho natural de UI nem de
 * localStorage — a expiração de auth e a trava consultiva por outra pessoa. Instalado
 * só em DEV pelo composition root (main.tsx); nunca vai ao bundle de produção.
 *
 * O terceiro seam (offline) não precisa disto: o Playwright dirige por
 * `context.setOffline`, que a window reflete direto no gate (App.tsx `useOnline`).
 */

import { FixtureSessionStore, type LockHolder } from '../../adapters/sessions';
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
    expireAuth: () => appAuth().simulateExpiry(),
    seedForeignLock: async (sessionId, holder = OTHER_HOLDER) => {
      const other = new FixtureSessionStore({ backend: appSessionBackend(), user: holder });
      await other.acquireLock(sessionId);
    },
  };
}
