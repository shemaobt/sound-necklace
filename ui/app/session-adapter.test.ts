import { afterEach, describe, expect, it, vi } from 'vitest';

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

/**
 * O singleton lê o modo do ambiente NA CARGA do módulo — o caso reseta o registry de
 * módulos e importa de novo para observar a seleção (ENG-247).
 */
describe('appSessionStore — seleção fixture ↔ real por ambiente (ENG-247)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('VITE_API_MODE=real monta o HttpSessionStore contra o tripod-api', async () => {
    vi.stubEnv('VITE_API_MODE', 'real');
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.prod/api');
    vi.resetModules();
    const { appSessionStore: realStore } = await import('./session-adapter');
    const { HttpSessionStore } = await import('../../adapters/sessions');
    expect(realStore()).toBeInstanceOf(HttpSessionStore);
  });
});
