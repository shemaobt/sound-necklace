/**
 * Fronteira travada + âncora ativa — port 1:1 de frontier (docs/reference/
 * index.html L400–415, ramo genérico L411–415) e activeAnchor (L416–423).
 * PRD v2 §6.4, §11.
 *
 * O ramo de cena ativa da camada de frases (L401–409: última frase travada na
 * cena, back-reach à vizinha anterior) chega com a ENG-223 — aqui só o ramo
 * genérico, que a referência aplica às duas camadas.
 *
 * Desvio de shape: activeAnchor devolve `index` onde a referência devolve o
 * próprio `item` (L420) — com estado imutável o chamador endereça pelo índice.
 */

import type { SessionState } from './state';

export function frontier(state: SessionState, layer: 'parts' | 'frases'): number {
  const arr = layer === 'parts' ? state.parts : state.frases;
  let f = layer === 'frases' ? state.whole.span.s : 0;
  for (const it of arr) {
    if (it.locked && it.span && it.span.e + 1 > f) f = it.span.e + 1;
  }
  return Math.min(f, state.totalBeads - 1);
}

export interface ActiveAnchor {
  layer: 'parts' | 'frases';
  index: number;
  start: number;
}

export function activeAnchor(state: SessionState): ActiveAnchor | null {
  const { layer, index } = state.current;
  if ((layer === 'parts' || layer === 'frases') && index >= 0) {
    const it = (layer === 'parts' ? state.parts : state.frases)[index];
    if (it && !it.locked) return { layer, index, start: frontier(state, layer) };
  }
  return null;
}
