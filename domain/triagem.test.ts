import { describe, expect, it } from 'vitest';

import { buildBeads } from './grid';
import { createSession, type ScenePart, type SessionState } from './state';
import { lockedParts, markNoneFit, productiveScenes, tagScene } from './triagem';

function mkPart(part_id: string, over: Partial<ScenePart> = {}): ScenePart {
  return {
    part_id,
    span: { s: 0, e: 1 },
    locked: true,
    scene_kind: null,
    scene_kind_confidence: null,
    tag_state: 'pending',
    ...over,
  };
}

function stateWith(parts: ScenePart[]): SessionState {
  const base = createSession({
    durationSec: 12,
    beadSec: 0.5,
    beads: buildBeads(12, 0.5),
    manifestId: 'fnv1a32:00000000',
    audioFilename: 'a.wav',
    slug: 's',
  });
  return { ...base, parts, partsConfirmed: true };
}

describe('tagScene — classifica uma cena com tipo + confiança', () => {
  it('marca a cena alvo como tagged e não toca nas outras', () => {
    const s = stateWith([mkPart('PT1'), mkPart('PT2')]);

    const next = tagScene(s, 'PT1', 'GLEANING_SCENE', 'high');

    expect(next.parts[0]).toMatchObject({
      part_id: 'PT1',
      tag_state: 'tagged',
      scene_kind: 'GLEANING_SCENE',
      scene_kind_confidence: 'high',
    });
    expect(next.parts[1]).toMatchObject({ part_id: 'PT2', tag_state: 'pending' });
  });

  it('preserva a confiança intermediária tal como recebida', () => {
    const s = stateWith([mkPart('PT1')]);
    const next = tagScene(s, 'PT1', 'MEAL_SCENE', 'medium');
    expect(next.parts[0]!.scene_kind_confidence).toBe('medium');
  });

  it('reclassificar substitui o tipo e a confiança anteriores', () => {
    const s = stateWith([
      mkPart('PT1', {
        tag_state: 'tagged',
        scene_kind: 'MEAL_SCENE',
        scene_kind_confidence: 'low',
      }),
    ]);
    const next = tagScene(s, 'PT1', 'VOW_SCENE', 'high');
    expect(next.parts[0]).toMatchObject({ scene_kind: 'VOW_SCENE', scene_kind_confidence: 'high' });
  });
});

describe('markNoneFit — marca "nenhum se encaixa"', () => {
  it('vira none_fit e zera tipo e confiança', () => {
    const s = stateWith([
      mkPart('PT1', {
        tag_state: 'tagged',
        scene_kind: 'MEAL_SCENE',
        scene_kind_confidence: 'high',
      }),
    ]);

    const next = markNoneFit(s, 'PT1');

    expect(next.parts[0]).toMatchObject({
      tag_state: 'none_fit',
      scene_kind: null,
      scene_kind_confidence: null,
    });
  });
});

describe('lockedParts — cenas travadas com span', () => {
  it('filtra travadas com span, na ordem de parts', () => {
    const s = stateWith([
      mkPart('PT1'),
      mkPart('PT2', { locked: false }),
      mkPart('PT3', { span: null }),
      mkPart('PT4'),
    ]);
    expect(lockedParts(s).map((p) => p.part_id)).toEqual(['PT1', 'PT4']);
  });
});

describe('productiveScenes — travadas, com span, tagged e com scene_kind', () => {
  it('inclui só as tagged com tipo, na ordem de parts', () => {
    const s = stateWith([
      mkPart('PT1', {
        tag_state: 'tagged',
        scene_kind: 'GLEANING_SCENE',
        scene_kind_confidence: 'high',
      }),
      mkPart('PT2', { tag_state: 'none_fit' }),
      mkPart('PT3', {
        tag_state: 'tagged',
        scene_kind: 'MEAL_SCENE',
        scene_kind_confidence: 'low',
      }),
      mkPart('PT4'),
    ]);
    expect(productiveScenes(s).map((p) => p.part_id)).toEqual(['PT1', 'PT3']);
  });

  it('exclui uma cena tagged que não está travada', () => {
    const s = stateWith([
      mkPart('PT1', {
        locked: false,
        tag_state: 'tagged',
        scene_kind: 'GLEANING_SCENE',
        scene_kind_confidence: 'high',
      }),
    ]);
    expect(productiveScenes(s)).toHaveLength(0);
  });
});
