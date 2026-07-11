import { expect, type Locator } from '@playwright/test';

/**
 * Scanner de minimalismo do ouvinte (ENG-258, PRD v2 §9.2 "quanto menos texto,
 * melhor"). Roda sobre o DOM REAL de cada estado de decisão do ouvinte e falha se
 * a superfície carrega mais do que o mínimo: mais de uma linha de instrução, mais
 * de uma ação dominante, qualquer dígito/contagem/ID/hash ou uma tabela.
 *
 * O "dominante" é o marcador semântico do app `[data-role="primary-action"]` (a
 * única ação dominante que as estações declaram — os testes por página já o fixam
 * em 1), e NÃO o variante visual `primary` da telha: o Shemá reusa a telha também
 * para o afeto de escuta (ex.: "▶ Ouvir esta cena" e o "Confirmar" da confiança
 * coexistem), então contar `data-variant="primary"` marcaria UI legítima.
 *
 * Superfícies da FACILITADORA (setup, dashboard, imports, relatório, gaveta de
 * cobertura) estão FORA do scan (§9.2). Um dígito só é tolerado com uma entrada de
 * allowlist que traz uma justificativa PRD-§ obrigatória (`reason`) — hoje a
 * allowlist é vazia porque as telas do ouvinte soletram os números por extenso.
 */

export interface MinimalismAllowEntry {
  /** trecho de texto visível autorizado a conter dígitos (região facilitadora) */
  readonly pattern: RegExp;
  /** justificativa PRD-§ — OBRIGATÓRIA e não vazia */
  readonly reason: string;
}

export interface MinimalismScanOptions {
  /** rótulo do estado, usado nas mensagens de falha */
  readonly label: string;
  /** allowlist versionada de dígitos permitidos; cada entrada exige `reason` */
  readonly allow?: readonly MinimalismAllowEntry[];
}

/** IDs/hashes que jamais devem vazar para uma tela do ouvinte (§10–§11). */
const ID_LIKE = /fnv1a32|\b[A-Z]{3,}_[A-Z]{2,}\b/;

interface Probe {
  instructions: string[];
  primaryActions: number;
  tables: number;
  text: string;
}

/** Aplica as regras 1–5 do §9.2 a uma superfície do ouvinte (raiz `root`). */
export async function scanListenerSurface(
  root: Locator,
  opts: MinimalismScanOptions,
): Promise<void> {
  for (const entry of opts.allow ?? []) {
    if (!entry.reason.trim()) {
      throw new Error(`allowlist de "${opts.label}" tem entrada de dígito sem justificativa`);
    }
  }

  await expect(root, `${opts.label}: superfície presente`).toBeVisible();

  const probe = await root.evaluate((node): Probe => {
    const el = node as HTMLElement;
    const all = (sel: string) => Array.from(el.querySelectorAll(sel));
    return {
      instructions: all('[data-role="instruction"]').map((n) =>
        (n as HTMLElement).innerText.trim(),
      ),
      primaryActions: all('[data-role="primary-action"]').length,
      tables: all('table').length,
      text: el.innerText,
    };
  });

  // Regra 1 — no máximo UMA linha de instrução, curta (≤ 90 caracteres).
  expect(probe.instructions.length, `${opts.label}: linhas de instrução`).toBeLessThanOrEqual(1);
  for (const line of probe.instructions) {
    expect(line.length, `${opts.label}: instrução longa "${line}"`).toBeLessThanOrEqual(90);
  }

  // Regra 2 — no máximo UMA ação dominante declarada.
  expect(probe.primaryActions, `${opts.label}: ações dominantes`).toBeLessThanOrEqual(1);

  // Regra 4 — nenhuma tabela.
  expect(probe.tables, `${opts.label}: <table> na tela do ouvinte`).toBe(0);

  const lines = probe.text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const allowed = (line: string): boolean =>
    (opts.allow ?? []).some((entry) => entry.pattern.test(line));

  // Regra 3 — nenhum dígito no texto visível, salvo allowlist facilitadora.
  const digitLines = lines.filter((l) => /\d/.test(l) && !allowed(l));
  expect(digitLines, `${opts.label}: dígitos em superfície do ouvinte`).toEqual([]);

  // Regra 5 — nenhuma string de ID/hash em fonte mono visível.
  const idLines = lines.filter((l) => ID_LIKE.test(l) && !allowed(l));
  expect(idLines, `${opts.label}: IDs/hashes visíveis`).toEqual([]);
}
