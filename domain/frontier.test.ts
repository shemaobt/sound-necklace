import { describe, expect, it } from 'vitest';

import { activeAnchor, frontier } from './frontier';
import { buildBeads } from './grid';
import { createSession, type Frase, type ScenePart, type SessionState } from './state';

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
    statement_pt: '',
    qa: [],
    span: null,
    part_link: null,
    locked: false,
    flagged: false,
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
});
