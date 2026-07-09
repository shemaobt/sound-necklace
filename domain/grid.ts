/**
 * Grade de contas — port 1:1 de docs/reference/index.html (buildBeads L437–443,
 * beadAtTime L390, spanDur L389). Byte-identidade com a referência é contrato
 * (PRD v2 §6.1, §11): não "corrigir" o epsilon nem o toFixed.
 */

export interface Bead {
  index: number;
  startTime: number;
  endTime: number;
}

export function buildBeads(dur: number, beadSec: number): Bead[] {
  // na referência este guard vive no caller segment() (UI); aqui desce para o
  // domínio puro (DoD da ENG-214) — a referência nunca chama com valor inválido
  if (!(beadSec > 0)) throw new Error('beadSec precisa ser maior que zero');
  let total = Math.floor(dur / beadSec + 1e-9);
  if (dur - total * beadSec > 1e-9) total += 1;
  const beads: Bead[] = [];
  for (let i = 0; i < total; i++) {
    beads.push({
      index: i,
      startTime: +(i * beadSec).toFixed(6),
      endTime: +Math.min((i + 1) * beadSec, dur).toFixed(6),
    });
  }
  return beads;
}

export function beadAtTime(t: number, beadSec: number, totalBeads: number): number {
  const i = Math.floor(t / beadSec + 1e-9);
  return Math.max(0, Math.min(totalBeads - 1, i));
}

export function spanDur(beads: readonly Bead[], s: number, e: number): number {
  const first = beads[s];
  const last = beads[e];
  if (!first || !last) throw new Error(`span fora da grade: ${s}–${e}`);
  return last.endTime - first.startTime;
}
