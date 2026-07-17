/**
 * Portas de acesso ao tripod-api (PRD v2 §7.1/§5/§12): `AuthProvider` (o esquema JWT
 * Bearer EXISTENTE da API — o SPA não introduz esquema próprio) e `ApiClient`
 * (wrapper `fetch` tipado: baseUrl, injeção de Bearer, 401 → dispara auth-expired
 * UMA vez e falha a chamada de forma previsível, parsing do envelope de erro JSON).
 * Implementações: fixture headless (default) e o cliente HTTP real dos endpoints
 * `/api/auth/*` do OpenAPI (contracts/generated/tripod.d.ts).
 *
 * §12 (higiene de sessão, EMENDADO em 2026-07-17 por decisão do dono): o ACCESS
 * token vive só em memória; o REFRESH token — rotativo, morre a cada uso — persiste
 * em localStorage para a sessão sobreviver a reload/reabertura (`resume()`). A
 * expiração devolve à tela de login SEM limpar o estado do app: o estado em memória
 * é do CHAMADOR; estes adapters nunca o tocam.
 */

import type { Role } from '../../contracts';

export type Unsubscribe = () => void;

/**
 * Credenciais de login (§7.1): identificador + senha. No modo real o identificador
 * é o E-MAIL da conta tripod (o wire é `UserLoginRequest{email}`); a fixture aceita
 * os usernames de teste. A porta não distingue — o adapter mapeia.
 */
export interface Credentials {
  username: string;
  password: string;
}

/**
 * Usuário autenticado com papéis (§7.1/O2) — forma da PORTA, não do wire: o adapter
 * real a monta de `/auth/login` (display_name ?? email) + `/auth/my-roles`.
 */
export interface AuthUser {
  id: string;
  username: string;
  roles: Role[];
}

export type { Role };

/** Falha de autenticação (credenciais inválidas / sem sessão) — a UI mostra a cópia. */
export class AuthError extends Error {
  override readonly name = 'AuthError';
}

/** Resposta não-2xx do tripod-api. `body` é o envelope de erro JSON, quando houver. */
export class ApiError extends Error {
  override readonly name = 'ApiError';

  constructor(
    readonly status: number,
    message: string,
    readonly body?: unknown,
  ) {
    super(message);
  }
}

/** Valida a resposta desserializada (ex.: um schema zod). */
export interface ResponseValidator<T> {
  parse(data: unknown): T;
}

export interface ApiRequestOptions<T> {
  /** Corpo JSON-able; ausente = sem corpo. */
  body?: unknown;
  /** Valida/tipa a resposta; ausente = devolve o JSON cru como `T`. */
  schema?: ResponseValidator<T>;
  /** Cabeçalhos extra. */
  headers?: Record<string, string>;
  /** Endpoint não autenticado (login/refresh): um 401 NÃO é expiração de sessão. */
  suppressAuthExpired?: boolean;
}

export interface ApiClient {
  /** Chamada tipada; injeta o Bearer, trata 401 e o envelope de erro. */
  request<T>(method: string, path: string, opts?: ApiRequestOptions<T>): Promise<T>;
  /** Observa a expiração de sessão (401). Dispara UMA vez por token expirado. */
  onAuthExpired(cb: () => void): Unsubscribe;
}

export interface AuthProvider {
  /** Autentica; devolve o usuário com papéis. Lança `AuthError` se recusado. */
  login(creds: Credentials): Promise<AuthUser>;
  /**
   * Retoma a sessão persistida (refresh rotativo, §12 emendado): o usuário
   * restaurado, ou `null` quando não há o que retomar. Nunca lança.
   */
  resume(): Promise<AuthUser | null>;
  /** Encerra a sessão local (limpa token + usuário). */
  logout(): Promise<void>;
  /** Usuário atual, ou `null` se deslogado. */
  currentUser(): AuthUser | null;
  /** Token Bearer atual, ou `null`. É o que os outros adapters injetam. */
  token(): string | null;
  /** Renova o token de acesso (§12). Lança `AuthError` sem sessão. */
  refresh(): Promise<void>;
  /** Observa a expiração de sessão (volta ao login SEM limpar o estado do app). */
  onAuthExpired(cb: () => void): Unsubscribe;
}
