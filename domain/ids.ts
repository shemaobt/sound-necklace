/**
 * Alocadores de ID — port 1:1 de nextPartId (docs/reference/index.html L697)
 * e nextPid (L770): menor número livre, varrendo TODAS as entradas —
 * travadas ou não (slots pendentes ocupam seu ID; PRD v2 §6.3).
 */

export function nextPartId(parts: ReadonlyArray<{ part_id: string }>): string {
  const used = new Set(parts.map((p) => p.part_id));
  let n = 1;
  while (used.has('PT' + n)) n++;
  return 'PT' + n;
}

export function nextPid(frases: ReadonlyArray<{ prop_id: string }>): string {
  const used = new Set(frases.map((p) => p.prop_id));
  let n = 1;
  while (used.has('P' + n)) n++;
  return 'P' + n;
}
