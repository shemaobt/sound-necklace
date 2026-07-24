/**
 * ProjectSettingsStore fixture — o app inteiro roda sem API (regra de adapters).
 *
 * Guarda em memória e reproduz as DUAS regras que o backend impõe, porque são elas
 * que a tela precisa exercitar: o nível congela depois que o projeto cortou algo, e
 * reenviar o nível que já está lá é no-op (uma tela de configuração precisa poder
 * salvar o que já está nela).
 *
 * `markCut` é o que a fixture usa no lugar do "existe sessão" que o backend consulta.
 * O composition root o chama ao criar uma sessão; nada em produção depende dele.
 */

import type { GranularityLevel, ProjectSettings } from '../../contracts';
import { GranularityLockedError, type ProjectSettingsStore } from './types';

interface Row {
  level: GranularityLevel | null;
  beadSec: number | null;
  updatedAt: string | null;
}

export interface FixtureProjectSettingsOptions {
  /** Estado inicial por projeto — o piloto abre com um nível já decidido. */
  seed?: Record<string, Partial<Row>>;
  /** Relógio injetável: um `updated_at` estável mantém o teste determinístico. */
  now?: () => string;
}

export class FixtureProjectSettings implements ProjectSettingsStore {
  readonly #rows = new Map<string, Row>();
  readonly #cut = new Set<string>();
  readonly #now: () => string;

  constructor(opts: FixtureProjectSettingsOptions = {}) {
    this.#now = opts.now ?? (() => new Date().toISOString());
    for (const [projectId, row] of Object.entries(opts.seed ?? {})) {
      this.#rows.set(projectId, {
        level: row.level ?? null,
        beadSec: row.beadSec ?? null,
        updatedAt: row.updatedAt ?? null,
      });
    }
  }

  get(projectId: string): Promise<ProjectSettings> {
    return Promise.resolve(this.#view(projectId));
  }

  setLevel(projectId: string, level: GranularityLevel): Promise<ProjectSettings> {
    const row = this.#rows.get(projectId);
    if (row?.level === level) return Promise.resolve(this.#view(projectId));
    if (this.#cut.has(projectId)) return Promise.reject(new GranularityLockedError(projectId));

    this.#rows.set(projectId, {
      level,
      beadSec: row?.beadSec ?? null,
      updatedAt: this.#now(),
    });
    return Promise.resolve(this.#view(projectId));
  }

  /**
   * O projeto cortou um áudio: carimba a grade resolvida e congela o nível — o que a
   * `create_session` faz no backend. Grava o nível quando não havia nenhum, pelo mesmo
   * motivo que lá: uma sessão criada antes desta configuração existir ainda define a
   * grade do projeto.
   */
  noteSessionCreated(projectId: string, level: GranularityLevel, beadSec: number): void {
    const row = this.#rows.get(projectId);
    this.#rows.set(projectId, {
      level: row?.level ?? level,
      beadSec: row?.beadSec ?? beadSec,
      updatedAt: row?.updatedAt ?? this.#now(),
    });
    this.#cut.add(projectId);
  }

  #view(projectId: string): ProjectSettings {
    const row = this.#rows.get(projectId);
    return {
      project_id: projectId,
      granularity_level: row?.level ?? null,
      bead_sec: row?.beadSec ?? null,
      locked: this.#cut.has(projectId),
      updated_at: row?.updatedAt ?? null,
    };
  }
}
