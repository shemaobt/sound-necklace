/**
 * contracts/imports.ts — as duas formas de interoperabilidade com o pipeline
 * (§8.9 + §10.3), ports 1:1 dos handlers da referência
 * (docs/reference/index.html):
 *
 *  - ENTREGA (delivery, L1341–1360): propostas DESTRAVADAS. Spans vêm de
 *    `proposed_span` (senão null), prefills de tipo/tag preservados, `whole.id`
 *    sobrescrito quando `scene_id` existe, fallbacks `PT#`/`P#` por índice.
 *    Aviso de mismatch SÓ quando `manifest_id` existe e diverge — não bloqueia.
 *  - RETORNO (return, L1362–1383): confirmações TRAVADAS. Spans de
 *    `confirmed_span`, tudo `locked`, `partsConfirmed` quando há cenas, flags
 *    NEEDS_REVIEW reaplicadas por `prop_id`, cursor em frases. SEM checagem de
 *    manifest (espelho: a referência não avisa mismatch no retorno).
 *
 * Ambos exigem áudio já segmentado (grade presente) — senão a referência
 * recusa com cópia PT-BR própria. As cópias ficam expostas para a UI (ENG-248)
 * reusar. Os mappers recebem o DTO já validado pelo schema (a UI faz o parse);
 * spans/enums são validados no schema (validação na borda, §10.5).
 *
 * Importa apenas domain/ + zod (raiz).
 */

import { z } from 'zod';

import { SCENE_KINDS, type Frase, type ScenePart, type SessionState, type Whole } from '../domain';

const sceneKindValues = SCENE_KINDS.map((k) => k.value) as [string, ...string[]];

const ProposedSpanSchema = z.strictObject({
  start_bead: z.int().nonnegative(),
  end_bead: z.int().nonnegative(),
});

const ConfidenceSchema = z.enum(['alta', 'média', 'baixa']);
const TagStateSchema = z.enum(['pending', 'tagged', 'none_fit']);

/* ---------------- ENTREGA ---------------- */

const DeliveryPartSchema = z.object({
  part_id: z.string().optional(),
  proposed_span: ProposedSpanSchema.optional(),
  scene_kind: z.enum(sceneKindValues).nullish(),
  scene_kind_confidence: ConfidenceSchema.nullish(),
  tag_state: TagStateSchema.optional(),
});

const DeliveryPropositionSchema = z.object({
  prop_id: z.string().optional(),
  statement_pt: z.string().optional(),
  qa_readback_pt: z.array(z.string()).optional(),
  proposed_span: ProposedSpanSchema.optional(),
  part_link: z.string().nullish(),
});

export const DeliverySchema = z.object({
  manifest_id: z.string().optional(),
  scenes: z
    .array(
      z.object({
        scene_id: z.string().optional(),
        parts: z.array(DeliveryPartSchema).optional(),
        propositions: z.array(DeliveryPropositionSchema).optional(),
      }),
    )
    .optional(),
});

export type Delivery = z.infer<typeof DeliverySchema>;

/* ---------------- RETORNO ---------------- */

const ReturnPartSchema = z.object({
  part_id: z.string().optional(),
  confirmed_span: ProposedSpanSchema,
  scene_kind: z.enum(sceneKindValues).nullish(),
  scene_kind_confidence: ConfidenceSchema.nullish(),
  tag_state: TagStateSchema.optional(),
});

const ReturnPropositionSchema = z.object({
  prop_id: z.string(),
  confirmed_span: ProposedSpanSchema,
  part_link: z.string().nullish(),
});

export const ReturnSchema = z.object({
  manifest_id: z.string().optional(),
  story_slug: z.string().optional(),
  scenes: z
    .array(
      z.object({
        scene_id: z.string().optional(),
        confirmed_span: ProposedSpanSchema,
        parts: z.array(ReturnPartSchema).optional(),
        propositions: z.array(ReturnPropositionSchema).optional(),
      }),
    )
    .optional(),
  flags: z
    .array(z.object({ kind: z.literal('NEEDS_REVIEW'), prop_id: z.string(), note_pt: z.string() }))
    .optional(),
});

export type ReturnImport = z.infer<typeof ReturnSchema>;

/* ---------------- cópias + resultado ---------------- */

export const DELIVERY_NO_GRID_MSG = 'Segmente o áudio antes de carregar a entrega.';
export const RETURN_NO_GRID_MSG = 'Segmente o áudio antes de retomar.';
export const MANIFEST_MISMATCH_MSG =
  'Atenção: o manifest_id da entrega não bate com o do áudio. A grade pode estar diferente.';

export type ImportOutcome =
  { ok: false; reason: 'no-grid' } | { ok: true; state: SessionState; manifestMismatch: boolean };

/* ---------------- mappers ---------------- */

export function applyDelivery(session: SessionState, dto: Delivery): ImportOutcome {
  if (!session.totalBeads) return { ok: false, reason: 'no-grid' };
  const manifestMismatch = !!(dto.manifest_id && dto.manifest_id !== session.manifestId);

  const sc = dto.scenes?.[0] ?? null;
  if (!sc) return { ok: true, state: session, manifestMismatch };

  const parts: ScenePart[] = (sc.parts ?? []).map((pt, idx) => ({
    part_id: pt.part_id || `PT${idx + 1}`,
    span: pt.proposed_span
      ? { s: pt.proposed_span.start_bead, e: pt.proposed_span.end_bead }
      : null,
    locked: false,
    scene_kind: pt.scene_kind ?? null,
    scene_kind_confidence: pt.scene_kind_confidence ?? null,
    tag_state: pt.tag_state ?? 'pending',
  }));

  const frases: Frase[] = (sc.propositions ?? []).map((p, idx) => ({
    prop_id: p.prop_id || `P${idx + 1}`,
    statement_pt: p.statement_pt ?? '',
    qa: p.qa_readback_pt ?? [],
    span: p.proposed_span ? { s: p.proposed_span.start_bead, e: p.proposed_span.end_bead } : null,
    part_link: p.part_link ?? null,
    locked: false,
    flagged: false,
  }));

  const whole: Whole = { ...session.whole, id: (sc.scene_id ?? session.whole.id) as Whole['id'] };
  return { ok: true, state: { ...session, whole, parts, frases }, manifestMismatch };
}

export function applyReturn(session: SessionState, dto: ReturnImport): ImportOutcome {
  if (!session.totalBeads) return { ok: false, reason: 'no-grid' };

  const sc = dto.scenes?.[0] ?? null;
  let next = session;

  if (sc) {
    const parts: ScenePart[] = (sc.parts ?? []).map((pt, idx) => ({
      part_id: pt.part_id || `PT${idx + 1}`,
      span: { s: pt.confirmed_span.start_bead, e: pt.confirmed_span.end_bead },
      locked: true,
      scene_kind: pt.scene_kind ?? null,
      scene_kind_confidence: pt.scene_kind_confidence ?? null,
      tag_state: pt.tag_state ?? 'pending',
    }));
    const frases: Frase[] = (sc.propositions ?? []).map((p) => ({
      prop_id: p.prop_id,
      statement_pt: '',
      qa: [],
      span: { s: p.confirmed_span.start_bead, e: p.confirmed_span.end_bead },
      part_link: p.part_link ?? null,
      locked: true,
      flagged: false,
    }));
    next = {
      ...next,
      whole: {
        id: (sc.scene_id ?? 'S1') as Whole['id'],
        span: { s: sc.confirmed_span.start_bead, e: sc.confirmed_span.end_bead },
        confirmed: true,
      },
      parts,
      // a referência só liga partsConfirmed quando há cenas; nunca a desliga
      partsConfirmed: parts.length ? true : next.partsConfirmed,
      frases,
    };
  }

  // flags reaplicadas por prop_id (mesmo sem cena), depois o cursor vai a frases
  const flagged = new Set((dto.flags ?? []).map((f) => f.prop_id));
  next = {
    ...next,
    frases: next.frases.map((f) => (flagged.has(f.prop_id) ? { ...f, flagged: true } : f)),
    current: { layer: 'frases', index: -1 },
    selection: null,
  };

  return { ok: true, state: next, manifestMismatch: false };
}
