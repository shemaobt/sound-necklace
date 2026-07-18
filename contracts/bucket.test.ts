import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  AcoustemeEnvelopeSchema,
  BucketAudioSchema,
  BucketListResponseSchema,
  GranularityLevelSchema,
} from './bucket';

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'api');
const bucketList = (): unknown =>
  JSON.parse(readFileSync(join(fixturesDir, 'bucket-list.json'), 'utf8'));

describe('BucketListResponseSchema — fixture compartilhada com os adapters (ENG-241)', () => {
  it('aceita a lista de áudios do bucket (com e sem acousteme)', () => {
    expect(BucketListResponseSchema.safeParse(bucketList()).success).toBe(true);
  });

  it('a fixture traz ao menos um áudio com acousteme e um sem (consent variado)', () => {
    const parsed = BucketListResponseSchema.parse(bucketList());
    expect(parsed.audios.some((a) => a.acousteme !== null)).toBe(true);
    expect(parsed.audios.some((a) => a.acousteme === null)).toBe(true);
    expect(parsed.audios.some((a) => a.consent_present === false)).toBe(true);
  });
});

describe('BucketAudioSchema — válida e inválidas', () => {
  const valid = {
    id: 'aud_x',
    filename: 'conto.wav',
    duration_sec: 12.5,
    consent_present: true,
    acousteme: {
      codebook_version: 'terena-xlsr53-k100-v1',
      hop_sec: 0.02,
      granularity_frames: { small: 10, medium: 25, large: 50 },
    },
  };

  it('aceita um áudio válido', () => {
    expect(BucketAudioSchema.safeParse(valid).success).toBe(true);
  });

  it('aceita acousteme null (áudio sem dado de granularidade, §6.1)', () => {
    expect(BucketAudioSchema.safeParse({ ...valid, acousteme: null }).success).toBe(true);
  });

  it('aceita duration_sec null/ausente (áudio não-sondado — a API valida na saída)', () => {
    expect(BucketAudioSchema.safeParse({ ...valid, duration_sec: null }).success).toBe(true);
    // fiel ao fio (OpenAPI aceita 0): uma linha degenerada não derruba a listagem
    expect(BucketAudioSchema.safeParse({ ...valid, duration_sec: 0 }).success).toBe(true);
    const semDuracao: Record<string, unknown> = { ...valid };
    delete semDuracao.duration_sec;
    expect(BucketAudioSchema.safeParse(semDuracao).success).toBe(true);
    const semAcousteme: Record<string, unknown> = { ...valid };
    delete semAcousteme.acousteme;
    expect(BucketAudioSchema.safeParse(semAcousteme).success).toBe(true);
  });

  it.each([
    ['chave faltando', (v: Record<string, unknown>) => delete v.consent_present],
    ['chave extra', (v: Record<string, unknown>) => (v.extra = 1)],
    ['duração com tipo errado', (v: Record<string, unknown>) => (v.duration_sec = '12')],
    ['consent com tipo errado', (v: Record<string, unknown>) => (v.consent_present = 'sim')],
  ])('rejeita: %s', (_label, mutate) => {
    const bad: Record<string, unknown> = { ...valid };
    mutate(bad);
    expect(BucketAudioSchema.safeParse(bad).success).toBe(false);
  });
});

describe('AcoustemeEnvelopeSchema — grade de granularidade do tokenizador (§6.1/O8)', () => {
  const env = {
    codebook_version: 'terena-xlsr53-k100-v1',
    hop_sec: 0.02,
    granularity_frames: { small: 10, medium: 25, large: 50 },
  };

  it('aceita um envelope com codebook_version (string do pipeline), hop_sec e as três presets', () => {
    expect(AcoustemeEnvelopeSchema.safeParse(env).success).toBe(true);
  });

  it('rejeita a forma antiga com version numérico', () => {
    const antigo: Record<string, unknown> = { ...env, version: 1 };
    delete antigo.codebook_version;
    expect(AcoustemeEnvelopeSchema.safeParse(antigo).success).toBe(false);
  });

  it('exige codebook_version, hop_sec e granularity_frames', () => {
    expect(
      AcoustemeEnvelopeSchema.safeParse({
        hop_sec: 0.02,
        granularity_frames: { small: 10, medium: 25, large: 50 },
      }).success,
    ).toBe(false); // sem codebook_version
    expect(
      AcoustemeEnvelopeSchema.safeParse({
        codebook_version: 'terena-xlsr53-k100-v1',
        granularity_frames: { small: 10, medium: 25, large: 50 },
      }).success,
    ).toBe(false); // sem hop_sec
    expect(
      AcoustemeEnvelopeSchema.safeParse({
        codebook_version: 'terena-xlsr53-k100-v1',
        hop_sec: 0.02,
      }).success,
    ).toBe(false); // sem frames
  });

  it('rejeita hop_sec não positivo e frames não inteiros ou não positivos', () => {
    expect(AcoustemeEnvelopeSchema.safeParse({ ...env, hop_sec: 0 }).success).toBe(false);
    expect(
      AcoustemeEnvelopeSchema.safeParse({
        ...env,
        granularity_frames: { small: 0, medium: 25, large: 50 },
      }).success,
    ).toBe(false);
    expect(
      AcoustemeEnvelopeSchema.safeParse({
        ...env,
        granularity_frames: { small: 10.5, medium: 25, large: 50 },
      }).success,
    ).toBe(false);
  });

  it('rejeita chave extra no envelope e nas presets (strict)', () => {
    expect(AcoustemeEnvelopeSchema.safeParse({ ...env, extra: 1 }).success).toBe(false);
    expect(
      AcoustemeEnvelopeSchema.safeParse({
        ...env,
        granularity_frames: { small: 10, medium: 25, large: 50, huge: 99 },
      }).success,
    ).toBe(false);
  });
});

describe('GranularityLevelSchema — três níveis (§8.1)', () => {
  it.each(['small', 'medium', 'large'])('aceita %s', (lvl) => {
    expect(GranularityLevelSchema.safeParse(lvl).success).toBe(true);
  });

  it('rejeita nível fora do vocabulário', () => {
    expect(GranularityLevelSchema.safeParse('enorme').success).toBe(false);
  });
});
