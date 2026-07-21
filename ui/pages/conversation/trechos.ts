import {
  L1_Q,
  L2_Q,
  L3_Q,
  lockedParts,
  productiveFrases,
  type QuestionSlot,
  type SessionState,
} from '../../../domain';
import { sceneKindLabel } from '../../i18n/scene-kind-label';
import type { ConversationTrecho } from '../../molecules';
import { type PaletteEntry, phrasePalette, scenePalette, storyColor } from '../../tokens';

export interface TrechoLabels {
  /** "a história inteira" — o trecho das perguntas de nível 1 */
  story: string;
  /** fallback de rótulo para uma cena sem tipo (none_fit) */
  sceneUntyped: string;
}

/**
 * Os trechos da conversa na ORDEM da sequência de perguntas (domain/mapping.ts:
 * `questionSequence`): a história (L1) → cada cena travada (L2) → cada frase
 * produtiva (L3). Cada trecho carrega sua contagem de perguntas (a largura do
 * segmento), sua cor (história / scenePalette / phrasePalette) e seu rótulo SEM
 * número (§9.2). Uma frase herda o tipo da cena-mãe (ENG-350, decisão do dono);
 * uma cena none_fit cai no rótulo genérico. A soma das contagens é exatamente o
 * `total` de `ConversationProgress`, então o marcador cai no trecho certo.
 */
export function buildTrechos(
  state: SessionState,
  lang: string,
  labels: TrechoLabels,
): ConversationTrecho[] {
  const kindLabel = (kind: string | null): string =>
    kind ? sceneKindLabel(kind, lang) : labels.sceneUntyped;

  const out: ConversationTrecho[] = [
    { count: L1_Q.length, color: storyColor, label: labels.story },
  ];
  lockedParts(state).forEach((p, i) => {
    out.push({
      count: L2_Q.length,
      color: scenePalette[i % scenePalette.length]!,
      label: kindLabel(p.scene_kind),
    });
  });
  productiveFrases(state).forEach(({ scene }, j) => {
    out.push({
      count: L3_Q.length,
      color: phrasePalette[j % phrasePalette.length]!,
      label: kindLabel(scene.scene_kind),
    });
  });
  return out;
}

/**
 * O trecho da pergunta ATUAL (cor + rótulo) para o indicador de trecho: a
 * história (N1), a cena (N2) ou a frase (N3, herdando o tipo da cena-mãe). Usa a
 * MESMA cor/rótulo que o segmento correspondente da barra (buildTrechos) — o
 * índice da cena/frase é a posição em lockedParts/productiveFrases.
 */
export function currentTrecho(
  state: SessionState,
  slot: QuestionSlot,
  lang: string,
  labels: TrechoLabels,
): { color: PaletteEntry; label: string } {
  const kindLabel = (kind: string | null): string =>
    kind ? sceneKindLabel(kind, lang) : labels.sceneUntyped;

  if (slot.level === 1) return { color: storyColor, label: labels.story };
  if (slot.level === 2) {
    const parts = lockedParts(state);
    const i = parts.findIndex((p) => p.part_id === slot.partId);
    return {
      color: scenePalette[Math.max(0, i) % scenePalette.length]!,
      label: kindLabel(parts[i]?.scene_kind ?? null),
    };
  }
  const frases = productiveFrases(state);
  const j = frases.findIndex((f) => f.fr.prop_id === slot.propId);
  return {
    color: phrasePalette[Math.max(0, j) % phrasePalette.length]!,
    label: kindLabel(frases[j]?.scene.scene_kind ?? null),
  };
}
