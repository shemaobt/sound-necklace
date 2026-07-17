/**
 * Porta SessionStore — persistência de sessão do PRD v2 §7.3: autosave contínuo do
 * estado INTEIRO (nenhuma ação do usuário é exigida), retomada de qualquer máquina,
 * ciclo de vida (em progresso → concluída, com o trio de artefatos guardado
 * BYTE-IDÊNTICO/opaco §10.5), lock consultivo de editor único (§7.3/O4) e recursos
 * de sessão (as respostas de voz por caminho `respostas/...`, §10.4/O5).
 *
 * Custódia é OPACA: o estado e os artefatos entram e saem por deep-clone; a store
 * nunca re-serializa nem reinterpreta a forma interna do payload (é o que preserva
 * a byte-identidade com os goldens). Implementações: fixture headless (default) e o
 * esqueleto HTTP real (compila contra os DTOs de contracts/api.ts).
 */

import type {
  ArtifactTriple,
  GranularityLevel,
  LockHolder,
  LockStatus,
  ResourcePath,
  SessionStateDto,
  SessionSummary,
} from '../../contracts';

export type Unsubscribe = () => void;

/** Erro tipado — `load`/`get` de uma sessão inexistente (a UI mostra a cópia). */
export class SessionNotFoundError extends Error {
  override readonly name = 'SessionNotFoundError';

  constructor(readonly sessionId: string) {
    super(`sessão desconhecida: ${sessionId}`);
  }
}

/**
 * Erro tipado — a escrita foi recusada porque a trava consultiva é de OUTRA pessoa
 * (§7.3; o fencing por `user_id` do tripod-api, ENG-262, responde 409). É um veredito,
 * não uma falha transitória: retentar só repete a recusa, então o autosaver descarta o
 * pendente em vez de segurá-lo em memória — o que perderia a escrita ao fechar a aba.
 */
export class LockLostError extends Error {
  override readonly name = 'LockLostError';

  /** `holder` nomeia quem detém agora (o 409 SESSION_LOCKED traz `holder_name`). */
  constructor(
    readonly sessionId: string,
    readonly holder: string | null = null,
  ) {
    super(`trava perdida na sessão: ${sessionId}`);
  }
}

/**
 * Entrada de criação (§8.1): o que o Setup calcula client-side antes de existir uma
 * sessão — áudio do bucket + parâmetros de grade + consentimento de uso no pipeline.
 */
export interface CreateSessionInput {
  projectId: string;
  storyName: string;
  storySlug: string;
  audioId: string;
  granularityLevel: GranularityLevel;
  beadSec: number;
  manifestId: string;
  pipelineConsent: boolean;
}

export interface SessionStore {
  /**
   * Identidade do editor desta store — o dono das travas que ela adquire. É o que
   * permite ao chamador decidir se um `LockStatus.holder` é ELE MESMO ou outra
   * pessoa, sem conhecer o modo (fixture/HTTP) nem importar a constante da fixture.
   */
  readonly me: LockHolder;

  /** Cria a sessão (status em_progresso, na 1ª estação) e devolve o resumo. */
  create(input: CreateSessionInput): Promise<SessionSummary>;
  /** Resumo de uma sessão (dashboard/resume). */
  get(id: string): Promise<SessionSummary>;
  /** Todas as sessões visíveis (dashboard), mais recentes primeiro. */
  list(): Promise<SessionSummary[]>;
  /** Estado salvo mais recente — retoma no passo exato. Lança se nunca salvo. */
  load(id: string): Promise<SessionStateDto>;

  /**
   * Enfileira um autosave: debounced, coalescente (o último estado vence) e
   * pausado enquanto offline (retoma e faz flush no reconnect, sem perda).
   */
  autosave(id: string, state: SessionStateDto): void;
  /** Força o autosave pendente agora (navegação/testes). No-op se offline. */
  flush(id: string): Promise<void>;

  /** Conclui (§8.8): status concluída + guarda o trio de artefatos opaco. */
  complete(id: string, state: SessionStateDto, artifacts: ArtifactTriple): Promise<void>;
  /** Reabre uma sessão concluída → volta a em_progresso (§7.3). */
  reopen(id: string): Promise<void>;
  /** Os três artefatos guardados na conclusão, byte-idênticos (§10.5). */
  getArtifacts(id: string): Promise<ArtifactTriple>;

  /**
   * Tenta adquirir o lock consultivo. NUNCA lança por conflito: devolve o
   * `LockStatus` — se `holder` não for o usuário desta store, o chamador abre em
   * modo revisão (§7.3).
   */
  acquireLock(id: string): Promise<LockStatus>;
  /** Renova o lock que este usuário detém (estende a expiração). */
  renewLock(id: string): Promise<LockStatus>;
  /** Libera o lock se detido por este usuário. */
  releaseLock(id: string): Promise<void>;
  /** Estado atual do lock (para o gate de revisão ao abrir). */
  lockStatus(id: string): Promise<LockStatus>;

  /** Grava um recurso de voz sob o caminho canônico `respostas/...` (§10.4/O5). */
  putResource(id: string, path: ResourcePath, bytes: Uint8Array): Promise<void>;
  /** Lê os bytes de um recurso. Lança se ausente. */
  getResource(id: string, path: ResourcePath): Promise<Uint8Array>;
  /** Caminhos de recurso com o prefixo dado (ex.: `respostas/level3/P2/`). */
  listResources(id: string, prefix: string): Promise<ResourcePath[]>;
  /** Apaga um recurso (objeto + registro). Caminho nunca gravado é no-op. */
  deleteResource(id: string, path: ResourcePath): Promise<void>;
}

/** Identidade do editor desta store (dono dos locks que ela adquire). */
export type { LockHolder };
