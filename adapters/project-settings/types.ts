/**
 * Porta ProjectSettingsStore — a granularidade do PROJETO (§6.1/§8.1, ENG-352).
 *
 * `beadSec` define a grade de contas e entra no `manifest_id`, então é o sistema de
 * coordenadas em que o pipeline e o dado de treino são construídos. Escolhê-la por
 * sessão deixava dois áudios do mesmo projeto caírem em duas grades incompatíveis.
 *
 * A porta é deliberadamente pequena: ler e decidir. O `bead_sec` não é escrevível
 * daqui — vem do acousteme de cada áudio (regra O8) e a primeira sessão do projeto o
 * carimba no backend.
 */

import type { GranularityLevel, ProjectSettings } from '../../contracts';

/**
 * O PUT foi recusado: o projeto já cortou alguma coisa, então o nível está congelado.
 * Erro tipado porque a tela reage a ISTO (explica em vez de oferecer o controle) e
 * não a um 409 genérico — recortar um projeto numa nova granularidade re-deriva todo
 * `manifest_id` já exportado, o que é migração, não retentativa.
 */
export class GranularityLockedError extends Error {
  constructor(readonly projectId: string) {
    super(`A granularidade do projeto ${projectId} já está congelada`);
    this.name = 'GranularityLockedError';
  }
}

export interface ProjectSettingsStore {
  /** A granularidade do projeto. Nível nulo = ninguém decidiu ainda. */
  get(projectId: string): Promise<ProjectSettings>;
  /** Decide o nível. Lança GranularityLockedError se o projeto já cortou algo. */
  setLevel(projectId: string, level: GranularityLevel): Promise<ProjectSettings>;
  /**
   * O projeto acabou de cortar um áudio. No modo real é NO-OP — a `create_session`
   * carimba a grade e congela o nível do lado do servidor, na mesma transação. Está na
   * porta mesmo assim porque a fixture não tem servidor para fazer isso por ela, e sem
   * este aviso o app rodando sem API não exibiria a regra que congela o nível.
   */
  noteSessionCreated(projectId: string, level: GranularityLevel, beadSec: number): void;
}
