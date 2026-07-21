/**
 * SessionStore HTTP real (PRD §5, cliente do tripod-api — fio verificado na ENG-267,
 * `http/sound-necklace.http`). Mapeia a porta para `/sound-necklace/*`, com `fetch`
 * INJETADO (sem rede no CI) e conectividade via ConnectivityMonitor. Custódia opaca
 * (§10.5): o estado viaja sem re-serialização; os artefatos sobem como bytes crus
 * (multipart) e descem por URL assinada — a API nunca os re-serializa.
 */

import {
  ArtifactUploadResponseSchema,
  LockStatusSchema,
  ResourceListResponseSchema,
  ResourceUrlResponseSchema,
  SessionListResponseSchema,
  SessionSummarySchema,
  type ArtifactKind,
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
  type AutosaveStatus,
  type CreateSessionInput,
  type LockHolder,
  type SessionStore,
  type Unsubscribe,
} from './types';

/**
 * Dois 409 vivem no PUT /state e o `code` é o que os separa (ENG-262): SESSION_LOCKED
 * é veredito (outra pessoa edita — parar de escrever); SESSION_LOCK_CHANGED é
 * transitório (o lease caducou no meio da escrita — retentar).
 */
const LOCK_CONFLICT = 409;

/** Filenames congelados do PRD §10 — parte do contrato com o Compilador. */
const ARTIFACT_FILES: Record<ArtifactKind, { name: string; type: string }> = {
  manifest: { name: 'manifesto-contas.json', type: 'application/json' },
  anchoring: { name: 'retorno-ancoragem.json', type: 'application/json' },
  report: { name: 'relatorio-mapeamento.md', type: 'text/markdown' },
};

export interface HttpSessionStoreOptions {
  /** Base compartilhada terminada em `/api`; as rotas daqui somam `/sound-necklace`. */
  baseUrl: string;
  fetch: typeof globalThis.fetch;
  monitor: ConnectivityMonitor;
  /** Editor dono das travas. Thunk quando só se conhece após o login (wiring real). */
  user: LockHolder | (() => LockHolder);
  /**
   * Token Bearer atual (do AuthProvider/ENG-239). Pode ser assíncrono: o wiring real
   * espera `authReady()` dentro do thunk, o que serializa TODA chamada de sessão
   * atrás da retomada do boot (§12 emendado) — sem 401 de corrida no reload.
   */
  token?: () => string | null | Promise<string | null>;
  debounceMs?: number;
  /**
   * A trava desta sessão foi tomada por outra pessoa — um autosave foi recusado com
   * 409 SESSION_LOCKED. O autosave é fire-and-forget (§7.3): não há promessa para o
   * chamador aguardar, então este callback é a ÚNICA via pela qual a UI descobre.
   * `holder` é o `holder_name` do corpo do 409 (null se o corpo não o trouxe). Só o
   * autosave passa por aqui; `complete`/`reopen` são aguardados e o 409 sobe por
   * throw para quem chamou — como `ApiError` cru (a tradução vive no `persist`).
   */
  onLockLost?: (id: string, holder: string | null) => void;
}

export class HttpSessionStore implements SessionStore {
  readonly #user: LockHolder | (() => LockHolder);
  readonly #baseUrl: string;
  readonly #fetch: typeof globalThis.fetch;
  readonly #token?: () => string | null | Promise<string | null>;
  readonly #autosaver: Autosaver;

  constructor(opts: HttpSessionStoreOptions) {
    this.#user = opts.user;
    this.#baseUrl = opts.baseUrl.replace(/\/$/, '');
    this.#fetch = opts.fetch;
    this.#token = opts.token;
    this.#autosaver = createAutosaver({
      persist: async (id, state) => {
        try {
          await this.#req('PUT', `/sessions/${id}/state`, state);
        } catch (err) {
          if (!(err instanceof ApiError) || err.status !== LOCK_CONFLICT) throw err;
          const body = err.body as { code?: string; holder_name?: string } | undefined;
          // SESSION_LOCK_CHANGED (e qualquer 409 sem code conhecido) fica transitório:
          // o autosaver retenta com backoff. Só o SESSION_LOCKED é terminal.
          if (body?.code !== 'SESSION_LOCKED') throw err;
          const holder = body.holder_name ?? null;
          opts.onLockLost?.(id, holder);
          throw new LockLostError(id, holder);
        }
      },
      monitor: opts.monitor,
      debounceMs: opts.debounceMs ?? 800,
    });
  }

  get me(): LockHolder {
    return typeof this.#user === 'function' ? this.#user() : this.#user;
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
    // o servidor pagina (limit ≤ 200); segue até a página curta — uma 201ª sessão
    // não pode simplesmente sumir do Dashboard
    const PAGE = 200;
    const all: SessionSummary[] = [];
    for (let offset = 0; ; offset += PAGE) {
      const page = SessionListResponseSchema.parse(
        await this.#req('GET', `/sessions?offset=${offset}&limit=${PAGE}`),
      ).sessions;
      all.push(...page);
      if (page.length < PAGE) return all;
    }
  }

  async load(id: string): Promise<SessionStateDto> {
    // payload opaco (§10.5): validado a fundo pela camada de estado, não aqui
    return (await this.#req('GET', `/sessions/${id}/state`)) as SessionStateDto;
  }

  onAutosaveStatus(cb: (status: AutosaveStatus) => void): Unsubscribe {
    return this.#autosaver.onStatus(cb);
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
    // nenhum PUT /state velho pode chegar após o complete: descarta o pendente E
    // espera o já despachado aterrissar (o servidor aceitaria a regressão).
    this.#autosaver.cancel(id);
    await this.#autosaver.settle(id);
    await this.#req('PUT', `/sessions/${id}/state`, state);
    // §10.5: o trio sobe como bytes crus em form-data — a API guarda sem re-serializar
    // e o download volta byte-idêntico (provado na ENG-267 contra o bucket real).
    const form = new FormData();
    for (const kind of ['manifest', 'anchoring', 'report'] as const) {
      const { name, type } = ARTIFACT_FILES[kind];
      form.append(kind, new Blob([artifacts[kind]], { type }), name);
    }
    // sem content-type nosso: o runtime assina o boundary do multipart
    const res = await this.#send('POST', `/sessions/${id}/artifacts`, { body: form });
    const receipt = ArtifactUploadResponseSchema.parse(await res.json());
    // o recibo tem de cobrir os TRÊS kinds antes de declarar a sessão concluída —
    // um upload parcial aceito em silêncio deixaria o pipeline sem um dos documentos
    const kinds = new Set(receipt.map((r) => r.kind));
    for (const kind of ['manifest', 'anchoring', 'report'] as const)
      if (!kinds.has(kind)) throw new Error(`recibo de artefatos sem o kind ${kind}`);
    await this.#req('POST', `/sessions/${id}/complete`);
  }

  async reopen(id: string): Promise<void> {
    this.#autosaver.cancel(id);
    await this.#autosaver.settle(id);
    await this.#req('POST', `/sessions/${id}/reopen`);
  }

  async getArtifacts(id: string): Promise<ArtifactTriple> {
    // Um GET por kind; a rota responde 307 para a URL assinada e o fetch a segue
    // sozinho — o browser remove o header Authorization no salto cross-origin (spec
    // do fetch), que é o que a URL assinada exige para não ser invalidada.
    const download = async (kind: ArtifactKind): Promise<string> => {
      const res = await this.#send('GET', `/sessions/${id}/artifacts/${kind}`);
      return res.text();
    };
    const [manifest, anchoring, report] = await Promise.all([
      download('manifest'),
      download('anchoring'),
      download('report'),
    ]);
    return { manifest, anchoring, report };
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
    await this.#send('PUT', `/sessions/${id}/resources?path=${encodeURIComponent(path)}`, {
      body: bytes as BodyInit,
      headers: { 'content-type': 'audio/webm' },
    });
  }

  async getResource(id: string, path: ResourcePath): Promise<Uint8Array> {
    // 2 saltos: a API assina a URL (com Bearer); o GET assinado vai SEM Bearer —
    // um header Authorization junto da assinatura é 400 no GCS.
    const res = await this.#send(
      'GET',
      `/sessions/${id}/resources/url?path=${encodeURIComponent(path)}`,
    );
    const { url } = ResourceUrlResponseSchema.parse(await res.json());
    const signed = await this.#fetch(url);
    if (!signed.ok) throw new ApiError(signed.status, `HTTP ${signed.status} no GET assinado`);
    return new Uint8Array(await signed.arrayBuffer());
  }

  async listResources(id: string, prefix: string): Promise<ResourcePath[]> {
    // a rota lista a sessão inteira; o recorte por prefixo é do cliente
    const res = await this.#send('GET', `/sessions/${id}/resources`);
    const { resources } = ResourceListResponseSchema.parse(await res.json());
    return resources.map((r) => r.path as ResourcePath).filter((p) => p.startsWith(prefix));
  }

  async deleteResource(id: string, path: ResourcePath): Promise<void> {
    await this.#send('DELETE', `/sessions/${id}/resources?path=${encodeURIComponent(path)}`);
  }

  async #authHeaders(extra?: Record<string, string>): Promise<Record<string, string>> {
    const headers: Record<string, string> = { ...extra };
    const token = await this.#token?.();
    if (token) headers['authorization'] = `Bearer ${token}`;
    return headers;
  }

  async #send(
    method: string,
    path: string,
    init?: { body?: BodyInit; headers?: Record<string, string> },
  ): Promise<Response> {
    const res = await this.#fetch(`${this.#baseUrl}/sound-necklace${path}`, {
      method,
      headers: await this.#authHeaders(init?.headers),
      body: init?.body,
    });
    if (!res.ok) {
      // O corpo viaja no ApiError: é onde o `code` do 409 (fencing ENG-262) vive —
      // e o que separa um veredito de um 5xx transitório que o autosaver retenta.
      let body: unknown;
      try {
        body = await res.json();
      } catch {
        body = undefined;
      }
      throw new ApiError(res.status, `HTTP ${res.status} em ${method} ${path}`, body);
    }
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
