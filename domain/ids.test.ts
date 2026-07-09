import { describe, expect, it } from 'vitest';

import { nextPartId, nextPid } from './ids';

describe('nextPartId (PT#)', () => {
  it('começa em PT1 e avança sequencialmente', () => {
    expect(nextPartId([])).toBe('PT1');
    expect(nextPartId([{ part_id: 'PT1' }])).toBe('PT2');
    expect(nextPartId([{ part_id: 'PT1' }, { part_id: 'PT2' }])).toBe('PT3');
  });

  it('preenche a menor lacuna livre', () => {
    expect(nextPartId([{ part_id: 'PT1' }, { part_id: 'PT3' }])).toBe('PT2');
    expect(nextPartId([{ part_id: 'PT2' }, { part_id: 'PT3' }])).toBe('PT1');
  });

  it('reusa o ID após remoção', () => {
    const parts = [{ part_id: 'PT1' }, { part_id: 'PT2' }];
    const after = parts.filter((p) => p.part_id !== 'PT1');
    expect(nextPartId(after)).toBe('PT1');
  });

  it('entradas não travadas (slots pendentes) ocupam seu ID', () => {
    const parts = [
      { part_id: 'PT1', locked: true },
      { part_id: 'PT2', locked: false },
    ];
    expect(nextPartId(parts)).toBe('PT3');
  });
});

describe('nextPid (P#)', () => {
  it('começa em P1 e preenche a menor lacuna livre', () => {
    expect(nextPid([])).toBe('P1');
    expect(nextPid([{ prop_id: 'P1' }, { prop_id: 'P3' }])).toBe('P2');
  });

  it('preenche a lacuna e conta slots não travados', () => {
    expect(nextPid([{ prop_id: 'P2' }])).toBe('P1');
    const frases = [
      { prop_id: 'P1', locked: false },
      { prop_id: 'P2', locked: true },
    ];
    expect(nextPid(frases)).toBe('P3');
  });
});
