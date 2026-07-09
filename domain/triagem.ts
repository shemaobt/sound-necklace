/**
 * Triagem — classificar cada cena travada. Port 1:1 do caminho do picker
 * (docs/reference/index.html L1258–1266) e dos seletores `lockedParts` (L1190)
 * e `productiveScenes` (L394). PRD v2 §6.5, §8.5, §11.
 *
 * Sem throw no fluxo: as mutações são mapas puros sobre `parts` por `part_id`.
 * A UI (ENG-225/236) só mostra o picker para cenas travadas; um `part_id` que
 * não casa deixa o estado inalterado.
 */

import type { Confidence, ScenePart, SessionState } from './state';

/** Cenas travadas com span — o universo da Triagem e da cobertura. */
export function lockedParts(state: SessionState): ScenePart[] {
  return state.parts.filter((p) => p.locked && p.span);
}

/** Cenas produtivas: travadas, com span, classificadas (tagged) e com tipo —
 *  na ordem de `parts`. São as que rendem cobertura de Rute e viram Segmentação. */
export function productiveScenes(state: SessionState): ScenePart[] {
  return state.parts.filter((p) => p.locked && p.span && p.tag_state === 'tagged' && p.scene_kind);
}

export function tagScene(
  state: SessionState,
  partId: string,
  sceneKind: string,
  confidence: Confidence,
): SessionState {
  return {
    ...state,
    parts: state.parts.map((p) =>
      p.part_id === partId
        ? { ...p, tag_state: 'tagged', scene_kind: sceneKind, scene_kind_confidence: confidence }
        : p,
    ),
  };
}

export function markNoneFit(state: SessionState, partId: string): SessionState {
  return {
    ...state,
    parts: state.parts.map((p) =>
      p.part_id === partId
        ? { ...p, tag_state: 'none_fit', scene_kind: null, scene_kind_confidence: null }
        : p,
    ),
  };
}
