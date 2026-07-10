/**
 * Modo fixture do SessionStore (default) — roda headless, sem rede. O "servidor" é
 * um `FixtureSessionBackend` em memória PARTILHÁVEL: duas stores sobre o mesmo
 * backend são dois usuários no mesmo servidor (é o que exercita o lock consultivo).
 * O backend persiste opcionalmente o estado JSON-able num `KeyValueStorage`
 * (localStorage no browser) para o dev sobreviver a um reload; os bytes de recurso
 * ficam só em memória. Custódia opaca: estado/artefatos entram e saem por clone.
 */

import type {
  ArtifactTriple,
  LockStatus,
  ResourcePath,
  SessionStateDto,
  SessionStatus,
  SessionStep,
  SessionSummary,
} from '../../contracts';
import { FixtureConnectivityMonitor } from '../connectivity/fixture';
import type { ConnectivityMonitor } from '../connectivity/types';
import { createAutosaver, type Autosaver } from './autosave';
import type { CreateSessionInput, LockHolder, SessionStore } from './types';
import { SessionNotFoundError } from './types';

/** Subconjunto da Web Storage API usado para persistir entre reloads. */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Usuário-editor default da fixture (holder dos locks). */
export const DEFAULT_FIXTURE_USER: LockHolder = {
  user_id: 'fixture-user',
  display_name: 'Facilitadora',
};

const STORAGE_KEY = 'colar-de-sons:sessions:v1';

interface LockRecord {
  holder: LockHolder;
  expires_at: string;
}

interface SessionRecord {
  summary: SessionSummary;
  state?: SessionStateDto;
  artifacts?: ArtifactTriple;
  lock?: LockRecord;
}

/**
 * Backend partilhável — o "servidor" simulado. Guarda os registros JSON-able
 * (resumo/estado/artefatos/lock) e, se houver `storage`, espelha um snapshot a
 * cada escrita e hidrata na construção. Os bytes de recurso ficam só em memória.
 */
export class FixtureSessionBackend {
  readonly sessions = new Map<string, SessionRecord>();
  readonly resources = new Map<string, Map<string, Uint8Array>>();
  readonly #storage?: KeyValueStorage;

  constructor(storage?: KeyValueStorage) {
    this.#storage = storage;
    if (storage) this.#hydrate(storage);
  }

  persist(): void {
    if (!this.#storage) return;
    this.#storage.setItem(STORAGE_KEY, JSON.stringify({ sessions: [...this.sessions.entries()] }));
  }

  #hydrate(storage: KeyValueStorage): void {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as { sessions: [string, SessionRecord][] };
    for (const [id, rec] of parsed.sessions) this.sessions.set(id, rec);
  }
}

export interface FixtureSessionStoreOptions {
  backend?: FixtureSessionBackend;
  monitor?: ConnectivityMonitor;
  user?: LockHolder;
  debounceMs?: number;
  /** TTL do lock consultivo (ms) — expira sozinho se o holder some. */
  lockTtlMs?: number;
  /** Latência simulada (ms) por operação; 0 = instantâneo (default). */
  latencyMs?: number;
}

/** Deriva o passo do dashboard (§7.2) do status + modo do estado salvo. */
function stepFor(status: SessionStatus, state: SessionStateDto | undefined): SessionStep {
  if (status === 'concluida') return 'guardar';
  const s = state as { mode?: string; whole?: { confirmed?: boolean } } | undefined;
  switch (s?.mode) {
    case 'triagem':
      return 'triagem';
    case 'segmentacao':
      return 'frases';
    case 'mapeamento':
      return 'conversa';
    default:
      return s?.whole?.confirmed ? 'cortar' : 'ouvir';
  }
}

export class FixtureSessionStore implements SessionStore {
  readonly #backend: FixtureSessionBackend;
  readonly #user: LockHolder;
  readonly #lockTtlMs: number;
  readonly #latencyMs: number;
  readonly #autosaver: Autosaver;

  constructor(opts: FixtureSessionStoreOptions = {}) {
    this.#backend = opts.backend ?? new FixtureSessionBackend();
    this.#user = opts.user ?? DEFAULT_FIXTURE_USER;
    this.#lockTtlMs = opts.lockTtlMs ?? 30_000;
    this.#latencyMs = opts.latencyMs ?? 0;
    this.#autosaver = createAutosaver({
      persist: (id, state) => this.#persistState(id, state),
      monitor: opts.monitor ?? new FixtureConnectivityMonitor(true),
      debounceMs: opts.debounceMs ?? 800,
    });
  }

  async create(input: CreateSessionInput): Promise<SessionSummary> {
    await this.#settle();
    const id = globalThis.crypto.randomUUID();
    const summary: SessionSummary = {
      id,
      project_id: input.projectId,
      story_name: input.storyName,
      story_slug: input.storySlug,
      status: 'em_progresso',
      last_modified: new Date().toISOString(),
      progress: { current_step: 'ouvir' },
    };
    this.#backend.sessions.set(id, { summary });
    this.#backend.persist();
    return clone(summary);
  }

  async get(id: string): Promise<SessionSummary> {
    await this.#settle();
    return clone(this.#requireRec(id).summary);
  }

  async list(): Promise<SessionSummary[]> {
    await this.#settle();
    return [...this.#backend.sessions.values()]
      .map((r) => clone(r.summary))
      .sort((a, b) => b.last_modified.localeCompare(a.last_modified));
  }

  async load(id: string): Promise<SessionStateDto> {
    await this.#settle();
    const rec = this.#requireRec(id);
    if (!rec.state) throw new SessionNotFoundError(id);
    return clone(rec.state);
  }

  autosave(id: string, state: SessionStateDto): void {
    this.#autosaver.schedule(id, clone(state));
  }

  async flush(id: string): Promise<void> {
    await this.#autosaver.flush(id);
  }

  async complete(id: string, state: SessionStateDto, artifacts: ArtifactTriple): Promise<void> {
    this.#autosaver.cancel(id); // um autosave armado não pode aterrissar após concluir
    await this.#settle();
    const rec = this.#requireRec(id);
    rec.state = clone(state);
    rec.artifacts = { ...artifacts }; // strings opacas — byte-idênticas
    rec.summary = {
      ...rec.summary,
      status: 'concluida',
      last_modified: new Date().toISOString(),
      progress: { current_step: 'guardar' },
    };
    this.#backend.persist();
  }

  async reopen(id: string): Promise<void> {
    this.#autosaver.cancel(id);
    await this.#settle();
    const rec = this.#requireRec(id);
    rec.summary = {
      ...rec.summary,
      status: 'em_progresso',
      last_modified: new Date().toISOString(),
      progress: { current_step: stepFor('em_progresso', rec.state) },
    };
    this.#backend.persist();
  }

  async getArtifacts(id: string): Promise<ArtifactTriple> {
    await this.#settle();
    const rec = this.#requireRec(id);
    if (!rec.artifacts) throw new SessionNotFoundError(id);
    return { ...rec.artifacts };
  }

  async acquireLock(id: string): Promise<LockStatus> {
    await this.#settle();
    const rec = this.#requireRec(id);
    if (!this.#heldByOther(rec)) {
      rec.lock = this.#mintLock();
      this.#backend.persist();
    }
    return lockStatusOf(rec);
  }

  async renewLock(id: string): Promise<LockStatus> {
    await this.#settle();
    const rec = this.#requireRec(id);
    if (rec.lock?.holder.user_id === this.#user.user_id) {
      rec.lock = this.#mintLock();
      this.#backend.persist();
    }
    return lockStatusOf(rec);
  }

  async releaseLock(id: string): Promise<void> {
    await this.#settle();
    const rec = this.#requireRec(id);
    if (rec.lock?.holder.user_id === this.#user.user_id) {
      rec.lock = undefined;
      this.#backend.persist();
    }
  }

  async lockStatus(id: string): Promise<LockStatus> {
    await this.#settle();
    return lockStatusOf(this.#requireRec(id));
  }

  async putResource(id: string, path: ResourcePath, bytes: Uint8Array): Promise<void> {
    await this.#settle();
    this.#requireRec(id);
    let map = this.#backend.resources.get(id);
    if (!map) {
      map = new Map();
      this.#backend.resources.set(id, map);
    }
    map.set(path, bytes.slice());
  }

  async getResource(id: string, path: ResourcePath): Promise<Uint8Array> {
    await this.#settle();
    const bytes = this.#backend.resources.get(id)?.get(path);
    if (!bytes) throw new Error(`recurso ausente: ${path}`);
    return bytes.slice();
  }

  async listResources(id: string, prefix: string): Promise<ResourcePath[]> {
    await this.#settle();
    const map = this.#backend.resources.get(id);
    if (!map) return [];
    return [...map.keys()].filter((p) => p.startsWith(prefix)) as ResourcePath[];
  }

  #requireRec(id: string): SessionRecord {
    const rec = this.#backend.sessions.get(id);
    if (!rec) throw new SessionNotFoundError(id);
    return rec;
  }

  #heldByOther(rec: SessionRecord): boolean {
    return (
      rec.lock !== undefined &&
      Date.parse(rec.lock.expires_at) > Date.now() &&
      rec.lock.holder.user_id !== this.#user.user_id
    );
  }

  #mintLock(): LockRecord {
    return {
      holder: { ...this.#user },
      expires_at: new Date(Date.now() + this.#lockTtlMs).toISOString(),
    };
  }

  #persistState(id: string, state: SessionStateDto): Promise<void> {
    const rec = this.#requireRec(id);
    rec.state = clone(state);
    rec.summary = {
      ...rec.summary,
      last_modified: new Date().toISOString(),
      progress: { current_step: stepFor(rec.summary.status, state) },
    };
    this.#backend.persist();
    return Promise.resolve();
  }

  #settle(): Promise<void> {
    return this.#latencyMs > 0
      ? new Promise((resolve) => setTimeout(resolve, this.#latencyMs))
      : Promise.resolve();
  }
}

function lockStatusOf(rec: SessionRecord): LockStatus {
  if (rec.lock && Date.parse(rec.lock.expires_at) > Date.now()) {
    return { held: true, holder: { ...rec.lock.holder }, expires_at: rec.lock.expires_at };
  }
  return { held: false, holder: null, expires_at: null };
}

/** Deep-clone JSON-able — isolamento de custódia opaca (o chamador não muta o guardado). */
function clone<T>(value: T): T {
  return structuredClone(value);
}
