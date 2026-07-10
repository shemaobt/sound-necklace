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
  it('login posts credentials, fetches /me, and stores token + user', async () => {
    const { fetch, calls } = stubFetch({
      'POST /api/auth/login': { body: { access_token: 'a1', token_type: 'bearer' } },
      'GET /api/auth/me': { body: { id: 'u1', username: 'facilitadora', roles: ['facilitator'] } },
    });
    const auth = new HttpAuthProvider({ baseUrl: '/api', fetch });
    const user = await auth.login({ username: 'facilitadora', password: 'x' });

    expect(calls[0]?.init.body).toBe(JSON.stringify({ username: 'facilitadora', password: 'x' }));
    expect(user.roles).toEqual(['facilitator']);
    expect(auth.token()).toBe('a1');
    // the /me call carried the freshly minted Bearer token
    const meHeaders = calls[1]?.init.headers as Record<string, string>;
    expect(meHeaders['authorization']).toBe('Bearer a1');
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

  it('refresh posts the refresh token and updates the access token', async () => {
    const { fetch, calls } = stubFetch({
      'POST /api/auth/refresh': { body: { access_token: 'a2', token_type: 'bearer' } },
    });
    const auth = new HttpAuthProvider({ baseUrl: '/api', fetch, refreshToken: 'r1' });
    await auth.refresh();
    expect(calls[0]?.init.body).toBe(JSON.stringify({ refresh_token: 'r1' }));
    expect(auth.token()).toBe('a2');
  });

  it('logout clears token and user', async () => {
    const { fetch } = stubFetch({
      'POST /api/auth/login': { body: { access_token: 'a1', token_type: 'bearer' } },
      'GET /api/auth/me': { body: { id: 'u1', username: 'facilitadora', roles: ['facilitator'] } },
    });
    const auth = new HttpAuthProvider({ baseUrl: '/api', fetch });
    await auth.login({ username: 'facilitadora', password: 'x' });
    await auth.logout();
    expect(auth.token()).toBeNull();
    expect(auth.currentUser()).toBeNull();
  });
});
