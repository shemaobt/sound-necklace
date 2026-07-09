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
  scene_kind_confidence: 'alta',
  tag_state: 'tagged',
};

function pick(state: SessionState, key: string) {
  return stepperStations(state).find((s) => s.key === key)!;
}

describe('stepperStations — estados derivados dos gates do domínio', () => {
  it('sessão nova: Ouvir é a atual; nada além de Escuta é alcançável', () => {
    const s = base();
    expect(pick(s, 'escuta1').state).toBe('current');
    expect(pick(s, 'escuta2').reachable).toBe(false);
    expect(pick(s, 'triagem').reachable).toBe(false);
  });

  it('história confirmada: Cortar vira a atual e alcançável; Ouvir fica concluída', () => {
    const s: SessionState = {
      ...base(),
      whole: { id: 'S1', span: { s: 0, e: 15 }, confirmed: true },
    };
    expect(pick(s, 'escuta1').state).toBe('done');
    expect(pick(s, 'escuta2').state).toBe('current');
    expect(pick(s, 'escuta2').reachable).toBe(true);
  });

  it('cenas confirmadas destravam Triagem', () => {
    const s: SessionState = {
      ...base(),
      mode: 'triagem',
      whole: { id: 'S1', span: { s: 0, e: 15 }, confirmed: true },
      partsConfirmed: true,
    };
    expect(pick(s, 'triagem').reachable).toBe(true);
    expect(pick(s, 'triagem').state).toBe('current');
  });

  it('cena produtiva destrava Frases mas não Conversa sem frase travada', () => {
    const s: SessionState = {
      ...base(),
      mode: 'segmentacao',
      whole: { id: 'S1', span: { s: 0, e: 15 }, confirmed: true },
      partsConfirmed: true,
      parts: [productive],
    };
    expect(pick(s, 'segmentacao').reachable).toBe(true);
    expect(pick(s, 'segmentacao').state).toBe('current');
    expect(pick(s, 'mapeamento').reachable).toBe(false);
  });

  it('frase travada destrava Conversa; passos anteriores ficam concluídos', () => {
    const s: SessionState = {
      ...base(),
      mode: 'mapeamento',
      whole: { id: 'S1', span: { s: 0, e: 15 }, confirmed: true },
      partsConfirmed: true,
      parts: [productive],
      frases: [
        {
          prop_id: 'P1',
          statement_pt: '',
          qa: [],
          span: { s: 0, e: 1 },
          part_link: 'PT1',
          locked: true,
          flagged: false,
        },
      ],
    };
    expect(pick(s, 'mapeamento').reachable).toBe(true);
    expect(pick(s, 'mapeamento').state).toBe('current');
    expect(pick(s, 'triagem').state).toBe('done');
    expect(pick(s, 'segmentacao').state).toBe('done');
    // Guardar (export) segue a cauda futura, ainda não alcançável (ENG-246).
    expect(pick(s, 'export').reachable).toBe(false);
    expect(pick(s, 'export').state).toBe('future');
  });
});
