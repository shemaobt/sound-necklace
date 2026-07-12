/**
 * contracts/bucket.ts — DTOs PROVISÓRIOS do bucket de áudios do projeto (§7.4).
 *
 * PROVISIONAL: substituído pelos tipos gerados do OpenAPI do tripod-api quando os
 * DTOs do ENG-211 chegarem (PRD §5, code-first). Até lá, estes schemas + as
 * fixtures em contracts/fixtures/api/ destravam a trilha de adapters/UI. Os
 * adapters importam SOMENTE os tipos aqui, para que a troca seja contida.
 *
 * Importa apenas zod (raiz). O acousteme viaja como envelope versionado com a grade
 * de granularidade do tokenizador (§6.1/§15.2 O8, resolvido — ver AcoustemeEnvelope).
 */

import { z } from 'zod';

/**
 * §6.1/§15.2 O8 (resolvido — tripod-api PR #100 "acousteme artifact + consumption
 * API"): a granularidade vem da grade fixa do tokenizador que acompanha cada áudio.
 * `hop_sec` = segundos por frame (0.02 = 20 ms); `granularity_frames` = frames por
 * conta em cada nível, espelhando as presets Small/Medium/Large do backend. O
 * GranularityResolver (adapters/granularity) resolve beadSec = frames[nível] × hop_sec.
 *
 * `version` tolera codebooks futuros. NOTA (ENG-247): o tripod-api serve isto como
 * `AcoustemeStreamResponse`, com `codebook_version: string` (aqui `version: int`) e
 * campos extra (download_url, num_frames…) que o MVP não consome — os tipos gerados
 * do OpenAPI reconciliam a divergência.
 */
export const AcoustemeGranularityFramesSchema = z.strictObject({
  small: z.int().positive(),
  medium: z.int().positive(),
  large: z.int().positive(),
});

export type AcoustemeGranularityFrames = z.infer<typeof AcoustemeGranularityFramesSchema>;

export const AcoustemeEnvelopeSchema = z.strictObject({
  version: z.int().positive(),
  hop_sec: z.number().positive(),
  granularity_frames: AcoustemeGranularityFramesSchema,
});

export type AcoustemeEnvelope = z.infer<typeof AcoustemeEnvelopeSchema>;

/**
 * Nível de granularidade escolhido no setup (§8.1): NÃO há campo numérico de
 * "segundos por conta" — o usuário escolhe o nível e o resolver dá o beadSec.
 */
export const GranularityLevelSchema = z.enum(['pequena', 'media', 'grande']);

export type GranularityLevel = z.infer<typeof GranularityLevelSchema>;

/**
 * Uma entrada de áudio do bucket (§7.4). `consent_present` é a flag de consentimento
 * de COLETA que viaja com o áudio desde o Oral Collector (§12/O6) — a setup a
 * exibe/verifica. `acousteme` é null quando o áudio não tem dado de granularidade
 * (caso de borda no MVP; normal para uploads pós-MVP — §6.1).
 */
export const BucketAudioSchema = z.strictObject({
  id: z.string(),
  filename: z.string(),
  duration_sec: z.number().positive(),
  consent_present: z.boolean(),
  acousteme: AcoustemeEnvelopeSchema.nullable(),
});

export type BucketAudio = z.infer<typeof BucketAudioSchema>;

/** Resposta da listagem do bucket (o BucketSource lista para a setup). */
export const BucketListResponseSchema = z.strictObject({
  audios: z.array(BucketAudioSchema),
});

export type BucketListResponse = z.infer<typeof BucketListResponseSchema>;

/**
 * Os bytes do áudio buscados por id são OPACOS (§10.5, mesma custódia dos
 * artefatos): não há schema JSON — o adapter devolve o ArrayBuffer cru.
 */
export type BucketAudioBytes = ArrayBuffer;
