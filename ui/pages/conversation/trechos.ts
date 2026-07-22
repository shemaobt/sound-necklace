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
 * Rótulos do eyebrow de bloco, agnósticos ao formato do número — cada superfície
 * decide se soletra ("Cena um", ouvinte/§9.2) ou usa dígito ("Cena 1", relatório
 * da facilitadora/§7.2). Recebem o número 1-based.
 */
export interface BlockLabels {
  /** o bloco da história (N1), sem número */
  story: string;
  /** "Cena {n}" no formato da superfície */
  scene: (num: number) => string;
  /** "Frase {n}" no formato da superfície */
  phrase: (num: number) => string;
}

/**
 * O eyebrow do bloco da pergunta ATUAL (protótipo `mapBlockEyebrow`) + a cor do
 * bloco, para o indicador de trecho e para os cabeçalhos do relatório: "A história
 * inteira" (N1), "Cena N · <tipo>" (N2) ou "Cena N · Frase M" (N3). A cena N é a
 * posição em lockedParts; a frase M é a posição DENTRO da cena-mãe (protótipo
 * `Frase j+1`). A cor casa com o segmento da barra (buildTrechos): cena por índice
 * em lockedParts, frase por índice achatado em productiveFrases.
 */
export function blockEyebrow(
  state: SessionState,
  slot: QuestionSlot,
  lang: string,
  labels: BlockLabels,
): { color: PaletteEntry; eyebrow: string } {
  if (slot.level === 1) return { color: storyColor, eyebrow: labels.story };
  const parts = lockedParts(state);
  if (slot.level === 2) {
    const i = Math.max(
      0,
      parts.findIndex((p) => p.part_id === slot.partId),
    );
    const base = labels.scene(i + 1);
    const kind = parts[i]?.scene_kind ?? null;
    return {
      color: scenePalette[i % scenePalette.length]!,
      eyebrow: kind ? `${base} · ${sceneKindLabel(kind, lang)}` : base,
    };
  }
  const frases = productiveFrases(state);
  const flat = Math.max(
    0,
    frases.findIndex((f) => f.fr.prop_id === slot.propId),
  );
  const sceneId = frases[flat]?.scene.part_id;
  const sceneNum =
    Math.max(
      0,
      parts.findIndex((p) => p.part_id === sceneId),
    ) + 1;
  const within = frases.filter((f) => f.scene.part_id === sceneId);
  const phraseNum =
    Math.max(
      0,
      within.findIndex((f) => f.fr.prop_id === slot.propId),
    ) + 1;
  return {
    color: phrasePalette[flat % phrasePalette.length]!,
    eyebrow: `${labels.scene(sceneNum)} · ${labels.phrase(phraseNum)}`,
  };
}
