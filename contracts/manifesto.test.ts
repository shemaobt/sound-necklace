import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { buildBeads, createSession } from '../domain';

import { buildManifesto, canExportManifesto, ManifestoSchema } from './manifesto';
import { serializeArtifact } from './serialize';

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'manifesto');
const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(join(fixturesDir, name), 'utf8'));

function sessionOf(durationSec: number, beadSec: number) {
  return createSession({
    durationSec,
    beadSec,
    beads: buildBeads(durationSec, beadSec),
    manifestId: 'fnv1a32:0f2a9c3d',
    audioFilename: 'conto.wav',
    slug: 'conto',
  });
}

describe('ManifestoSchema — fixtures válida e inválidas', () => {
  it('aceita a fixture válida', () => {
    expect(ManifestoSchema.safeParse(fixture('valid.json')).success).toBe(true);
  });

  it.each([
    'invalid-missing-key.json',
    'invalid-extra-key.json',
    'invalid-type.json',
    'invalid-manifest-id.json',
  ])('rejeita %s', (name) => {
    expect(ManifestoSchema.safeParse(fixture(name)).success).toBe(false);
  });
});

describe('buildManifesto — espelho de buildManifest (referência L1316–1317)', () => {
  it('serializa byte-idêntico ao shape da referência, incl. conta parcial e ordem de chaves', () => {
    // 1.2 s a 0.25 s/conta: 4 contas cheias + parcial 1–1.2 (grid domain)
    const state = sessionOf(1.2, 0.25);
    const expected = JSON.stringify(
      {
        manifest_id: 'fnv1a32:0f2a9c3d',
        audio_filename: 'conto.wav',
        bead_duration_sec: 0.25,
        total_beads: 5,
        beads: [
          { index: 0, startTime: 0, endTime: 0.25 },
          { index: 1, startTime: 0.25, endTime: 0.5 },
          { index: 2, startTime: 0.5, endTime: 0.75 },
          { index: 3, startTime: 0.75, endTime: 1 },
          { index: 4, startTime: 1, endTime: 1.2 },
        ],
      },
      null,
      2,
    );
    expect(serializeArtifact(buildManifesto(state))).toBe(expected);
  });

  it('o manifesto construído passa no próprio schema', () => {
    expect(ManifestoSchema.safeParse(buildManifesto(sessionOf(1.2, 0.25))).success).toBe(true);
  });
});

describe('canExportManifesto — gate do dlManifest (referência L1331: !totalBeads → no-op)', () => {
  it('bloqueia sem grade (zero contas)', () => {
    expect(canExportManifesto(sessionOf(0, 0.25))).toBe(false);
  });

  it('libera com grade presente', () => {
    expect(canExportManifesto(sessionOf(1.2, 0.25))).toBe(true);
  });
});
