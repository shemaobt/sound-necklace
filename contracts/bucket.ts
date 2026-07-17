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
 * §6.1/§15.2 O8 (resolvido — tripod-api ENG-261): a granularidade vem da grade fixa
 * do tokenizador que acompanha cada áudio. `hop_sec` = segundos por frame (0.02 =
 * 20 ms); `granularity_frames` = frames por conta em cada nível, espelhando as
 * presets Small/Medium/Large do backend. O GranularityResolver (adapters/granularity)
 * resolve beadSec = frames[nível] × hop_sec.
 *
 * `codebook_version` é string (ex.: `terena-xlsr53-k100-v1`) — é metade da chave
 * primária do artefato de acousteme no pipeline; um int aqui seria uma versão que o
 * pipeline nunca minta (forma confirmada pelo OpenAPI real, contracts/generated/).
 */
export const AcoustemeGranularityFramesSchema = z.strictObject({
  small: z.int().positive(),
  medium: z.int().positive(),
  large: z.int().positive(),
});

export type AcoustemeGranularityFrames = z.infer<typeof AcoustemeGranularityFramesSchema>;

export const AcoustemeEnvelopeSchema = z.strictObject({
  codebook_version: z.string(),
  hop_sec: z.number().positive(),
  granularity_frames: AcoustemeGranularityFramesSchema,
});

export type AcoustemeEnvelope = z.infer<typeof AcoustemeEnvelopeSchema>;

/**
 * Nível de granularidade escolhido no setup (§8.1): NÃO há campo numérico de
 * "segundos por conta" — o usuário escolhe o nível e o resolver dá o beadSec.
 */
export const GranularityLevelSchema = z.enum(['small', 'medium', 'large']);

export type GranularityLevel = z.infer<typeof GranularityLevelSchema>;

/**
 * Uma entrada de áudio do bucket (§7.4). `consent_present` é a flag de consentimento
 * de COLETA que viaja com o áudio (§12/O6, assertada no vínculo `sn_audio_refs`) — a
 * setup a exibe/verifica. `acousteme` é null quando o áudio não tem dado de
 * granularidade (fallback do §6.1). `duration_sec` é anulável/opcional porque a API
 * valida na SAÍDA: um único áudio não-sondado reprovaria a listagem inteira — a
 * invariante mora na ingestão (forma real do OpenAPI; foi o que nos ensinou a não
 * ser mais estritos que o wire numa resposta).
 */
export const BucketAudioSchema = z.strictObject({
  id: z.string(),
  filename: z.string(),
  duration_sec: z.number().positive().nullable().optional(),
  consent_present: z.boolean(),
  acousteme: AcoustemeEnvelopeSchema.nullable().optional(),
});

export type BucketAudio = z.infer<typeof BucketAudioSchema>;

/** Resposta da listagem do bucket (o BucketSource lista para a setup). */
export const BucketListResponseSchema = z.strictObject({
  audios: z.array(BucketAudioSchema),
});

export type BucketListResponse = z.infer<typeof BucketListResponseSchema>;

/**
 * `GET /audios/{id}/url` — a API nunca serve os bytes do áudio: minta uma URL
 * assinada de curta duração e o adapter busca dela (2 saltos; o 2º sem Bearer).
 */
export const AudioUrlResponseSchema = z.strictObject({
  url: z.string(),
});

export type AudioUrlResponse = z.infer<typeof AudioUrlResponseSchema>;

/**
 * Os bytes do áudio buscados por id são OPACOS (§10.5, mesma custódia dos
 * artefatos): não há schema JSON — o adapter devolve o ArrayBuffer cru.
 */
export type BucketAudioBytes = ArrayBuffer;
