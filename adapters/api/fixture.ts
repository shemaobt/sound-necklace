/**
 * Modo fixture do acesso ao tripod-api (default) — roda headless, sem rede. Autentica
 * contra usuários em memória (uma facilitadora + um project-admin), com tokens
 * DETERMINÍSTICOS e um switch de expiração para exercer o gate de re-login (§7.1). A
 * expiração NÃO limpa o estado do app: o estado em memória é do chamador; este adapter
 * nunca o toca (§7.1/§12).
 */

import { Emitter } from './emitter';
import {
  ApiError,
  AuthError,
  type ApiClient,
  type ApiRequestOptions,
  type AuthProvider,
  type AuthUser,
  type Credentials,
  type Role,
  type Unsubscribe,
} from './types';

export interface FixtureUser {
  id: string;
  username: string;
  roles: Role[];
}

/**
 * Um facilitador e um project-admin (§7.1/O2). O modo fixture NÃO guarda senha: um
 * login vale por username conhecido + senha não-vazia (a validação real de credencial
 * é do servidor). Assim não há literal de credencial no repo.
 */
export const DEFAULT_FIXTURE_USERS: FixtureUser[] = [
  { id: 'u-facilitadora', username: 'facilitadora', roles: ['facilitator'] },
  { id: 'u-admin', username: 'admin', roles: ['project_admin'] },
];

export interface FixtureAuthProviderOptions {
  users?: FixtureUser[];
}

export class FixtureAuthProvider implements AuthProvider {
  readonly #users: FixtureUser[];
  readonly #expired = new Emitter();
  #user: AuthUser | null = null;
  #token: string | null = null;
  /** Contador que torna cada token (login/refresh) distinto do anterior. */
  #nonce = 0;

  constructor(opts: FixtureAuthProviderOptions = {}) {
    this.#users = opts.users ?? DEFAULT_FIXTURE_USERS;
  }

  login(creds: Credentials): Promise<AuthUser> {
    const match = this.#users.find((u) => u.username === creds.username);
    if (!match || creds.password.length === 0) {
      return Promise.reject(new AuthError('credenciais inválidas'));
    }
    this.#user = { id: match.id, username: match.username, roles: [...match.roles] };
    this.#token = this.#mintToken(match.username);
    return Promise.resolve(this.#user);
  }

  refresh(): Promise<void> {
    if (!this.#user) return Promise.reject(new AuthError('sem sessão para renovar'));
    this.#token = this.#mintToken(this.#user.username);
    return Promise.resolve();
  }

  logout(): Promise<void> {
    this.#user = null;
    this.#token = null;
    return Promise.resolve();
  }

  currentUser(): AuthUser | null {
    return this.#user;
  }

  token(): string | null {
    return this.#token;
  }

  onAuthExpired(cb: () => void): Unsubscribe {
    return this.#expired.subscribe(cb);
  }

  /**
   * Simula a expiração do lado do servidor (§7.1): invalida o token e avisa o
   * chamador (que volta ao login). Não mexe no `currentUser` nem no estado do app.
   */
  simulateExpiry(): void {
    if (!this.#token) return;
    this.#token = null;
    this.#expired.emit();
  }

  #mintToken(username: string): string {
    this.#nonce += 1;
    return `sessao-${username}-${this.#nonce}`;
  }
}

/** Resposta roteada pela fixture do ApiClient. */
export interface FixtureRoute {
  status: number;
  body?: unknown;
}

export interface FixtureApiClientOptions {
  /** Resolve cada chamada; default = 200 `{ ok: true }`. */
  routes?: (method: string, path: string, body: unknown) => FixtureRoute;
}

const DEFAULT_ROUTE: FixtureRoute = { status: 200, body: { ok: true } };

export class FixtureApiClient implements ApiClient {
  readonly #routes: (method: string, path: string, body: unknown) => FixtureRoute;
  readonly #expiredEmitter = new Emitter();
  #isExpired = false;
  #reportedExpired = false;

  constructor(opts: FixtureApiClientOptions = {}) {
    this.#routes = opts.routes ?? (() => DEFAULT_ROUTE);
  }

  /** Liga/desliga a simulação de expiração (o próximo request devolve 401). */
  setExpired(expired: boolean): void {
    this.#isExpired = expired;
    if (!expired) this.#reportedExpired = false;
  }

  onAuthExpired(cb: () => void): Unsubscribe {
    return this.#expiredEmitter.subscribe(cb);
  }

  request<T>(method: string, path: string, opts?: ApiRequestOptions<T>): Promise<T> {
    if (this.#isExpired) {
      if (!this.#reportedExpired && !opts?.suppressAuthExpired) {
        this.#reportedExpired = true;
        this.#expiredEmitter.emit();
      }
      return Promise.reject(new ApiError(401, 'sessão expirada', { detail: 'sessão expirada' }));
    }
    const route = this.#routes(method, path, opts?.body);
    if (route.status >= 400) {
      return Promise.reject(new ApiError(route.status, `erro fixture ${route.status}`, route.body));
    }
    return Promise.resolve(opts?.schema ? opts.schema.parse(route.body) : (route.body as T));
  }
}
