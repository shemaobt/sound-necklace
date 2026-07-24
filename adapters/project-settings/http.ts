/**
 * ProjectSettingsStore real sobre o tripod-api (ENG-361). Duas rotas em
 * `/sound-necklace/projects/{id}/settings`: GET para qualquer papel com acesso ao
 * projeto, PUT só para `project_admin`.
 *
 * `fetch` INJETADO (sem rede no CI), como em todo adapter deste diretório. O 409 do
 * PUT vira `GranularityLockedError` — a tela reage ao veredito, não ao número.
 */

import {
  ProjectSettingsSchema,
  type GranularityLevel,
  type ProjectSettings,
} from '../../contracts';
import { GranularityLockedError, type ProjectSettingsStore } from './types';

/** O `code` que separa "já cortado" de qualquer outro 409 (contrato da ENG-361). */
const LOCKED_CODE = 'PROJECT_GRANULARITY_LOCKED';

export interface HttpProjectSettingsOptions {
  /** Base compartilhada terminada em `/api`; as rotas daqui somam `/sound-necklace`. */
  baseUrl: string;
  fetch: typeof globalThis.fetch;
  /** Token Bearer atual (do AuthProvider/ENG-239). */
  token?: () => string | null;
}

export class HttpProjectSettings implements ProjectSettingsStore {
  readonly #baseUrl: string;
  readonly #fetch: typeof globalThis.fetch;
  readonly #token?: () => string | null;

  constructor(opts: HttpProjectSettingsOptions) {
    this.#baseUrl = opts.baseUrl.replace(/\/$/, '');
    this.#fetch = opts.fetch;
    this.#token = opts.token;
  }

  async get(projectId: string): Promise<ProjectSettings> {
    const res = await this.#send(projectId, 'GET');
    if (!res.ok) throw new Error(`HTTP ${res.status} ao ler a granularidade do projeto`);
    return ProjectSettingsSchema.parse(await res.json());
  }

  async setLevel(projectId: string, level: GranularityLevel): Promise<ProjectSettings> {
    const res = await this.#send(projectId, 'PUT', { granularity_level: level });
    if (res.status === 409) {
      // Só o `code` distingue: um 409 sem ele não é esta recusa, e tratar todos como
      // "congelado" esconderia um conflito real atrás de uma explicação errada.
      const body: unknown = await res.json().catch(() => null);
      const code =
        body && typeof body === 'object' && 'code' in body
          ? (body as { code: unknown }).code
          : null;
      if (code === LOCKED_CODE) throw new GranularityLockedError(projectId);
    }
    if (!res.ok) throw new Error(`HTTP ${res.status} ao gravar a granularidade do projeto`);
    return ProjectSettingsSchema.parse(await res.json());
  }

  /**
   * No-op de propósito: a `create_session` da API carimba o `bead_sec` e congela o
   * nível na mesma transação que grava a sessão (ENG-361). Um POST daqui seria uma
   * segunda fonte da mesma verdade — e a que pode falhar sozinha.
   */
  noteSessionCreated(): void {}

  #send(projectId: string, method: 'GET' | 'PUT', body?: unknown): Promise<Response> {
    const token = this.#token?.();
    const headers: Record<string, string> = {};
    if (token) headers.authorization = `Bearer ${token}`;
    if (body !== undefined) headers['content-type'] = 'application/json';
    return this.#fetch(
      `${this.#baseUrl}/sound-necklace/projects/${encodeURIComponent(projectId)}/settings`,
      { method, headers, body: body === undefined ? undefined : JSON.stringify(body) },
    );
  }
}
