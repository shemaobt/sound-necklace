import { describe, expect, it } from 'vitest';

import { buildBeads, createSession, type ScenePart, type SessionState } from '../../domain';
import { stepperStations } from './stepper-model';

function base(): SessionState {
  return createSession({
    durationSec: 4,
    beadSec: 0.25,
    beads: buildBeads(4, 0.25),
    manifestId: 'fnv1a32:deadbeef',
    audioFilename: 'h.wav',
    slug: 'h',
  });
}

const productive: ScenePart = {
  part_id: 'PT1',
  span: { s: 0, e: 3 },
  locked: true,
  scene_kind: 'BIRTH_SCENE',
  scene_kind_confidence: 'high',
  tag_state: 'tagged',
};

function pick(state: SessionState, key: string) {
  return stepperStations(state).find((s) => s.key === key)!;
}

describe('stepperStations — estados derivados dos gates do domínio', () => {
  it('sessão nova: Ouvir é a atual; nada além de Escuta é alcançável', () => {
    const s = base();
    expect(pick(s, 'listen').state).toBe('current');
    expect(pick(s, 'cut').reachable).toBe(false);
    expect(pick(s, 'triage').reachable).toBe(false);
  });

  it('história confirmada: Cortar vira a atual e alcançável; Ouvir fica concluída', () => {
    const s: SessionState = {
      ...base(),
      whole: { id: 'S1', span: { s: 0, e: 15 }, confirmed: true },
    };
    expect(pick(s, 'listen').state).toBe('done');
    expect(pick(s, 'cut').state).toBe('current');
    expect(pick(s, 'cut').reachable).toBe(true);
  });

  it('cenas confirmadas destravam Triage', () => {
    const s: SessionState = {
      ...base(),
      mode: 'triagem',
      whole: { id: 'S1', span: { s: 0, e: 15 }, confirmed: true },
      partsConfirmed: true,
    };
    expect(pick(s, 'triage').reachable).toBe(true);
    expect(pick(s, 'triage').state).toBe('current');
  });

  it('cena produtiva destrava Frases, a última estação do fluxo', () => {
    const s: SessionState = {
      ...base(),
      mode: 'segmentacao',
      whole: { id: 'S1', span: { s: 0, e: 15 }, confirmed: true },
      partsConfirmed: true,
      parts: [productive],
    };
    expect(pick(s, 'phrases').reachable).toBe(true);
    expect(pick(s, 'phrases').state).toBe('current');
    expect(pick(s, 'triage').state).toBe('done');
  });
});
