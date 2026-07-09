/**
 * Geometria do colar — porta pura da referência (docs/reference/index.html):
 * a janela de render da Segmentação (L506–509), a posição absoluta de cada conta
 * (L521–526), o mapeamento pointer→conta `beadAtXY` (L554–560) e os retângulos de
 * banda `drawBand` (L485–498). Sem DOM, sem framework: entradas → saídas exatas.
 */

import type { Span } from '../../../domain';

export interface Size {
  slot: number;
  bead: number;
  row: number;
}

/** Tamanho M da referência (L484). O seletor de tamanho fica oculto (minimalismo). */
export const SIZE_M: Size = { slot: 25, bead: 18, row: 31 };

export interface WindowRange {
  winS: number;
  winE: number;
}

export interface BeadPos {
  left: number;
  top: number;
}

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Range de contas a renderizar. `window` = span da cena ativa (Segmentação); o
 * organismo abre uma margem `max(3, round(2/beadSec))` de cada lado (L509). Sem
 * cena ativa, mostra a história inteira.
 */
export function resolveWindow(total: number, beadSec: number, window: Span | null): WindowRange {
  if (!window) return { winS: 0, winE: total - 1 };
  const margin = Math.max(3, Math.round(2 / beadSec));
  return {
    winS: Math.max(0, window.s - margin),
    winE: Math.min(total - 1, window.e + margin),
  };
}

/** Contas por linha a partir da largura do container (L505). Piso de 1. */
export function beadsPerRow(width: number, size: Size): number {
  return Math.max(1, Math.floor(width / size.slot));
}

/** Centro (left/top) da conta `index` na grade absoluta, dada a janela e o bpr. */
export function beadPosition(index: number, winS: number, bpr: number, size: Size): BeadPos {
  const local = index - winS;
  const row = Math.floor(local / bpr);
  const col = local % bpr;
  return {
    left: col * size.slot + size.slot / 2,
    top: 6 + row * size.row + size.row / 2,
  };
}

/**
 * Coordenadas RELATIVAS ao container (`clientX - rect.left`, `clientY - rect.top`)
 * → índice de conta, clampeado à janela [winS, winE]. Espelha `beadAtXY` (L554–560).
 */
export function beadAtXY(
  x: number,
  y: number,
  winS: number,
  winE: number,
  bpr: number,
  size: Size,
): number {
  const col = Math.max(0, Math.min(bpr - 1, Math.floor(x / size.slot)));
  const row = Math.max(0, Math.floor((y - 6) / size.row));
  return Math.max(winS, Math.min(winE, winS + row * bpr + col));
}

/**
 * Retângulos de uma banda `[s, e]` — um por linha quando a banda cruza a quebra
 * (L485–498). `pad` folga em px além da conta. Intervalo vazio (e < s) → nenhum.
 */
export function bandRects(
  s: number,
  e: number,
  winS: number,
  bpr: number,
  size: Size,
  pad: number,
): Rect[] {
  if (e < s) return [];
  const ls = s - winS;
  const le = e - winS;
  const rowStart = Math.floor(ls / bpr);
  const rowEnd = Math.floor(le / bpr);
  const rects: Rect[] = [];
  for (let r = rowStart; r <= rowEnd; r++) {
    const colStart = r === rowStart ? ls % bpr : 0;
    const colEnd = r === rowEnd ? le % bpr : bpr - 1;
    rects.push({
      left: colStart * size.slot + (size.slot - size.bead) / 2 - pad,
      width: (colEnd - colStart + 1) * size.slot - (size.slot - size.bead) + 2 * pad,
      top: 6 + r * size.row + (size.row - size.bead) / 2 - pad,
      height: size.bead + 2 * pad,
    });
  }
  return rects;
}
