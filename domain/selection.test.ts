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

describe('clickBead — 1º e 2º cliques (referência L567–573)', () => {
  it('1º clique marca o início pendente, seleciona a conta única e toca só ela', () => {
    const r = clickBead(anchored(), 7);
    expect(r.state.pendingStart).toBe(7);
    expect(r.state.selection).toEqual({ s: 7, e: 7 });
    expect(r.play).toEqual({ type: 'single-bead', bead: 7 });
  });

  it('2º clique fecha o range e toca o trecho inteiro', () => {
    const r = clickBead(anchored({ selection: { s: 7, e: 7 }, pendingStart: 7 }), 12);
    expect(r.state.selection).toEqual({ s: 7, e: 12 });
    expect(r.state.pendingStart).toBeNull();
    expect(r.play).toEqual({ type: 'range', s: 7, e: 12 });
  });

  it('2º clique antes do início normaliza a ordem', () => {
    const r = clickBead(anchored({ selection: { s: 7, e: 7 }, pendingStart: 7 }), 3);
    expect(r.state.selection).toEqual({ s: 3, e: 7 });
    expect(r.play).toEqual({ type: 'range', s: 3, e: 7 });
  });
});

describe('clickBead — clamp a [fronteira, fim da história] (referência L565–566)', () => {
  it('clique antes da fronteira é puxado para ela', () => {
    const s = anchored({
      parts: [
        part({ part_id: 'PT1', span: { s: 0, e: 3 }, locked: true }),
        part({ part_id: 'PT2' }),
      ],
      current: { layer: 'parts', index: 1 },
    });
    const r = clickBead(s, 1);
    expect(r.state.selection).toEqual({ s: 4, e: 4 });
    expect(r.state.pendingStart).toBe(4);
    expect(r.play).toEqual({ type: 'single-bead', bead: 4 });
  });

  it('clique além do fim da história é puxado para a última conta', () => {
    const r = clickBead(anchored(), 99);
    expect(r.state.selection).toEqual({ s: 23, e: 23 });
  });
});

describe('clickBead — clamp na camada de frases: fronteira com back-reach (referência L563–566 + L400–409)', () => {
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

  /** Duas cenas produtivas travadas; ancorando uma frase na 2ª (PT2). */
  function fraseando(frases: Frase[], index: number): SessionState {
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
      activeSceneId: 'PT2',
    };
  }

  it('1ª frase da cena: clique antes da vizinha anterior é puxado ao início dela (back-reach)', () => {
    const r = clickBead(fraseando([frase({})], 0), 1);
    expect(r.state.selection).toEqual({ s: 4, e: 4 });
    expect(r.state.pendingStart).toBe(4);
    expect(r.play).toEqual({ type: 'single-bead', bead: 4 });
  });

  it('o piso do clique é o fim da última frase travada DA CENA +1 — não o máximo global', () => {
    const base = fraseando(
      [
        frase({ prop_id: 'P1', span: { s: 5, e: 6 }, locked: true, part_link: 'PT1' }),
        frase({ prop_id: 'P2', span: { s: 12, e: 13 }, locked: true, part_link: 'PT2' }),
        frase({ prop_id: 'P3' }),
      ],
      2,
    );
    const s = { ...base, activeSceneId: 'PT1' };
    // piso na cena PT1 = 7 (fim da P1 +1); o ramo genérico daria 14 (fim da P2 +1)
    const r = clickBead(s, 5);
    expect(r.state.selection).toEqual({ s: 7, e: 7 });
    expect(r.play).toEqual({ type: 'single-bead', bead: 7 });
  });
});

describe('clickBead — nudge da borda mais próxima (referência L574–581)', () => {
  it('clique em/antes do início move o início e toca só a fronteira ajustada', () => {
    const r = clickBead(anchored({ selection: { s: 4, e: 8 } }), 2);
    expect(r.state.selection).toEqual({ s: 2, e: 8 });
    // janela do playEdge: max(1, round(1/0.5)) = 2 contas de cada lado
    expect(r.play).toEqual({ type: 'edge', edge: 2, s: 0, e: 4 });
  });

  it('clique em/depois do fim move o fim', () => {
    const r = clickBead(anchored({ selection: { s: 4, e: 8 } }), 10);
    expect(r.state.selection).toEqual({ s: 4, e: 10 });
    expect(r.play).toEqual({ type: 'edge', edge: 10, s: 8, e: 12 });
  });

  it('clique exatamente no início mantém a seleção e reproduz a borda', () => {
    const r = clickBead(anchored({ selection: { s: 4, e: 8 } }), 4);
    expect(r.state.selection).toEqual({ s: 4, e: 8 });
    expect(r.play).toEqual({ type: 'edge', edge: 4, s: 2, e: 6 });
  });

  it('clique interno mais perto do início move o início', () => {
    const r = clickBead(anchored({ selection: { s: 2, e: 9 } }), 4);
    expect(r.state.selection).toEqual({ s: 4, e: 9 });
    expect(r.play).toEqual({ type: 'edge', edge: 4, s: 2, e: 6 });
  });

  it('clique interno mais perto do fim move o fim', () => {
    const r = clickBead(anchored({ selection: { s: 2, e: 9 } }), 7);
    expect(r.state.selection).toEqual({ s: 2, e: 7 });
    expect(r.play).toEqual({ type: 'edge', edge: 7, s: 5, e: 9 });
  });

  it('empate exato move o INÍCIO — a comparação é (b−s) <= (e−b)', () => {
    const r = clickBead(anchored({ selection: { s: 2, e: 8 } }), 5);
    expect(r.state.selection).toEqual({ s: 5, e: 8 });
    expect(r.play).toEqual({ type: 'edge', edge: 5, s: 3, e: 7 });
  });

  it('a janela da borda satura na última conta do colar', () => {
    const r = clickBead(anchored({ selection: { s: 20, e: 22 } }), 23);
    expect(r.state.selection).toEqual({ s: 20, e: 23 });
    expect(r.play).toEqual({ type: 'edge', edge: 23, s: 21, e: 23 });
  });

  it('a janela nunca é menor que 1 conta de cada lado (beadSec > 1 s)', () => {
    // 48 s a 4 s/conta → 12 contas; round(1/4) = 0 → max(1, 0) = 1
    const base = sess({}, 48, 4);
    const s: SessionState = {
      ...base,
      whole: { ...base.whole, confirmed: true },
      parts: [part({})],
      current: { layer: 'parts', index: 0 },
      selection: { s: 3, e: 6 },
    };
    const r = clickBead(s, 8);
    expect(r.play).toEqual({ type: 'edge', edge: 8, s: 7, e: 9 });
  });
});

describe('clickBead — sem ancoragem ativa: transporte apenas (referência L562–564; PRD §8.2)', () => {
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
    const s = anchored({ selection: { s: 4, e: 8 } });
    const before = JSON.stringify(s);
    clickBead(s, 2);
    clickBead(s, 10);
    expect(JSON.stringify(s)).toBe(before);
  });
});
