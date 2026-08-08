import { describe, expect, it, vi } from 'vitest';

import type { ScenePart } from '../../../domain';
import { scenePalette } from '../../tokens';
import {
  lockedItemAt,
  playClick,
  playDragDelta,
  playHoverEdge,
  rankLockedScenes,
  sceneColor,
  sceneOrdinal,
} from './cutting';

/**
 * Helpers puros da estação de corte (Escuta 2): o intérprete efeito→player que
 * traduz a INTENÇÃO do redutor de seleção em chamadas do `Player`, com o playhead
 * como entrada (regras de segmentação, docs/segmentation-rules.md); o
 * número de cena por extenso e por idioma SEM dígitos (§9.2), o ranqueamento das
 * cenas travadas por posição no colar e a cor de cena (§4.2). Blackbox.
 */

function spyPlayer() {
  return {
    toggle: vi.fn(),
    play: vi.fn(),
    playEdge: vi.fn(),
    stop: vi.fn(),
    state: { key: null, playing: false, paused: false },
    onHead: vi.fn(() => () => {}),
  };
}

describe('playClick — intenção do clique → player, com o playhead', () => {
  it('transport toca a conta tocada (fallback sem ancoragem)', () => {
    const player = spyPlayer();
    playClick(player, { type: 'transport', bead: 3 }, 23, null);
    expect(player.play).toHaveBeenCalledWith(3, 3);
  });

  it('run toca do começo marcado até o fim do pai, e deixa correr', () => {
    const player = spyPlayer();
    playClick(player, { type: 'run', from: 4 }, 23, null);
    expect(player.play).toHaveBeenCalledWith(4, 23);
  });

  it('set-end com o playhead JÁ no fim marcado (ou além): para', () => {
    const player = spyPlayer();
    playClick(player, { type: 'set-end', end: 10 }, 23, 10);
    expect(player.stop).toHaveBeenCalled();
    expect(player.play).not.toHaveBeenCalled();
  });

  it('set-end com o playhead ANTES do fim marcado: não interrompe', () => {
    const player = spyPlayer();
    playClick(player, { type: 'set-end', end: 10 }, 23, 6);
    expect(player.stop).not.toHaveBeenCalled();
    expect(player.play).not.toHaveBeenCalled();
  });

  it('set-end sem nada tocando: não faz nada', () => {
    const player = spyPlayer();
    playClick(player, { type: 'set-end', end: 10 }, 23, null);
    expect(player.stop).not.toHaveBeenCalled();
  });

  it('range toca o trecho resultante inteiro, não a borda', () => {
    const player = spyPlayer();
    playClick(player, { type: 'range', s: 4, e: 17 }, 23, null);
    expect(player.play).toHaveBeenCalledWith(4, 17);
    expect(player.playEdge).not.toHaveBeenCalled();
  });

  /**
   * Ajustar a borda com o áudio CORRENDO não pode reiniciar (relato do dono,
   * 2026-08-07): "a reprodução não chegou no limite novo, então deveria continuar".
   * E quando é preciso soar, o que interessa é o TRECHO QUE MUDOU DE DONO — do limite
   * antigo ao novo —, não a cena de novo nem ~1 s solto em volta da borda.
   */
  it('adjust com o playhead DENTRO do novo trecho não faz nada — deixa correr', () => {
    const player = spyPlayer();
    playClick(player, { type: 'adjust', s: 0, e: 14, delta: { s: 10, e: 14 } }, 23, 5);
    expect(player.play).not.toHaveBeenCalled();
    expect(player.playEdge).not.toHaveBeenCalled();
    expect(player.stop).not.toHaveBeenCalled();
  });

  it('adjust nas pontas do trecho ainda conta como dentro (bordas inclusivas)', () => {
    const player = spyPlayer();
    playClick(player, { type: 'adjust', s: 4, e: 14, delta: { s: 10, e: 14 } }, 23, 14);
    expect(player.play).not.toHaveBeenCalled();
    playClick(player, { type: 'adjust', s: 4, e: 14, delta: { s: 4, e: 6 } }, 23, 4);
    expect(player.play).not.toHaveBeenCalled();
  });

  it('esticar o fim com NADA tocando toca só o pedaço GANHO', () => {
    const player = spyPlayer();
    playClick(player, { type: 'adjust', s: 0, e: 14, delta: { s: 10, e: 14 } }, 23, null);
    expect(player.play).toHaveBeenCalledWith(10, 14);
    expect(player.playEdge).not.toHaveBeenCalled();
  });

  it('encolher o fim toca o pedaço PERDIDO — o que saiu da cena', () => {
    const player = spyPlayer();
    playClick(player, { type: 'adjust', s: 0, e: 10, delta: { s: 10, e: 14 } }, 23, null);
    expect(player.play).toHaveBeenCalledWith(10, 14);
  });

  it('com o playhead já ALÉM do trecho, o pedaço que mudou também soa', () => {
    const player = spyPlayer();
    playClick(player, { type: 'adjust', s: 0, e: 14, delta: { s: 10, e: 14 } }, 23, 20);
    expect(player.play).toHaveBeenCalledWith(10, 14);
  });
});

/**
 * O dwell do hover (280 ms a ±1 conta de uma borda) é porte fiel da referência
 * L584-597, e o dono quer mantê-lo. Mas ele sequestrava o áudio: mover a borda e
 * deixar o ponteiro ali tocava o delta e, 280 ms depois, era cortado para tocar só a
 * borda. Decisão do dono (2026-08-07): o hover é uma lupa para o SILÊNCIO — havendo
 * som em curso, o som manda. Pausado conta como silêncio: nada está soando.
 */
describe('playHoverEdge — a lupa da borda só vale no silêncio', () => {
  const player = (playing: boolean, paused = false) => ({
    ...spyPlayer(),
    state: { key: playing ? 'k' : null, playing, paused },
  });

  it('com áudio tocando, o hover não faz nada', () => {
    const p = player(true);
    playHoverEdge(p, 12);
    expect(p.playEdge).not.toHaveBeenCalled();
  });

  it('no silêncio, confere a borda', () => {
    const p = player(false);
    playHoverEdge(p, 12);
    expect(p.playEdge).toHaveBeenCalledWith(12);
  });

  it('pausado é silêncio: nada está soando, então a lupa vale', () => {
    const p = player(true, true);
    playHoverEdge(p, 12);
    expect(p.playEdge).toHaveBeenCalledWith(12);
  });
});

describe('playDragDelta — o fim do arrasto soa como o clique soaria', () => {
  it('esticar o fim toca o pedaço ganho, uma vez só (no fim do gesto)', () => {
    const player = spyPlayer();
    playDragDelta(player, 10, 14, { s: 0, e: 14 }, null);
    expect(player.play).toHaveBeenCalledWith(10, 14);
  });

  it('encolher toca o pedaço perdido — o intervalo é ordenado', () => {
    const player = spyPlayer();
    playDragDelta(player, 14, 10, { s: 0, e: 10 }, null);
    expect(player.play).toHaveBeenCalledWith(10, 14);
  });

  it('soltar onde pegou não faz som', () => {
    const player = spyPlayer();
    playDragDelta(player, 10, 10, { s: 0, e: 10 }, null);
    expect(player.play).not.toHaveBeenCalled();
  });

  it('não interrompe áudio que já corre DENTRO do trecho — a mesma cortesia do clique', () => {
    const player = spyPlayer();
    playDragDelta(player, 10, 14, { s: 0, e: 14 }, 5);
    expect(player.play).not.toHaveBeenCalled();
  });
});

describe('sceneOrdinal — número de cena por extenso, por idioma, sem dígitos (PRD v2 §9.2)', () => {
  it('numera por extenso em PT a partir do índice 0-based', () => {
    expect(sceneOrdinal(0, 'pt')).toBe('um');
    expect(sceneOrdinal(1, 'pt')).toBe('dois');
    expect(sceneOrdinal(9, 'pt')).toBe('dez');
    expect(sceneOrdinal(19, 'pt')).toBe('vinte');
    expect(sceneOrdinal(20, 'pt')).toBe('vinte e um');
  });

  it('numera por extenso em EN (respeita o toggle de idioma)', () => {
    expect(sceneOrdinal(0, 'en')).toBe('one');
    expect(sceneOrdinal(1, 'en')).toBe('two');
    expect(sceneOrdinal(9, 'en')).toBe('ten');
    expect(sceneOrdinal(19, 'en')).toBe('twenty');
    expect(sceneOrdinal(20, 'en')).toBe('twenty-one');
  });

  it('nunca contém um dígito em nenhum idioma', () => {
    for (let i = 0; i < 120; i++) {
      expect(sceneOrdinal(i, 'pt')).not.toMatch(/\d/);
      expect(sceneOrdinal(i, 'en')).not.toMatch(/\d/);
    }
  });

  it('além do intervalo nomeável devolve vazio (o chamador omite o número)', () => {
    expect(sceneOrdinal(999, 'pt')).toBe('');
    expect(sceneOrdinal(999, 'en')).toBe('');
  });
});

describe('rankLockedScenes — numera pela posição no colar, não pela ordem do array', () => {
  const cena = (part_id: string, span: ScenePart['span'], locked = true): ScenePart => ({
    part_id,
    span,
    locked,
    scene_kind: null,
    scene_kind_confidence: null,
    tag_state: 'pending',
  });

  it('ordena as cenas travadas por bead inicial e atribui rank 0..N-1', () => {
    // retorno salvo: parts em ordem de CRIAÇÃO ≠ ordem de bead (contracts/imports.ts)
    const parts = [cena('PT3', { s: 5, e: 9 }), cena('PT1', { s: 0, e: 4 })];
    const ranked = rankLockedScenes(parts);

    expect(ranked.map((r) => r.rank)).toEqual([0, 1]);
    // a cena que começa na conta 0 é a primeira do colar (rank 0), mesmo estando em parts[1]
    expect(ranked[0]!.span.s).toBe(0);
    expect(ranked[0]!.rank).toBe(0);
    expect(ranked[0]!.arrayIndex).toBe(1);
    // e a que começa na conta 5 é a segunda (rank 1), embora seja parts[0]
    expect(ranked[1]!.span.s).toBe(5);
    expect(ranked[1]!.arrayIndex).toBe(0);
  });

  it('ignora cenas destravadas ou sem span (só as travadas contam)', () => {
    const parts = [
      cena('PT1', { s: 0, e: 4 }),
      cena('PT2', null),
      cena('PT3', { s: 5, e: 9 }, false),
    ];
    const ranked = rankLockedScenes(parts);
    expect(ranked).toHaveLength(1);
    expect(ranked[0]!.part.part_id).toBe('PT1');
  });
});

describe('lockedItemAt — de que cena travada é esta conta? (ENG-293)', () => {
  const cena = (part_id: string, span: ScenePart['span'], locked: boolean): ScenePart => ({
    part_id,
    span,
    locked,
    scene_kind: null,
    scene_kind_confidence: null,
    tag_state: 'pending',
  });
  const travadas = [cena('PT1', { s: 0, e: 3 }, true), cena('PT2', { s: 4, e: 6 }, true)];

  it('acha a cena que contém a conta, com as duas bordas dentro', () => {
    expect(lockedItemAt(travadas, 0)?.part_id).toBe('PT1');
    expect(lockedItemAt(travadas, 2)?.part_id).toBe('PT1');
    expect(lockedItemAt(travadas, 3)?.part_id).toBe('PT1');
    expect(lockedItemAt(travadas, 4)?.part_id).toBe('PT2');
    expect(lockedItemAt(travadas, 6)?.part_id).toBe('PT2');
  });

  it('conta fora de toda cena travada não tem cena', () => {
    expect(lockedItemAt(travadas, 7)).toBeNull();
  });

  it('a cena em corte não conta: só as travadas são para ouvir', () => {
    expect(lockedItemAt([cena('PT1', { s: 0, e: 3 }, false)], 2)).toBeNull();
  });

  it('cena travada sem span ainda não ocupa conta nenhuma', () => {
    expect(lockedItemAt([cena('PT1', null, true)], 0)).toBeNull();
  });
});

describe('sceneColor — cor de cena por índice, cíclica (§4.2)', () => {
  it('cores adjacentes diferem e o índice cicla na paleta', () => {
    expect(sceneColor(0)).not.toEqual(sceneColor(1));
    expect(sceneColor(0)).toEqual(sceneColor(scenePalette.length));
  });
});
