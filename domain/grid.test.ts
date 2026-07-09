import { describe, expect, it } from 'vitest';

import { beadAtTime, buildBeads, spanDur } from './grid';

describe('buildBeads', () => {
  it('duração múltipla exata de beadSec: sem conta parcial', () => {
    const beads = buildBeads(10, 0.25);
    expect(beads).toHaveLength(40);
    expect(beads[0]).toEqual({ index: 0, startTime: 0, endTime: 0.25 });
    expect(beads[39]).toEqual({ index: 39, startTime: 9.75, endTime: 10 });
  });

  it('duração não múltipla: conta parcial no fim, endTime clampado à duração', () => {
    // caso golden partial-bead: 455000 amostras / 44100 Hz = 10.317460317…s
    const dur = 455000 / 44100;
    const beads = buildBeads(dur, 0.3);
    expect(beads).toHaveLength(35);
    expect(beads[34]).toEqual({ index: 34, startTime: 10.2, endTime: 10.31746 });
  });

  it('epsilon 1e-9: múltiplo exato com float impreciso não gera conta parcial fantasma', () => {
    // 0.9/0.3 = 2.9999999999999996 em double; sem o epsilon seriam 2+1 contas erradas
    const beads = buildBeads(0.9, 0.3);
    expect(beads).toHaveLength(3);
    expect(beads[2]).toEqual({ index: 2, startTime: 0.6, endTime: 0.9 });
  });

  it('tempos da grade saem limpos, sem artefatos de float (0.9, nunca 0.8999999999999999)', () => {
    // a referência coage via +(x).toFixed(6) — parte do contrato de bytes
    const beads = buildBeads(2, 0.3);
    expect(beads[3]?.startTime).toBe(0.9);
    expect(beads[2]?.endTime).toBe(0.9);
  });

  it('duração zero: grade vazia', () => {
    expect(buildBeads(0, 0.25)).toEqual([]);
  });

  it('duração menor que beadSec: uma única conta parcial terminando na duração', () => {
    const beads = buildBeads(0.1, 0.25);
    expect(beads).toHaveLength(1);
    expect(beads[0]).toEqual({ index: 0, startTime: 0, endTime: 0.1 });
  });

  it('rejeita beadSec inválido (zero, negativo, NaN)', () => {
    // Desvio DELIBERADO da referência, exigido pela DoD da ENG-214: lá a
    // validação `!(beadSec>0)` vive no caller segment() (UI); domain/ é puro
    // e não tem caller de UI, então o guard desce para cá.
    expect(() => buildBeads(10, 0)).toThrow(/beadSec/);
    expect(() => buildBeads(10, -0.25)).toThrow(/beadSec/);
    expect(() => buildBeads(10, Number.NaN)).toThrow(/beadSec/);
  });
});

describe('beadAtTime', () => {
  it('mapeia tempo para índice de conta com o epsilon da referência', () => {
    // 0.6/0.3 = 1.9999999999999998 em double; sem epsilon cairia na conta 1
    expect(beadAtTime(0.6, 0.3, 35)).toBe(2);
    expect(beadAtTime(0, 0.25, 40)).toBe(0);
    expect(beadAtTime(0.74, 0.25, 40)).toBe(2);
  });

  it('clampa aos limites da grade', () => {
    expect(beadAtTime(-5, 0.25, 40)).toBe(0);
    expect(beadAtTime(1000, 0.25, 40)).toBe(39);
  });
});

describe('spanDur', () => {
  it('duração do span = fim da última conta − início da primeira', () => {
    const beads = buildBeads(10, 0.25);
    expect(spanDur(beads, 4, 7)).toBe(1);
    expect(spanDur(beads, 0, 39)).toBe(10);
    expect(spanDur(beads, 3, 3)).toBe(0.25);
  });

  it('rejeita índices fora da grade', () => {
    const beads = buildBeads(10, 0.25);
    expect(() => spanDur(beads, 0, 40)).toThrow(/fora da grade/);
    expect(() => spanDur(beads, -1, 5)).toThrow(/fora da grade/);
  });
});
