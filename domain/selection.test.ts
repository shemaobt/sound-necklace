import { describe, expect, it } from 'vitest';

import { buildBeads } from './grid';
import { primeFrase } from './phrases';
import { primePart } from './scenes';
import { clickBead, dragSelectionStart } from './selection';
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

/**
 * O modelo de clique é o `cordInteraction` da referência (index.html L561–583),
 * restaurado por decisão do dono em 2026-08-07: "o comportamento do colar para a
 * segmentação de cenas/frases fica estritamente igual; só Pac-Man e
 * remover-absorve são acréscimos".
 *
 * Com a pré-ancoragem (`primePart`/`primeFrase`) o slot já chega com
 * `selection={f,f}` e `pendingStart=f`, então o PRIMEIRO clique cai no ramo de
 * fechar o trecho: da emenda até a conta clicada, tocando-o inteiro. Do segundo em
 * diante o clique move a borda MAIS PRÓXIMA — inclusive o começo — e toca só ela.
 */
describe('clickBead — fecha o trecho, depois ajusta a borda mais próxima (L561–583)', () => {
  /** Como o app entrega o slot ao ouvinte: pré-ancorado na emenda. */
  const priming = (over: Partial<SessionState> = {}) => primePart(anchored(over));

  it('o 1º clique fecha da emenda até a conta e toca o TRECHO inteiro', () => {
    const r = clickBead(priming(), 7); // pré-ancorado em 0
    expect(r.state.selection).toEqual({ s: 0, e: 7 });
    expect(r.state.pendingStart).toBeNull();
    expect(r.play).toEqual({ type: 'range', s: 0, e: 7 });
  });

  it('fechado o trecho, clicar DEPOIS do fim move o fim e toca só a borda', () => {
    const r = clickBead(anchored({ selection: { s: 0, e: 7 }, pendingStart: null }), 12);
    expect(r.state.selection).toEqual({ s: 0, e: 12 });
    expect(r.play).toEqual({ type: 'edge', bead: 12 });
  });

  it('clicar ANTES do começo move o COMEÇO — a referência deixa (fronteira 4)', () => {
    const r = clickBead(afterPT1({ selection: { s: 6, e: 12 }, pendingStart: null }), 5);
    expect(r.state.selection).toEqual({ s: 5, e: 12 });
    expect(r.play).toEqual({ type: 'edge', bead: 5 });
  });

  it('clique NO MEIO puxa a borda mais próxima: perto do começo, o começo cede', () => {
    const r = clickBead(anchored({ selection: { s: 0, e: 12 }, pendingStart: null }), 4);
    expect(r.state.selection).toEqual({ s: 4, e: 12 }); // 4−0=4 ≤ 12−4=8
    expect(r.play).toEqual({ type: 'edge', bead: 4 });
  });

  it('clique NO MEIO perto do fim: o fim cede', () => {
    const r = clickBead(anchored({ selection: { s: 0, e: 12 }, pendingStart: null }), 9);
    expect(r.state.selection).toEqual({ s: 0, e: 9 }); // 9−0=9 > 12−9=3
    expect(r.play).toEqual({ type: 'edge', bead: 9 });
  });

  it('empate no meio vai para o COMEÇO (`<=` da referência)', () => {
    const r = clickBead(anchored({ selection: { s: 0, e: 10 }, pendingStart: null }), 5);
    expect(r.state.selection).toEqual({ s: 5, e: 10 });
  });

  /**
   * Exceção deliberada ao `cordInteraction` (decisão do dono, 2026-08-07). A
   * referência reouve o trecho inteiro pelo botão `▶ tocar este pedaço` (`playSel`,
   * L262), que a ENG-291 removeu daqui — o som desta estação vem das contas. Sem
   * substituto, quem está cortando só conseguiria ouvir ~1 s em volta de bordas que
   * ele ainda nem sabe onde ficaram. A conta de COMEÇO passa a ser esse botão.
   */
  describe('a conta de começo reouve o trecho fechado (o `playSel` que não temos)', () => {
    it('clicar exatamente o começo toca o trecho inteiro e não mexe na seleção', () => {
      const s = anchored({ selection: { s: 0, e: 12 }, pendingStart: null });
      const r = clickBead(s, 0);
      expect(r.state).toBe(s);
      expect(r.play).toEqual({ type: 'range', s: 0, e: 12 });
    });

    it('a conta VIZINHA do começo continua movendo a borda — a exceção é de uma conta só', () => {
      const r = clickBead(anchored({ selection: { s: 0, e: 12 }, pendingStart: null }), 1);
      expect(r.state.selection).toEqual({ s: 1, e: 12 });
      expect(r.play).toEqual({ type: 'edge', bead: 1 });
    });

    it('clicar antes da fronteira satura nela; sendo ela o começo, reouve o trecho', () => {
      const s = afterPT1({ selection: { s: 4, e: 12 }, pendingStart: null }); // fronteira 4
      const r = clickBead(s, 1);
      expect(r.state).toBe(s);
      expect(r.play).toEqual({ type: 'range', s: 4, e: 12 });
    });

    it('com o começo ARRASTADO à frente da emenda, clicar atrás ainda o traz de volta', () => {
      const s = afterPT1({ selection: { s: 7, e: 12 }, pendingStart: null }); // fronteira 4
      const r = clickBead(s, 1); // satura em 4, que é ANTES do começo 7
      expect(r.state.selection).toEqual({ s: 4, e: 12 });
      expect(r.play).toEqual({ type: 'edge', bead: 4 });
    });

    it('o trecho ainda não fechado não usa a exceção: o clique fecha, como na referência', () => {
      const r = clickBead(primePart(anchored()), 0); // pendingStart=0, seleção {0,0}
      expect(r.state.pendingStart).toBeNull();
      expect(r.play).toEqual({ type: 'range', s: 0, e: 0 });
    });
  });

  it('sem pré-ancoragem, o 1º clique fixa o começo e toca UMA conta', () => {
    const r = clickBead(anchored({ selection: null, pendingStart: null }), 7);
    expect(r.state.selection).toEqual({ s: 7, e: 7 });
    expect(r.state.pendingStart).toBe(7);
    expect(r.play).toEqual({ type: 'range', s: 7, e: 7 });
  });

  it('clique abaixo da fronteira satura NELA (floor = aa.start; fronteira 4)', () => {
    const r = clickBead(primePart(afterPT1()), 1);
    expect(r.state.selection).toEqual({ s: 4, e: 4 });
    expect(r.play).toEqual({ type: 'range', s: 4, e: 4 });
  });

  it('clique além do fim da história satura na última conta', () => {
    const r = clickBead(priming(), 99);
    expect(r.state.selection).toEqual({ s: 0, e: 23 });
    expect(r.play).toEqual({ type: 'range', s: 0, e: 23 });
  });
});

/**
 * Decisão do dono (2026-08-07): cena e frase seguem o MESMO modelo. A referência é
 * assimétrica aqui — `primePart` só existe para cenas (L698), e `addFrase` (L776)
 * zera a seleção, de modo que a frase gasta um clique a mais fixando o começo.
 * `primeFrase` fecha essa assimetria; o resto do `cordInteraction` é idêntico.
 */
describe('clickBead — a frase se comporta como a cena (primeFrase, §8.6)', () => {
  function frase(over: Partial<Frase>): Frase {
    return {
      prop_id: 'P1',
      statement: '',
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

  it('1ª frase: pré-ancorada no início da CENA (10) — um clique fecha e toca o trecho', () => {
    const s = primeFrase(fraseando([frase({})], 0)); // PT2 {10,19} ativa, 1ª frase
    const r = clickBead(s, 12);
    expect(r.state.selection).toEqual({ s: 10, e: 12 });
    expect(r.play).toEqual({ type: 'range', s: 10, e: 12 });
  });

  it('clicar antes do início da cena satura nele — a frase não recua à vizinha', () => {
    const s = primeFrase(fraseando([frase({})], 0));
    const r = clickBead(s, 1);
    expect(r.state.selection).toEqual({ s: 10, e: 10 });
    expect(r.play).toEqual({ type: 'range', s: 10, e: 10 });
  });

  it('o piso da cena (fim da última frase DELA +1) é o começo pré-ancorado', () => {
    const s = primeFrase(
      fraseando(
        [
          frase({ prop_id: 'P1', span: { s: 5, e: 6 }, locked: true, part_link: 'PT1' }),
          frase({ prop_id: 'P2', span: { s: 12, e: 13 }, locked: true, part_link: 'PT2' }),
          frase({ prop_id: 'P3' }),
        ],
        2,
        'PT1',
      ),
    );
    // fronteira na cena PT1 = 7 (fim da P1 +1); o ramo genérico daria 14
    const r = clickBead(s, 9);
    expect(r.state.selection).toEqual({ s: 7, e: 9 });
    expect(r.play).toEqual({ type: 'range', s: 7, e: 9 });
  });

  it('fechado o trecho, a frase também ajusta a borda mais próxima', () => {
    const s = fraseando([frase({})], 0);
    const r = clickBead({ ...s, selection: { s: 10, e: 16 }, pendingStart: null }, 15);
    expect(r.state.selection).toEqual({ s: 10, e: 15 }); // 15−10=5 > 16−15=1
    expect(r.play).toEqual({ type: 'edge', bead: 15 });
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

/**
 * Buraco no meio do colar (decisão do dono, 2026-08-06). O áudio é CRU: quem gravou
 * às vezes erra, repete, hesita. Para esse trecho não virar ruído no treinamento, o
 * usuário precisa poder deixá-lo FORA de qualquer cena/frase — não removê-lo, não
 * pulá-lo na escuta, não excluí-lo do artefato. Só não selecionar.
 *
 * O padrão não muda: um clique segue setando só o FIM. O começo passa a ceder ao
 * ARRASTO da extremidade inicial, e é isso que abre o buraco — o trecho entre o fim
 * da cena anterior e o novo começo não pertence a ninguém.
 */
describe('dragSelectionStart — o começo cede ao arrasto, e o buraco aparece', () => {
  it('arrastar o começo para frente deixa o trecho anterior fora do segmento', () => {
    const s = dragSelectionStart(afterPT1({ selection: { s: 4, e: 4 }, pendingStart: 4 }), 7);
    // PT1 termina em 3, este segmento passa a começar em 7 → 4,5,6 ficam sem dono
    expect(s.selection).toEqual({ s: 7, e: 7 });
  });

  it('nunca recua antes da fronteira — sobrepor a cena anterior continua proibido', () => {
    const s = dragSelectionStart(afterPT1({ selection: { s: 6, e: 9 }, pendingStart: null }), 1);
    expect(s.selection).toEqual({ s: 4, e: 9 });
  });

  it('nunca passa do fim já escolhido', () => {
    const s = dragSelectionStart(afterPT1({ selection: { s: 4, e: 9 }, pendingStart: null }), 20);
    expect(s.selection).toEqual({ s: 9, e: 9 });
  });

  it('sem ancoragem ativa não há o que arrastar', () => {
    const parado = anchored({ current: { layer: 'parts', index: -1 }, selection: { s: 2, e: 5 } });
    expect(dragSelectionStart(parado, 4)).toBe(parado);
  });

  it('o fim ainda não escolhido segue não escolhido: arrastar não confirma nada', () => {
    const s = dragSelectionStart(afterPT1({ selection: { s: 4, e: 4 }, pendingStart: 4 }), 7);
    expect(s.pendingStart).toBe(7);
  });

  it('não muta o estado de entrada', () => {
    const s = afterPT1({ selection: { s: 4, e: 9 }, pendingStart: null });
    const before = JSON.stringify(s);
    dragSelectionStart(s, 6);
    expect(JSON.stringify(s)).toBe(before);
  });
});

describe('clickBead — depois de arrastar o começo, o clique fecha COM ele', () => {
  it('o fim clicado se emparelha com o começo arrastado, não com a fronteira', () => {
    const arrastado = dragSelectionStart(
      afterPT1({ selection: { s: 4, e: 4 }, pendingStart: 4 }),
      7,
    );
    const r = clickBead(arrastado, 15);
    expect(r.state.selection).toEqual({ s: 7, e: 15 });
    expect(r.state.pendingStart).toBeNull();
  });

  it('tocar o começo arrastado toca a conta — o trecho ainda é degenerado', () => {
    const arrastado = dragSelectionStart(
      afterPT1({ selection: { s: 4, e: 4 }, pendingStart: 4 }),
      7,
    );
    expect(clickBead(arrastado, 7).play).toEqual({ type: 'range', s: 7, e: 7 });
  });

  /**
   * O preço de restaurar o `cordInteraction`: fechado o trecho, o clique volta a
   * mover a borda mais próxima — e o começo é uma delas. Um clique atrás do começo
   * arrastado reancora na fronteira e FECHA o buraco. Na referência é assim; abrir
   * o buraco continua sendo o arrasto, mantê-lo é não clicar antes dele.
   */
  it('um clique antes do começo arrastado fecha o buraco de volta na fronteira', () => {
    const arrastado = dragSelectionStart(
      afterPT1({ selection: { s: 4, e: 4 }, pendingStart: 4 }),
      7,
    );
    const fechado = clickBead(arrastado, 15).state; // trecho {7,15}
    const r = clickBead(fechado, 2); // satura na fronteira 4
    expect(r.state.selection).toEqual({ s: 4, e: 15 });
    expect(r.play).toEqual({ type: 'edge', bead: 4 });
  });
});
