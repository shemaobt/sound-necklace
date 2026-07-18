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
  UserResponseSchema,
  type AuthResponse,
  type Role,
  type UserResponse,
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

/** `exp` do payload de um JWT, em ms — ou null se o token não for decodável. */
function jwtExpMs(token: string | null): number | null {
  if (!token) return null;
  const payload = token.split('.')[1];
  if (!payload) return null;
  try {
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as {
      exp?: unknown;
    };
    return typeof json.exp === 'number' ? json.exp * 1000 : null;
  } catch {
    return null;
  }
}

/** Antecedência do refresh automático sobre o exp do access token. */
const REFRESH_MARGIN_MS = 60_000;

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

/** Onde o refresh token rotativo persiste (§12 emendado — decisão do dono). */
const REFRESH_STORAGE_KEY = 'colar-de-sons:auth:refresh:v1';

export interface HttpAuthProviderOptions {
  baseUrl: string;
  fetch: typeof globalThis.fetch;
  /** Persistência do refresh token (localStorage no app real); ausente = só memória. */
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
}

export class HttpAuthProvider implements AuthProvider {
  readonly #client: HttpApiClient;
  /** Expiração detectada pelo PROVIDER (refresh agendado que falhou) — soma-se aos 401 do client. */
  readonly #expired = new Emitter();
  readonly #storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  #refreshTimer: ReturnType<typeof setTimeout> | null = null;
  #refreshToken: string | null = null;
  #token: string | null = null;
  #user: AuthUser | null = null;

  constructor(opts: HttpAuthProviderOptions) {
    this.#storage = opts.storage;
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
      // só a recusa de credencial vira a cópia de login; 429/5xx sobem como
      // ApiError — "senha errada" e "servidor fora" pedem reações diferentes.
      if (err instanceof ApiError && err.status < 500 && err.status !== 429)
        throw new AuthError('credenciais inválidas');
      throw err;
    }
    this.#token = res.tokens.access_token;
    this.#refreshToken = res.tokens.refresh_token;

    // Daqui até o fim, o login é transacional: qualquer falha limpa a memória
    // inteira (token novo + usuário anterior) — ninguém fica meio-logado com o
    // token de um e o usuário de outro. O refresh persistido anterior sobrevive:
    // um re-login falhado não destrói a sessão retomável do boot.
    let roles: Role[];
    try {
      roles = await this.#fetchRoles();
    } catch (err) {
      this.#resetSession();
      throw err;
    }
    if (roles.length === 0) {
      // conta válida na plataforma, mas sem papel no Colar: não há sessão a manter
      this.#resetSession();
      throw new AuthError('sem acesso ao Colar de Sons');
    }

    this.#persistRefresh(res.tokens.refresh_token);
    this.#user = this.#userFrom(res.user, roles);
    this.#scheduleRefresh();
    return this.#user;
  }

  /** Zera a sessão em memória (token/refresh/usuário/timer). Não toca o storage. */
  #resetSession(): void {
    this.#clearRefreshTimer();
    this.#token = null;
    this.#refreshToken = null;
    this.#user = null;
  }

  /**
   * Retoma a sessão persistida (§12 emendado): troca o refresh guardado por um par
   * novo (rotação), rebusca usuário + papéis e re-arma o refresh automático. Um
   * refresh recusado pela API limpa a persistência (sessão morta); uma falha de
   * REDE a preserva — o próximo boot tenta de novo.
   */
  async resume(): Promise<AuthUser | null> {
    let stored: string | null;
    try {
      stored = this.#storage?.getItem(REFRESH_STORAGE_KEY) ?? null;
    } catch {
      return null; // storage bloqueado (modo privado/política): sem retomada, sem lançar
    }
    if (!stored) return null;
    try {
      const tokens = await this.#client.request('POST', '/auth/refresh', {
        body: { refresh_token: stored },
        schema: TokenResponseSchema,
        suppressAuthExpired: true,
      });
      this.#token = tokens.access_token;
      this.#refreshToken = tokens.refresh_token;
      this.#persistRefresh(tokens.refresh_token);

      const user = await this.#client.request('GET', '/auth/me', {
        schema: UserResponseSchema,
        suppressAuthExpired: true,
      });
      const roles = await this.#fetchRoles();
      if (roles.length === 0) throw new AuthError('sem acesso ao Colar de Sons');

      this.#user = this.#userFrom(user, roles);
      this.#scheduleRefresh();
      return this.#user;
    } catch (err) {
      // recusa da API (refresh revogado/sem papel) = sessão morta → esquece;
      // falha de rede = transitória → o refresh guardado fica para o próximo boot
      if (err instanceof ApiError || err instanceof AuthError) this.#persistRefresh(null);
      this.#clearRefreshTimer();
      this.#token = null;
      this.#refreshToken = null;
      this.#user = null;
      return null;
    }
  }

  /** Papéis do app via my-roles (o /me da plataforma não os traz); role_key estranho é ignorado. */
  async #fetchRoles(): Promise<Role[]> {
    const myRoles = await this.#client.request('GET', `/auth/my-roles?app_key=${APP_KEY}`, {
      schema: MyRolesResponseSchema,
    });
    return myRoles.flatMap((r) => {
      const parsed = RoleSchema.safeParse(r.role_key);
      return parsed.success ? [parsed.data] : [];
    });
  }

  #userFrom(user: UserResponse, roles: Role[]): AuthUser {
    return { id: user.id, username: user.display_name ?? user.email, roles };
  }

  /** Grava/remove o refresh persistido; storage indisponível não derruba o login. */
  #persistRefresh(value: string | null): void {
    try {
      if (value === null) this.#storage?.removeItem(REFRESH_STORAGE_KEY);
      else this.#storage?.setItem(REFRESH_STORAGE_KEY, value);
    } catch {
      // quota/modo privado: sessão vive só em memória, como antes da emenda
    }
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
    this.#persistRefresh(res.refresh_token);
    this.#scheduleRefresh();
  }

  /**
   * O access token da casa dura 30 min — menos que uma sessão de facilitação. O
   * refresh roda sozinho com 60s de antecedência sobre o `exp` do JWT; se falhar
   * (refresh revogado/expirado), a sessão está morta: limpa e dispara auth-expired,
   * e o app volta ao login em vez de degradar em silêncio.
   */
  #scheduleRefresh(): void {
    this.#clearRefreshTimer();
    const expMs = jwtExpMs(this.#token);
    if (expMs === null) return;
    const delay = Math.max(0, expMs - Date.now() - REFRESH_MARGIN_MS);
    this.#refreshTimer = setTimeout(() => {
      void this.refresh().catch(() => {
        this.#clearRefreshTimer();
        this.#persistRefresh(null);
        this.#token = null;
        this.#refreshToken = null;
        this.#user = null;
        this.#expired.emit();
      });
    }, delay);
  }

  #clearRefreshTimer(): void {
    if (this.#refreshTimer !== null) {
      clearTimeout(this.#refreshTimer);
      this.#refreshTimer = null;
    }
  }

  async logout(): Promise<void> {
    this.#clearRefreshTimer();
    this.#persistRefresh(null);
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
    const offClient = this.#client.onAuthExpired(cb);
    const offOwn = this.#expired.subscribe(cb);
    return () => {
      offClient();
      offOwn();
    };
  }
}
