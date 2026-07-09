/**
 * Ontologia de scene_kind da Camada de Triagem de Rute — port 1:1 da referência
 * (docs/reference/index.html): `SCENE_KINDS` L355–366, `SK_PT` L1194–1206,
 * `skEnShort`/`skShort` L1207–1208, `T_TARGET` L1188. PRD v2 §6.6, §8.5, §11.
 *
 * `SCENE_KINDS` é GERADO de `_spec/scene-kind-palette.json` (pin do Compilador
 * 5314907, eixo scene_kind) — NÃO editar à mão; regerar via a ferramenta. O
 * `value` (inglês) é o contrato com o Compilador e é exportado verbatim; os
 * rótulos `SK_PT` são SÓ exibição e nunca tocam o dado gravado.
 */

export type Tier = 'ALTA' | 'comum';

export interface SceneKind {
  value: string;
  tier: Tier;
}

export const SCENE_KINDS: readonly SceneKind[] = [
  { value: 'BIRTH_SCENE', tier: 'ALTA' },
  { value: 'CONSENT_SCENE', tier: 'ALTA' },
  { value: 'DEPARTURE_SCENE', tier: 'ALTA' },
  { value: 'GATE_COURT_CONVENING_SCENE', tier: 'ALTA' },
  { value: 'GENEALOGY_SCENE', tier: 'ALTA' },
  { value: 'GLEANING_SCENE', tier: 'ALTA' },
  { value: 'INITIATIVE_SCENE', tier: 'ALTA' },
  { value: 'LAMENT_SCENE', tier: 'ALTA' },
  { value: 'MARRIAGE_SCENE', tier: 'ALTA' },
  { value: 'MEAL_SCENE', tier: 'ALTA' },
  { value: 'NAMING_SCENE', tier: 'ALTA' },
  { value: 'NARRATOR_INTRODUCTION_SCENE', tier: 'ALTA' },
  { value: 'NIGHT_APPROACH_SCENE', tier: 'ALTA' },
  { value: 'OPENING_CHRONICLE_SCENE', tier: 'ALTA' },
  { value: 'PROVISION_HOMECOMING_SCENE', tier: 'ALTA' },
  { value: 'REDEEMER_RECOGNITION_SCENE', tier: 'ALTA' },
  { value: 'REDEMPTION_DECLINE_SCENE', tier: 'ALTA' },
  { value: 'REDEMPTION_OFFER_SCENE', tier: 'ALTA' },
  { value: 'VOW_SCENE', tier: 'ALTA' },
  { value: 'APPEAL_SCENE', tier: 'comum' },
  { value: 'BLESSING_SCENE', tier: 'comum' },
  { value: 'INSTRUCTION_SCENE', tier: 'comum' },
  { value: 'RATIFICATION_SCENE', tier: 'comum' },
  { value: 'ARRIVAL_SCENE', tier: 'comum' },
  { value: 'BEREAVEMENT_SCENE', tier: 'comum' },
  { value: 'NARRATOR_FRAMING_CLOSE_SCENE', tier: 'comum' },
  { value: 'REPORT_SCENE', tier: 'comum' },
];

/** Rótulos PT-BR — SÓ EXIBIÇÃO (o inglês fica no dado e no title/hover). */
export const SK_PT: Record<string, string> = {
  BIRTH_SCENE: 'Nascimento',
  CONSENT_SCENE: 'Consentimento',
  DEPARTURE_SCENE: 'Partida',
  GATE_COURT_CONVENING_SCENE: 'Convocação do tribunal na porta',
  GENEALOGY_SCENE: 'Genealogia',
  GLEANING_SCENE: 'Respiga',
  INITIATIVE_SCENE: 'Iniciativa',
  LAMENT_SCENE: 'Lamento',
  MARRIAGE_SCENE: 'Casamento',
  MEAL_SCENE: 'Refeição',
  NAMING_SCENE: 'Nomeação',
  NARRATOR_INTRODUCTION_SCENE: 'Introdução do narrador',
  NIGHT_APPROACH_SCENE: 'Aproximação noturna',
  OPENING_CHRONICLE_SCENE: 'Crônica de abertura',
  PROVISION_HOMECOMING_SCENE: 'Provisão e retorno ao lar',
  REDEEMER_RECOGNITION_SCENE: 'Reconhecimento do resgatador',
  REDEMPTION_DECLINE_SCENE: 'Recusa do resgate',
  REDEMPTION_OFFER_SCENE: 'Oferta de resgate',
  VOW_SCENE: 'Voto',
  APPEAL_SCENE: 'Apelo',
  BLESSING_SCENE: 'Bênção',
  INSTRUCTION_SCENE: 'Instrução',
  RATIFICATION_SCENE: 'Ratificação',
  ARRIVAL_SCENE: 'Chegada',
  BEREAVEMENT_SCENE: 'Luto',
  NARRATOR_FRAMING_CLOSE_SCENE: 'Fechamento do narrador',
  REPORT_SCENE: 'Relato',
};

/** Fallback em inglês curto quando não há rótulo PT-BR (bytes do relatório
 *  dependem disto — ENG-233). */
export function skEnShort(v: string): string {
  return v
    .replace(/_SCENE$/, '')
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/^./, (m) => m.toUpperCase());
}

export function skShort(v: string): string {
  return SK_PT[v] || skEnShort(v);
}

/** Alvos de cobertura de firmeza por tier (ALTA exibe "1–2"; comum, "3"). */
export const T_TARGET: Record<Tier, number> = { ALTA: 1, comum: 3 };
