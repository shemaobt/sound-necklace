/**
 * Answer store do Mapeamento — port de ensureMapping (referência L1057–1063)
 * e productiveFrases (L1082), mais a escrita de resposta com a semântica de
 * atribuição do driver (tests/golden/generate.mjs L179–186). PRD v2 §8.7,
 * §10.4 (chaveamento `level1{k}` / `level2{part_id}{k}` / `level3{prop_id}{k}`
 * e caminhos de voz `respostas/level{1,2,3}/…/<k>.webm`).
 *
 * Quirks espelhados de propósito:
 * - a semeadura usa `== null` — resposta `""` explícita sobrevive (extensão
 *   preguiçosa: re-cortes/reaberturas nunca perdem respostas);
 * - ensureMapping NUNCA apaga buckets (frase reaberta mantém as respostas);
 * - L3 semeia para TODA frase travada com span e part_link, produtiva ou não
 *   (≠ productiveFrases, que filtra por cena produtiva);
 * - escrever em bucket L2/L3 inexistente é erro de programação (a referência
 *   lançaria TypeError) — aqui lança Error explícito.
 */

import { L1_Q, L2_Q, L3_Q, type MapQuestion } from './mapeamento-scripts';
import type { Frase, Mapping, ScenePart, SessionState } from './state';
import { lockedParts, productiveScenes } from './triagem';

export type AnswerSlot =
  | { level: 1; k: string }
  | { level: 2; partId: string; k: string }
  | { level: 3; propId: string; k: string };

export type QuestionSlot = AnswerSlot & { question: MapQuestion };

export interface ProductiveFrase {
  fr: Frase;
  scene: ScenePart;
}

function seed(
  bucket: Record<string, string> | undefined,
  questions: readonly MapQuestion[],
): Record<string, string> {
  const out = { ...bucket };
  for (const q of questions) {
    if (out[q.k] == null) out[q.k] = '';
  }
  return out;
}

/** Cria/estende o mapping sem perder respostas (referência L1057–1063). */
export function ensureMapping(state: SessionState): SessionState {
  const prev: Mapping = state.mapping ?? { level1: {}, level2: {}, level3: {} };

  const level2 = { ...prev.level2 };
  for (const p of lockedParts(state)) {
    level2[p.part_id] = seed(level2[p.part_id], L2_Q);
  }

  const level3 = { ...prev.level3 };
  for (const fr of state.frases) {
    if (fr.locked && fr.span && fr.part_link) {
      level3[fr.prop_id] = seed(level3[fr.prop_id], L3_Q);
    }
  }

  return { ...state, mapping: { level1: seed(prev.level1, L1_Q), level2, level3 } };
}

/** Escreve uma resposta de texto (driver L179–186: atribuição direta). */
export function setAnswer(state: SessionState, slot: AnswerSlot, text: string): SessionState {
  const m = state.mapping;
  if (!m) throw new Error('setAnswer antes de ensureMapping');
  if (slot.level === 1) {
    return { ...state, mapping: { ...m, level1: { ...m.level1, [slot.k]: text } } };
  }
  const [store, id] =
    slot.level === 2 ? ([m.level2, slot.partId] as const) : ([m.level3, slot.propId] as const);
  const bucket = store[id];
  if (!bucket) throw new Error(`setAnswer: bucket level${slot.level} inexistente para ${id}`);
  const next = { ...store, [id]: { ...bucket, [slot.k]: text } };
  return {
    ...state,
    mapping: slot.level === 2 ? { ...m, level2: next } : { ...m, level3: next },
  };
}

/** Caminho do recurso de voz de uma resposta (PRD §10.4 / O5). */
export function voiceAnswerPath(slot: AnswerSlot): string {
  switch (slot.level) {
    case 1:
      return `respostas/level1/${slot.k}.webm`;
    case 2:
      return `respostas/level2/${slot.partId}/${slot.k}.webm`;
    case 3:
      return `respostas/level3/${slot.propId}/${slot.k}.webm`;
  }
}

/** Frases das cenas produtivas em ordem cena-major (referência L1082). */
export function productiveFrases(state: SessionState): ProductiveFrase[] {
  const out: ProductiveFrase[] = [];
  for (const scene of productiveScenes(state)) {
    for (const fr of state.frases) {
      if (fr.locked && fr.span && fr.part_link === scene.part_id) out.push({ fr, scene });
    }
  }
  return out;
}

/**
 * Sequência plana da conversa (§8.7): L1 (11) → 5 por cena travada em ordem
 * (none_fit incluída) → 5 por frase de cena produtiva (ordem de
 * productiveFrases).
 */
export function questionSequence(state: SessionState): QuestionSlot[] {
  const out: QuestionSlot[] = L1_Q.map((q) => ({ level: 1, k: q.k, question: q }));
  for (const p of lockedParts(state)) {
    for (const q of L2_Q) out.push({ level: 2, partId: p.part_id, k: q.k, question: q });
  }
  for (const { fr } of productiveFrases(state)) {
    for (const q of L3_Q) out.push({ level: 3, propId: fr.prop_id, k: q.k, question: q });
  }
  return out;
}
