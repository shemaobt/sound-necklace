import { describe, expect, it } from 'vitest';

import { buildBeads } from './grid';
import {
  addPart,
  confirmPart,
  confirmParts,
  confirmWhole,
  primePart,
  reopenPart,
  reopenWhole,
  type SceneResult,
} from './scenes';
import { createSession, type ScenePart, type SessionState } from './state';

/** Sessão de teste: 12 s a 0.5 s/conta → 24 contas (0…23). */
function sess(over: Partial<SessionState> = {}): SessionState {
  const base = createSession({
    durationSec: 12,
    beadSec: 0.5,
    beads: buildBeads(12, 0.5),
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

/** Extrai o estado de um resultado que DEVE ter sucedido. */
function okState(r: SceneResult): SessionState {
  if (!r.ok) throw new Error(`esperava sucesso, veio ${r.error.code}: ${r.error.message}`);
  return r.state;
}

/** Extrai o erro de um resultado que DEVE ter falhado. */
function errOf(r: SceneResult): { code: string; message: string } {
  if (r.ok) throw new Error('esperava erro, veio sucesso');
  return r.error;
}

/** Simula o 2º clique do corte: range completo pronto para confirmar. */
function withSelection(s: SessionState, sel: { s: number; e: number }): SessionState {
  return { ...s, selection: sel, pendingStart: null };
}

describe('confirmWhole (referência L685–694 + enterLayer L930–935)', () => {
  it('recusa span que não cobre 0…N−1, com a cópia exata', () => {
    const base = sess();
    const r = confirmWhole({ ...base, whole: { ...base.whole, span: { s: 0, e: 22 } } });
    const err = errOf(r);
    expect(err.code).toBe('WHOLE_SPAN_INCOMPLETE');
    expect(err.message).toBe('O áudio precisa cobrir a história inteira — da conta 0 à conta 23.');
    expect(
      errOf(confirmWhole({ ...base, whole: { ...base.whole, span: { s: 1, e: 23 } } })).code,
    ).toBe('WHOLE_SPAN_INCOMPLETE');
  });

  it('em sessão virgem: confirma e abre PT1 primado na conta 0', () => {
    const s = okState(confirmWhole(sess()));
    expect(s.whole.confirmed).toBe(true);
    expect(s.parts).toHaveLength(1);
    expect(s.parts[0]).toMatchObject({
      part_id: 'PT1',
      span: null,
      locked: false,
      tag_state: 'pending',
    });
    expect(s.current).toEqual({ layer: 'parts', index: 0 });
    expect(s.pendingStart).toBe(0);
    expect(s.selection).toEqual({ s: 0, e: 0 });
    expect(s.mode).toBe('escuta');
  });

  it('com slots destravados existentes, assume o ÚLTIMO destravado (quirk enterLayer L931)', () => {
    const s = okState(
      confirmWhole(
        sess({
          parts: [
            part({ part_id: 'PT1', span: { s: 0, e: 9 }, locked: true }),
            part({ part_id: 'PT2' }),
            part({ part_id: 'PT3' }),
          ],
        }),
      ),
    );
    expect(s.parts).toHaveLength(3); // nenhum slot novo
    expect(s.current).toEqual({ layer: 'parts', index: 2 });
    expect(s.pendingStart).toBe(10); // primado na fronteira
    expect(s.selection).toEqual({ s: 10, e: 10 });
  });

  it('com todas as cenas travadas, cria slot novo com o menor PT# livre', () => {
    const s = okState(
      confirmWhole(
        sess({
          parts: [
            part({ part_id: 'PT1', span: { s: 0, e: 9 }, locked: true }),
            part({ part_id: 'PT3', span: { s: 10, e: 23 }, locked: true }),
          ],
        }),
      ),
    );
    expect(s.parts).toHaveLength(3);
    expect(s.parts[2]?.part_id).toBe('PT2'); // PT2 estava livre
    expect(s.current).toEqual({ layer: 'parts', index: 2 });
    expect(s.pendingStart).toBe(23); // fronteira capada na última conta
  });

  it('com cenas já confirmadas (partsConfirmed) e todas travadas, só entra na camada sem slot novo', () => {
    const s = okState(
      confirmWhole(
        sess({
          partsConfirmed: true,
          parts: [part({ part_id: 'PT1', span: { s: 0, e: 23 }, locked: true })],
        }),
      ),
    );
    expect(s.parts).toHaveLength(1);
    expect(s.current).toEqual({ layer: 'parts', index: -1 });
    expect(s.selection).toBeNull();
    expect(s.pendingStart).toBeNull();
  });
});

describe('reopenWhole (referência L677–680)', () => {
  it('limpa confirmed e partsConfirmed, volta à camada whole, preserva cenas E seleção (quirk)', () => {
    const base = sess({
      partsConfirmed: true,
      parts: [part({ part_id: 'PT1', span: { s: 0, e: 23 }, locked: true })],
      selection: { s: 4, e: 8 },
      pendingStart: null,
    });
    const confirmed = { ...base, whole: { ...base.whole, confirmed: true } };
    const s = reopenWhole(confirmed);
    expect(s.whole.confirmed).toBe(false);
    expect(s.partsConfirmed).toBe(false);
    expect(s.current).toEqual({ layer: 'whole', index: -1 });
    expect(s.parts).toEqual(confirmed.parts);
    expect(s.selection).toEqual({ s: 4, e: 8 }); // a referência NÃO limpa aqui
  });
});

describe('addPart / primePart (referência L698–711)', () => {
  it('addPart é no-op quando já há uma ancoragem ativa', () => {
    const s = okState(confirmWhole(sess()));
    expect(addPart(s)).toBe(s);
  });

  it('addPart aloca o menor PT# livre e prima o início na fronteira', () => {
    const s = addPart(
      sess({
        parts: [part({ part_id: 'PT1', span: { s: 0, e: 9 }, locked: true })],
        current: { layer: 'parts', index: -1 },
      }),
    );
    expect(s.parts).toHaveLength(2);
    expect(s.parts[1]).toMatchObject({
      part_id: 'PT2',
      span: null,
      locked: false,
      tag_state: 'pending',
    });
    expect(s.current).toEqual({ layer: 'parts', index: 1 });
    expect(s.pendingStart).toBe(10);
    expect(s.selection).toEqual({ s: 10, e: 10 });
  });

  it('primePart é no-op fora da camada de cenas ou com alvo travado', () => {
    const emWhole = sess();
    expect(primePart(emWhole)).toBe(emWhole);
    const travada = sess({
      parts: [part({ span: { s: 0, e: 9 }, locked: true })],
      current: { layer: 'parts', index: 0 },
    });
    expect(primePart(travada)).toBe(travada);
  });
});

describe('confirmPart (referência L713–724)', () => {
  it('é no-op silencioso com índice inválido ou cena já travada', () => {
    const s = sess({ parts: [part({ span: { s: 0, e: 9 }, locked: true })] });
    expect(okState(confirmPart(s, 5))).toBe(s);
    expect(okState(confirmPart(withSelection(s, { s: 10, e: 12 }), 0)).parts[0]?.span).toEqual({
      s: 0,
      e: 9,
    });
  });

  it('recusa seleção incompleta — início pendente ainda sem fim', () => {
    const primado = okState(confirmWhole(sess())); // pendingStart=0, selection={0,0}
    const err = errOf(confirmPart(primado, 0));
    expect(err.code).toBe('SELECTION_INCOMPLETE');
    expect(err.message).toBe('Clique onde a cena termina, no colar.');
  });

  it('recusa sem seleção nenhuma', () => {
    const s = sess({ parts: [part({})], current: { layer: 'parts', index: 0 } });
    expect(errOf(confirmPart(s, 0)).code).toBe('SELECTION_INCOMPLETE');
  });

  it('recusa seleção que começa antes da fronteira, com a conta interpolada', () => {
    const s = withSelection(
      sess({
        parts: [
          part({ part_id: 'PT1', span: { s: 0, e: 3 }, locked: true }),
          part({ part_id: 'PT2' }),
        ],
        current: { layer: 'parts', index: 1 },
      }),
      { s: 2, e: 6 },
    );
    const err = errOf(confirmPart(s, 1));
    expect(err.code).toBe('SCENE_BEFORE_FRONTIER');
    expect(err.message).toBe('A cena não pode começar antes da conta 4.');
  });

  it('sucesso trava o span da seleção e abre o próximo slot automaticamente (novo PT#)', () => {
    const primado = okState(confirmWhole(sess()));
    const s = okState(confirmPart(withSelection(primado, { s: 0, e: 9 }), 0));
    expect(s.parts[0]).toMatchObject({ part_id: 'PT1', span: { s: 0, e: 9 }, locked: true });
    expect(s.parts).toHaveLength(2); // auto-addPart deixou um slot fresco
    expect(s.parts[1]?.part_id).toBe('PT2');
    expect(s.current).toEqual({ layer: 'parts', index: 1 });
    expect(s.pendingStart).toBe(10);
    expect(s.selection).toEqual({ s: 10, e: 10 });
  });

  it('sucesso avança para o primeiro slot destravado existente, sem criar slot novo', () => {
    const s = okState(
      confirmPart(
        withSelection(
          sess({
            parts: [
              part({ part_id: 'PT1', span: { s: 0, e: 5 }, locked: false }),
              part({ part_id: 'PT2', span: { s: 6, e: 23 }, locked: false }),
            ],
            current: { layer: 'parts', index: 0 },
          }),
          { s: 0, e: 5 },
        ),
        0,
      ),
    );
    expect(s.parts).toHaveLength(2);
    expect(s.parts[0]?.locked).toBe(true);
    expect(s.current).toEqual({ layer: 'parts', index: 1 });
    expect(s.pendingStart).toBe(6); // primado na nova fronteira
    expect(s.selection).toEqual({ s: 6, e: 6 });
  });
});

describe('reopenPart (referência L726–731)', () => {
  const tres = () =>
    sess({
      parts: [
        part({
          part_id: 'PT1',
          span: { s: 0, e: 4 },
          locked: true,
          scene_kind: 'GLEANING_SCENE',
          scene_kind_confidence: 'alta',
          tag_state: 'tagged',
        }),
        part({ part_id: 'PT2', span: { s: 5, e: 9 }, locked: true, tag_state: 'none_fit' }),
        part({ part_id: 'PT3', span: { s: 10, e: 23 }, locked: true }),
      ],
    });

  it('destrava i e tudo depois, preservando IDs e dados de triagem', () => {
    const s = reopenPart(tres(), 1);
    expect(s.parts.map((p) => p.locked)).toEqual([true, false, false]);
    expect(s.parts.map((p) => p.part_id)).toEqual(['PT1', 'PT2', 'PT3']);
    expect(s.parts[1]?.tag_state).toBe('none_fit'); // triagem preservada
    expect(s.parts[0]?.scene_kind).toBe('GLEANING_SCENE');
    expect(s.current).toEqual({ layer: 'parts', index: 1 });
    expect(s.selection).toEqual({ s: 5, e: 9 }); // seleção = span reaberto
    expect(s.pendingStart).toBeNull();
  });

  it('alvo sem span deixa a seleção nula', () => {
    const base = tres();
    const comSlot = { ...base, parts: [...base.parts, part({ part_id: 'PT4' })] };
    expect(reopenPart(comSlot, 3).selection).toBeNull();
  });

  it('índice fora do intervalo é no-op (a referência quebraria; desvio documentado)', () => {
    const s = tres();
    expect(reopenPart(s, 9)).toBe(s);
  });
});

describe('confirmParts (referência L757–767)', () => {
  it('exige a história confirmada primeiro', () => {
    const err = errOf(confirmParts(sess()));
    expect(err.code).toBe('WHOLE_NOT_CONFIRMED');
    expect(err.message).toBe('Ouça a história completa primeiro.');
  });

  it('exige ao menos uma cena travada', () => {
    const base = sess({ parts: [part({})] });
    const err = errOf(confirmParts({ ...base, whole: { ...base.whole, confirmed: true } }));
    expect(err.code).toBe('NO_LOCKED_SCENE');
    expect(err.message).toBe('Confirme ao menos uma cena.');
  });

  it('descarta os slots destravados, libera seus PT#s e entra na triagem', () => {
    // fluxo real: confirma a história, corta duas cenas (PT3 fica primado ao fim)
    let s = okState(confirmWhole(sess()));
    s = okState(confirmPart(withSelection(s, { s: 0, e: 9 }), 0));
    s = okState(confirmPart(withSelection(s, { s: 10, e: 23 }), 1));
    expect(s.parts).toHaveLength(3); // PT3 destravado, auto-adicionado

    const done = okState(confirmParts(s));
    expect(done.parts.map((p) => p.part_id)).toEqual(['PT1', 'PT2']);
    expect(done.partsConfirmed).toBe(true);
    expect(done.mode).toBe('triagem');
    expect(done.current).toEqual({ layer: 'parts', index: -1 });
    expect(done.selection).toBeNull();
    expect(done.pendingStart).toBeNull();

    // o PT# do slot descartado volta ao pool: o próximo addPart reusa PT3
    const depois = addPart(done);
    expect(depois.parts[2]?.part_id).toBe('PT3');
  });
});

describe('pureza dos reducers', () => {
  it('nenhum reducer muta o estado de entrada', () => {
    const primado = okState(confirmWhole(sess()));
    const pronto = withSelection(primado, { s: 0, e: 9 });
    const before = JSON.stringify(pronto);
    confirmPart(pronto, 0);
    reopenWhole(pronto);
    confirmParts(pronto);
    addPart(pronto);
    primePart(pronto);
    reopenPart(pronto, 0);
    expect(JSON.stringify(pronto)).toBe(before);
  });
});
