import { describe, expect, it, vi } from 'vitest';

import type { PlayAction, ScenePart } from '../../../domain';
import { scenePalette } from '../../tokens';
import { lockedItemAt, playActionOn, rankLockedScenes, sceneColor, sceneOrdinal } from './cutting';

/**
 * Helpers puros da estação de corte (Escuta 2): o intérprete efeito→player que
 * traduz a `PlayAction` do redutor de seleção em chamadas do `Player` (áudio
 * instantâneo por clique, §8.2), o número de cena por extenso e por idioma SEM
 * dígitos (§9.2), o ranqueamento das cenas travadas por posição no colar e a cor
 * de cena por índice (paleta terrosa §4.2). Blackbox: entradas → chamadas/valores.
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
