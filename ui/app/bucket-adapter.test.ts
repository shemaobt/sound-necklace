import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * O resolver de projeto (ENG-247) lê env na carga — cada caso reseta módulos e
 * stuba o fetch global. A conta de dono/teste pertence a VÁRIOS projetos: o
 * resolver fica com o primeiro que tem áudio no bucket.
 */
function stubApi(routes: Record<string, unknown>) {
  const calls: string[] = [];
  vi.stubGlobal('fetch', async (url: unknown) => {
    const path = new URL(String(url)).pathname;
    calls.push(path);
    const hit = Object.entries(routes).find(([k]) => path.endsWith(k));
    if (!hit) return new Response('{"detail":"sem rota"}', { status: 404 });
    return new Response(JSON.stringify(hit[1]), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });
  return calls;
}

describe('resolveProjectId — conta multi-projeto fica com quem tem áudio', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('sonda os projetos na ordem e escolhe o primeiro com áudios', async () => {
    vi.stubEnv('VITE_API_MODE', 'real');
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.test/api');
    stubApi({
      '/auth/my-project-roles': {
        is_platform_admin: false,
        project_roles: { 'p-vazio': 'manager', 'p-piloto': 'member' },
      },
      '/sound-necklace/projects/p-vazio/audios': { audios: [] },
      '/sound-necklace/projects/p-piloto/audios': {
        audios: [
          {
            id: 'ruth-cicatriz',
            filename: 'cicatriz',
            duration_sec: 174,
            consent_present: true,
            acousteme: null,
          },
        ],
      },
    });
    vi.resetModules();
    const { resolveProjectId } = await import('./bucket-adapter');

    expect(await resolveProjectId()).toBe('p-piloto');
  });

  it('projeto único não é sondado: vai direto', async () => {
    vi.stubEnv('VITE_API_MODE', 'real');
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.test/api');
    const calls = stubApi({
      '/auth/my-project-roles': {
        is_platform_admin: false,
        project_roles: { 'p-unico': 'member' },
      },
    });
    vi.resetModules();
    const { resolveProjectId } = await import('./bucket-adapter');

    expect(await resolveProjectId()).toBe('p-unico');
    expect(calls.filter((p) => p.includes('/audios'))).toHaveLength(0);
  });

  it('todos vazios: fica com o primeiro (a Setup mostra a lista vazia honesta)', async () => {
    vi.stubEnv('VITE_API_MODE', 'real');
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.test/api');
    stubApi({
      '/auth/my-project-roles': {
        is_platform_admin: false,
        project_roles: { 'p-a': 'manager', 'p-b': 'member' },
      },
      '/sound-necklace/projects/p-a/audios': { audios: [] },
      '/sound-necklace/projects/p-b/audios': { audios: [] },
    });
    vi.resetModules();
    const { resolveProjectId } = await import('./bucket-adapter');

    expect(await resolveProjectId()).toBe('p-a');
  });
});
