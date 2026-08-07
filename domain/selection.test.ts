import { describe, expect, it } from 'vitest';

import { buildBeads } from './grid';
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
 * Modelo de clique — decisão do dono, 2026-08-07 (à noite), depois de rodar o app.
 * Substitui o `cordInteraction` restaurado nesta mesma branch; o que sobrou dele é a
 * escolha da borda mais próxima. O motivo foi de ouvido: sem a pré-ancoragem e com
 * áudio contínuo, quem corta escuta a história correr e marca onde a cena acaba, em
 * vez de ouvir ~1 s solto em volta de bordas que ainda não conhece.
 *
 * Três tempos:
 *  1. sem seleção → o clique fixa o COMEÇO e o áudio SEGUE dali (`run`);
 *  2. com `pendingStart` → fecha o trecho e PARA se o playhead já passou do fim
 *     marcado; se não chegou, deixa correr (`set-end`, decisão do playhead na UI);
 *  3. trecho fechado → move a borda mais próxima e toca o TRECHO RESULTANTE inteiro
 *     (`range`), não só a borda.
 */
describe('clickBead — marca o começo ouvindo, fecha no fim, e reouve ao ajustar', () => {
  const aberto = (over: Partial<SessionState> = {}) =>
    anchored({ selection: null, pendingStart: null, ...over });

  it('o 1º clique fixa o COMEÇO e o áudio segue dali', () => {
    const r = clickBead(aberto(), 7);
    expect(r.state.selection).toEqual({ s: 7, e: 7 });
    expect(r.state.pendingStart).toBe(7);
    expect(r.play).toEqual({ type: 'run', from: 7 });
  });

  it('o 2º clique fecha o trecho e devolve a decisão do playhead à UI', () => {
    const s = aberto({ selection: { s: 7, e: 7 }, pendingStart: 7 });
    const r = clickBead(s, 20);
    expect(r.state.selection).toEqual({ s: 7, e: 20 });
    expect(r.state.pendingStart).toBeNull();
    expect(r.play).toEqual({ type: 'set-end', end: 20 });
  });

  it('fechar ATRÁS do começo marcado inverte as pontas, como na referência', () => {
    const s = aberto({ selection: { s: 10, e: 10 }, pendingStart: 10 });
    const r = clickBead(s, 4);
    expect(r.state.selection).toEqual({ s: 4, e: 10 });
    expect(r.play).toEqual({ type: 'set-end', end: 10 });
  });

  it('fechado o trecho, clicar além do fim move o FIM e reouve o trecho todo', () => {
    const r = clickBead(aberto({ selection: { s: 0, e: 12 } }), 20);
    expect(r.state.selection).toEqual({ s: 0, e: 20 });
    expect(r.play).toEqual({ type: 'range', s: 0, e: 20 });
  });

  it('clicar perto do começo move o COMEÇO e reouve o trecho encurtado', () => {
    const r = clickBead(aberto({ selection: { s: 0, e: 12 } }), 4);
    expect(r.state.selection).toEqual({ s: 4, e: 12 }); // 4−0=4 ≤ 12−4=8
    expect(r.play).toEqual({ type: 'range', s: 4, e: 12 });
  });

  it('clicar perto do fim move o FIM', () => {
    const r = clickBead(aberto({ selection: { s: 0, e: 12 } }), 9);
    expect(r.state.selection).toEqual({ s: 0, e: 9 }); // 9−0=9 > 12−9=3
    expect(r.play).toEqual({ type: 'range', s: 0, e: 9 });
  });

  it('empate no meio vai para o COMEÇO (o `<=` da referência)', () => {
    const r = clickBead(aberto({ selection: { s: 0, e: 10 } }), 5);
    expect(r.state.selection).toEqual({ s: 5, e: 10 });
  });

  /**
   * Cai fora do modelo por consequência, não por exceção: clicar a própria conta de
   * começo move o começo para onde ele já está, e o `range` do ramo 3 reouve o trecho.
   * É o que faz as vezes do botão `▶ tocar este pedaço` (`playSel`, L262) que a
   * ENG-291 tirou destas estações.
   */
  it('clicar a conta de começo reouve o trecho sem mexer nele', () => {
    const r = clickBead(aberto({ selection: { s: 0, e: 12 } }), 0);
    expect(r.state.selection).toEqual({ s: 0, e: 12 });
    expect(r.play).toEqual({ type: 'range', s: 0, e: 12 });
  });

  it('clique abaixo da fronteira satura NELA (floor = aa.start; fronteira 4)', () => {
    const r = clickBead(afterPT1({ selection: null, pendingStart: null }), 1);
    expect(r.state.selection).toEqual({ s: 4, e: 4 });
    expect(r.play).toEqual({ type: 'run', from: 4 });
  });

  it('clique além do fim da história satura na última conta', () => {
    const r = clickBead(aberto(), 99);
    expect(r.state.selection).toEqual({ s: 23, e: 23 });
    expect(r.play).toEqual({ type: 'run', from: 23 });
  });
});

/**
 * Cena e frase seguem o MESMO modelo — e agora isso sai de graça: sem pré-ancoragem,
 * a assimetria da referência (só a cena tinha `primePart`) deixou de existir. As duas
 * camadas abrem sem seleção e gastam os mesmos dois cliques.
 */
describe('clickBead — a frase se comporta como a cena', () => {
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

  it('o 1º clique fixa o começo da frase e o áudio segue dali', () => {
    const r = clickBead(fraseando([frase({})], 0), 12); // PT2 {10,19} ativa
    expect(r.state.selection).toEqual({ s: 12, e: 12 });
    expect(r.play).toEqual({ type: 'run', from: 12 });
  });

  it('clicar antes do início da cena satura nele — a frase não recua à vizinha', () => {
    const r = clickBead(fraseando([frase({})], 0), 1);
    expect(r.state.selection).toEqual({ s: 10, e: 10 });
    expect(r.play).toEqual({ type: 'run', from: 10 });
  });

  it('o piso é a fronteira DENTRO da cena (fim da última frase dela + 1)', () => {
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
    const r = clickBead(s, 5);
    expect(r.state.selection).toEqual({ s: 7, e: 7 });
    expect(r.play).toEqual({ type: 'run', from: 7 });
  });

  it('fechado o trecho, a frase também ajusta a borda e reouve o resultado', () => {
    const s = fraseando([frase({})], 0);
    const r = clickBead({ ...s, selection: { s: 10, e: 16 }, pendingStart: null }, 15);
    expect(r.state.selection).toEqual({ s: 10, e: 15 }); // 15−10=5 > 16−15=1
    expect(r.play).toEqual({ type: 'range', s: 10, e: 15 });
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

  it('tocar o começo arrastado fecha um trecho de uma conta', () => {
    const arrastado = dragSelectionStart(
      afterPT1({ selection: { s: 4, e: 4 }, pendingStart: 4 }),
      7,
    );
    expect(clickBead(arrastado, 7).play).toEqual({ type: 'set-end', end: 7 });
  });

  /**
   * O preço do modelo de borda mais próxima: fechado o trecho, um clique atrás do
   * começo arrastado o reancora na fronteira e FECHA o buraco. Abrir o buraco é o
   * arrasto; mantê-lo é não clicar atrás dele.
   */
  it('um clique antes do começo arrastado fecha o buraco de volta na fronteira', () => {
    const arrastado = dragSelectionStart(
      afterPT1({ selection: { s: 4, e: 4 }, pendingStart: 4 }),
      7,
    );
    const fechado = clickBead(arrastado, 15).state; // trecho {7,15}
    const r = clickBead(fechado, 2); // satura na fronteira 4
    expect(r.state.selection).toEqual({ s: 4, e: 15 });
    expect(r.play).toEqual({ type: 'range', s: 4, e: 15 });
  });
});
