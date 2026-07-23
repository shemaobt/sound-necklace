import { describe, expect, it } from 'vitest';

import {
  buildBeads,
  createSession,
  type Frase,
  questionSequence,
  type ScenePart,
  type SessionState,
  type Span,
} from '../../../domain';
import { phrasePalette, scenePalette, storyColor } from '../../tokens';
import { blockEyebrow, buildTrechos } from './trechos';

const LABELS = { story: 'a história inteira', sceneUntyped: 'uma cena' };
const BLOCK = {
  story: 'a história inteira',
  scene: (n: number) => `Cena ${n}`,
  phrase: (n: number) => `Frase ${n}`,
};

function mkPart(part_id: string, span: Span, over: Partial<ScenePart> = {}): ScenePart {
  return {
    part_id,
    span,
    locked: true,
    scene_kind: null,
    scene_kind_confidence: null,
    tag_state: 'pending',
    ...over,
  };
}

function mkFrase(prop_id: string, over: Partial<Frase> = {}): Frase {
  return {
    prop_id,
    statement: '',
    qa: [],
    span: null,
    part_link: null,
    locked: false,
    ...over,
  };
}

// PT1 = cena produtiva (Respiga); PT2 = none_fit (entra em L2, mas sem frase produtiva)
const PT1 = mkPart('PT1', { s: 0, e: 9 }, { tag_state: 'tagged', scene_kind: 'GLEANING_SCENE' });
const PT2 = mkPart('PT2', { s: 10, e: 19 }, { tag_state: 'none_fit' });
const P1 = mkFrase('P1', { span: { s: 0, e: 4 }, part_link: 'PT1', locked: true });

function sess(): SessionState {
  const base = createSession({
    durationSec: 20,
    beadSec: 0.5,
    beads: buildBeads(20, 0.5),
    manifestId: 'fnv1a32:00000000',
    audioFilename: 'a.wav',
    slug: 's',
  });
  return { ...base, parts: [PT1, PT2], partsConfirmed: true, frases: [P1], mode: 'mapeamento' };
}

describe('buildTrechos', () => {
  it('ordena história · cenas · frases com as contagens 11 · 5 · 5 e as cores certas', () => {
    const trechos = buildTrechos(sess(), 'pt', LABELS);

    expect(trechos.map((tr) => tr.count)).toEqual([11, 5, 5, 5]); // história + PT1 + PT2 + P1
    expect(trechos[0]!.label).toBe('a história inteira');
    expect(trechos[0]!.color).toBe(storyColor);
    expect(trechos[1]!.label).toBe('Respiga'); // PT1 = GLEANING_SCENE
    expect(trechos[1]!.color).toBe(scenePalette[0]);
    expect(trechos[2]!.label).toBe('uma cena'); // PT2 = none_fit → fallback
    expect(trechos[2]!.color).toBe(scenePalette[1]);
  });

  it('a frase herda o tipo da cena-mãe (ENG-350, decisão do dono)', () => {
    const trechos = buildTrechos(sess(), 'pt', LABELS);
    const frase = trechos[3]!;
    expect(frase.label).toBe('Respiga'); // = o tipo de PT1, a cena-mãe de P1
    expect(frase.color).toBe(phrasePalette[0]);
  });

  it('a soma das contagens é exatamente o total da sequência de perguntas', () => {
    const st = sess();
    const soma = buildTrechos(st, 'pt', LABELS).reduce((n, tr) => n + tr.count, 0);
    expect(soma).toBe(questionSequence(st).length);
  });
});

describe('blockEyebrow — o eyebrow do bloco da pergunta atual (cor + rótulo do indicador)', () => {
  const seq = questionSequence(sess());
  const l1 = seq.find((s) => s.level === 1)!;
  const l2 = seq.find((s) => s.level === 2 && s.partId === 'PT1')!;
  const l3 = seq.find((s) => s.level === 3 && s.propId === 'P1')!;

  it('história → a cor e o rótulo da história, sem número', () => {
    expect(blockEyebrow(sess(), l1, 'pt', BLOCK)).toEqual({
      color: storyColor,
      eyebrow: 'a história inteira',
    });
  });

  it('cena → scenePalette + "Cena N · tipo"', () => {
    expect(blockEyebrow(sess(), l2, 'pt', BLOCK)).toEqual({
      color: scenePalette[0],
      eyebrow: 'Cena 1 · Respiga',
    });
  });

  it('frase → phrasePalette + "Cena N · Frase M" (M dentro da cena-mãe)', () => {
    expect(blockEyebrow(sess(), l3, 'pt', BLOCK)).toEqual({
      color: phrasePalette[0],
      eyebrow: 'Cena 1 · Frase 1',
    });
  });
});
