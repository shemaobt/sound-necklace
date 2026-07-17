/**
 * Esqueleto HTTP real do acesso ao tripod-api (PRD §5, code-first). `HttpApiClient` é
 * o wrapper `fetch` INJETADO (sem rede no CI): injeta o Bearer, dispara auth-expired
 * UMA vez por token expirado num 401 e traduz o envelope de erro JSON em `ApiError`.
 * `HttpAuthProvider` mapeia login/refresh/logout/`/me` para os endpoints (§7.1) e
 * expõe o token que os outros adapters injetam. Endpoints PROVISÓRIOS até o OpenAPI
 * do tripod-api (ENG-211/ENG-247).
 */

import {
  AuthResponseSchema,
  MyRolesResponseSchema,
  RoleSchema,
  TokenResponseSchema,
  type AuthResponse,
} from '../../contracts';
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

/** app_key do Colar no tripod-api (decisão ENG-259). */
const APP_KEY = 'sound-necklace';

export interface HttpAuthProviderOptions {
  baseUrl: string;
  fetch: typeof globalThis.fetch;
}

export class HttpAuthProvider implements AuthProvider {
  readonly #client: HttpApiClient;
  #refreshToken: string | null = null;
  #token: string | null = null;
  #user: AuthUser | null = null;

  constructor(opts: HttpAuthProviderOptions) {
    this.#client = new HttpApiClient({
      baseUrl: opts.baseUrl,
      fetch: opts.fetch,
      getToken: () => this.#token,
    });
  }

  async login(creds: Credentials): Promise<AuthUser> {
    let res: AuthResponse;
    try {
      // login é endpoint não autenticado: um 401 aqui é credencial inválida, não
      // expiração. A casa autentica por e-mail — o identificador viaja como `email`.
      res = await this.#client.request('POST', '/auth/login', {
        body: { email: creds.username, password: creds.password },
        schema: AuthResponseSchema,
        suppressAuthExpired: true,
      });
    } catch (err) {
      if (err instanceof ApiError) throw new AuthError('credenciais inválidas');
      throw err;
    }
    this.#token = res.tokens.access_token;
    this.#refreshToken = res.tokens.refresh_token;

    // os papéis do app não vêm no /me da plataforma — vêm de my-roles, já filtrados
    // pelo app_key; um role_key fora do vocabulário do Colar é ignorado
    const myRoles = await this.#client.request('GET', `/auth/my-roles?app_key=${APP_KEY}`, {
      schema: MyRolesResponseSchema,
    });
    const roles = myRoles.flatMap((r) => {
      const parsed = RoleSchema.safeParse(r.role_key);
      return parsed.success ? [parsed.data] : [];
    });
    if (roles.length === 0) {
      // conta válida na plataforma, mas sem papel no Colar: não há sessão a manter
      this.#token = null;
      this.#refreshToken = null;
      throw new AuthError('sem acesso ao Colar de Sons');
    }

    this.#user = {
      id: res.user.id,
      username: res.user.display_name ?? res.user.email,
      roles,
    };
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
    this.#refreshToken = res.refresh_token; // rotação: o refresh antigo morre no uso
  }

  async logout(): Promise<void> {
    const refreshToken = this.#refreshToken;
    this.#token = null;
    this.#refreshToken = null;
    this.#user = null;
    if (!refreshToken) return;
    // revogação best-effort: a sessão local já morreu; falha de rede não a ressuscita
    await this.#client
      .request('POST', '/auth/logout', {
        body: { refresh_token: refreshToken },
        suppressAuthExpired: true,
      })
      .catch(() => undefined);
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
