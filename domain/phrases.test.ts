import { describe, expect, it } from 'vitest';

import { buildBeads } from './grid';
import { createSession, type Frase, type ScenePart, type SessionState, type Span } from './state';
import {
  activeScene,
  addFrase,
  confirmFrase,
  confirmFrasesDone,
  enterFrasesLayer,
  enterScene,
  enterSegmentacao,
  FRASE_ERROR_COPY,
  moveBorder,
  phraseFrontier,
  reanchorFrase,
  removeFrase,
  reopenFrase,
  sceneIndexOf,
  toggleFlag,
  type ConfirmFraseResult,
} from './phrases';

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
    statement_pt: '',
    qa: [],
    span: null,
    part_link: null,
    locked: false,
    flagged: false,
    ...over,
  };
}

const PT1 = mkPart('PT1', { s: 0, e: 9 }, { tag_state: 'tagged', scene_kind: 'GLEANING_SCENE' });
const PT2 = mkPart('PT2', { s: 10, e: 29 }, { tag_state: 'tagged', scene_kind: 'MEAL_SCENE' });
const PT3 = mkPart('PT3', { s: 30, e: 39 }, { tag_state: 'none_fit' });

/** Sessão de 40 contas (20 s, beadSec 0.5) pronta para segmentar. */
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
    parts: [PT1, PT2, PT3],
    partsConfirmed: true,
    mode: 'segmentacao',
    ...over,
  };
}

/** Sessão com um slot P1 aberto e corrente, cena ativa PT2. */
function anchoring(over: Partial<SessionState> = {}): SessionState {
  return sess({
    frases: [mkFrase('P1')],
    current: { layer: 'frases', index: 0 },
    activeSceneId: 'PT2',
    ...over,
  });
}

function lockedState(r: ConfirmFraseResult): SessionState {
  if (r.kind !== 'locked') throw new Error(`esperava locked, veio ${r.kind}`);
  return r.state;
}

function errOf(r: ConfirmFraseResult): { code: string; message: string } {
  if (r.kind !== 'error') throw new Error(`esperava error, veio ${r.kind}`);
  return r.error;
}

describe('activeScene / sceneIndexOf — a cena produtiva em foco', () => {
  it('resolve pelo activeSceneId; id desconhecido cai na primeira produtiva', () => {
    expect(activeScene(sess({ activeSceneId: 'PT2' }))?.part_id).toBe('PT2');
    expect(activeScene(sess({ activeSceneId: 'PT9' }))?.part_id).toBe('PT1');
    expect(activeScene(sess({ activeSceneId: null }))?.part_id).toBe('PT1');
  });

  it('sem cena produtiva devolve null; none_fit não conta', () => {
    const s = sess({ parts: [PT3] });
    expect(activeScene(s)).toBeNull();
  });

  it('sceneIndexOf indexa a vista de produtivas (PT3 fora)', () => {
    const s = sess();
    expect(sceneIndexOf(s, 'PT1')).toBe(0);
    expect(sceneIndexOf(s, 'PT2')).toBe(1);
    expect(sceneIndexOf(s, 'PT3')).toBe(-1);
    expect(sceneIndexOf(s, null)).toBe(-1);
  });
});

describe('phraseFrontier — fronteira com back-reach (§6.4)', () => {
  it('1ª frase da cena recua até o INÍCIO da vizinha anterior', () => {
    const s = sess({ activeSceneId: 'PT2' });
    expect(phraseFrontier(s)).toBe(0); // PT1 começa em 0
  });

  it('sem vizinha anterior fica no início da própria cena', () => {
    const deslocada = mkPart(
      'PT1',
      { s: 2, e: 9 },
      { tag_state: 'tagged', scene_kind: 'VOW_SCENE' },
    );
    const s = sess({ parts: [deslocada, PT2], activeSceneId: 'PT1' });
    expect(phraseFrontier(s)).toBe(2);
  });

  it('com frase travada na cena avança para o fim dela + 1', () => {
    const s = sess({
      activeSceneId: 'PT2',
      frases: [mkFrase('P1', { locked: true, span: { s: 10, e: 14 }, part_link: 'PT2' })],
    });
    expect(phraseFrontier(s)).toBe(15);
  });

  it('frase travada de OUTRA cena não move a fronteira desta', () => {
    const s = sess({
      activeSceneId: 'PT2',
      frases: [mkFrase('P1', { locked: true, span: { s: 0, e: 4 }, part_link: 'PT1' })],
    });
    expect(phraseFrontier(s)).toBe(0); // ainda o back-reach a PT1
  });
});

describe('addFrase — slot com menor P# livre', () => {
  it('cria o slot, vira corrente e limpa a seleção', () => {
    const s = sess({ selection: { s: 1, e: 2 }, pendingStart: 1 });
    const next = addFrase(s);
    expect(next.frases).toHaveLength(1);
    expect(next.frases[0]).toMatchObject({ prop_id: 'P1', locked: false, span: null });
    expect(next.current).toEqual({ layer: 'frases', index: 0 });
    expect(next.selection).toBeNull();
    expect(next.pendingStart).toBeNull();
  });

  it('com âncora ativa é no-op (o slot aberto já espera)', () => {
    const s = anchoring();
    expect(addFrase(s)).toBe(s);
  });

  it('slot dangling ocupa o P#: remover libera e o próximo add reusa', () => {
    const travada = mkFrase('P1', { locked: true, span: { s: 10, e: 12 }, part_link: 'PT2' });
    const dangling = mkFrase('P2');
    const s = sess({ frases: [travada, dangling], current: { layer: 'frases', index: 1 } });
    // dangling ocupa P2 → um novo add (sem âncora: current fora) daria P3
    const semAncora = { ...s, current: { layer: 'frases' as const, index: -1 } };
    expect(addFrase(semAncora).frases[2]!.prop_id).toBe('P3');
    // remover o dangling libera o P2 — o auto-add do próprio remove já o reusa
    const removed = removeFrase(s, 1);
    expect(removed.frases.map((f) => f.prop_id)).toEqual(['P1', 'P2']);
    expect(removed.frases[1]).toMatchObject({ prop_id: 'P2', locked: false, span: null });
  });
});

describe('confirmFrase — guardas na ordem da referência', () => {
  it('meia-seleção {b,b} com pendingStart PASSA (não checa pendingStart)', () => {
    const s = anchoring({ selection: { s: 12, e: 12 }, pendingStart: 12 });
    const next = lockedState(confirmFrase(s, 0));
    expect(next.frases[0]).toMatchObject({
      locked: true,
      span: { s: 12, e: 12 },
      part_link: 'PT2',
    });
  });

  it('sem cenas confirmadas: "Confirme as cenas primeiro."', () => {
    const s = anchoring({ partsConfirmed: false, selection: { s: 12, e: 14 } });
    expect(errOf(confirmFrase(s, 0))).toEqual({
      code: 'PARTS_NOT_CONFIRMED',
      message: 'Confirme as cenas primeiro.',
    });
  });

  it('sem seleção: "Clique o início e o fim da frase no colar."', () => {
    const s = anchoring({ selection: null });
    expect(errOf(confirmFrase(s, 0))).toEqual({
      code: 'SELECTION_INCOMPLETE',
      message: 'Clique o início e o fim da frase no colar.',
    });
  });

  it('sem cena produtiva: "Nenhuma cena produtiva para frasear."', () => {
    const s = anchoring({ parts: [PT3], selection: { s: 30, e: 31 } });
    expect(errOf(confirmFrase(s, 0))).toEqual({
      code: 'NO_PRODUCTIVE_SCENE',
      message: 'Nenhuma cena produtiva para frasear.',
    });
  });

  it('início antes da fronteira: cópia interpola a conta', () => {
    const s = anchoring({
      frases: [
        mkFrase('P1', { locked: true, span: { s: 10, e: 14 }, part_link: 'PT2' }),
        mkFrase('P2'),
      ],
      current: { layer: 'frases', index: 1 },
      selection: { s: 12, e: 20 },
    });
    expect(errOf(confirmFrase(s, 1))).toEqual({
      code: 'FRASE_BEFORE_FRONTIER',
      message: 'A frase não pode começar antes da conta 15.',
    });
    expect(FRASE_ERROR_COPY.FRASE_BEFORE_FRONTIER(15)).toBe(
      'A frase não pode começar antes da conta 15.',
    );
  });

  it('fim além do colar: "A frase precisa terminar dentro do colar."', () => {
    const s = anchoring({ selection: { s: 12, e: 45 } });
    expect(errOf(confirmFrase(s, 0))).toEqual({
      code: 'FRASE_BEYOND_STORY',
      message: 'A frase precisa terminar dentro do colar.',
    });
  });

  it('frase travada ou índice inválido: no-op silencioso', () => {
    const travada = mkFrase('P1', { locked: true, span: { s: 10, e: 12 }, part_link: 'PT2' });
    const s = sess({ frases: [travada], selection: { s: 13, e: 14 }, activeSceneId: 'PT2' });
    const r = confirmFrase(s, 0);
    expect(r.kind).toBe('noop');
    expect(confirmFrase(s, 7).kind).toBe('noop');
  });

  it('travessia de borda devolve a OFERTA sem tocar o estado', () => {
    const s = anchoring({ selection: { s: 12, e: 32 } }); // passa o fim de PT2 (29)
    const r = confirmFrase(s, 0);
    if (r.kind !== 'border') throw new Error(`esperava border, veio ${r.kind}`);
    expect(r.offer.crossEnd).toBe(true);
    expect(r.offer.sel).toEqual({ s: 12, e: 32 });
    expect(s.frases[0]!.locked).toBe(false); // estado original intacto
  });

  it('ao travar pula para o 1º slot destravado; sem slot, auto-add', () => {
    const doisSlots = anchoring({
      frases: [mkFrase('P1'), mkFrase('P2')],
      selection: { s: 12, e: 14 },
    });
    const pulou = lockedState(confirmFrase(doisSlots, 0));
    expect(pulou.current).toEqual({ layer: 'frases', index: 1 });

    const soUm = anchoring({ selection: { s: 12, e: 14 } });
    const autoAdd = lockedState(confirmFrase(soUm, 0));
    expect(autoAdd.frases).toHaveLength(2);
    expect(autoAdd.frases[1]).toMatchObject({ prop_id: 'P2', locked: false });
    expect(autoAdd.current).toEqual({ layer: 'frases', index: 1 });
  });
});

describe('moveBorder / reanchorFrase — as saídas da oferta', () => {
  it('mover desliza a costura e trava a frase na cena ativa', () => {
    const s = anchoring({ selection: { s: 12, e: 32 } });
    const r = confirmFrase(s, 0);
    if (r.kind !== 'border') throw new Error('esperava border');
    const next = moveBorder(s, r.offer);
    expect(next.parts[1]!.span).toEqual({ s: 10, e: 32 }); // PT2 cresceu
    expect(next.parts[2]!.span).toEqual({ s: 33, e: 39 }); // PT3 encolheu
    expect(next.frases[0]).toMatchObject({
      locked: true,
      span: { s: 12, e: 32 },
      part_link: 'PT2',
    });
  });

  it('mover cruzando o começo recua a vizinha anterior', () => {
    const s = anchoring({ selection: { s: 7, e: 20 } });
    const r = confirmFrase(s, 0);
    if (r.kind !== 'border') throw new Error('esperava border');
    const next = moveBorder(s, r.offer);
    expect(next.parts[0]!.span).toEqual({ s: 0, e: 6 }); // PT1 encolheu
    expect(next.parts[1]!.span).toEqual({ s: 7, e: 29 }); // PT2 cresceu
  });

  it('moveBorder sem cena produtiva deixa o estado intacto', () => {
    const s = anchoring({ selection: { s: 12, e: 32 } });
    const r = confirmFrase(s, 0);
    if (r.kind !== 'border') throw new Error('esperava border');
    const semProdutiva = { ...s, parts: [PT3] };
    expect(moveBorder(semProdutiva, r.offer)).toBe(semProdutiva);
  });

  it('reancorar só limpa seleção e pendingStart', () => {
    const s = anchoring({ selection: { s: 12, e: 32 }, pendingStart: 12 });
    const next = reanchorFrase(s);
    expect(next.selection).toBeNull();
    expect(next.pendingStart).toBeNull();
    expect(next.frases).toBe(s.frases);
  });
});

describe('reopenFrase — cascata GLOBAL', () => {
  it('destrava i e TODAS as posteriores, mesmo de outras cenas', () => {
    const s = sess({
      frases: [
        mkFrase('P1', { locked: true, span: { s: 0, e: 4 }, part_link: 'PT1' }),
        mkFrase('P2', { locked: true, span: { s: 10, e: 14 }, part_link: 'PT2' }),
        mkFrase('P3', { locked: true, span: { s: 15, e: 20 }, part_link: 'PT2' }),
      ],
      activeSceneId: 'PT2',
    });
    const next = reopenFrase(s, 1);
    expect(next.frases.map((f) => f.locked)).toEqual([true, false, false]);
    expect(next.current).toEqual({ layer: 'frases', index: 1 });
    expect(next.selection).toEqual({ s: 10, e: 14 });
    expect(next.pendingStart).toBeNull();
  });

  it('flagged SOBREVIVE ao reopen (a flag exporta sem proposition)', () => {
    const s = sess({
      frases: [
        mkFrase('P1', { locked: true, span: { s: 0, e: 4 }, part_link: 'PT1', flagged: true }),
      ],
      activeSceneId: 'PT1',
    });
    const next = reopenFrase(s, 0);
    expect(next.frases[0]!.flagged).toBe(true);
    expect(next.frases[0]!.locked).toBe(false);
  });

  it('frase sem span reabre com seleção nula', () => {
    const s = sess({ frases: [mkFrase('P1')], activeSceneId: 'PT1' });
    const next = reopenFrase(s, 0);
    expect(next.selection).toBeNull();
  });

  it('índice inválido é no-op (desvio deliberado do TypeError da referência)', () => {
    const s = sess({ frases: [mkFrase('P1')] });
    expect(reopenFrase(s, 9)).toBe(s);
  });
});

describe('removeFrase — libera o P# e escolhe o ÚLTIMO destravado', () => {
  it('remove e aponta para o último slot destravado remanescente', () => {
    const s = sess({
      frases: [
        mkFrase('P1', { locked: true, span: { s: 0, e: 4 }, part_link: 'PT1' }),
        mkFrase('P2'),
        mkFrase('P3'),
      ],
      current: { layer: 'frases', index: 1 },
      activeSceneId: 'PT1',
    });
    const next = removeFrase(s, 1);
    expect(next.frases.map((f) => f.prop_id)).toEqual(['P1', 'P3']);
    expect(next.current).toEqual({ layer: 'frases', index: 1 }); // P3, o último destravado
  });

  it('sem destravado restante: auto-add', () => {
    const s = sess({
      frases: [
        mkFrase('P1', { locked: true, span: { s: 0, e: 4 }, part_link: 'PT1' }),
        mkFrase('P2'),
      ],
      current: { layer: 'frases', index: 1 },
      activeSceneId: 'PT1',
    });
    const next = removeFrase(s, 1);
    expect(next.frases).toHaveLength(2);
    expect(next.frases[1]).toMatchObject({ prop_id: 'P2', locked: false, span: null });
    expect(next.current).toEqual({ layer: 'frases', index: 1 });
  });
});

describe('toggleFlag — marca/desmarca para revisão', () => {
  it('alterna a flag da frase alvo sem tocar as outras', () => {
    const s = sess({
      frases: [
        mkFrase('P1', { locked: true, span: { s: 0, e: 4 }, part_link: 'PT1' }),
        mkFrase('P2', { locked: true, span: { s: 10, e: 14 }, part_link: 'PT2' }),
      ],
    });
    const marcada = toggleFlag(s, 0);
    expect(marcada.frases[0]!.flagged).toBe(true);
    expect(marcada.frases[1]!.flagged).toBe(false);
    expect(toggleFlag(marcada, 0).frases[0]!.flagged).toBe(false);
  });
});

describe('enterScene — foco numa cena produtiva', () => {
  it('assume o PRIMEIRO slot destravado e limpa a seleção', () => {
    const s = sess({
      frases: [mkFrase('P1'), mkFrase('P2')],
      selection: { s: 1, e: 2 },
      pendingStart: 1,
      activeSceneId: 'PT1',
    });
    const next = enterScene(s, 'PT2');
    expect(next.activeSceneId).toBe('PT2');
    expect(next.current).toEqual({ layer: 'frases', index: 0 });
    expect(next.selection).toBeNull();
    expect(next.pendingStart).toBeNull();
  });

  it('sem slot destravado: auto-add (slot dangling por cena visitada)', () => {
    const s = sess({
      frases: [mkFrase('P1', { locked: true, span: { s: 0, e: 4 }, part_link: 'PT1' })],
      activeSceneId: 'PT1',
    });
    const next = enterScene(s, 'PT2');
    expect(next.frases).toHaveLength(2);
    expect(next.frases[1]).toMatchObject({ prop_id: 'P2', locked: false });
    expect(next.current).toEqual({ layer: 'frases', index: 1 });
  });
});

describe('enterFrasesLayer / enterSegmentacao — entrada na camada', () => {
  it('enterFrasesLayer assume o ÚLTIMO destravado (sem prime)', () => {
    const s = sess({
      frases: [mkFrase('P1'), mkFrase('P2')],
      selection: { s: 1, e: 2 },
    });
    const next = enterFrasesLayer(s);
    expect(next.current).toEqual({ layer: 'frases', index: 1 });
    expect(next.selection).toBeNull();
    expect(next.pendingStart).toBeNull();
  });

  it('enterFrasesLayer sem destravado: auto-add', () => {
    const s = sess({ frases: [] });
    const next = enterFrasesLayer(s);
    expect(next.frases).toHaveLength(1);
    expect(next.current).toEqual({ layer: 'frases', index: 0 });
  });

  it('enterSegmentacao conserta activeSceneId inválido para a 1ª produtiva', () => {
    const s = sess({ activeSceneId: 'PT3' }); // PT3 não é produtiva
    const next = enterSegmentacao(s);
    expect(next.activeSceneId).toBe('PT1');
    expect(next.current.layer).toBe('frases');
    expect(next.frases).toHaveLength(1); // auto-add do enterScene
  });

  it('enterSegmentacao preserva activeSceneId válido', () => {
    const s = sess({ activeSceneId: 'PT2' });
    expect(enterSegmentacao(s).activeSceneId).toBe('PT2');
  });

  it('enterSegmentacao sem activeSceneId assume a 1ª produtiva', () => {
    expect(enterSegmentacao(sess()).activeSceneId).toBe('PT1');
  });

  it('enterSegmentacao sem produtivas cai no enterFrasesLayer', () => {
    const s = sess({ parts: [PT3] });
    const next = enterSegmentacao(s);
    expect(next.activeSceneId).toBeNull();
    expect(next.frases).toHaveLength(1); // auto-add da camada
  });
});

describe('confirmFrasesDone — aviso de cena vazia e avanço (§8.6)', () => {
  const comFrase = (partLink: string) =>
    mkFrase('P1', { locked: true, span: { s: 0, e: 4 }, part_link: partLink });

  it('cena vazia avisa UMA vez; segunda chamada segue mesmo assim', () => {
    const s = sess({ activeSceneId: 'PT1', frases: [] });
    const aviso = confirmFrasesDone(s, null);
    if (aviso.kind !== 'warn-empty') throw new Error(`esperava warn-empty, veio ${aviso.kind}`);
    expect(aviso.warnedEmptyScene).toBe('PT1');
    expect(aviso.message).toBe(
      'Esta cena ficou sem frases. Clique de novo para seguir mesmo assim.',
    );

    const seguiu = confirmFrasesDone(s, aviso.warnedEmptyScene);
    expect(seguiu.kind).toBe('next-scene');
    if (seguiu.kind !== 'next-scene') throw new Error('unreachable');
    expect(seguiu.state.activeSceneId).toBe('PT2');
    expect(seguiu.warnedEmptyScene).toBeNull();
  });

  it('o aviso é POR CENA: marcador de outra cena não silencia', () => {
    const s = sess({ activeSceneId: 'PT2', frases: [] });
    const r = confirmFrasesDone(s, 'PT1');
    expect(r.kind).toBe('warn-empty');
  });

  it('cena com frase avança direto para a próxima produtiva', () => {
    const s = sess({ activeSceneId: 'PT1', frases: [comFrase('PT1')] });
    const r = confirmFrasesDone(s, null);
    expect(r.kind).toBe('next-scene');
    if (r.kind !== 'next-scene') throw new Error('unreachable');
    expect(r.state.activeSceneId).toBe('PT2');
  });

  it('última cena produtiva vai ao Mapeamento', () => {
    const s = sess({ activeSceneId: 'PT2', frases: [comFrase('PT2')] });
    const r = confirmFrasesDone(s, null);
    expect(r.kind).toBe('mapeamento');
    if (r.kind !== 'mapeamento') throw new Error('unreachable');
    expect(r.state.mode).toBe('mapeamento');
  });

  it('sem cena produtiva pede mapeamento e o redirect derruba na triagem', () => {
    const s = sess({ parts: [PT3] });
    const r = confirmFrasesDone(s, null);
    expect(r.kind).toBe('mapeamento');
    if (r.kind !== 'mapeamento') throw new Error('unreachable');
    expect(r.state.mode).toBe('triagem');
  });

  it('em revisão é no-op', () => {
    const s = sess({ review: true, activeSceneId: 'PT1' });
    expect(confirmFrasesDone(s, null).kind).toBe('noop');
  });
});
