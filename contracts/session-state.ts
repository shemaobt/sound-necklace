/**
 * contracts/session-state.ts — DTO versionado de autosave da sessão INTEIRA
 * (PRD v2 §7.3): tudo que é preciso para retomar de qualquer máquina.
 *
 * Sem referência 1:1 (o protótipo não persiste sessão): este é um formato
 * v2-novo. Ele carrega o `SessionState` do domínio round-trippável byte-a-byte
 * (o par `toSessionDto`/`fromSessionDto`) MAIS os campos que não vivem no
 * domínio mas o setup precisa para retomar — nível de granularidade (§8.1),
 * referência do áudio do bucket (§7.4), confirmação de consentimento de uso no
 * pipeline (§12/O6) e as referências de recurso de voz do Mapeamento (§10.4/O5).
 *
 * Custódia (§10.5): a API guarda este DTO de forma opaca; a SPA VALIDA na
 * leitura — daí o schema estrito (chave extra/tipo errado/version divergente
 * reprovam alto). Essa validação mora em `fromSessionDto`, que recebe `unknown`:
 * é o ÚNICO ponto por onde o documento vira estado do domínio, e o adapter
 * entrega o corpo cru sem parse (`http.ts`: "validado a fundo pela camada de
 * estado, não aqui"). Campos TRANSIENTES da referência NÃO são persistidos: o
 * marcador `warnedEmptyScene` (variável de módulo, L916) e o andaime de tela do
 * Mapeamento (`mapStep`/`mapN*i`) — reconstruídos ao reabrir a estação.
 *
 * VERSÕES (ENG-357). v1 = a forma PT-BR (`statement_pt`, confiança
 * `alta`/`média`/`baixa`); v2 = a forma inglesa que a ENG-356 introduziu. A
 * ENG-356 trocou a forma sem carimbar versão nova, então v1 e v2 conviveram
 * indistinguíveis por um commit — daí o bump aqui. A leitura aceita as duas e
 * normaliza para v2; a escrita só emite v2, então reabrir e salvar promove a
 * sessão. `SessionStateDtoSchema` (v2) permanece o schema canônico e RECUSA v1:
 * migrar é um passo explícito, nunca uma tolerância do schema.
 *
 * Importa apenas domain/ + zod (raiz) + o enum de granularidade do bucket.
 */

import { z } from 'zod';

import { SCENE_KINDS, type Mapping, type SessionState, type Whole } from '../domain';

import { GranularityLevelSchema, type GranularityLevel } from './bucket';

/** O enum dos 27 kinds é derivado da lista GERADA (idêntico ao retorno.ts). */
const sceneKindValues = SCENE_KINDS.map((k) => k.value) as [string, ...string[]];

const SpanSchema = z.strictObject({
  s: z.int().nonnegative(),
  e: z.int().nonnegative(),
});

const BeadSchema = z.strictObject({
  index: z.int().nonnegative(),
  startTime: z.number().nonnegative(),
  endTime: z.number().nonnegative(),
});

const WholeSchema = z.strictObject({
  // a referência sobrescreve whole.id com o scene_id da entrega (imports.ts) —
  // por isso string, não o literal 'S1' do domínio; o cast volta na leitura
  id: z.string(),
  span: SpanSchema,
  confirmed: z.boolean(),
});

const ScenePartSchema = z.strictObject({
  part_id: z.string(),
  span: SpanSchema.nullable(),
  locked: z.boolean(),
  scene_kind: z.enum(sceneKindValues).nullable(),
  scene_kind_confidence: z.enum(['high', 'medium', 'low']).nullable(),
  tag_state: z.enum(['pending', 'tagged', 'none_fit']),
});

const FraseSchema = z.strictObject({
  prop_id: z.string(),
  statement: z.string(),
  qa: z.array(z.string()),
  span: SpanSchema.nullable(),
  part_link: z.string().nullable(),
  locked: z.boolean(),
});

const MappingSchema = z.strictObject({
  level1: z.record(z.string(), z.string()),
  level2: z.record(z.string(), z.record(z.string(), z.string())),
  level3: z.record(z.string(), z.record(z.string(), z.string())),
});

export const SessionStateDtoSchema = z.strictObject({
  schema_version: z.literal(2),
  // grade + identidade
  durationSec: z.number().nonnegative(),
  beadSec: z.number().positive(),
  totalBeads: z.int().nonnegative(),
  beads: z.array(BeadSchema),
  manifestId: z.string(),
  audioFilename: z.string(),
  slug: z.string(),
  // hierarquia
  whole: WholeSchema,
  parts: z.array(ScenePartSchema),
  partsConfirmed: z.boolean(),
  frases: z.array(FraseSchema),
  // cursor + fase
  current: z.strictObject({
    layer: z.enum(['whole', 'parts', 'frases']),
    index: z.int().gte(-1),
  }),
  activeSceneId: z.string().nullable(),
  mapping: MappingSchema.nullable(),
  selection: SpanSchema.nullable(),
  pendingStart: z.int().nonnegative().nullable(),
  mode: z.enum(['escuta', 'triagem', 'segmentacao', 'mapeamento']),
  review: z.boolean(),
  // meta v2-novo (fora do domínio)
  granularityLevel: GranularityLevelSchema,
  bucketAudioId: z.string(),
  pipelineConsent: z.boolean(),
  voice: z.array(z.string()),
});

export type SessionStateDto = z.infer<typeof SessionStateDtoSchema>;

/* ---------------- v1 legado (ENG-357) ---------------- */

/** A confiança como o v1 a gravava; a ordem casa com o enum inglês do v2. */
const LEGACY_CONFIDENCE = { alta: 'high', média: 'medium', baixa: 'low' } as const;

/** v1 difere do v2 em DOIS campos e mais nada — o resto é reusado, para que uma
 *  mudança futura no formato não precise ser espelhada aqui. */
const LegacyScenePartSchema = ScenePartSchema.extend({
  scene_kind_confidence: z.enum(['alta', 'média', 'baixa']).nullable(),
});

const LegacyFraseSchema = FraseSchema.omit({ statement: true }).extend({
  statement_pt: z.string(),
});

const SessionStateDtoV1Schema = SessionStateDtoSchema.extend({
  schema_version: z.literal(1),
  parts: z.array(LegacyScenePartSchema),
  frases: z.array(LegacyFraseSchema),
});

/** Traz um documento v1 para a forma v2. Só toca o que mudou de nome/vocabulário. */
function upgradeV1(dto: z.infer<typeof SessionStateDtoV1Schema>): SessionStateDto {
  return {
    ...dto,
    schema_version: 2,
    parts: dto.parts.map((p) => ({
      ...p,
      scene_kind_confidence: p.scene_kind_confidence
        ? LEGACY_CONFIDENCE[p.scene_kind_confidence]
        : null,
    })),
    frases: dto.frases.map(({ statement_pt, ...rest }) => ({ ...rest, statement: statement_pt })),
  };
}

/**
 * Valida o documento persistido e o entrega SEMPRE na forma v2. Aceita v1 e o
 * promove; qualquer outra coisa (versão desconhecida, chave extra, tipo errado)
 * reprova alto — corromper em silêncio é pior que falhar ao retomar.
 */
function parseSessionDto(raw: unknown): SessionStateDto {
  const v2 = SessionStateDtoSchema.safeParse(raw);
  if (v2.success) return v2.data;
  const v1 = SessionStateDtoV1Schema.safeParse(raw);
  if (v1.success) return upgradeV1(v1.data);
  // o erro do v2 é o útil: v1 é o caminho de exceção, não o esperado
  throw new Error(`estado de sessão inválido: ${v2.error.message}`);
}

/** Campos de sessão que não vivem no `SessionState` do domínio (§7.3). */
export interface SessionMeta {
  granularityLevel: GranularityLevel;
  bucketAudioId: string;
  /** referências de recurso de voz já gravadas (§10.4/O5), ex.: respostas/level1/<k>.webm */
  voice: string[];
  pipelineConsent: boolean;
}

export function toSessionDto(state: SessionState, meta: SessionMeta): SessionStateDto {
  return {
    schema_version: 2,
    durationSec: state.durationSec,
    beadSec: state.beadSec,
    totalBeads: state.totalBeads,
    beads: state.beads.map((b) => ({ index: b.index, startTime: b.startTime, endTime: b.endTime })),
    manifestId: state.manifestId,
    audioFilename: state.audioFilename,
    slug: state.slug,
    whole: { id: state.whole.id, span: { ...state.whole.span }, confirmed: state.whole.confirmed },
    parts: state.parts.map((p) => ({
      part_id: p.part_id,
      span: p.span ? { ...p.span } : null,
      locked: p.locked,
      scene_kind: p.scene_kind,
      scene_kind_confidence: p.scene_kind_confidence,
      tag_state: p.tag_state,
    })),
    partsConfirmed: state.partsConfirmed,
    frases: state.frases.map((f) => ({
      prop_id: f.prop_id,
      statement: f.statement,
      qa: [...f.qa],
      span: f.span ? { ...f.span } : null,
      part_link: f.part_link,
      locked: f.locked,
    })),
    current: { layer: state.current.layer, index: state.current.index },
    activeSceneId: state.activeSceneId,
    mapping: cloneMapping(state.mapping),
    selection: state.selection ? { ...state.selection } : null,
    pendingStart: state.pendingStart,
    mode: state.mode,
    review: state.review,
    granularityLevel: meta.granularityLevel,
    bucketAudioId: meta.bucketAudioId,
    pipelineConsent: meta.pipelineConsent,
    voice: [...meta.voice],
  };
}

/**
 * O documento persistido vira estado do domínio. Recebe `unknown` de propósito:
 * este é o ponto de validação da borda de leitura (§10.5) — o adapter entrega o
 * corpo cru. Aceita v1 e v2; devolve sempre o estado da forma corrente.
 */
export function fromSessionDto(raw: unknown): { state: SessionState; meta: SessionMeta } {
  const dto = parseSessionDto(raw);
  const state: SessionState = {
    durationSec: dto.durationSec,
    beadSec: dto.beadSec,
    totalBeads: dto.totalBeads,
    beads: dto.beads.map((b) => ({ index: b.index, startTime: b.startTime, endTime: b.endTime })),
    manifestId: dto.manifestId,
    audioFilename: dto.audioFilename,
    slug: dto.slug,
    // o domínio tipa whole.id como o literal 'S1'; imports pode tê-lo trocado
    whole: {
      id: dto.whole.id as Whole['id'],
      span: { ...dto.whole.span },
      confirmed: dto.whole.confirmed,
    },
    parts: dto.parts.map((p) => ({
      part_id: p.part_id,
      span: p.span ? { ...p.span } : null,
      locked: p.locked,
      scene_kind: p.scene_kind,
      scene_kind_confidence: p.scene_kind_confidence,
      tag_state: p.tag_state,
    })),
    partsConfirmed: dto.partsConfirmed,
    frases: dto.frases.map((f) => ({
      prop_id: f.prop_id,
      statement: f.statement,
      qa: [...f.qa],
      span: f.span ? { ...f.span } : null,
      part_link: f.part_link,
      locked: f.locked,
    })),
    current: { layer: dto.current.layer, index: dto.current.index },
    activeSceneId: dto.activeSceneId,
    mapping: cloneMapping(dto.mapping),
    selection: dto.selection ? { ...dto.selection } : null,
    pendingStart: dto.pendingStart,
    mode: dto.mode,
    review: dto.review,
  };
  const meta: SessionMeta = {
    granularityLevel: dto.granularityLevel,
    bucketAudioId: dto.bucketAudioId,
    pipelineConsent: dto.pipelineConsent,
    voice: [...dto.voice],
  };
  return { state, meta };
}

function cloneMapping(m: Mapping | null): Mapping | null {
  if (!m) return null;
  const cloneL2 = (
    r: Record<string, Record<string, string>>,
  ): Record<string, Record<string, string>> =>
    Object.fromEntries(Object.entries(r).map(([k, v]) => [k, { ...v }]));
  return { level1: { ...m.level1 }, level2: cloneL2(m.level2), level3: cloneL2(m.level3) };
}
