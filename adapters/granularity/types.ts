/**
 * Porta GranularityResolver — o usuário escolhe um NÍVEL (Pequena/Média/Grande,
 * §8.1) e o sistema resolve para UM beadSec uniforme (§6.1). A regra de derivação
 * (acousteme → beadSec) é aberta (§15.2 O8, owner: pipeline) — daí a porta: o app
 * nunca inventa a regra, apenas consome `resolve`. Implementações: o stub fixture
 * (default) e, depois, a regra O8 real (ENG-242).
 */

import type { AcoustemeEnvelope, GranularityLevel } from '../../contracts';

export interface GranularityResolution {
  /** Segundos por conta — sempre > 0. */
  beadSec: number;
}

export interface GranularityResolver {
  /** Resolve o nível para um beadSec, a partir do acousteme do áudio (ou null). */
  resolve(level: GranularityLevel, acousteme: AcoustemeEnvelope | null): GranularityResolution;
}
