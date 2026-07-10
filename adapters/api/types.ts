/**
 * Portas de acesso ao tripod-api (PRD v2 §7.1/§5/§12): `AuthProvider` (o esquema JWT
 * Bearer EXISTENTE da API — python-jose; o SPA não introduz esquema próprio) e
 * `ApiClient` (wrapper `fetch` tipado: baseUrl, injeção de Bearer, 401 → dispara
 * auth-expired UMA vez e falha a chamada de forma previsível, parsing do envelope de
 * erro JSON). Implementações: fixture headless (default) e o esqueleto HTTP real que
 * compila contra os DTOs PROVISÓRIOS de contracts/api.ts.
 *
 * §12 (higiene de sessão): tokens vivem SÓ em memória (+ refresh) — nunca em
 * localStorage. A expiração devolve à tela de login SEM limpar o estado do app: o
 * estado em memória é do CHAMADOR; estes adapters nunca o tocam.
 */

import type { LoginRequest, MeResponse, Role } from '../../contracts';

export type Unsubscribe = () => void;

/** Credenciais de login (§7.1) — reusa o DTO do contrato. */
export type Credentials = LoginRequest;

/** Usuário autenticado com papéis (§7.1/O2) — reusa o DTO `/me` do contrato. */
export type AuthUser = MeResponse;

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
