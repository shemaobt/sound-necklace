import { describe, expect, it } from 'vitest';

import { buildBeads } from './grid';
import {
  ensureMapping,
  productiveFrases,
  questionSequence,
  setAnswer,
  voiceAnswerPath,
} from './mapping';
import { createSession, type Frase, type ScenePart, type SessionState, type Span } from './state';

function mkPart(part_id: string, span: Span | null, over: Partial<ScenePart> = {}): ScenePart {
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
    statement_pt: '',
    qa: [],
    span: null,
    part_link: null,
    locked: false,
    ...over,
  };
}

const PT1 = mkPart(
  'PT1',
  { s: 0, e: 9 },
  { tag_state: 'tagged', scene_kind: 'GLEANING_SCENE', scene_kind_confidence: 'alta' },
);
const PT2 = mkPart('PT2', { s: 10, e: 29 }, { tag_state: 'none_fit' });

// travada em cena produtiva → semeia L3 e entra na sequência
const P1 = mkFrase('P1', { span: { s: 0, e: 4 }, part_link: 'PT1', locked: true });
// travada em cena none_fit → semeia L3 (quirk: ensureMapping não checa
// produtividade) mas fica FORA da sequência (productiveFrases)
const P2 = mkFrase('P2', { span: { s: 10, e: 12 }, part_link: 'PT2', locked: true });
// slot dangling (destravado, sem span) → não semeia nada
const P3 = mkFrase('P3');

/** Sessão de 40 contas com cenas travadas e triadas, pronta para o Mapeamento. */
function sess(over: Partial<SessionState> = {}): SessionState {
  const base = createSession({
    durationSec: 20,
    beadSec: 0.5,
    beads: buildBeads(20, 0.5),
    manifestId: 'fnv1a32:00000000',
    audioFilename: 'a.wav',
    slug: 's',
  });
  return {
    ...base,
    parts: [PT1, PT2],
    partsConfirmed: true,
    frases: [P1, P2, P3],
    mode: 'mapeamento',
    ...over,
  };
}

describe('ensureMapping — semeadura preguiçosa (referência L1057–1063)', () => {
  it('cria o mapping do zero: 11 chaves L1, bucket L2 por cena travada (none_fit incluída), L3 por frase travada com part_link', () => {
    const st = ensureMapping(sess());
    const m = st.mapping!;

    expect(Object.keys(m.level1)).toHaveLength(11);
    expect(m.level1['recontar']).toBe('');
    expect(m.level1['ausencia']).toBe('');

    expect(Object.keys(m.level2).sort()).toEqual(['PT1', 'PT2']);
    expect(Object.keys(m.level2['PT1']!)).toHaveLength(5);
    expect(m.level2['PT2']!['descrever']).toBe('');

    // P2 está em cena none_fit e MESMO ASSIM semeia (quirk fiel); P3 dangling não
    expect(Object.keys(m.level3).sort()).toEqual(['P1', 'P2']);
    expect(Object.keys(m.level3['P1']!)).toHaveLength(5);
    expect(m.level3).not.toHaveProperty('P3');
  });

  it('não semeia L2 para cena destravada nem L3 para frase sem part_link ou sem span', () => {
    const st = ensureMapping(
      sess({
        parts: [PT1, mkPart('PT9', { s: 30, e: 39 }, { locked: false })],
        frases: [
          P1,
          mkFrase('P9', { span: { s: 5, e: 6 }, locked: true, part_link: null }),
          mkFrase('P8', { span: null, locked: true, part_link: 'PT1' }),
        ],
      }),
    );
    expect(st.mapping!.level2).not.toHaveProperty('PT9');
    expect(st.mapping!.level3).not.toHaveProperty('P9');
    expect(st.mapping!.level3).not.toHaveProperty('P8');
  });

  it('extensão preguiçosa: respostas existentes sobrevivem a um novo ensureMapping (== null, "" explícito também fica)', () => {
    const first = ensureMapping(sess());
    const answered = setAnswer(
      setAnswer(first, { level: 1, k: 'recontar' }, 'já respondida'),
      { level: 2, partId: 'PT1', k: 'quem' },
      '',
    );

    // re-corte tardio: uma frase nova aparece depois das primeiras respostas
    const P4 = mkFrase('P4', { span: { s: 6, e: 8 }, part_link: 'PT1', locked: true });
    const extended = ensureMapping({ ...answered, frases: [P1, P2, P4] });
    const m = extended.mapping!;

    expect(m.level1['recontar']).toBe('já respondida');
    expect(m.level2['PT1']!['quem']).toBe('');
    expect(Object.keys(m.level3).sort()).toEqual(['P1', 'P2', 'P4']);
    expect(m.level3['P4']!['oque']).toBe('');
  });

  it('nunca apaga: bucket de frase reaberta (destravada) permanece no mapping', () => {
    const first = ensureMapping(sess());
    const withAnswer = setAnswer(first, { level: 3, propId: 'P1', k: 'oque' }, 'gravada');

    const reopened = ensureMapping({
      ...withAnswer,
      frases: [{ ...P1, locked: false }, P2, P3],
    });
    expect(reopened.mapping!.level3['P1']!['oque']).toBe('gravada');
  });

  it('é imutável: o estado de entrada não é tocado', () => {
    const input = sess();
    const out = ensureMapping(input);
    expect(input.mapping).toBeNull();
    expect(out).not.toBe(input);
  });
});

describe('setAnswer — semântica de atribuição do driver (generate.mjs L179–186)', () => {
  it('escreve nos três níveis sem tocar o estado de entrada', () => {
    const st = ensureMapping(sess());
    const a1 = setAnswer(st, { level: 1, k: 'lugar' }, 'no campo');
    const a2 = setAnswer(a1, { level: 2, partId: 'PT2', k: 'onde' }, 'no mesmo lugar');
    const a3 = setAnswer(a2, { level: 3, propId: 'P1', k: 'quem' }, 'duas mulheres');

    expect(a3.mapping!.level1['lugar']).toBe('no campo');
    expect(a3.mapping!.level2['PT2']!['onde']).toBe('no mesmo lugar');
    expect(a3.mapping!.level3['P1']!['quem']).toBe('duas mulheres');
    expect(st.mapping!.level1['lugar']).toBe('');
  });

  it('lança em bucket L2/L3 inexistente (a referência lançaria TypeError; a mensagem é do port)', () => {
    const st = ensureMapping(sess());
    expect(() => setAnswer(st, { level: 2, partId: 'PTX', k: 'quem' }, 'x')).toThrow(/PTX/);
    expect(() => setAnswer(st, { level: 3, propId: 'PX', k: 'oque' }, 'x')).toThrow(/PX/);
  });

  it('lança se chamado antes de ensureMapping', () => {
    expect(() => setAnswer(sess(), { level: 1, k: 'lugar' }, 'x')).toThrow(/ensureMapping/);
  });
});

describe('productiveFrases / questionSequence — ordem da conversa (referência L1082)', () => {
  it('productiveFrases ordena cena-major (ordem das cenas produtivas, depois ordem das frases)', () => {
    const PT2prod = mkPart(
      'PT2',
      { s: 10, e: 29 },
      { tag_state: 'tagged', scene_kind: 'MEAL_SCENE', scene_kind_confidence: 'média' },
    );
    // frases em ordem INVERSA à das cenas no array state.frases
    const st = sess({ parts: [PT1, PT2prod], frases: [P2, P1] });

    expect(productiveFrases(st).map(({ fr, scene }) => [fr.prop_id, scene.part_id])).toEqual([
      ['P1', 'PT1'],
      ['P2', 'PT2'],
    ]);
  });

  it('frase de cena none_fit fica fora (a cena não é produtiva)', () => {
    expect(productiveFrases(sess()).map(({ fr }) => fr.prop_id)).toEqual(['P1']);
  });

  it('sequência plana: 11 L1 → 5 por cena travada em ordem (none_fit incluída) → 5 por frase produtiva', () => {
    const seq = questionSequence(sess());

    expect(seq).toHaveLength(11 + 5 * 2 + 5 * 1);
    expect(seq.slice(0, 11).map((s) => s.level)).toEqual(Array<number>(11).fill(1));
    expect(seq[0]).toMatchObject({ level: 1, k: 'recontar' });
    expect(seq[11]).toMatchObject({ level: 2, partId: 'PT1', k: 'descrever' });
    expect(seq[16]).toMatchObject({ level: 2, partId: 'PT2', k: 'descrever' });
    expect(seq[21]).toMatchObject({ level: 3, propId: 'P1', k: 'oque' });
    // cada slot carrega a pergunta contratual correspondente
    expect(seq[21]!.question.q).toBe('O que aconteceu nesta frase?');
  });
});

describe('voiceAnswerPath — chaves de recurso de voz (PRD §10.4 / O5)', () => {
  it('produz os três formatos respostas/level{1,2,3}/…/<k>.webm', () => {
    expect(voiceAnswerPath({ level: 1, k: 'recontar' })).toBe('respostas/level1/recontar.webm');
    expect(voiceAnswerPath({ level: 2, partId: 'PT1', k: 'quem' })).toBe(
      'respostas/level2/PT1/quem.webm',
    );
    expect(voiceAnswerPath({ level: 3, propId: 'P1', k: 'oque' })).toBe(
      'respostas/level3/P1/oque.webm',
    );
  });
});
