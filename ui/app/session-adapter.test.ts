import { describe, expect, it } from 'vitest';

import { defaultSessionStore as dashboardStore } from '../pages/dashboard/ports';
import { defaultSessionStore as setupStore } from '../pages/setup/ports';
import { appSessionStore } from './session-adapter';

/**
 * Wiring do composition root (ENG-272): Setup, Dashboard e Export precisam ler e
 * escrever a MESMA store de sessão em modo fixture, senão a sessão criada no Setup
 * não aparece no Dashboard nem é lida pela Export. As portas default das páginas
 * apontam para o singleton app-global.
 */
describe('store de sessão unificada', () => {
  it('setup e dashboard resolvem o mesmo singleton que a export (appSessionStore)', () => {
    expect(setupStore()).toBe(appSessionStore());
    expect(dashboardStore()).toBe(appSessionStore());
  });

  it('uma sessão criada aparece na listagem compartilhada entre as páginas', async () => {
    const summary = await setupStore().create({
      projectId: 'p',
      storyName: 'Colar',
      storySlug: 'colar',
      audioId: 'a',
      granularityLevel: 'medium',
      beadSec: 0.25,
      manifestId: 'fnv1a32:deadbeef',
      pipelineConsent: true,
    });
    const ids = (await dashboardStore().list()).map((s) => s.id);
    expect(ids).toContain(summary.id);
  });
});
