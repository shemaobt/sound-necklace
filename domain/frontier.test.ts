import { describe, expect, it } from 'vitest';

import { activeAnchor, frontier } from './frontier';
import { buildBeads } from './grid';
import { createSession, type Frase, type ScenePart, type SessionState, type Span } from './state';

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

describe('frontier — camada de cenas (referência L411–415)', () => {
  it('sem cena travada, a fronteira é a conta 0', () => {
    expect(frontier(sess(), 'parts')).toBe(0);
    expect(frontier(sess({ parts: [part({})] }), 'parts')).toBe(0);
  });

  it('avança para o maior fim travado + 1', () => {
    const s = sess({
      parts: [
        part({ part_id: 'PT1', span: { s: 0, e: 3 }, locked: true }),
        part({ part_id: 'PT2', span: { s: 4, e: 9 }, locked: true }),
        part({ part_id: 'PT3' }),
      ],
    });
    expect(frontier(s, 'parts')).toBe(10);
  });

  it('ignora slots destravados mesmo quando têm span (pós-reabrir)', () => {
    const s = sess({
      parts: [
        part({ part_id: 'PT1', span: { s: 0, e: 3 }, locked: true }),
        part({ part_id: 'PT2', span: { s: 4, e: 9 }, locked: false }),
      ],
    });
    expect(frontier(s, 'parts')).toBe(4);
  });

  it('é capada na última conta quando a última cena termina no fim do colar', () => {
    const s = sess({ parts: [part({ span: { s: 0, e: 23 }, locked: true })] });
    expect(frontier(s, 'parts')).toBe(23);
  });

  it('camada de frases (ramo genérico): último fim de frase travada + 1', () => {
    const s = sess({ frases: [frase({ span: { s: 2, e: 5 }, locked: true })] });
    expect(frontier(s, 'frases')).toBe(6);
    expect(frontier(sess(), 'frases')).toBe(0);
  });
});

/** Cena produtiva travada (tagged + kind) — o insumo de productiveScenes. */
function cena(id: string, span: Span, over: Partial<ScenePart> = {}): ScenePart {
  return part({
    part_id: id,
    span,
    locked: true,
    tag_state: 'tagged',
    scene_kind: 'GLEANING_SCENE',
    ...over,
  });
}

describe('frontier — camada de frases com cena ativa (referência L400–409)', () => {
  it('avança a partir da última frase travada DA CENA — frases de outras cenas não contam', () => {
    const s = sess({
      parts: [cena('PT1', { s: 2, e: 9 }), cena('PT2', { s: 10, e: 19 })],
      frases: [
        frase({ prop_id: 'P1', span: { s: 3, e: 5 }, locked: true, part_link: 'PT1' }),
        frase({ prop_id: 'P2', span: { s: 12, e: 14 }, locked: true, part_link: 'PT2' }),
      ],
      activeSceneId: 'PT1',
    });
    expect(frontier(s, 'frases')).toBe(6);
  });

  it('1ª frase da cena recua ao INÍCIO da vizinha anterior (back-reach)', () => {
    const s = sess({
      parts: [cena('PT1', { s: 2, e: 9 }), cena('PT2', { s: 10, e: 19 })],
      frases: [frase({ prop_id: 'P1', span: { s: 3, e: 4 }, locked: true, part_link: 'PT1' })],
      activeSceneId: 'PT2',
    });
    expect(frontier(s, 'frases')).toBe(2);
  });

  it('sem vizinha anterior, o piso é o início da própria cena', () => {
    const s = sess({ parts: [cena('PT1', { s: 2, e: 9 })], activeSceneId: 'PT1' });
    expect(frontier(s, 'frases')).toBe(2);
  });

  it('sem activeSceneId, a cena ativa é a primeira produtiva (referência L395)', () => {
    const s = sess({ parts: [cena('PT1', { s: 2, e: 9 }), cena('PT2', { s: 10, e: 19 })] });
    expect(frontier(s, 'frases')).toBe(2);
  });

  it('sem cena produtiva (só none_fit), vale o ramo genérico', () => {
    const s = sess({
      parts: [cena('PT1', { s: 0, e: 9 }, { tag_state: 'none_fit', scene_kind: null })],
      frases: [frase({ span: { s: 2, e: 5 }, locked: true, part_link: 'PT1' })],
    });
    expect(frontier(s, 'frases')).toBe(6);
  });

  it('quirk: no ramo de cena ativa a fronteira NÃO é capada no fim do colar', () => {
    const s = sess({
      parts: [cena('PT1', { s: 10, e: 23 })],
      frases: [frase({ span: { s: 20, e: 23 }, locked: true, part_link: 'PT1' })],
      activeSceneId: 'PT1',
    });
    expect(frontier(s, 'frases')).toBe(24);
  });
});

describe('activeAnchor (referência L416–423)', () => {
  it('nulo ao ouvir a história inteira (camada whole) ou sem item corrente', () => {
    expect(activeAnchor(sess())).toBeNull();
    expect(activeAnchor(sess({ current: { layer: 'parts', index: -1 } }))).toBeNull();
  });

  it('nulo quando o item corrente está travado', () => {
    const s = sess({
      parts: [part({ span: { s: 0, e: 9 }, locked: true })],
      current: { layer: 'parts', index: 0 },
    });
    expect(activeAnchor(s)).toBeNull();
  });

  it('âncora no slot de cena destravado, com início na fronteira', () => {
    const s = sess({
      parts: [
        part({ part_id: 'PT1', span: { s: 0, e: 9 }, locked: true }),
        part({ part_id: 'PT2' }),
      ],
      current: { layer: 'parts', index: 1 },
    });
    expect(activeAnchor(s)).toEqual({ layer: 'parts', index: 1, start: 10 });
  });

  it('âncora também na camada de frases (slot destravado)', () => {
    const s = sess({
      frases: [frase({})],
      current: { layer: 'frases', index: 0 },
    });
    expect(activeAnchor(s)).toEqual({ layer: 'frases', index: 0, start: 0 });
  });

  it('na camada de frases com cena produtiva, o start herda o piso com back-reach', () => {
    const s = sess({
      parts: [cena('PT1', { s: 2, e: 9 })],
      frases: [frase({})],
      current: { layer: 'frases', index: 0 },
      activeSceneId: 'PT1',
    });
    expect(activeAnchor(s)).toEqual({ layer: 'frases', index: 0, start: 2 });
  });
});
