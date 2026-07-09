import { describe, expect, it } from 'vitest';

import { computeCoverage } from './coverage';
import { buildBeads } from './grid';
import { createSession, type ScenePart, type SessionState } from './state';

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

function tagged(
  part_id: string,
  scene_kind: string,
  conf: ScenePart['scene_kind_confidence'],
): ScenePart {
  return mkPart(part_id, { tag_state: 'tagged', scene_kind, scene_kind_confidence: conf });
}

function kindRow(state: SessionState, value: string) {
  return computeCoverage(state).kinds.find((k) => k.value === value)!;
}

describe('computeCoverage — firme vs. hesitante', () => {
  it('conta alta e média como firme; baixa como hesitante', () => {
    const s = stateWith([
      tagged('PT1', 'GLEANING_SCENE', 'alta'),
      tagged('PT2', 'GLEANING_SCENE', 'média'),
      tagged('PT3', 'GLEANING_SCENE', 'baixa'),
    ]);
    const row = kindRow(s, 'GLEANING_SCENE');
    expect(row.firm).toBe(2);
    expect(row.hesitant).toBe(1);
  });
});

describe('computeCoverage — alvos e status por tipo', () => {
  it('rara vira "covered" com 1 firme; "candidato a ausência" quando firme é 0', () => {
    const semFirme = stateWith([]);
    const rara = kindRow(semFirme, 'VOW_SCENE');
    expect(rara.tier).toBe('ALTA');
    expect(rara.target).toBe(1);
    expect(rara.status).toBe('open');
    expect(rara.candidateAbsence).toBe(true);

    const comFirme = stateWith([tagged('PT1', 'VOW_SCENE', 'alta')]);
    const cob = kindRow(comFirme, 'VOW_SCENE');
    expect(cob.status).toBe('covered');
    expect(cob.candidateAbsence).toBe(false);
  });

  it('rara só com hesitante (baixa) fica "partial" mas SEGUE candidato a ausência (firme=0)', () => {
    const s = stateWith([tagged('PT1', 'LAMENT_SCENE', 'baixa')]);
    const row = kindRow(s, 'LAMENT_SCENE');
    expect(row.status).toBe('partial');
    // open-rara da referência = tier ALTA && firme===0 (o hesitante não conta)
    expect(row.candidateAbsence).toBe(true);
  });

  it('comum exige 3 firmes para cobrir', () => {
    const dois = stateWith([
      tagged('PT1', 'REPORT_SCENE', 'alta'),
      tagged('PT2', 'REPORT_SCENE', 'alta'),
    ]);
    expect(kindRow(dois, 'REPORT_SCENE')).toMatchObject({
      tier: 'comum',
      target: 3,
      status: 'partial',
    });

    const tres = stateWith([
      tagged('PT1', 'REPORT_SCENE', 'alta'),
      tagged('PT2', 'REPORT_SCENE', 'média'),
      tagged('PT3', 'REPORT_SCENE', 'baixa'),
    ]);
    // 2 firmes + 1 hesitante = firme<3 → ainda parcial
    expect(kindRow(tres, 'REPORT_SCENE').status).toBe('partial');
  });
});

describe('computeCoverage — agregados', () => {
  it('resume raras cobertas, none-fit, produtivas e triadas', () => {
    const s = stateWith([
      tagged('PT1', 'GLEANING_SCENE', 'alta'),
      mkPart('PT2', { tag_state: 'none_fit' }),
      mkPart('PT3'), // pending
    ]);
    const cov = computeCoverage(s);
    expect(cov.rareTotal).toBe(19);
    expect(cov.rareCovered).toBe(1);
    expect(cov.rareOpen).toBe(18);
    expect(cov.noneFit).toBe(1);
    expect(cov.productive).toBe(1);
    expect(cov.triaged).toBe(2);
    expect(cov.total).toBe(3);
  });
});

describe('computeCoverage — trava all-none-fit', () => {
  it('allNoneFit quando todas triadas e nenhuma produtiva', () => {
    const s = stateWith([
      mkPart('PT1', { tag_state: 'none_fit' }),
      mkPart('PT2', { tag_state: 'none_fit' }),
    ]);
    expect(computeCoverage(s).allNoneFit).toBe(true);
  });

  it('não trava se ainda há cena pendente', () => {
    const s = stateWith([mkPart('PT1', { tag_state: 'none_fit' }), mkPart('PT2')]);
    expect(computeCoverage(s).allNoneFit).toBe(false);
  });

  it('não trava se há ao menos uma produtiva', () => {
    const s = stateWith([
      tagged('PT1', 'GLEANING_SCENE', 'alta'),
      mkPart('PT2', { tag_state: 'none_fit' }),
    ]);
    expect(computeCoverage(s).allNoneFit).toBe(false);
  });

  it('não trava sem nenhuma cena travada', () => {
    expect(computeCoverage(stateWith([])).allNoneFit).toBe(false);
  });
});
