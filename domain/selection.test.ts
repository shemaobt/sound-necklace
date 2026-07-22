import { describe, expect, it } from 'vitest';

import { buildBeads } from './grid';
import { clickBead } from './selection';
import { createSession, type Frase, type ScenePart, type SessionState } from './state';

/** Sessão de teste: 12 s a 0.5 s/conta → 24 contas (0…23). */
function sess(over: Partial<SessionState> = {}, dur = 12, beadSec = 0.5): SessionState {
  const base = createSession({
    durationSec: dur,
    beadSec,
    beads: buildBeads(dur, beadSec),
    manifestId: 'fnv1a32:00000000',
    audioFilename: 'teste.wav',
    slug: 'teste',
  });
  return { ...base, ...over };
}

function part(over: Partial<ScenePart>): ScenePart {
  return {
    part_id: 'PT1',
    span: null,
    locked: false,
    scene_kind: null,
    scene_kind_confidence: null,
    tag_state: 'pending',
    ...over,
  };
}

/** Estado ancorando uma cena destravada (fronteira 0, salvo cenas travadas). */
function anchored(over: Partial<SessionState> = {}): SessionState {
  const base = sess();
  return {
    ...base,
    whole: { ...base.whole, confirmed: true },
    parts: [part({})],
    current: { layer: 'parts', index: 0 },
    ...over,
  };
}

/** Duas cenas travadas; PT1{0,3}, PT2 pendente → fronteira do corte = 4. */
function afterPT1(over: Partial<SessionState> = {}): SessionState {
  return anchored({
    parts: [part({ part_id: 'PT1', span: { s: 0, e: 3 }, locked: true }), part({ part_id: 'PT2' })],
    current: { layer: 'parts', index: 1 },
    ...over,
  });
}

describe('clickBead — só o FIM se define; o começo é a fronteira (§8.2, novo modelo)', () => {
  it('clicar além da fronteira define o FIM; o começo fica na fronteira', () => {
    const r = clickBead(anchored(), 7); // fronteira 0
    expect(r.state.selection).toEqual({ s: 0, e: 7 });
    expect(r.state.pendingStart).toBeNull();
    expect(r.play).toEqual({ type: 'set-end', end: 7 });
  });

  it('novo clique além redefine o FIM (o começo continua fixo)', () => {
    const r = clickBead(anchored({ selection: { s: 0, e: 7 }, pendingStart: null }), 12);
    expect(r.state.selection).toEqual({ s: 0, e: 12 });
    expect(r.play).toEqual({ type: 'set-end', end: 12 });
  });

  it('clicar no começo (a fronteira) pede OUVIR a partir dali; a seleção fica intacta', () => {
    const s = anchored({ selection: { s: 0, e: 7 } });
    const r = clickBead(s, 0);
    expect(r.state).toBe(s); // nada muda
    expect(r.play).toEqual({ type: 'listen', from: 0 });
  });

  it('clicar ANTES da fronteira também é OUVIR — nunca puxa o começo (fronteira 4)', () => {
    const s = afterPT1();
    const r = clickBead(s, 1);
    expect(r.play).toEqual({ type: 'listen', from: 4 });
    expect(r.state).toBe(s);
  });

  it('exatamente na fronteira é OUVIR; fronteira+1 define o fim', () => {
    const s = afterPT1();
    expect(clickBead(s, 4).play).toEqual({ type: 'listen', from: 4 });
    const r = clickBead(s, 5);
    expect(r.state.selection).toEqual({ s: 4, e: 5 });
    expect(r.play).toEqual({ type: 'set-end', end: 5 });
  });

  it('clique além do fim da história satura na última conta', () => {
    const r = clickBead(anchored(), 99);
    expect(r.state.selection).toEqual({ s: 0, e: 23 });
    expect(r.play).toEqual({ type: 'set-end', end: 23 });
  });
});

describe('clickBead — o começo da frase é a fronteira DENTRO da cena (um-toque, §8.6)', () => {
  function frase(over: Partial<Frase>): Frase {
    return {
      prop_id: 'P1',
      statement_pt: '',
      qa: [],
      span: null,
      part_link: null,
      locked: false,
      ...over,
    };
  }

  /** Duas cenas produtivas travadas; ancorando uma frase na cena `index`. */
  function fraseando(frases: Frase[], index: number, activeSceneId = 'PT2'): SessionState {
    const base = sess();
    return {
      ...base,
      whole: { ...base.whole, confirmed: true },
      parts: [
        part({
          part_id: 'PT1',
          span: { s: 4, e: 9 },
          locked: true,
          tag_state: 'tagged',
          scene_kind: 'GLEANING_SCENE',
        }),
        part({
          part_id: 'PT2',
          span: { s: 10, e: 19 },
          locked: true,
          tag_state: 'tagged',
          scene_kind: 'MEAL_SCENE',
        }),
      ],
      partsConfirmed: true,
      frases,
      current: { layer: 'frases', index },
      activeSceneId,
    };
  }

  it('1ª frase: o começo é o início da CENA (10), sem back-reach à vizinha (§8.6, um-toque)', () => {
    const s = fraseando([frase({})], 0); // PT2 {10,19} ativa, 1ª frase
    // clicar antes do início da cena é OUVIR de lá — nunca recua à cena anterior
    expect(clickBead(s, 1).play).toEqual({ type: 'listen', from: 10 });
    // tocar o FIM ancora o começo na cena, não no início do colar
    const r = clickBead(s, 12);
    expect(r.state.selection).toEqual({ s: 10, e: 12 });
    expect(r.play).toEqual({ type: 'set-end', end: 12 });
  });

  it('o piso da cena (fim da última frase DELA +1) é o começo; além dele define o fim', () => {
    const s = fraseando(
      [
        frase({ prop_id: 'P1', span: { s: 5, e: 6 }, locked: true, part_link: 'PT1' }),
        frase({ prop_id: 'P2', span: { s: 12, e: 13 }, locked: true, part_link: 'PT2' }),
        frase({ prop_id: 'P3' }),
      ],
      2,
      'PT1',
    );
    // fronteira na cena PT1 = 7 (fim da P1 +1); o ramo genérico daria 14
    expect(clickBead(s, 5).play).toEqual({ type: 'listen', from: 7 });
    const r = clickBead(s, 9);
    expect(r.state.selection).toEqual({ s: 7, e: 9 });
    expect(r.play).toEqual({ type: 'set-end', end: 9 });
  });
});

describe('clickBead — sem ancoragem ativa: transporte apenas (PRD §8.2)', () => {
  it('ouvindo a história inteira, o toque vira transporte e nada é selecionado', () => {
    const s = sess();
    const r = clickBead(s, 5);
    expect(r.play).toEqual({ type: 'transport', bead: 5 });
    expect(r.state).toBe(s);
  });

  it('com o item corrente travado também é transporte', () => {
    const s = sess({
      parts: [part({ span: { s: 0, e: 9 }, locked: true })],
      current: { layer: 'parts', index: 0 },
    });
    expect(clickBead(s, 5).play).toEqual({ type: 'transport', bead: 5 });
  });

  it('em revisão, cliques no colar são ignorados', () => {
    const s = anchored({ review: true });
    const r = clickBead(s, 5);
    expect(r.play).toBeNull();
    expect(r.state).toBe(s);
  });

  it('sem contas na grade, cliques são ignorados', () => {
    const base = sess();
    const s: SessionState = {
      ...base,
      totalBeads: 0,
      beads: [],
      whole: { ...base.whole, span: { s: 0, e: -1 } },
    };
    expect(clickBead(s, 0).play).toBeNull();
  });
});

describe('clickBead — pureza', () => {
  it('não muta o estado de entrada', () => {
    const s = anchored({ selection: { s: 0, e: 8 } });
    const before = JSON.stringify(s);
    clickBead(s, 2);
    clickBead(s, 10);
    expect(JSON.stringify(s)).toBe(before);
  });
});
