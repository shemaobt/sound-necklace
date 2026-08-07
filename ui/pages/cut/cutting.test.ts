import { describe, expect, it, vi } from 'vitest';

import type { ScenePart } from '../../../domain';
import { scenePalette } from '../../tokens';
import {
  lockedItemAt,
  playClick,
  playEditWindow,
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

describe('playClick — intenção do clique → player (cordInteraction L571–582)', () => {
  it('transport toca a conta tocada (fallback sem ancoragem)', () => {
    const player = spyPlayer();
    playClick(player, { type: 'transport', bead: 3 });
    expect(player.play).toHaveBeenCalledWith(3, 3);
  });

  it('range toca o trecho recém-fechado, inteiro', () => {
    const player = spyPlayer();
    playClick(player, { type: 'range', s: 4, e: 17 });
    expect(player.play).toHaveBeenCalledWith(4, 17);
  });

  it('range degenerado (a conta recém-fixada) toca só ela', () => {
    const player = spyPlayer();
    playClick(player, { type: 'range', s: 7, e: 7 });
    expect(player.play).toHaveBeenCalledWith(7, 7);
  });

  it('edge toca só a borda que se moveu, nunca o trecho', () => {
    const player = spyPlayer();
    playClick(player, { type: 'edge', bead: 10 });
    expect(player.playEdge).toHaveBeenCalledWith(10);
    expect(player.play).not.toHaveBeenCalled();
  });
});

describe('playEditWindow — prévia ao editar a fronteira (regra 5)', () => {
  it('toca ~4 contas antes do limite até ~3 depois', () => {
    const player = spyPlayer();
    playEditWindow(player, 12, 24);
    expect(player.play).toHaveBeenCalledWith(8, 15);
  });

  it('satura nas bordas do colar', () => {
    const player = spyPlayer();
    playEditWindow(player, 1, 24);
    expect(player.play).toHaveBeenCalledWith(0, 4);
    playEditWindow(player, 23, 24);
    expect(player.play).toHaveBeenCalledWith(19, 23);
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
