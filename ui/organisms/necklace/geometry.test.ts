import { describe, expect, it } from 'vitest';

import {
  centerOffset,
  beadAtXY,
  beadPosition,
  beadsPerRow,
  bandRects,
  cordRects,
  followScrollTop,
  resolveWindow,
  rowShift,
  SIZE_M,
} from './geometry';

/**
 * Geometria do colar — porta 1:1 da referência (docs/reference/index.html):
 * janela item 4 (L506–509), posição das contas (L521–526), beadAtXY (L554–560),
 * drawBand (L485–498). Comportamento puro: entradas conhecidas → saídas exatas.
 */
describe('resolveWindow — range de render (referência L506–509)', () => {
  it('sem cena ativa, a janela é a história inteira', () => {
    expect(resolveWindow(100, 0.25, null)).toEqual({ winS: 0, winE: 99 });
  });

  it('com cena ativa, abre uma margem de max(3, round(2/beadSec)) contas de cada lado', () => {
    // beadSec 0.25 → margem 8; cena 20–30 → janela 12–38
    expect(resolveWindow(100, 0.25, { s: 20, e: 30 })).toEqual({ winS: 12, winE: 38 });
  });

  it('a margem tem piso 3 mesmo com contas longas', () => {
    // beadSec 1 → round(2) = 2, mas o piso 3 vence → cena 20–30 → 17–33
    expect(resolveWindow(100, 1, { s: 20, e: 30 })).toEqual({ winS: 17, winE: 33 });
  });

  it('a janela é clampeada às bordas do colar', () => {
    expect(resolveWindow(100, 0.25, { s: 2, e: 5 })).toEqual({ winS: 0, winE: 13 });
    expect(resolveWindow(100, 0.25, { s: 90, e: 98 })).toEqual({ winS: 82, winE: 99 });
  });
});

describe('beadsPerRow — contas por linha a partir da largura', () => {
  it('divide a largura pelo slot, arredondando para baixo', () => {
    expect(beadsPerRow(500, SIZE_M)).toBe(20);
  });

  it('garante ao menos uma conta por linha em larguras minúsculas', () => {
    expect(beadsPerRow(10, SIZE_M)).toBe(1);
  });
});

describe('beadPosition — centro da conta na grade absoluta (referência L525–526)', () => {
  it('posiciona a primeira conta da janela no topo-esquerda', () => {
    expect(beadPosition(12, 12, 51, 20, SIZE_M)).toEqual({ left: 12.5, top: 21.5 });
  });

  it('quebra para a linha seguinte após bpr contas', () => {
    // local 20 com bpr 20 → linha 1, coluna 0
    expect(beadPosition(32, 12, 51, 20, SIZE_M)).toEqual({ left: 12.5, top: 52.5 });
  });

  it('avança a coluna dentro da linha', () => {
    expect(beadPosition(13, 12, 51, 20, SIZE_M)).toEqual({ left: 37.5, top: 21.5 });
  });
});

/**
 * Protótipo v3 §4: "as linhas do colar são centralizadas horizontalmente (a última
 * fileira, incompleta, fica centrada em vez de alinhada à esquerda)". O deslocamento
 * é POR FILEIRA e relativo à largura do campo (`min(count, bpr)` contas), não à
 * largura do container — quem centra o campo inteiro é o `centerOffset`, e somar os
 * dois sem cuidado empurraria um colar curto para a direita.
 */
describe('rowShift — a fileira incompleta fica centrada (protótipo v3 §4)', () => {
  it('não desloca fileira cheia', () => {
    expect(rowShift(0, 45, 20, SIZE_M)).toBe(0);
    expect(rowShift(1, 45, 20, SIZE_M)).toBe(0);
  });

  it('centra a última fileira pela metade das colunas que faltam', () => {
    // 45 contas, bpr 20 → última fileira com 5; faltam 15 colunas → 7,5 slots
    expect(rowShift(2, 45, 20, SIZE_M)).toBe((15 * SIZE_M.slot) / 2);
  });

  it('colar mais curto que uma fileira não desloca (o centerOffset já o centra)', () => {
    expect(rowShift(0, 6, 20, SIZE_M)).toBe(0);
  });
});

describe('beadPosition — a fileira incompleta acompanha o rowShift', () => {
  it('desloca as contas da última fileira e deixa as cheias no lugar', () => {
    const shift = rowShift(2, 45, 20, SIZE_M);
    expect(beadPosition(40, 0, 44, 20, SIZE_M).left).toBe(shift + SIZE_M.slot / 2);
    expect(beadPosition(0, 0, 44, 20, SIZE_M).left).toBe(SIZE_M.slot / 2);
  });
});

describe('beadAtXY — pointer (relativo ao container) → índice, clampeado à janela', () => {
  it('acerta a conta na fileira incompleta, que está deslocada (desenho e clique juntos)', () => {
    // 45 contas (0…44), bpr 20: a conta 40 abre a 3ª fileira, centrada
    const pos = beadPosition(40, 0, 44, 20, SIZE_M);
    expect(beadAtXY(pos.left, pos.top, 0, 44, 20, SIZE_M)).toBe(40);
    const last = beadPosition(44, 0, 44, 20, SIZE_M);
    expect(beadAtXY(last.left, last.top, 0, 44, 20, SIZE_M)).toBe(44);
  });

  it('mapeia coluna e linha a partir das coordenadas', () => {
    expect(beadAtXY(12.5, 21.5, 0, 99, 20, SIZE_M)).toBe(0);
    expect(beadAtXY(37.5, 21.5, 0, 99, 20, SIZE_M)).toBe(1);
    expect(beadAtXY(12.5, 52.5, 0, 99, 20, SIZE_M)).toBe(20);
  });

  it('desloca o índice pelo início da janela (window offset)', () => {
    // segunda linha da janela que começa em 12 → 12 + 20 + 0
    expect(beadAtXY(12.5, 52.5, 12, 38, 20, SIZE_M)).toBe(32);
  });

  it('clampa às bordas da janela', () => {
    expect(beadAtXY(-50, -50, 12, 38, 20, SIZE_M)).toBe(12);
    expect(beadAtXY(99999, 99999, 12, 38, 20, SIZE_M)).toBe(38);
  });
});

describe('bandRects — retângulos por linha de uma banda (referência drawBand L485–498)', () => {
  it('uma banda dentro de uma linha rende um retângulo', () => {
    expect(bandRects(0, 2, 0, 39, 20, SIZE_M, 3)).toEqual([
      { left: 0.5, width: 74, top: 9.5, height: 24 },
    ]);
  });

  it('uma banda que cruza a quebra de linha rende um retângulo por linha', () => {
    expect(bandRects(18, 22, 0, 39, 20, SIZE_M, 3)).toHaveLength(2);
  });

  it('intervalo vazio (e < s) não rende retângulo', () => {
    expect(bandRects(5, 4, 0, 39, 20, SIZE_M, 3)).toEqual([]);
  });
});

describe('cordRects — fio atrás de cada fileira (referência _rowStyle)', () => {
  it('janela de 2 fileiras cheias + 1 parcial rende 3 retângulos', () => {
    const rects = cordRects(0, 59, 28, SIZE_M);
    expect(rects).toEqual([
      { left: 3.5, width: 693, top: 20.5, height: 2 },
      { left: 3.5, width: 693, top: 51.5, height: 2 },
      { left: 3.5 + (28 - 4) * (SIZE_M.slot / 2), width: 93, top: 82.5, height: 2 },
    ]);
  });

  it('janela de uma única fileira rende um retângulo', () => {
    expect(cordRects(0, 5, 28, SIZE_M)).toEqual([{ left: 3.5, width: 143, top: 20.5, height: 2 }]);
  });

  it('winS>0 não muda left/top relativo — a janela realinha em 0', () => {
    expect(cordRects(12, 39, 28, SIZE_M)).toEqual([
      { left: 3.5, width: 693, top: 20.5, height: 2 },
    ]);
  });
});

describe('centerOffset — colar sempre centrado (feedback do dono)', () => {
  it('fileira menor que a largura → metade da folga; cheia/estreita → 0', () => {
    // 6 contas no SIZE_M (slot 25) em 400px: 400 - 150 = 250 → 125
    expect(centerOffset(6, 16, 400, SIZE_M)).toBe(125);
    // fileira cheia (bpr limita): min(40, 16)*25 = 400 → 0
    expect(centerOffset(40, 16, 400, SIZE_M)).toBe(0);
    // container mais estreito que a fileira → nunca negativo
    expect(centerOffset(20, 20, 100, SIZE_M)).toBe(0);
  });
});

/**
 * ENG-387 — a janela acompanha a conta acesa.
 *
 * O colar agora rola dentro de uma janela em vez de fazer a página crescer. Quem
 * decide o quanto rolar é esta função pura: jsdom não tem layout, e no organismo
 * o playhead é aplicado imperativamente (o campo de contas é memoizado de
 * propósito, para não re-renderizar a 60fps). Aqui se testa a decisão; que a
 * conta acesa termine visível de verdade é asserção do teste em Chromium.
 */
describe('seguir a conta acesa dentro da janela', () => {
  const VIEWPORT = 200;

  it('não mexe quando a conta acesa já está à vista', () => {
    const { top } = beadPosition(3, 0, 29, 10, SIZE_M);

    expect(followScrollTop(top, SIZE_M, VIEWPORT, 0)).toBeNull();
  });

  it('rola quando a conta acesa passou abaixo da borda', () => {
    const { top } = beadPosition(300, 0, 29, 10, SIZE_M);

    const next = followScrollTop(top, SIZE_M, VIEWPORT, 0);

    expect(next).not.toBeNull();
    expect(next!).toBeGreaterThan(0);
    expect(top).toBeGreaterThanOrEqual(next!);
    expect(top).toBeLessThanOrEqual(next! + VIEWPORT);
  });

  it('rola de volta quando o usuário voltou para uma conta acima da janela', () => {
    const { top } = beadPosition(2, 0, 29, 10, SIZE_M);

    const next = followScrollTop(top, SIZE_M, VIEWPORT, 900);

    expect(next).not.toBeNull();
    expect(next!).toBeLessThan(900);
    expect(top).toBeGreaterThanOrEqual(next!);
  });

  it('nas primeiras fileiras nunca pede posição negativa', () => {
    const { top } = beadPosition(0, 0, 29, 10, SIZE_M);

    const next = followScrollTop(top, SIZE_M, VIEWPORT, 400);

    expect(next).toBe(0);
  });

  it('janela mais alta que o conteúdo: não há o que rolar', () => {
    const { top } = beadPosition(5, 0, 29, 10, SIZE_M);

    expect(followScrollTop(top, SIZE_M, 10_000, 0)).toBeNull();
  });
});
