/**
 * Fronteira travada + âncora ativa — port 1:1 de frontier (docs/reference/
 * index.html L400–415: ramo de cena ativa L401–409, ramo genérico L411–415)
 * e activeAnchor (L416–423). PRD v2 §6.4, §11.
 *
 * O ramo de cena ativa da camada de frases (última frase travada na cena +1;
 * back-reach ao início da vizinha anterior) retorna ANTES do clamp em
 * totalBeads−1 — quirk da referência espelhado de propósito (ENG-269): com a
 * última frase cobrindo o fim do colar, a fronteira cai FORA da grade.
 *
 * Desvio de shape: activeAnchor devolve `index` onde a referência devolve o
 * próprio `item` (L420) — com estado imutável o chamador endereça pelo índice.
 */

import { activeScene, prevNeighbor } from './seam';
import type { SessionState } from './state';

export function frontier(state: SessionState, layer: 'parts' | 'frases'): number {
  if (layer === 'frases') {
    const sc = activeScene(state);
    const scSpan = sc?.span;
    if (sc && scSpan) {
      let maxEnd = -1;
      for (const fr of state.frases) {
        if (fr.locked && fr.span && fr.part_link === sc.part_id && fr.span.e > maxEnd) {
          maxEnd = fr.span.e;
        }
      }
      if (maxEnd >= 0) return maxEnd + 1;
      const pv = prevNeighbor(state, sc);
      return pv ? pv.span.s : scSpan.s;
    }
  }
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
    if (it && !it.locked) {
      // O um-toque ancora a 1ª frase no início da CENA, não na back-reach à
      // vizinha que `frontier` mantém (quirk fiel à referência) — espelha o
      // clamp de `primeFrase`. Sem ele, tocar o fim puxaria o começo da frase
      // para a cena anterior (o "início da linha", ENG-343).
      const raw = frontier(state, layer);
      const sc = layer === 'frases' ? activeScene(state) : null;
      return { layer, index, start: sc?.span ? Math.max(sc.span.s, raw) : raw };
    }
  }
  return null;
}
