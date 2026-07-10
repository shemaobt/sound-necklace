import { describe, expect, it, vi } from 'vitest';

import { ApiError, AuthError } from './types';
import { DEFAULT_FIXTURE_USERS, FixtureApiClient, FixtureAuthProvider } from './fixture';

describe('FixtureAuthProvider', () => {
  it('logs in a facilitator and surfaces the role', async () => {
    const auth = new FixtureAuthProvider();
    const user = await auth.login({ username: 'facilitadora', password: 'x' });
    expect(user.roles).toEqual(['facilitator']);
    expect(auth.currentUser()).toEqual(user);
    expect(auth.token()).not.toBeNull();
  });

  it('logs in a project_admin and surfaces the role', async () => {
    const auth = new FixtureAuthProvider();
    const user = await auth.login({ username: 'admin', password: 'x' });
    expect(user.roles).toEqual(['project_admin']);
  });

  it('rejects an unknown user with a typed AuthError and stays logged out', async () => {
    const auth = new FixtureAuthProvider();
    await expect(auth.login({ username: 'ninguem', password: 'x' })).rejects.toBeInstanceOf(
      AuthError,
    );
    expect(auth.currentUser()).toBeNull();
    expect(auth.token()).toBeNull();
  });

  it('rejects an empty password with a typed AuthError', async () => {
    const auth = new FixtureAuthProvider();
    await expect(auth.login({ username: 'facilitadora', password: '' })).rejects.toBeInstanceOf(
      AuthError,
    );
  });

  it('refresh mints a new token without changing the user', async () => {
    const auth = new FixtureAuthProvider();
    const user = await auth.login({ username: 'facilitadora', password: 'x' });
    const first = auth.token();
    await auth.refresh();
    expect(auth.token()).not.toBe(first);
    expect(auth.currentUser()).toEqual(user);
  });

  it('refresh without a session throws AuthError', async () => {
    const auth = new FixtureAuthProvider();
    await expect(auth.refresh()).rejects.toBeInstanceOf(AuthError);
  });

  it('logout clears the token and user', async () => {
    const auth = new FixtureAuthProvider();
    await auth.login({ username: 'facilitadora', password: 'x' });
    await auth.logout();
    expect(auth.currentUser()).toBeNull();
    expect(auth.token()).toBeNull();
  });

  it('in-memory app state survives an expiry → re-login cycle (adapter never clears it)', async () => {
    const auth = new FixtureAuthProvider();
    const appState = { work: [1, 2, 3] }; // owned by the caller
    await auth.login({ username: 'facilitadora', password: 'x' });
    const first = auth.token();

    const expired = vi.fn();
    auth.onAuthExpired(expired);
    auth.simulateExpiry();

    expect(auth.token()).toBeNull();
    expect(expired).toHaveBeenCalledTimes(1);
    expect(appState).toEqual({ work: [1, 2, 3] });

    await auth.login({ username: 'facilitadora', password: 'x' });
    expect(auth.token()).not.toBeNull();
    expect(auth.token()).not.toBe(first);
    expect(appState).toEqual({ work: [1, 2, 3] });
  });

  it('unsubscribing stops auth-expired notifications', async () => {
    const auth = new FixtureAuthProvider();
    await auth.login({ username: 'facilitadora', password: 'x' });
    const cb = vi.fn();
    const off = auth.onAuthExpired(cb);
    off();
    auth.simulateExpiry();
    expect(cb).not.toHaveBeenCalled();
  });

  it('ships exactly one facilitator and one project_admin by default', () => {
    const roles = DEFAULT_FIXTURE_USERS.flatMap((u) => u.roles).sort();
    expect(roles).toEqual(['facilitator', 'project_admin']);
  });
});

describe('FixtureApiClient', () => {
  it('emits auth-expired exactly once across repeated 401s while expired', async () => {
    const client = new FixtureApiClient();
    const expired = vi.fn();
    client.onAuthExpired(expired);
    client.setExpired(true);

    await expect(client.request('GET', '/anything')).rejects.toBeInstanceOf(ApiError);
    await expect(client.request('GET', '/anything')).rejects.toBeInstanceOf(ApiError);
    expect(expired).toHaveBeenCalledTimes(1);
  });

  it('resolves a routed response and validates it with the given schema', async () => {
    const schema = { parse: (d: unknown) => d as { ok: boolean } };
    const client = new FixtureApiClient({
      routes: () => ({ status: 200, body: { ok: true } }),
    });
    await expect(client.request('GET', '/ping', { schema })).resolves.toEqual({ ok: true });
  });

  it('throws ApiError with the status for a non-2xx route', async () => {
    const client = new FixtureApiClient({
      routes: () => ({ status: 404, body: { detail: 'não encontrado' } }),
    });
    await expect(client.request('GET', '/missing')).rejects.toMatchObject({ status: 404 });
  });
});
