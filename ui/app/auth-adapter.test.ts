import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * O singleton lê o modo do ambiente NA CARGA do módulo — cada caso reseta o registry
 * de módulos e importa de novo para observar a seleção (ENG-247).
 */
describe('appAuth — seleção fixture ↔ real por ambiente (ENG-247)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('sem configuração, o modo é fixture (default de teste/CI)', async () => {
    vi.resetModules();
    const { appAuth } = await import('./auth-adapter');
    const { FixtureAuthProvider } = await import('../../adapters/api');
    expect(appAuth()).toBeInstanceOf(FixtureAuthProvider);
  });

  it('VITE_API_MODE=real monta o HttpAuthProvider (login real por e-mail)', async () => {
    vi.stubEnv('VITE_API_MODE', 'real');
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.prod/api');
    vi.resetModules();
    const { appAuth } = await import('./auth-adapter');
    const { HttpAuthProvider } = await import('../../adapters/api');
    expect(appAuth()).toBeInstanceOf(HttpAuthProvider);
  });

  it('o singleton é UM só: chamadas repetidas devolvem a mesma instância', async () => {
    vi.resetModules();
    const { appAuth } = await import('./auth-adapter');
    expect(appAuth()).toBe(appAuth());
  });
});
