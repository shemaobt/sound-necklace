/**
 * Esqueleto do SessionStore HTTP real (PRD §5, cliente do tripod-api). Mapeia os
 * métodos da porta para as superfícies de endpoint de contracts/api.ts, com `fetch`
 * INJETADO (sem rede no CI) e conectividade via ConnectivityMonitor. Custódia
 * opaca: o estado e os artefatos viajam sem re-serialização (o corpo do PUT/POST é
 * o próprio DTO; o load devolve o payload opaco tal como veio). Os endpoints exatos
 * são PROVISÓRIOS até o OpenAPI do tripod-api (ENG-211/ENG-247).
 */

import {
  LockStatusSchema,
  SessionListResponseSchema,
  SessionSummarySchema,
  type ArtifactTriple,
  type CreateSessionRequest,
  type LockStatus,
  type ResourcePath,
  type SessionStateDto,
  type SessionSummary,
} from '../../contracts';
import { ApiError } from '../api';
import type { ConnectivityMonitor } from '../connectivity/types';
import { createAutosaver, type Autosaver } from './autosave';
import {
  LockLostError,
  type CreateSessionInput,
  type LockHolder,
  type SessionStore,
} from './types';

/** Fencing do tripod-api (ENG-262): a trava é de outra pessoa e a escrita foi recusada. */
const LOCK_CONFLICT = 409;

export interface HttpSessionStoreOptions {
  baseUrl: string;
  fetch: typeof globalThis.fetch;
  monitor: ConnectivityMonitor;
  user: LockHolder;
  /** Token Bearer atual (do AuthProvider/ENG-239). */
  token?: () => string | null;
  debounceMs?: number;
  /**
   * A trava desta sessão foi tomada por outra pessoa — um autosave foi recusado com
   * 409. O autosave é fire-and-forget (§7.3), então é por aqui que a UI fica sabendo;
   * `complete`/`reopen` são aguardados e propagam o `LockLostError` pelo throw.
   */
  onLockLost?: (id: string) => void;
}

export class HttpSessionStore implements SessionStore {
  readonly me: LockHolder;
  readonly #baseUrl: string;
  readonly #fetch: typeof globalThis.fetch;
  readonly #token?: () => string | null;
  readonly #autosaver: Autosaver;

  constructor(opts: HttpSessionStoreOptions) {
    this.me = opts.user;
    this.#baseUrl = opts.baseUrl.replace(/\/$/, '');
    this.#fetch = opts.fetch;
    this.#token = opts.token;
    this.#autosaver = createAutosaver({
      persist: async (id, state) => {
        try {
          await this.#req('PUT', `/sessions/${id}/state`, state);
        } catch (err) {
          if (!(err instanceof ApiError) || err.status !== LOCK_CONFLICT) throw err;
          opts.onLockLost?.(id);
          throw new LockLostError(id);
        }
      },
      monitor: opts.monitor,
      debounceMs: opts.debounceMs ?? 800,
    });
  }

  async create(input: CreateSessionInput): Promise<SessionSummary> {
    const body: CreateSessionRequest = {
      audio_id: input.audioId,
      project_id: input.projectId,
      story_name: input.storyName,
      story_slug: input.storySlug,
      granularity_level: input.granularityLevel,
      bead_sec: input.beadSec,
      manifest_id: input.manifestId,
      pipeline_consent: input.pipelineConsent,
    };
    return SessionSummarySchema.parse(await this.#req('POST', '/sessions', body));
  }

  async get(id: string): Promise<SessionSummary> {
    return SessionSummarySchema.parse(await this.#req('GET', `/sessions/${id}`));
  }

  async list(): Promise<SessionSummary[]> {
    return SessionListResponseSchema.parse(await this.#req('GET', '/sessions')).sessions;
  }

  async load(id: string): Promise<SessionStateDto> {
    // payload opaco (§10.5): validado a fundo pela camada de estado, não aqui
    return (await this.#req('GET', `/sessions/${id}/state`)) as SessionStateDto;
  }

  autosave(id: string, state: SessionStateDto): void {
    // clona (paridade com a fixture): uma mutação do chamador na janela de debounce
    // não pode reescrever a escrita já enfileirada
    this.#autosaver.schedule(id, structuredClone(state));
  }

  async flush(id: string): Promise<void> {
    await this.#autosaver.flush(id);
  }

  async complete(id: string, state: SessionStateDto, artifacts: ArtifactTriple): Promise<void> {
    this.#autosaver.cancel(id); // nenhum PUT /state pendente pode chegar após o complete
    await this.#req('PUT', `/sessions/${id}/state`, state);
    await this.#req('POST', `/sessions/${id}/complete`, { artifacts });
  }

  async reopen(id: string): Promise<void> {
    this.#autosaver.cancel(id);
    await this.#req('POST', `/sessions/${id}/reopen`);
  }

  async getArtifacts(id: string): Promise<ArtifactTriple> {
    return (await this.#req('GET', `/sessions/${id}/artifacts`)) as ArtifactTriple;
  }

  async acquireLock(id: string): Promise<LockStatus> {
    // Adquirir e renovar são a MESMA operação idempotente no tripod-api (ENG-262) —
    // um só PUT. Não existe POST nesta rota: ele responderia 405.
    return LockStatusSchema.parse(await this.#req('PUT', `/sessions/${id}/lock`));
  }

  async renewLock(id: string): Promise<LockStatus> {
    return LockStatusSchema.parse(await this.#req('PUT', `/sessions/${id}/lock`));
  }

  async releaseLock(id: string): Promise<void> {
    await this.#req('DELETE', `/sessions/${id}/lock`);
  }

  async lockStatus(id: string): Promise<LockStatus> {
    return LockStatusSchema.parse(await this.#req('GET', `/sessions/${id}/lock`));
  }

  async putResource(id: string, path: ResourcePath, bytes: Uint8Array): Promise<void> {
    // bytes WebM opacos — viajam fora do JSON, com o content-type do recurso
    await this.#send('PUT', `/sessions/${id}/resources/${path}`, {
      body: bytes as BodyInit,
      headers: { 'content-type': 'audio/webm' },
    });
  }

  async getResource(id: string, path: ResourcePath): Promise<Uint8Array> {
    const res = await this.#send('GET', `/sessions/${id}/resources/${path}`);
    return new Uint8Array(await res.arrayBuffer());
  }

  async listResources(id: string, prefix: string): Promise<ResourcePath[]> {
    const q = `?prefix=${encodeURIComponent(prefix)}`;
    const json = (await this.#req('GET', `/sessions/${id}/resources${q}`)) as { paths: string[] };
    return json.paths as ResourcePath[];
  }

  #authHeaders(extra?: Record<string, string>): Record<string, string> {
    const headers: Record<string, string> = { ...extra };
    const token = this.#token?.();
    if (token) headers['authorization'] = `Bearer ${token}`;
    return headers;
  }

  async #send(
    method: string,
    path: string,
    init?: { body?: BodyInit; headers?: Record<string, string> },
  ): Promise<Response> {
    const res = await this.#fetch(`${this.#baseUrl}${path}`, {
      method,
      headers: this.#authHeaders(init?.headers),
      body: init?.body,
    });
    // ApiError carrega o status — é o que separa o 409 do fencing (veredito) de um
    // 5xx transitório, que o autosaver ainda deve retentar.
    if (!res.ok) throw new ApiError(res.status, `HTTP ${res.status} em ${method} ${path}`);
    return res;
  }

  async #req(method: string, path: string, body?: unknown): Promise<unknown> {
    const hasBody = body !== undefined;
    const res = await this.#send(method, path, {
      body: hasBody ? JSON.stringify(body) : undefined,
      headers: hasBody ? { 'content-type': 'application/json' } : undefined,
    });
    const text = await res.text();
    return text ? (JSON.parse(text) as unknown) : undefined;
  }
}
