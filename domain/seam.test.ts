import { describe, expect, it } from 'vitest';

import { buildBeads } from './grid';
import { createSession, type Frase, type ScenePart, type SessionState, type Span } from './state';
import {
  classifyBorderMove,
  dragSceneBoundary,
  nextNeighbor,
  prevNeighbor,
  sceneHasFrases,
  sceneWindow,
  slideSeam,
  windowMargin,
} from './seam';

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

/** Sessão de 40 contas (20 s, beadSec 0.5) com cenas forjadas. */
function sess(over: Partial<SessionState> = {}): SessionState {
  const base = createSession({
    durationSec: 20,
    beadSec: 0.5,
    beads: buildBeads(20, 0.5),
    manifestId: 'fnv1a32:00000000',
    audioFilename: 'a.wav',
    slug: 's',
  });
  return { ...base, partsConfirmed: true, mode: 'segmentacao', ...over };
}

const PT1 = mkPart('PT1', { s: 0, e: 9 }, { tag_state: 'tagged', scene_kind: 'GLEANING_SCENE' });
const PT2 = mkPart('PT2', { s: 10, e: 29 }, { tag_state: 'tagged', scene_kind: 'MEAL_SCENE' });
const PT3 = mkPart('PT3', { s: 30, e: 39 }, { tag_state: 'none_fit' });

describe('prevNeighbor / nextNeighbor — vizinhas travadas (none_fit incluído)', () => {
  it('acha a vizinha imediata em cada direção (none_fit conta)', () => {
    const s = sess({ parts: [PT1, PT2, PT3] });
    expect(prevNeighbor(s, PT2)?.part_id).toBe('PT1');
    expect(nextNeighbor(s, PT2)?.part_id).toBe('PT3'); // PT3 é none_fit
  });

  it('sem vizinha na direção devolve null', () => {
    const s = sess({ parts: [PT1, PT2, PT3] });
    expect(prevNeighbor(s, PT1)).toBeNull();
    expect(nextNeighbor(s, PT3)).toBeNull();
  });

  it('ignora cenas destravadas e sem span', () => {
    const aberta = mkPart('PT4', { s: 30, e: 39 }, { locked: false });
    const semSpan = { ...mkPart('PT5', { s: 0, e: 9 }), span: null };
    const s = sess({ parts: [semSpan, PT2, aberta] });
    expect(prevNeighbor(s, PT2)).toBeNull();
    expect(nextNeighbor(s, PT2)).toBeNull();
  });

  it('escolhe a MAIS PRÓXIMA quando há mais de uma na direção', () => {
    const longe = mkPart('PT9', { s: 0, e: 3 });
    const perto = mkPart('PT8', { s: 4, e: 9 });
    const s = sess({ parts: [longe, perto, PT2] });
    expect(prevNeighbor(s, PT2)?.part_id).toBe('PT8');
    // e na outra direção, com a candidata pior examinada depois da melhor
    const dep1 = mkPart('PT6', { s: 30, e: 33 });
    const dep2 = mkPart('PT7', { s: 34, e: 39 });
    const s2 = sess({ parts: [PT2, dep1, dep2] });
    expect(nextNeighbor(s2, PT2)?.part_id).toBe('PT6');
  });

  it('cena sem span não tem vizinhas', () => {
    const semSpan = { ...mkPart('PT7', { s: 0, e: 1 }), span: null };
    const s = sess({ parts: [PT1, PT2] });
    expect(prevNeighbor(s, semSpan)).toBeNull();
    expect(nextNeighbor(s, semSpan)).toBeNull();
  });
});

describe('sceneHasFrases — a cena tem frase travada?', () => {
  it('true só com frase travada, com span, ligada à cena', () => {
    const semNada = sess({ parts: [PT1, PT2] });
    expect(sceneHasFrases(semNada, PT1)).toBe(false);

    const comFrase = sess({
      parts: [PT1, PT2],
      frases: [mkFrase('P1', { locked: true, span: { s: 0, e: 4 }, part_link: 'PT1' })],
    });
    expect(sceneHasFrases(comFrase, PT1)).toBe(true);
    expect(sceneHasFrases(comFrase, PT2)).toBe(false);
  });

  it('frase destravada ou de outra cena não conta; cena null é false', () => {
    const s = sess({
      parts: [PT1],
      frases: [mkFrase('P1', { locked: false, span: { s: 0, e: 4 }, part_link: 'PT1' })],
    });
    expect(sceneHasFrases(s, PT1)).toBe(false);
    expect(sceneHasFrases(s, null)).toBe(false);
  });
});

describe('classifyBorderMove — limiar §11: max(3, round(25% da cena))', () => {
  // cena PT2 tem 20 contas → thr = 5
  function crossEndBy(delta: number, parts = [PT1, PT2, PT3]) {
    const s = sess({ parts });
    return classifyBorderMove(s, PT2, { s: 12, e: 29 + delta }, 0);
  }

  it('delta == thr (5 em cena de 20) → oferta simples, pode mover', () => {
    const offer = crossEndBy(5);
    expect(offer.kind).toBe('simple');
    expect(offer.delta).toBe(5);
    expect(offer.thr).toBe(5);
    expect(offer.canMove).toBe(true);
  });

  it('delta == thr+1 → escalada (re-corte), mover mesmo assim permitido', () => {
    const offer = crossEndBy(6);
    expect(offer.kind).toBe('escalation');
    expect(offer.consumed).toBe(false);
    expect(offer.canMove).toBe(true);
    expect(offer.warning).toContain('são 6 contas, acima do limiar de 5');
  });

  it('piso do limiar é 3 mesmo em cena minúscula', () => {
    const mini = mkPart('PT1', { s: 0, e: 3 }, { tag_state: 'tagged', scene_kind: 'VOW_SCENE' });
    const s = sess({ parts: [mini, mkPart('PT2', { s: 4, e: 39 })] });
    // 25% de 4 = 1 → piso 3; delta 3 ainda é simples
    const noLimite = classifyBorderMove(s, mini, { s: 0, e: 6 }, 0);
    expect(noLimite.thr).toBe(3);
    expect(noLimite.kind).toBe('simple');
  });

  it('consumir a vizinha inteira (fim) → escalada SEM mover mesmo assim', () => {
    // PT3 vai de 30..39; sel.e = 39 engole a vizinha
    const offer = crossEndBy(10);
    expect(offer.kind).toBe('escalation');
    expect(offer.consumed).toBe(true);
    expect(offer.canMove).toBe(false);
    expect(offer.warning).toContain('engole a cena vizinha inteira');
  });

  it('consumir a vizinha inteira (começo) → consumed na outra direção', () => {
    const s = sess({ parts: [PT1, PT2, PT3] });
    // sel.s = 0 <= PT1.span.s → engole PT1
    const offer = classifyBorderMove(s, PT2, { s: 0, e: 20 }, 0);
    expect(offer.crossStart).toBe(true);
    expect(offer.consumed).toBe(true);
    expect(offer.canMove).toBe(false);
  });

  it('vizinha produtiva COM frases → duas cenas produtivas: só Triagem/reancorar', () => {
    const s = sess({
      parts: [PT1, PT2, PT3],
      frases: [mkFrase('P1', { locked: true, span: { s: 0, e: 4 }, part_link: 'PT1' })],
    });
    const offer = classifyBorderMove(s, PT2, { s: 8, e: 20 }, 0);
    expect(offer.kind).toBe('two-productive');
    expect(offer.canMove).toBe(false);
    expect(offer.warning).toContain('mexe em duas cenas');
  });

  it('vizinha produtiva SEM frases não escala por twoProd', () => {
    const s = sess({ parts: [PT1, PT2, PT3] });
    const offer = classifyBorderMove(s, PT2, { s: 8, e: 20 }, 0);
    expect(offer.kind).toBe('simple');
  });

  it('sem vizinha na direção: nunca consumed/twoProd; delta grande ainda escala', () => {
    const s = sess({ parts: [PT2] });
    const pequena = classifyBorderMove(s, PT2, { s: 12, e: 34 }, 0); // delta 5
    expect(pequena.kind).toBe('simple');
    const grande = classifyBorderMove(s, PT2, { s: 12, e: 39 }, 0); // delta 10
    expect(grande.kind).toBe('escalation');
    expect(grande.consumed).toBe(false);
    expect(grande.canMove).toBe(true);
  });

  it('travessia dupla (começo E fim): o FIM decide vizinha e delta', () => {
    const s = sess({ parts: [PT1, PT2, PT3] });
    // cruza 2 no começo e 4 no fim: delta = 4 (fim), vizinha = PT3
    const offer = classifyBorderMove(s, PT2, { s: 8, e: 33 }, 0);
    expect(offer.crossStart).toBe(true);
    expect(offer.crossEnd).toBe(true);
    expect(offer.delta).toBe(4);
    expect(offer.question).toContain('passa o fim');
  });

  it('twoProd tem precedência sobre consumed (checagem na ordem da referência)', () => {
    // vizinha anterior produtiva com frase E engolida inteira pela seleção
    const s = sess({
      parts: [PT1, PT2, PT3],
      frases: [mkFrase('P1', { locked: true, span: { s: 0, e: 4 }, part_link: 'PT1' })],
    });
    const offer = classifyBorderMove(s, PT2, { s: 0, e: 20 }, 0);
    expect(offer.consumed).toBe(true);
    expect(offer.kind).toBe('two-productive');
  });

  it('cena sem span ou sem tipo é violação de invariante: lança', () => {
    const s = sess({ parts: [PT1, PT2, PT3] });
    const semSpan = { ...PT2, span: null };
    expect(() => classifyBorderMove(s, semSpan, { s: 12, e: 32 }, 0)).toThrow(/span|tipo/);
    const semTipo = { ...PT2, scene_kind: null };
    expect(() => classifyBorderMove(s, semTipo, { s: 12, e: 32 }, 0)).toThrow(/span|tipo/);
  });

  it('a pergunta nomeia a direção e o tipo da cena (rótulo PT-BR)', () => {
    const fim = crossEndBy(2);
    expect(fim.question).toBe('Esta frase passa o fim da cena (Refeição). O tipo continua aqui?');
    const s = sess({ parts: [PT1, PT2, PT3] });
    const comeco = classifyBorderMove(s, PT2, { s: 8, e: 20 }, 0);
    expect(comeco.question).toContain('passa o começo da cena');
  });
});

describe('slideSeam — a cena cresce, a vizinha imediata encolhe', () => {
  it('crescer o fim empurra o início da vizinha seguinte', () => {
    const s = sess({ parts: [PT1, PT2, PT3] });
    const next = slideSeam(s, 'PT2', null, 33);
    expect(next.parts[1]!.span).toEqual({ s: 10, e: 33 });
    expect(next.parts[2]!.span).toEqual({ s: 34, e: 39 });
    expect(next.parts[0]).toBe(s.parts[0]); // intacta preserva identidade
  });

  it('crescer o começo recua o fim da vizinha anterior', () => {
    const s = sess({ parts: [PT1, PT2, PT3] });
    const next = slideSeam(s, 'PT2', 7, null);
    expect(next.parts[1]!.span).toEqual({ s: 7, e: 29 });
    expect(next.parts[0]!.span).toEqual({ s: 0, e: 6 });
  });

  it('vizinha que não colide fica intacta', () => {
    const afastada = mkPart('PT3', { s: 36, e: 39 });
    const s = sess({ parts: [PT1, PT2, afastada] });
    const next = slideSeam(s, 'PT2', null, 33);
    expect(next.parts[1]!.span).toEqual({ s: 10, e: 33 });
    expect(next.parts[2]).toBe(afastada);
  });

  it('sem vizinha só estica a cena; nas duas direções de uma vez', () => {
    const s = sess({ parts: [PT2] });
    const next = slideSeam(s, 'PT2', 5, 35);
    expect(next.parts[0]!.span).toEqual({ s: 5, e: 35 });
  });

  it('newStart/newEnd que não ultrapassam o span atual não mexem em nada', () => {
    const s = sess({ parts: [PT1, PT2, PT3] });
    expect(slideSeam(s, 'PT2', 12, 25)).toBe(s);
  });
});

describe('dragSceneBoundary — arrastar a fronteira interna (Pac-Man, ENG-342)', () => {
  it('arrastar para a direita: a cena esquerda cresce, a direita encolhe o mesmo', () => {
    const s = sess({ parts: [PT1, PT2, PT3] });
    const next = dragSceneBoundary(s, 'PT1', 15);
    expect(next.parts[0]!.span).toEqual({ s: 0, e: 15 });
    expect(next.parts[1]!.span).toEqual({ s: 16, e: 29 });
    expect(next.parts[2]).toBe(s.parts[2]); // nada rippla para frente
  });

  it('arrastar para a esquerda: a esquerda encolhe, a direita cresce', () => {
    const s = sess({ parts: [PT1, PT2, PT3] });
    const next = dragSceneBoundary(s, 'PT1', 5);
    expect(next.parts[0]!.span).toEqual({ s: 0, e: 5 });
    expect(next.parts[1]!.span).toEqual({ s: 6, e: 29 });
  });

  it('clampa: a cena esquerda nunca fica vazia (≥ 1 conta)', () => {
    const s = sess({ parts: [PT1, PT2, PT3] });
    const next = dragSceneBoundary(s, 'PT1', -4);
    expect(next.parts[0]!.span).toEqual({ s: 0, e: 0 });
    expect(next.parts[1]!.span).toEqual({ s: 1, e: 29 });
  });

  it('clampa: a cena direita nunca fica vazia (≥ 1 conta)', () => {
    const s = sess({ parts: [PT1, PT2, PT3] });
    const next = dragSceneBoundary(s, 'PT1', 99);
    expect(next.parts[0]!.span).toEqual({ s: 0, e: 28 });
    expect(next.parts[1]!.span).toEqual({ s: 29, e: 29 });
  });

  it('última cena não tem fronteira à direita: no-op', () => {
    const s = sess({ parts: [PT1, PT2, PT3] });
    expect(dragSceneBoundary(s, 'PT3', 35)).toBe(s);
  });

  it('arrastar para a posição atual não muda nada', () => {
    const s = sess({ parts: [PT1, PT2, PT3] });
    expect(dragSceneBoundary(s, 'PT1', 9)).toBe(s);
  });
});

describe('windowMargin / sceneWindow — janela da segmentação (§8.6)', () => {
  it('margem = max(3, round(2/beadSec)) para 0.25 / 0.5 / 1.0', () => {
    expect(windowMargin(0.25)).toBe(8);
    expect(windowMargin(0.5)).toBe(4);
    expect(windowMargin(1.0)).toBe(3);
  });

  it('janela = cena ± margem, clampada ao colar', () => {
    expect(sceneWindow({ s: 10, e: 29 }, 0.5, 40)).toEqual({ s: 6, e: 33 });
    expect(sceneWindow({ s: 0, e: 9 }, 0.5, 40)).toEqual({ s: 0, e: 13 });
    expect(sceneWindow({ s: 30, e: 39 }, 0.5, 40)).toEqual({ s: 26, e: 39 });
  });
});
