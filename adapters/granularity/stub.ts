/**
 * StubGranularityResolver — PROVISIONAL. O resolver de granularidade como STUB até a
 * regra O8 real (ENG-242, blocked-O8). NÃO há matemática de derivação aqui: o stub
 * lê o beadSec fixture-authored do envelope de acousteme quando presente e válido, e
 * senão cai em constantes fallback PROVISÓRIAS. O `data` do envelope é opaco
 * (§15.2 O8) — lido defensivamente, nunca interpretado além de "número por nível".
 */

import type { AcoustemeEnvelope, GranularityLevel } from '../../contracts';
import type { GranularityResolution, GranularityResolver } from './types';

/**
 * Fallbacks PROVISÓRIOS por nível quando o áudio não traz acousteme (§6.1): valores
 * fixos com media = 0.25 s (a referência do v1). Substituídos pela regra O8 (ENG-242).
 */
const FALLBACK_BEAD_SEC: Record<GranularityLevel, number> = {
  pequena: 0.12,
  media: 0.25,
  grande: 0.5,
};

export class StubGranularityResolver implements GranularityResolver {
  resolve(level: GranularityLevel, acousteme: AcoustemeEnvelope | null): GranularityResolution {
    return { beadSec: readFixtureBeadSec(acousteme, level) ?? FALLBACK_BEAD_SEC[level] };
  }
}

/** Lê `data.bead_sec[level]` do envelope opaco; null se ausente ou não-positivo. */
function readFixtureBeadSec(
  acousteme: AcoustemeEnvelope | null,
  level: GranularityLevel,
): number | null {
  const data = acousteme?.data;
  if (typeof data !== 'object' || data === null) return null;
  const beadSecMap = (data as Record<string, unknown>).bead_sec;
  if (typeof beadSecMap !== 'object' || beadSecMap === null) return null;
  const value = (beadSecMap as Record<string, unknown>)[level];
  return typeof value === 'number' && value > 0 ? value : null;
}
