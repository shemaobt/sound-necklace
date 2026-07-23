import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  buildBeads,
  createSession,
  type Frase,
  type ScenePart,
  type SessionState,
} from '../domain';

import { buildRetorno, retornoExportStatus, RetornoSchema } from './retorno';

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'retorno');
const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(join(fixturesDir, name), 'utf8'));

function session(overrides: Partial<SessionState> = {}): SessionState {
  const base = createSession({
    durationSec: 12,
    beadSec: 0.5,
    beads: buildBeads(12, 0.5), // 24 contas
    manifestId: 'fnv1a32:d31a8419',
    audioFilename: 'fluxo-minimo.wav',
    slug: 'fluxo-minimo',
  });
  return { ...base, ...overrides };
}

function part(overrides: Partial<ScenePart> & { part_id: string }): ScenePart {
  return {
    span: null,
    locked: false,
    scene_kind: null,
    scene_kind_confidence: null,
    tag_state: 'pending',
    ...overrides,
  };
}

function frase(overrides: Partial<Frase> & { prop_id: string }): Frase {
  return {
    statement: '',
    qa: [],
    span: null,
    part_link: null,
    locked: false,
    ...overrides,
  };
}

describe('RetornoSchema — fixtures válida e inválidas', () => {
  it('aceita a fixture válida (espelho do golden minimal-flow)', () => {
    expect(RetornoSchema.safeParse(fixture('valid.json')).success).toBe(true);
  });

  it.each([
    'invalid-enum.json',
    'invalid-scene-kind.json', // "RESPIGA" fora dos 27 kinds gerados
    'invalid-missing-key.json',
    'invalid-extra-key.json',
    'invalid-two-scenes.json', // §10.2: exatamente UMA cena externa
    'invalid-id-pattern.json', // PT0 viola ^PT[1-9]\d*$
  ])('rejeita %s', (name) => {
    expect(RetornoSchema.safeParse(fixture(name)).success).toBe(false);
  });
});

describe('buildRetorno — espelho de buildReturn (referência L1318–1329)', () => {
  it('pula partes não travadas no meio e renumera S# pela ordem da lista', () => {
    const st = session({
      parts: [
        part({ part_id: 'PT1', span: { s: 0, e: 4 }, locked: true }),
        part({ part_id: 'PT2', span: { s: 5, e: 9 }, locked: false }),
        part({ part_id: 'PT3', span: { s: 10, e: 23 }, locked: true }),
      ],
    });
    const parts = buildRetorno(st).scenes[0]!.parts;
    expect(parts.map((p) => [p.part_id, p.scene_id])).toEqual([
      ['PT1', 'S1'],
      ['PT3', 'S2'],
    ]);
  });

  it('none_fit exporta scene_kind e confiança null; tagged exporta os valores', () => {
    const st = session({
      parts: [
        part({
          part_id: 'PT1',
          span: { s: 0, e: 9 },
          locked: true,
          scene_kind: 'GLEANING_SCENE',
          scene_kind_confidence: 'medium',
          tag_state: 'tagged',
        }),
        part({ part_id: 'PT2', span: { s: 10, e: 23 }, locked: true, tag_state: 'none_fit' }),
      ],
    });
    const parts = buildRetorno(st).scenes[0]!.parts;
    expect(parts[0]).toMatchObject({
      scene_kind: 'GLEANING_SCENE',
      scene_kind_confidence: 'medium',
      tag_state: 'tagged',
    });
    expect(parts[1]).toMatchObject({
      scene_kind: null,
      scene_kind_confidence: null,
      tag_state: 'none_fit',
    });
  });

  it('flags sai sempre vazio (o ⚑ foi removido na ENG-342)', () => {
    const st = session({
      frases: [frase({ prop_id: 'P1', span: { s: 0, e: 4 }, locked: true, part_link: 'PT1' })],
    });
    expect(buildRetorno(st).flags).toEqual([]);
  });

  it('propositions saem na ordem de CRIAÇÃO global, não agrupadas por cena', () => {
    const st = session({
      frases: [
        frase({ prop_id: 'P1', span: { s: 10, e: 12 }, part_link: 'PT2', locked: true }),
        frase({ prop_id: 'P2', span: { s: 0, e: 4 }, part_link: 'PT1', locked: true }),
        frase({ prop_id: 'P3', span: { s: 13, e: 14 }, part_link: 'PT2', locked: true }),
      ],
    });
    expect(buildRetorno(st).scenes[0]!.propositions.map((p) => p.prop_id)).toEqual([
      'P1',
      'P2',
      'P3',
    ]);
  });

  it('frase travada sem part_link exporta part_link null; destravada não vira proposition', () => {
    const st = session({
      frases: [
        frase({ prop_id: 'P1', span: { s: 0, e: 2 }, locked: true }),
        frase({ prop_id: 'P2', span: { s: 3, e: 4 }, locked: false }),
      ],
    });
    expect(buildRetorno(st).scenes[0]!.propositions).toEqual([
      { prop_id: 'P1', part_link: null, confirmed_span: { start_bead: 0, end_bead: 2 } },
    ]);
  });

  it('envelope: exatamente uma cena externa (whole.id, span do colar) e story_slug CRU', () => {
    const st = session({ slug: '' }); // sem fallback no JSON — "colar" é só nome de arquivo
    const ret = buildRetorno(st);
    expect(ret.manifest_id).toBe('fnv1a32:d31a8419');
    expect(ret.story_slug).toBe('');
    expect(ret.scenes).toHaveLength(1);
    expect(ret.scenes[0]).toMatchObject({
      scene_id: 'S1',
      confirmed_span: { start_bead: 0, end_bead: 23 },
    });
  });

  it('o retorno construído pelo mapper passa no próprio schema', () => {
    const st = session({
      whole: { id: 'S1', span: { s: 0, e: 23 }, confirmed: true },
      parts: [
        part({
          part_id: 'PT1',
          span: { s: 0, e: 9 },
          locked: true,
          scene_kind: 'GLEANING_SCENE',
          scene_kind_confidence: 'medium',
          tag_state: 'tagged',
        }),
      ],
    });
    expect(RetornoSchema.safeParse(buildRetorno(st)).success).toBe(true);
  });

  it('scene_kind string vazia coage para null (||null da referência); locked sem span não exporta', () => {
    const st = session({
      parts: [
        part({ part_id: 'PT1', span: { s: 0, e: 9 }, locked: true, scene_kind: '' }),
        part({ part_id: 'PT2', span: null, locked: true }),
      ],
      frases: [frase({ prop_id: 'P1', span: null, locked: true })],
    });
    const ret = buildRetorno(st);
    expect(ret.scenes[0]!.parts).toHaveLength(1);
    expect(ret.scenes[0]!.parts[0]).toMatchObject({ part_id: 'PT1', scene_kind: null });
    expect(ret.scenes[0]!.propositions).toEqual([]);
  });
});

describe('retornoExportStatus — gate do dlReturn (referência L1332–1335)', () => {
  it('bloqueia sem o colar confirmado', () => {
    expect(retornoExportStatus(session()).canExport).toBe(false);
  });

  it('libera com o colar confirmado', () => {
    const st = session({ whole: { id: 'S1', span: { s: 0, e: 23 }, confirmed: true } });
    expect(retornoExportStatus(st).canExport).toBe(true);
  });

  it('semFim conta frases destravadas com span OU statement não-branco; travadas não', () => {
    const st = session({
      whole: { id: 'S1', span: { s: 0, e: 23 }, confirmed: true },
      frases: [
        frase({ prop_id: 'P1', span: { s: 0, e: 2 } }), // destravada com span → conta
        frase({ prop_id: 'P2', statement: 'uma frase dita' }), // texto não-branco → conta
        frase({ prop_id: 'P3', statement: '   ' }), // só espaços → NÃO conta
        frase({ prop_id: 'P4', span: { s: 3, e: 4 }, locked: true }), // travada → NÃO conta
        frase({ prop_id: 'P5' }), // vazia → NÃO conta
      ],
    });
    expect(retornoExportStatus(st).semFim).toBe(2);
  });
});
