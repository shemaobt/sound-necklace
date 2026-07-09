/**
 * Portas de modo e o gate da Triagem — port 1:1 de `updateTriagemDone`
 * (docs/reference/index.html L1176–1184), `updateModeLocks` (L1018–1026) e do
 * redirect + efeito colateral de `setMode` (L982–1010). PRD v2 §8.0, §8.5, §11.
 *
 * Funções puras: a UI compõe (o `setMode` da referência também orquestra
 * entrada de camada — whole/parts em scenes.ts/ENG-216, cena/frases em ENG-223).
 * Aqui vive só a decisão de porta: modo efetivo, review derrubada e o efeito
 * `partsConfirmed`.
 */

import { lockedParts, productiveScenes } from './triagem';
import type { Mode, SessionState } from './state';

export interface TriagemDone {
  enabled: boolean;
  message: string;
}

/** Gate "Já classifiquei todas as cenas →": habilita só quando toda cena
 *  travada está não-pendente E há ≥1 produtiva (copy §8.5 verbatim). */
export function triagemDone(state: SessionState): TriagemDone {
  const parts = lockedParts(state);
  const allTriaged = parts.length > 0 && parts.every((p) => p.tag_state !== 'pending');
  const prod = productiveScenes(state).length;
  const enabled = allTriaged && prod > 0;
  const message = !allTriaged
    ? 'Classifique todas as cenas (ou marque “nenhum se encaixa”) para seguir.'
    : prod === 0
      ? 'Nenhuma cena se encaixa em Rute — escolha outra história.'
      : '';
  return { enabled, message };
}

export interface ModeLocks {
  escuta: boolean;
  triagem: boolean;
  segmentacao: boolean;
  mapeamento: boolean;
}

/** Abas como indicador de progresso: cada `true` = passo alcançável. Mapeamento
 *  exige produtiva E ≥1 frase travada com span — mais estrito que o redirect. */
export function modeLocks(state: SessionState): ModeLocks {
  const prod = productiveScenes(state).length;
  const nFrases = state.frases.filter((f) => f.locked && f.span).length;
  return {
    escuta: true,
    triagem: state.partsConfirmed,
    segmentacao: prod > 0,
    mapeamento: prod > 0 && nFrases > 0,
  };
}

/** Redirect do fluxo guiado: pedir segmentação/mapeamento sem cena produtiva
 *  cai na Triagem. NÃO checa frases — o guiado ALCANÇA mapeamento com zero
 *  frases (espelho do quirk da referência L983–984). */
export function resolveMode(state: SessionState, requested: Mode): Mode {
  const prod = productiveScenes(state).length;
  if ((requested === 'segmentacao' || requested === 'mapeamento') && prod === 0) return 'triagem';
  return requested;
}

/** Troca de modo: aplica o redirect, derruba o modo de revisão e, ao entrar em
 *  segmentação com cenas travadas, confirma as cenas (efeito L1005). */
export function setMode(state: SessionState, requested: Mode): SessionState {
  const mode = resolveMode(state, requested);
  const next: SessionState = { ...state, mode, review: false };
  if (mode === 'segmentacao' && lockedParts(state).length > 0 && !state.partsConfirmed) {
    next.partsConfirmed = true;
  }
  return next;
}
