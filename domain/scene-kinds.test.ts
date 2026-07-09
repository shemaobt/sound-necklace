import { describe, expect, it } from 'vitest';

import { SCENE_KINDS, SK_PT, skEnShort, skShort, T_TARGET } from './scene-kinds';

/**
 * A ontologia dos scene_kind é o contrato com o Compilador (eixo scene_kind,
 * pin 5314907). Estes testes afirmam byte-identidade com a lista da referência
 * (docs/reference/index.html L355–366) — se a geração mudar, isto reprova.
 */
describe('SCENE_KINDS — 27 tipos byte-idênticos à referência', () => {
  it('lista os 27 valores + tiers na ordem exata da referência', () => {
    expect(SCENE_KINDS).toEqual([
      { value: 'BIRTH_SCENE', tier: 'ALTA' },
      { value: 'CONSENT_SCENE', tier: 'ALTA' },
      { value: 'DEPARTURE_SCENE', tier: 'ALTA' },
      { value: 'GATE_COURT_CONVENING_SCENE', tier: 'ALTA' },
      { value: 'GENEALOGY_SCENE', tier: 'ALTA' },
      { value: 'GLEANING_SCENE', tier: 'ALTA' },
      { value: 'INITIATIVE_SCENE', tier: 'ALTA' },
      { value: 'LAMENT_SCENE', tier: 'ALTA' },
      { value: 'MARRIAGE_SCENE', tier: 'ALTA' },
      { value: 'MEAL_SCENE', tier: 'ALTA' },
      { value: 'NAMING_SCENE', tier: 'ALTA' },
      { value: 'NARRATOR_INTRODUCTION_SCENE', tier: 'ALTA' },
      { value: 'NIGHT_APPROACH_SCENE', tier: 'ALTA' },
      { value: 'OPENING_CHRONICLE_SCENE', tier: 'ALTA' },
      { value: 'PROVISION_HOMECOMING_SCENE', tier: 'ALTA' },
      { value: 'REDEEMER_RECOGNITION_SCENE', tier: 'ALTA' },
      { value: 'REDEMPTION_DECLINE_SCENE', tier: 'ALTA' },
      { value: 'REDEMPTION_OFFER_SCENE', tier: 'ALTA' },
      { value: 'VOW_SCENE', tier: 'ALTA' },
      { value: 'APPEAL_SCENE', tier: 'comum' },
      { value: 'BLESSING_SCENE', tier: 'comum' },
      { value: 'INSTRUCTION_SCENE', tier: 'comum' },
      { value: 'RATIFICATION_SCENE', tier: 'comum' },
      { value: 'ARRIVAL_SCENE', tier: 'comum' },
      { value: 'BEREAVEMENT_SCENE', tier: 'comum' },
      { value: 'NARRATOR_FRAMING_CLOSE_SCENE', tier: 'comum' },
      { value: 'REPORT_SCENE', tier: 'comum' },
    ]);
  });

  it('tem 19 raras (ALTA) e 8 comuns', () => {
    expect(SCENE_KINDS.filter((s) => s.tier === 'ALTA')).toHaveLength(19);
    expect(SCENE_KINDS.filter((s) => s.tier === 'comum')).toHaveLength(8);
  });
});

describe('SK_PT — rótulos de exibição PT-BR', () => {
  it('cobre todos os 27 valores', () => {
    for (const { value } of SCENE_KINDS) {
      expect(SK_PT[value]).toBeTruthy();
    }
    expect(Object.keys(SK_PT)).toHaveLength(27);
  });

  it('traduz valores conhecidos (só exibição — o dado fica em inglês)', () => {
    expect(SK_PT.GLEANING_SCENE).toBe('Respiga');
    expect(SK_PT.GATE_COURT_CONVENING_SCENE).toBe('Convocação do tribunal na porta');
  });
});

describe('skEnShort / skShort', () => {
  it('skEnShort remove _SCENE, troca _ por espaço, minúsculas com inicial maiúscula', () => {
    expect(skEnShort('GLEANING_SCENE')).toBe('Gleaning');
    expect(skEnShort('GATE_COURT_CONVENING_SCENE')).toBe('Gate court convening');
  });

  it('skShort prefere o rótulo PT-BR e cai no inglês curto quando não há tradução', () => {
    expect(skShort('GLEANING_SCENE')).toBe('Respiga');
    expect(skShort('FOO_SCENE')).toBe('Foo');
  });
});

describe('T_TARGET — alvos de cobertura', () => {
  it('raras exigem 1 firme, comuns 3', () => {
    expect(T_TARGET.ALTA).toBe(1);
    expect(T_TARGET.comum).toBe(3);
  });
});
