import { describe, expect, it, vi } from 'vitest';

import { HttpApiClient, HttpAuthProvider } from './client';
import { ApiError, AuthError } from './types';

/** Fabrica um `fetch` injetável que devolve respostas roteadas por `${method} ${path}`. */
function stubFetch(routes: Record<string, { status?: number; body?: unknown }>) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchStub = vi.fn(async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const key = `${init?.method ?? 'GET'} ${new URL(String(url), 'http://x').pathname}`;
    const route = routes[key] ?? { status: 404, body: { detail: 'sem rota' } };
    const status = route.status ?? 200;
    const text = route.body === undefined ? '' : JSON.stringify(route.body);
    return new Response(text, { status, headers: { 'content-type': 'application/json' } });
  });
  return { fetch: fetchStub as unknown as typeof globalThis.fetch, calls };
}

describe('HttpApiClient', () => {
  it('injects the Bearer token from getToken', async () => {
    const { fetch, calls } = stubFetch({ 'GET /api/thing': { body: { ok: true } } });
    const client = new HttpApiClient({ baseUrl: '/api', fetch, getToken: () => 'a9' });
    await client.request('GET', '/thing');
    const headers = calls[0]?.init.headers as Record<string, string>;
    expect(headers['authorization']).toBe('Bearer a9');
  });

  it('omits Authorization when there is no token', async () => {
    const { fetch, calls } = stubFetch({ 'GET /api/thing': { body: { ok: true } } });
    const client = new HttpApiClient({ baseUrl: '/api', fetch, getToken: () => null });
    await client.request('GET', '/thing');
    const headers = (calls[0]?.init.headers ?? {}) as Record<string, string>;
    expect(headers['authorization']).toBeUndefined();
  });

  it('sends a JSON body with the content-type header', async () => {
    const { fetch, calls } = stubFetch({ 'POST /api/echo': { body: { ok: true } } });
    const client = new HttpApiClient({ baseUrl: '/api', fetch, getToken: () => null });
    await client.request('POST', '/echo', { body: { a: 1 } });
    expect(calls[0]?.init.body).toBe(JSON.stringify({ a: 1 }));
    const headers = calls[0]?.init.headers as Record<string, string>;
    expect(headers['content-type']).toBe('application/json');
  });

  it('parses the response through the given schema', async () => {
    const { fetch } = stubFetch({ 'GET /api/me': { body: { id: 'u1' } } });
    const client = new HttpApiClient({ baseUrl: '/api', fetch, getToken: () => null });
    const schema = { parse: (d: unknown) => d as { id: string } };
    await expect(client.request('GET', '/me', { schema })).resolves.toEqual({ id: 'u1' });
  });

  it('on 401 emits auth-expired once and throws ApiError', async () => {
    const { fetch } = stubFetch({
      'GET /api/secure': { status: 401, body: { detail: 'expirou' } },
    });
    const client = new HttpApiClient({ baseUrl: '/api', fetch, getToken: () => 'tok' });
    const expired = vi.fn();
    client.onAuthExpired(expired);
    await expect(client.request('GET', '/secure')).rejects.toBeInstanceOf(ApiError);
    await expect(client.request('GET', '/secure')).rejects.toBeInstanceOf(ApiError);
    expect(expired).toHaveBeenCalledTimes(1);
  });

  it('suppresses auth-expired for unauthenticated endpoints', async () => {
    const { fetch } = stubFetch({
      'POST /api/auth/login': { status: 401, body: { detail: 'bad' } },
    });
    const client = new HttpApiClient({ baseUrl: '/api', fetch, getToken: () => null });
    const expired = vi.fn();
    client.onAuthExpired(expired);
    await expect(
      client.request('POST', '/auth/login', { body: {}, suppressAuthExpired: true }),
    ).rejects.toBeInstanceOf(ApiError);
    expect(expired).not.toHaveBeenCalled();
  });

  it('parses the error envelope detail into the ApiError message', async () => {
    const { fetch } = stubFetch({ 'GET /api/boom': { status: 500, body: { detail: 'explodiu' } } });
    const client = new HttpApiClient({ baseUrl: '/api', fetch, getToken: () => null });
    await expect(client.request('GET', '/boom')).rejects.toMatchObject({
      status: 500,
      message: 'explodiu',
    });
  });
});

describe('HttpAuthProvider', () => {
  const wireUser = {
    id: 'u1',
    email: 'facilitadora@shema.org',
    display_name: 'Marcia',
    avatar_url: null,
    is_active: true,
    is_platform_admin: false,
    locale: null,
  };
  const wireLogin = {
    user: wireUser,
    tokens: { access_token: 'a1', refresh_token: 'r1', token_type: 'bearer' },
  };
  const myRoles = [{ app_key: 'sound-necklace', role_key: 'facilitator' }];

  /** JWT mínimo (header.payload.assinatura) com `exp` em segundos — só o payload importa. */
  const jwtCom = (expSec: number): string =>
    `e30.${btoa(JSON.stringify({ exp: expSec }))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')}.sig`;

  it('login envia o identificador como e-mail, guarda o par de tokens e busca os papéis', async () => {
    const { fetch, calls } = stubFetch({
      'POST /api/auth/login': { body: wireLogin },
      'GET /api/auth/my-roles': { body: myRoles },
    });
    const auth = new HttpAuthProvider({ baseUrl: '/api', fetch });
    const user = await auth.login({ username: 'facilitadora@shema.org', password: 'x' });

    expect(calls[0]?.init.body).toBe(
      JSON.stringify({ email: 'facilitadora@shema.org', password: 'x' }),
    );
    expect(calls[1]?.url).toContain('/auth/my-roles?app_key=sound-necklace');
    // a chamada de papéis carregou o Bearer recém-emitido
    const rolesHeaders = calls[1]?.init.headers as Record<string, string>;
    expect(rolesHeaders['authorization']).toBe('Bearer a1');
    expect(user).toEqual({ id: 'u1', username: 'Marcia', roles: ['facilitator'] });
    expect(auth.token()).toBe('a1');
  });

  it('sem display_name o username cai para o e-mail; papel de outro vocabulário é filtrado', async () => {
    const { fetch } = stubFetch({
      'POST /api/auth/login': {
        body: { ...wireLogin, user: { ...wireUser, display_name: null } },
      },
      'GET /api/auth/my-roles': {
        body: [...myRoles, { app_key: 'sound-necklace', role_key: 'viewer' }],
      },
    });
    const auth = new HttpAuthProvider({ baseUrl: '/api', fetch });
    const user = await auth.login({ username: 'facilitadora@shema.org', password: 'x' });
    expect(user.username).toBe('facilitadora@shema.org');
    expect(user.roles).toEqual(['facilitator']);
  });

  it('conta válida SEM papel no app é recusada (AuthError) e não deixa sessão', async () => {
    const { fetch } = stubFetch({
      'POST /api/auth/login': { body: wireLogin },
      'GET /api/auth/my-roles': { body: [] },
    });
    const auth = new HttpAuthProvider({ baseUrl: '/api', fetch });
    await expect(
      auth.login({ username: 'facilitadora@shema.org', password: 'x' }),
    ).rejects.toBeInstanceOf(AuthError);
    expect(auth.token()).toBeNull();
    expect(auth.currentUser()).toBeNull();
  });

  it('maps a rejected login to AuthError without firing auth-expired', async () => {
    const { fetch } = stubFetch({
      'POST /api/auth/login': { status: 401, body: { detail: 'bad' } },
    });
    const auth = new HttpAuthProvider({ baseUrl: '/api', fetch });
    const expired = vi.fn();
    auth.onAuthExpired(expired);
    await expect(auth.login({ username: 'x', password: 'y' })).rejects.toBeInstanceOf(AuthError);
    expect(expired).not.toHaveBeenCalled();
  });

  it('login com 5xx sobe como ApiError — servidor fora não vira "credenciais inválidas"', async () => {
    const { fetch } = stubFetch({
      'POST /api/auth/login': { status: 503, body: { detail: 'manutenção' } },
    });
    const auth = new HttpAuthProvider({ baseUrl: '/api', fetch });
    await expect(auth.login({ username: 'x', password: 'y' })).rejects.toBeInstanceOf(ApiError);
  });

  it('falha ao buscar papéis limpa a sessão inteira — ninguém fica meio-logado', async () => {
    const { fetch } = stubFetch({
      'POST /api/auth/login': { body: wireLogin },
      'GET /api/auth/my-roles': { status: 500, body: { detail: 'boom' } },
    });
    const auth = new HttpAuthProvider({ baseUrl: '/api', fetch });
    await expect(
      auth.login({ username: 'facilitadora@shema.org', password: 'x' }),
    ).rejects.toBeInstanceOf(ApiError);
    // o token novo NÃO fica instalado com o usuário anterior (ou nenhum): memória zerada
    expect(auth.token()).toBeNull();
    expect(auth.currentUser()).toBeNull();
  });

  it('refresh usa o refresh do login e ROTACIONA o par a cada uso', async () => {
    const { fetch, calls } = stubFetch({
      'POST /api/auth/login': { body: wireLogin },
      'GET /api/auth/my-roles': { body: myRoles },
      'POST /api/auth/refresh': {
        body: { access_token: 'a2', refresh_token: 'r2', token_type: 'bearer' },
      },
    });
    const auth = new HttpAuthProvider({ baseUrl: '/api', fetch });
    await auth.login({ username: 'facilitadora@shema.org', password: 'x' });

    await auth.refresh();
    const first = calls.filter((c) => c.url.includes('/auth/refresh'))[0];
    expect(first?.init.body).toBe(JSON.stringify({ refresh_token: 'r1' }));
    expect(auth.token()).toBe('a2');

    await auth.refresh();
    const second = calls.filter((c) => c.url.includes('/auth/refresh'))[1];
    expect(second?.init.body).toBe(JSON.stringify({ refresh_token: 'r2' }));
  });

  it('refresh sem sessão lança AuthError', async () => {
    const { fetch } = stubFetch({});
    const auth = new HttpAuthProvider({ baseUrl: '/api', fetch });
    await expect(auth.refresh()).rejects.toBeInstanceOf(AuthError);
  });

  it('agenda o refresh 60s antes do exp do JWT e rotaciona sozinho', async () => {
    vi.useFakeTimers({ now: 1_000_000 });
    try {
      // exp em +300s → refresh dispara em +240s (margem de 60s)
      const { fetch, calls } = stubFetch({
        'POST /api/auth/login': {
          body: {
            ...wireLogin,
            tokens: { access_token: jwtCom(1300), refresh_token: 'r1', token_type: 'bearer' },
          },
        },
        'GET /api/auth/my-roles': { body: myRoles },
        'POST /api/auth/refresh': {
          body: { access_token: 'a2', refresh_token: 'r2', token_type: 'bearer' },
        },
      });
      const auth = new HttpAuthProvider({ baseUrl: '/api', fetch });
      await auth.login({ username: 'facilitadora@shema.org', password: 'x' });

      await vi.advanceTimersByTimeAsync(239_999);
      expect(calls.some((c) => c.url.includes('/auth/refresh'))).toBe(false);
      await vi.advanceTimersByTimeAsync(2);
      expect(calls.filter((c) => c.url.includes('/auth/refresh'))).toHaveLength(1);
      expect(auth.token()).toBe('a2');
      await auth.logout();
    } finally {
      vi.useRealTimers();
    }
  });

  it('refresh agendado que FALHA derruba a sessão e dispara auth-expired', async () => {
    vi.useFakeTimers({ now: 1_000_000 });
    try {
      const { fetch } = stubFetch({
        'POST /api/auth/login': {
          body: {
            ...wireLogin,
            tokens: { access_token: jwtCom(1120), refresh_token: 'r1', token_type: 'bearer' },
          },
        },
        'GET /api/auth/my-roles': { body: myRoles },
        'POST /api/auth/refresh': { status: 401, body: { detail: 'revogado' } },
      });
      const auth = new HttpAuthProvider({ baseUrl: '/api', fetch });
      const expired = vi.fn();
      auth.onAuthExpired(expired);
      await auth.login({ username: 'facilitadora@shema.org', password: 'x' });

      await vi.advanceTimersByTimeAsync(60_001);
      expect(expired).toHaveBeenCalledTimes(1);
      expect(auth.token()).toBeNull();
      expect(auth.currentUser()).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('logout cancela o refresh agendado', async () => {
    vi.useFakeTimers({ now: 1_000_000 });
    try {
      const { fetch, calls } = stubFetch({
        'POST /api/auth/login': {
          body: {
            ...wireLogin,
            tokens: { access_token: jwtCom(1300), refresh_token: 'r1', token_type: 'bearer' },
          },
        },
        'GET /api/auth/my-roles': { body: myRoles },
        'POST /api/auth/logout': { status: 204 },
      });
      const auth = new HttpAuthProvider({ baseUrl: '/api', fetch });
      await auth.login({ username: 'facilitadora@shema.org', password: 'x' });
      await auth.logout();

      await vi.advanceTimersByTimeAsync(400_000);
      expect(calls.some((c) => c.url.includes('/auth/refresh'))).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  const fakeStorage = () => {
    const m = new Map<string, string>();
    return {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      removeItem: (k: string) => void m.delete(k),
      dump: () => [...m.entries()],
    };
  };
  const KEY = 'colar-de-sons:auth:refresh:v1';

  it('login persiste o refresh token; logout o remove (decisão do dono, §12 emendado)', async () => {
    const storage = fakeStorage();
    const { fetch } = stubFetch({
      'POST /api/auth/login': { body: wireLogin },
      'GET /api/auth/my-roles': { body: myRoles },
      'POST /api/auth/logout': { status: 204 },
    });
    const auth = new HttpAuthProvider({ baseUrl: '/api', fetch, storage });
    await auth.login({ username: 'facilitadora@shema.org', password: 'x' });
    expect(storage.dump()).toEqual([[KEY, 'r1']]);
    await auth.logout();
    expect(storage.dump()).toEqual([]);
  });

  it('resume() troca o refresh guardado por sessão nova: rotação + /me + papéis', async () => {
    const storage = fakeStorage();
    storage.setItem(KEY, 'r-guardado');
    const { fetch, calls } = stubFetch({
      'POST /api/auth/refresh': {
        body: { access_token: 'a2', refresh_token: 'r2', token_type: 'bearer' },
      },
      'GET /api/auth/me': { body: wireUser },
      'GET /api/auth/my-roles': { body: myRoles },
    });
    const auth = new HttpAuthProvider({ baseUrl: '/api', fetch, storage });

    const user = await auth.resume();

    expect(calls[0]?.init.body).toBe(JSON.stringify({ refresh_token: 'r-guardado' }));
    expect(user).toEqual({ id: 'u1', username: 'Marcia', roles: ['facilitator'] });
    expect(auth.token()).toBe('a2');
    expect(storage.dump()).toEqual([[KEY, 'r2']]);
  });

  it('resume() sem nada guardado devolve null sem tocar a rede', async () => {
    const { fetch, calls } = stubFetch({});
    const auth = new HttpAuthProvider({ baseUrl: '/api', fetch, storage: fakeStorage() });
    expect(await auth.resume()).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it('resume() com storage que LANÇA devolve null — o contrato é "nunca lança"', async () => {
    const { fetch, calls } = stubFetch({});
    const blocked = {
      getItem: () => {
        throw new Error('storage bloqueado');
      },
      setItem: () => undefined,
      removeItem: () => undefined,
    };
    const auth = new HttpAuthProvider({ baseUrl: '/api', fetch, storage: blocked });
    expect(await auth.resume()).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it('resume() com refresh REVOGADO limpa o storage e devolve null', async () => {
    const storage = fakeStorage();
    storage.setItem(KEY, 'r-morto');
    const { fetch } = stubFetch({
      'POST /api/auth/refresh': { status: 401, body: { detail: 'revogado' } },
    });
    const auth = new HttpAuthProvider({ baseUrl: '/api', fetch, storage });
    expect(await auth.resume()).toBeNull();
    expect(auth.token()).toBeNull();
    expect(storage.dump()).toEqual([]);
  });

  it('resume() com falha de REDE preserva o refresh guardado (retomável no próximo boot)', async () => {
    const storage = fakeStorage();
    storage.setItem(KEY, 'r-valido');
    const fetchDown = (async () => {
      throw new TypeError('rede fora');
    }) as unknown as typeof globalThis.fetch;
    const auth = new HttpAuthProvider({ baseUrl: '/api', fetch: fetchDown, storage });
    expect(await auth.resume()).toBeNull();
    expect(storage.dump()).toEqual([[KEY, 'r-valido']]);
  });

  it('logout revoga o refresh token e limpa a sessão mesmo se a API falhar', async () => {
    const { fetch, calls } = stubFetch({
      'POST /api/auth/login': { body: wireLogin },
      'GET /api/auth/my-roles': { body: myRoles },
      'POST /api/auth/logout': { status: 500, body: { detail: 'indisponível' } },
    });
    const auth = new HttpAuthProvider({ baseUrl: '/api', fetch });
    await auth.login({ username: 'facilitadora@shema.org', password: 'x' });
    await auth.logout();

    const revoke = calls.find((c) => c.url.includes('/auth/logout'));
    expect(revoke?.init.body).toBe(JSON.stringify({ refresh_token: 'r1' }));
    expect(auth.token()).toBeNull();
    expect(auth.currentUser()).toBeNull();
  });
});
