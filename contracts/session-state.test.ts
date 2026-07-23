import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  buildBeads,
  createSession,
  type Frase,
  type Mapping,
  type ScenePart,
  type SessionState,
  type Whole,
} from '../domain';

import { serializeArtifact } from './serialize';
import {
  fromSessionDto,
  SessionStateDtoSchema,
  toSessionDto,
  type SessionMeta,
} from './session-state';

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'session-state');
const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(join(fixturesDir, name), 'utf8'));

function baseSession(overrides: Partial<SessionState> = {}): SessionState {
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

const meta = (overrides: Partial<SessionMeta> = {}): SessionMeta => ({
  granularityLevel: 'medium',
  bucketAudioId: 'aud-123',
  pipelineConsent: true,
  voice: [],
  ...overrides,
});

/** Variedade de estados que exercita cada campo round-trippável do domínio. */
const variety: Array<{ name: string; state: SessionState; meta: SessionMeta }> = [
  { name: 'sessão recém-criada (escuta)', state: baseSession(), meta: meta() },
  {
    // whole.id round-trip é o ÚNICO campo não-trivial: o domínio o tipa 'S1',
    // mas a entrega o sobrescreve com um scene_id externo — o DTO guarda string
    name: 'whole.id sobrescrito por entrega (não-S1)',
    state: baseSession({
      whole: { id: 'CENA-EXTERNA' as Whole['id'], span: { s: 0, e: 23 }, confirmed: false },
    }),
    meta: meta(),
  },
  {
    name: 'cenas travadas + slot destravado + none_fit',
    state: baseSession({
      whole: { id: 'S1', span: { s: 0, e: 23 }, confirmed: true },
      parts: [
        part({
          part_id: 'PT1',
          span: { s: 0, e: 9 },
          locked: true,
          scene_kind: 'GLEANING_SCENE',
          scene_kind_confidence: 'high',
          tag_state: 'tagged',
        }),
        part({ part_id: 'PT2', span: { s: 10, e: 23 }, locked: true, tag_state: 'none_fit' }),
        part({ part_id: 'PT3' }), // slot destravado (dangling)
      ],
      partsConfirmed: true,
      current: { layer: 'parts', index: 2 },
      activeSceneId: 'PT1',
      mode: 'triagem',
    }),
    meta: meta({ granularityLevel: 'small' }),
  },
  {
    name: 'frases + flag + seleção + pendingStart + mapping + review + voz',
    state: baseSession({
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
      partsConfirmed: true,
      frases: [
        frase({
          prop_id: 'P1',
          span: { s: 0, e: 4 },
          part_link: 'PT1',
          locked: true,
          statement: 'A chegada.',
          qa: ['Quem chega?'],
        }),
        frase({ prop_id: 'P2' }),
      ],
      current: { layer: 'frases', index: 1 },
      activeSceneId: 'PT1',
      selection: { s: 5, e: 8 },
      pendingStart: 5,
      mapping: {
        level1: { recontar: 'Uma história.', tempo: '' },
        level2: { PT1: { quem: 'Duas mulheres.' } },
        level3: { P1: { oque: 'A chegada — com acento: coração.' } },
      } satisfies Mapping,
      mode: 'mapeamento',
      review: true,
    }),
    meta: meta({
      granularityLevel: 'large',
      voice: ['respostas/level1/recontar.webm', 'respostas/level3/P1/oque.webm'],
    }),
  },
];

describe('session-state DTO — round-trip domínio → DTO → domínio', () => {
  for (const { name, state, meta: m } of variety) {
    it(`preserva o estado e o meta: ${name}`, () => {
      const back = fromSessionDto(toSessionDto(state, m));
      expect(back.state).toEqual(state);
      expect(back.meta).toEqual(m);
    });

    it(`sobrevive à serialização + schema: ${name}`, () => {
      const dto = toSessionDto(state, m);
      const roundBytes = JSON.parse(serializeArtifact(dto)) as unknown;
      const parsed = SessionStateDtoSchema.parse(roundBytes);
      const back = fromSessionDto(parsed);
      expect(back.state).toEqual(state);
      expect(back.meta).toEqual(m);
    });
  }

  it('carimba schema_version = 1', () => {
    expect(toSessionDto(baseSession(), meta()).schema_version).toBe(1);
  });
});

describe('session-state DTO — fixtures válidas/inválidas', () => {
  it('aceita a fixture válida', () => {
    expect(() => SessionStateDtoSchema.parse(fixture('valid.json'))).not.toThrow();
  });

  for (const bad of [
    'invalid-schema-version.json',
    'invalid-extra-key.json',
    'invalid-type.json',
    'invalid-mode.json',
  ]) {
    it(`rejeita ${bad}`, () => {
      expect(() => SessionStateDtoSchema.parse(fixture(bad))).toThrow();
    });
  }
});
