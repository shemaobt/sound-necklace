import { describe, expect, it, vi } from 'vitest';

import type { PlayAction, ScenePart } from '../../../domain';
import { scenePalette } from '../../tokens';
import { lockedSceneAt, playActionOn, sceneColor, sceneLabel } from './cutting';

/**
 * Helpers puros da estação de corte (Escuta 2): o intérprete efeito→player que
 * traduz a `PlayAction` do redutor de seleção em chamadas do `Player` (áudio
 * instantâneo por clique, §8.2), o rótulo de cena SEM dígitos (§9.2) e a cor de
 * cena por índice (paleta terrosa §4.2). Blackbox: entradas → chamadas/valores.
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

describe('playActionOn — efeito-como-valor → player (PRD v2 §8.2)', () => {
  it('single-bead toca só aquela conta (play b..b)', () => {
    const player = spyPlayer();
    playActionOn(player, { type: 'single-bead', bead: 4 });
    expect(player.play).toHaveBeenCalledWith(4, 4);
    expect(player.playEdge).not.toHaveBeenCalled();
  });

  it('range toca o intervalo inteiro (play s..e)', () => {
    const player = spyPlayer();
    playActionOn(player, { type: 'range', s: 2, e: 7 });
    expect(player.play).toHaveBeenCalledWith(2, 7);
  });

  it('edge toca SÓ a janela da fronteira ajustada (playEdge)', () => {
    const player = spyPlayer();
    const action: PlayAction = { type: 'edge', edge: 5, s: 1, e: 9 };
    playActionOn(player, action);
    expect(player.playEdge).toHaveBeenCalledWith(5);
    expect(player.play).not.toHaveBeenCalled();
  });

  it('transport toca a partir da conta (fallback sem ancoragem)', () => {
    const player = spyPlayer();
    playActionOn(player, { type: 'transport', bead: 3 });
    expect(player.play).toHaveBeenCalledWith(3, 3);
  });
});

describe('sceneLabel — rótulo de cena sem dígitos (PRD v2 §9.2)', () => {
  it('numera por extenso a partir do índice 0-based', () => {
    expect(sceneLabel(0)).toBe('Cena um');
    expect(sceneLabel(1)).toBe('Cena dois');
    expect(sceneLabel(9)).toBe('Cena dez');
    expect(sceneLabel(19)).toBe('Cena vinte');
    expect(sceneLabel(20)).toBe('Cena vinte e um');
  });

  it('nunca contém um dígito', () => {
    for (let i = 0; i < 120; i++) {
      expect(sceneLabel(i)).not.toMatch(/\d/);
    }
  });

  it('além do intervalo nomeável cai em "Cena" sem número', () => {
    expect(sceneLabel(999)).toBe('Cena');
  });
});

describe('lockedSceneAt — de que cena travada é esta conta? (ENG-293)', () => {
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
    expect(lockedSceneAt(travadas, 0)?.part_id).toBe('PT1');
    expect(lockedSceneAt(travadas, 2)?.part_id).toBe('PT1');
    expect(lockedSceneAt(travadas, 3)?.part_id).toBe('PT1');
    expect(lockedSceneAt(travadas, 4)?.part_id).toBe('PT2');
    expect(lockedSceneAt(travadas, 6)?.part_id).toBe('PT2');
  });

  it('conta fora de toda cena travada não tem cena', () => {
    expect(lockedSceneAt(travadas, 7)).toBeNull();
  });

  it('a cena em corte não conta: só as travadas são para ouvir', () => {
    expect(lockedSceneAt([cena('PT1', { s: 0, e: 3 }, false)], 2)).toBeNull();
  });

  it('cena travada sem span ainda não ocupa conta nenhuma', () => {
    expect(lockedSceneAt([cena('PT1', null, true)], 0)).toBeNull();
  });
});

describe('sceneColor — cor de cena por índice, cíclica (§4.2)', () => {
  it('cores adjacentes diferem e o índice cicla na paleta', () => {
    expect(sceneColor(0)).not.toEqual(sceneColor(1));
    expect(sceneColor(0)).toEqual(sceneColor(scenePalette.length));
  });
});
