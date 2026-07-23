/**
 * anchoring-return.json — schema (PRD v2 §10.2) + mapper, port 1:1 de
 * buildReturn() da referência (docs/reference/index.html L1318–1329) e do gate
 * do dlReturn (L1332–1335).
 *
 * Regras espelhadas: só locked && span exporta (partes e frases);
 * parts[].scene_id é "S"+n sequencial pela ordem da lista (reatribuído no
 * export, distinto do part_id estável); propositions saem na ordem de CRIAÇÃO
 * global do array frases (não agrupadas por cena); `flags` permanece no schema
 * mas sai sempre vazio (o "⚑ marcar para revisão" foi removido na ENG-342);
 * o envelope tem exatamente UMA cena externa (whole.id + span do colar) e
 * story_slug CRU (o fallback "colar" é só de nome de arquivo, serialize.ts).
 */

import { z } from 'zod';

import { SCENE_KINDS, type SessionState } from '../domain';

const SpanSchema = z.strictObject({
  start_bead: z.int().nonnegative(),
  end_bead: z.int().nonnegative(),
});

/** Não há union type dos 27 kinds no domain (scene_kind é string|null na camada
 *  congelada) — o enum é derivado da lista GERADA `SCENE_KINDS`. */
const sceneKindValues = SCENE_KINDS.map((k) => k.value) as [string, ...string[]];

const PartSchema = z.strictObject({
  part_id: z.string().regex(/^PT[1-9]\d*$/),
  scene_id: z.string().regex(/^S[1-9]\d*$/),
  scene_kind: z.enum(sceneKindValues).nullable(),
  scene_kind_confidence: z.enum(['high', 'medium', 'low']).nullable(),
  tag_state: z.enum(['pending', 'tagged', 'none_fit']),
  confirmed_span: SpanSchema,
});

const PropositionSchema = z.strictObject({
  prop_id: z.string().regex(/^P[1-9]\d*$/),
  part_link: z
    .string()
    .regex(/^PT[1-9]\d*$/)
    .nullable(),
  confirmed_span: SpanSchema,
});

const FlagSchema = z.strictObject({
  kind: z.literal('NEEDS_REVIEW'),
  prop_id: z.string().regex(/^P[1-9]\d*$/),
  note: z.string(),
});

export const RetornoSchema = z.strictObject({
  manifest_id: z.string().regex(/^fnv1a32:[0-9a-f]{8}$/),
  story_slug: z.string(),
  // §10.2: o array externo contém exatamente uma cena — a história inteira
  scenes: z
    .array(
      z.strictObject({
        scene_id: z.string().regex(/^S[1-9]\d*$/),
        confirmed_span: SpanSchema,
        parts: z.array(PartSchema),
        propositions: z.array(PropositionSchema),
      }),
    )
    .length(1),
  flags: z.array(FlagSchema),
});

export type Retorno = z.infer<typeof RetornoSchema>;

export function buildRetorno(state: SessionState): Retorno {
  const parts: Retorno['scenes'][number]['parts'] = [];
  let sn = 0;
  for (const pt of state.parts) {
    if (pt.locked && pt.span) {
      sn++;
      parts.push({
        part_id: pt.part_id,
        scene_id: `S${sn}`,
        // ||null da referência: coage também string vazia (possível no tipo).
        // O tipo aqui é `string | null` (o enum é derivado em runtime, então a
        // inferência alarga p/ string) — os 27 kinds são impostos SÓ pelo
        // RetornoSchema, que a fiação do export valida (safeParse) antes de
        // serializar o literal ORIGINAL (nunca o resultado do parse).
        scene_kind: pt.scene_kind || null,
        scene_kind_confidence: pt.scene_kind_confidence || null,
        // referência coage tag_state||"pending"; TagState nunca é falsy no
        // domain, então a coação seria branch morto — bytes idênticos sem ela
        tag_state: pt.tag_state,
        confirmed_span: { start_bead: pt.span.s, end_bead: pt.span.e },
      });
    }
  }

  const propositions: Retorno['scenes'][number]['propositions'] = [];
  // O "⚑ marcar para revisão" saiu na ENG-342 — nada mais popula `flags`. O campo
  // permanece no schema/DTO (o Compilador o espera), sempre vazio.
  const flags: Retorno['flags'] = [];
  for (const p of state.frases) {
    if (p.locked && p.span) {
      propositions.push({
        prop_id: p.prop_id,
        part_link: p.part_link || null,
        confirmed_span: { start_bead: p.span.s, end_bead: p.span.e },
      });
    }
  }

  return {
    manifest_id: state.manifestId,
    story_slug: state.slug,
    scenes: [
      {
        scene_id: state.whole.id,
        confirmed_span: { start_bead: state.whole.span.s, end_bead: state.whole.span.e },
        parts,
        propositions,
      },
    ],
    flags,
  };
}

export interface RetornoExportStatus {
  /** gate do dlReturn: "Confirme o colar antes de exportar." quando falso */
  canExport: boolean;
  /** aviso não-bloqueante (L1335): frases destravadas com span ou texto */
  semFim: number;
}

export function retornoExportStatus(state: SessionState): RetornoExportStatus {
  return {
    canExport: state.whole.confirmed,
    semFim: state.frases.filter((p) => !p.locked && (p.span || p.statement.trim())).length,
  };
}
