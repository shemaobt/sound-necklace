/**
 * Esqueleto HTTP real do acesso ao tripod-api (PRD §5, code-first). `HttpApiClient` é
 * o wrapper `fetch` INJETADO (sem rede no CI): injeta o Bearer, dispara auth-expired
 * UMA vez por token expirado num 401 e traduz o envelope de erro JSON em `ApiError`.
 * `HttpAuthProvider` mapeia login/refresh/logout/`/me` para os endpoints (§7.1) e
 * expõe o token que os outros adapters injetam. Endpoints PROVISÓRIOS até o OpenAPI
 * do tripod-api (ENG-211/ENG-247).
 */

import { MeResponseSchema, TokenResponseSchema } from '../../contracts';
import { Emitter } from './emitter';
import {
  ApiError,
  AuthError,
  type ApiClient,
  type ApiRequestOptions,
  type AuthProvider,
  type AuthUser,
  type Credentials,
  type Unsubscribe,
} from './types';

export interface HttpApiClientOptions {
  baseUrl: string;
  fetch: typeof globalThis.fetch;
  /** Token Bearer atual (do AuthProvider). */
  getToken: () => string | null;
}

export class HttpApiClient implements ApiClient {
  readonly #baseUrl: string;
  readonly #fetch: typeof globalThis.fetch;
  readonly #getToken: () => string | null;
  readonly #expired = new Emitter();
  /** Token já reportado como expirado — garante o "dispara UMA vez" até re-autenticar. */
  #lastExpiredToken: string | null = null;
  #everExpired = false;

  constructor(opts: HttpApiClientOptions) {
    this.#baseUrl = opts.baseUrl.replace(/\/$/, '');
    this.#fetch = opts.fetch;
    this.#getToken = opts.getToken;
  }

  onAuthExpired(cb: () => void): Unsubscribe {
    return this.#expired.subscribe(cb);
  }

  async request<T>(method: string, path: string, opts?: ApiRequestOptions<T>): Promise<T> {
    const hasBody = opts?.body !== undefined;
    const headers: Record<string, string> = { ...opts?.headers };
    const token = this.#getToken();
    if (token) headers['authorization'] = `Bearer ${token}`;
    if (hasBody) headers['content-type'] = 'application/json';

    const res = await this.#fetch(`${this.#baseUrl}${path}`, {
      method,
      headers,
      body: hasBody ? JSON.stringify(opts?.body) : undefined,
    });

    if (!res.ok) {
      const body = await this.#parseBody(res);
      if (res.status === 401 && !opts?.suppressAuthExpired) this.#reportExpired(token);
      throw new ApiError(res.status, messageOf(body, res.statusText), body);
    }

    const body = await this.#parseBody(res);
    return opts?.schema ? opts.schema.parse(body) : (body as T);
  }

  /** Dispara auth-expired só na primeira vez para um mesmo token (re-login zera o guard). */
  #reportExpired(token: string | null): void {
    if (this.#everExpired && token === this.#lastExpiredToken) return;
    this.#everExpired = true;
    this.#lastExpiredToken = token;
    this.#expired.emit();
  }

  async #parseBody(res: Response): Promise<unknown> {
    const text = await res.text();
    if (!text) return undefined;
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return text; // envelope não-JSON: devolve o texto cru
    }
  }
}

/** Extrai a mensagem legível do envelope de erro (FastAPI usa `{ detail }`). */
function messageOf(body: unknown, fallback: string): string {
  if (body && typeof body === 'object' && 'detail' in body) {
    const detail = (body as { detail: unknown }).detail;
    if (typeof detail === 'string') return detail;
  }
  return fallback || 'erro de API';
}

export interface HttpAuthProviderOptions {
  baseUrl: string;
  fetch: typeof globalThis.fetch;
  /** Refresh token capturado no login (forma real PROVISÓRIA, §12). */
  refreshToken?: string;
}

export class HttpAuthProvider implements AuthProvider {
  readonly #client: HttpApiClient;
  readonly #refreshToken?: string;
  #token: string | null = null;
  #user: AuthUser | null = null;

  constructor(opts: HttpAuthProviderOptions) {
    this.#refreshToken = opts.refreshToken;
    this.#client = new HttpApiClient({
      baseUrl: opts.baseUrl,
      fetch: opts.fetch,
      getToken: () => this.#token,
    });
  }

  async login(creds: Credentials): Promise<AuthUser> {
    let token: string;
    try {
      // login é endpoint não autenticado: um 401 aqui é credencial inválida, não expiração
      const res = await this.#client.request('POST', '/auth/login', {
        body: creds,
        schema: TokenResponseSchema,
        suppressAuthExpired: true,
      });
      token = res.access_token;
    } catch (err) {
      if (err instanceof ApiError) throw new AuthError('credenciais inválidas');
      throw err;
    }
    this.#token = token;
    this.#user = await this.#client.request('GET', '/auth/me', { schema: MeResponseSchema });
    return this.#user;
  }

  async refresh(): Promise<void> {
    if (!this.#refreshToken) throw new AuthError('sem refresh token');
    const res = await this.#client.request('POST', '/auth/refresh', {
      body: { refresh_token: this.#refreshToken },
      schema: TokenResponseSchema,
      suppressAuthExpired: true,
    });
    this.#token = res.access_token;
  }

  logout(): Promise<void> {
    this.#token = null;
    this.#user = null;
    return Promise.resolve();
  }

  currentUser(): AuthUser | null {
    return this.#user;
  }

  token(): string | null {
    return this.#token;
  }

  onAuthExpired(cb: () => void): Unsubscribe {
    return this.#client.onAuthExpired(cb);
  }
}
