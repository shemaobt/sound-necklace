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
    acousteme: { version: 1, data: { bead_sec: { media: 0.25 } } },
  };

  it('aceita um áudio válido', () => {
    expect(BucketAudioSchema.safeParse(valid).success).toBe(true);
  });

  it('aceita acousteme null (áudio sem dado de granularidade, §6.1)', () => {
    expect(BucketAudioSchema.safeParse({ ...valid, acousteme: null }).success).toBe(true);
  });

  it.each([
    ['chave faltando', (v: Record<string, unknown>) => delete v.consent_present],
    ['chave extra', (v: Record<string, unknown>) => (v.extra = 1)],
    ['duração não positiva', (v: Record<string, unknown>) => (v.duration_sec = 0)],
    ['consent com tipo errado', (v: Record<string, unknown>) => (v.consent_present = 'sim')],
  ])('rejeita: %s', (_label, mutate) => {
    const bad: Record<string, unknown> = { ...valid };
    mutate(bad);
    expect(BucketAudioSchema.safeParse(bad).success).toBe(false);
  });
});

describe('AcoustemeEnvelopeSchema — envelope versionado e opaco (§15.2 O8)', () => {
  it('é version-tagged: rejeita sem version', () => {
    expect(AcoustemeEnvelopeSchema.safeParse({ data: {} }).success).toBe(false);
  });

  it('deixa passar chaves internas desconhecidas de data sem validar (semântica O8 em aberto)', () => {
    const data = { foo: 1, aninhado: { bar: 'x' }, lista: [1, 2, 3], desconhecida: true };
    const parsed = AcoustemeEnvelopeSchema.parse({ version: 2, data });
    expect(parsed.data).toEqual(data);
  });

  it('rejeita chave extra no próprio envelope (strict)', () => {
    expect(AcoustemeEnvelopeSchema.safeParse({ version: 1, data: {}, extra: 1 }).success).toBe(
      false,
    );
  });
});

describe('GranularityLevelSchema — três níveis (§8.1)', () => {
  it.each(['pequena', 'media', 'grande'])('aceita %s', (lvl) => {
    expect(GranularityLevelSchema.safeParse(lvl).success).toBe(true);
  });

  it('rejeita nível fora do vocabulário', () => {
    expect(GranularityLevelSchema.safeParse('enorme').success).toBe(false);
  });
});
