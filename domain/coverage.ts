/**
 * Cobertura da Triagem — port 1:1 de `renderCoverage` (docs/reference/index.html
 * L1272–1308), reduzido ao cálculo puro (a tabela/drawer é ENG-225). PRD v2
 * §6.6 (alvos), §8.5. O componente de UI decide exibição ("1–2", cores).
 *
 * Firme = tagged com confiança alta|média; hesitante = baixa. `candidateAbsence`
 * (o `open-rara` da referência) marca tipo raro sem nenhuma cobertura firme.
 */

import { SCENE_KINDS, T_TARGET, type Tier } from './scene-kinds';
import { lockedParts, productiveScenes } from './triagem';
import type { SessionState } from './state';

export type CoverageStatus = 'covered' | 'partial' | 'open';

export interface KindCoverage {
  value: string;
  tier: Tier;
  firm: number;
  hesitant: number;
  target: number;
  status: CoverageStatus;
  candidateAbsence: boolean;
}

export interface Coverage {
  kinds: KindCoverage[];
  rareTotal: number;
  rareCovered: number;
  rareOpen: number;
  noneFit: number;
  productive: number;
  triaged: number;
  total: number;
  allNoneFit: boolean;
}

export function computeCoverage(state: SessionState): Coverage {
  const parts = lockedParts(state);
  const firm = new Map<string, number>();
  const hes = new Map<string, number>();
  for (const sk of SCENE_KINDS) {
    firm.set(sk.value, 0);
    hes.set(sk.value, 0);
  }
  for (const pt of parts) {
    if (pt.tag_state === 'tagged' && pt.scene_kind && firm.has(pt.scene_kind)) {
      if (pt.scene_kind_confidence === 'baixa')
        hes.set(pt.scene_kind, (hes.get(pt.scene_kind) ?? 0) + 1);
      else firm.set(pt.scene_kind, (firm.get(pt.scene_kind) ?? 0) + 1);
    }
  }

  const kinds: KindCoverage[] = SCENE_KINDS.map((sk) => {
    const fv = firm.get(sk.value) ?? 0;
    const hv = hes.get(sk.value) ?? 0;
    const target = T_TARGET[sk.tier];
    const status: CoverageStatus = fv >= target ? 'covered' : fv > 0 || hv > 0 ? 'partial' : 'open';
    return {
      value: sk.value,
      tier: sk.tier,
      firm: fv,
      hesitant: hv,
      target,
      status,
      candidateAbsence: sk.tier === 'ALTA' && fv === 0,
    };
  });

  const rareTotal = SCENE_KINDS.filter((s) => s.tier === 'ALTA').length;
  const rareCovered = SCENE_KINDS.filter(
    (s) => s.tier === 'ALTA' && (firm.get(s.value) ?? 0) >= T_TARGET.ALTA,
  ).length;
  const noneFit = parts.filter((p) => p.tag_state === 'none_fit').length;
  const productive = productiveScenes(state).length;
  const triaged = parts.filter((p) => p.tag_state !== 'pending').length;

  return {
    kinds,
    rareTotal,
    rareCovered,
    rareOpen: rareTotal - rareCovered,
    noneFit,
    productive,
    triaged,
    total: parts.length,
    allNoneFit: parts.length > 0 && triaged === parts.length && productive === 0,
  };
}
