import { describe, expect, it } from 'vitest';

import { modeLocks, resolveMode, setMode, triagemDone } from './gates';
import { buildBeads } from './grid';
import { createSession, type Frase, type ScenePart, type SessionState } from './state';

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

function tagged(part_id: string): ScenePart {
  return mkPart(part_id, {
    tag_state: 'tagged',
    scene_kind: 'GLEANING_SCENE',
    scene_kind_confidence: 'high',
  });
}

function mkFrase(prop_id: string, over: Partial<Frase> = {}): Frase {
  return {
    prop_id,
    statement: '',
    qa: [],
    span: { s: 0, e: 1 },
    part_link: 'PT1',
    locked: true,
    ...over,
  };
}

function stateWith(over: Partial<SessionState> = {}): SessionState {
  const base = createSession({
    durationSec: 12,
    beadSec: 0.5,
    beads: buildBeads(12, 0.5),
    manifestId: 'fnv1a32:00000000',
    audioFilename: 'a.wav',
    slug: 's',
  });
  return { ...base, ...over };
}

describe('triagemDone — gate "Já classifiquei todas as cenas →"', () => {
  it('habilita quando todas triadas e ≥1 produtiva', () => {
    const s = stateWith({ parts: [tagged('PT1'), mkPart('PT2', { tag_state: 'none_fit' })] });
    expect(triagemDone(s)).toEqual({ enabled: true, message: '' });
  });

  it('pede para classificar todas quando há pendente (aspas curvas verbatim)', () => {
    const s = stateWith({ parts: [tagged('PT1'), mkPart('PT2')] });
    const r = triagemDone(s);
    expect(r.enabled).toBe(false);
    expect(r.message).toBe(
      'Classifique todas as cenas (ou marque “nenhum se encaixa”) para seguir.',
    );
  });

  it('avisa quando todas triadas mas nenhuma produtiva (travessão verbatim)', () => {
    const s = stateWith({ parts: [mkPart('PT1', { tag_state: 'none_fit' })] });
    const r = triagemDone(s);
    expect(r.enabled).toBe(false);
    expect(r.message).toBe('Nenhuma cena se encaixa em Rute — escolha outra história.');
  });

  it('desabilitado sem nenhuma cena travada', () => {
    expect(triagemDone(stateWith({ parts: [] })).enabled).toBe(false);
  });
});

describe('modeLocks — abas como indicador de progresso', () => {
  it('escuta sempre habilitada; triagem só com partsConfirmed', () => {
    expect(modeLocks(stateWith({ partsConfirmed: false })).escuta).toBe(true);
    expect(modeLocks(stateWith({ partsConfirmed: false })).triagem).toBe(false);
    expect(modeLocks(stateWith({ partsConfirmed: true })).triagem).toBe(true);
  });

  it('segmentação exige ≥1 produtiva', () => {
    expect(
      modeLocks(stateWith({ parts: [mkPart('PT1', { tag_state: 'none_fit' })] })).segmentacao,
    ).toBe(false);
    expect(modeLocks(stateWith({ parts: [tagged('PT1')] })).segmentacao).toBe(true);
  });

  it('a segmentação é a última estação — não há chave depois dela (ENG-691)', () => {
    const s = stateWith({ parts: [tagged('PT1')], frases: [mkFrase('P1')] });
    expect(Object.keys(modeLocks(s))).toEqual(['escuta', 'triagem', 'segmentacao']);
  });
});

describe('resolveMode — redirect do fluxo guiado', () => {
  it('redireciona segmentacao/concluida para triagem quando não há produtiva', () => {
    const s = stateWith({ parts: [mkPart('PT1', { tag_state: 'none_fit' })] });
    expect(resolveMode(s, 'segmentacao')).toBe('triagem');
    expect(resolveMode(s, 'concluida')).toBe('triagem');
  });

  it('não redireciona quando há produtiva', () => {
    const s = stateWith({ parts: [tagged('PT1')] });
    expect(resolveMode(s, 'segmentacao')).toBe('segmentacao');
    expect(resolveMode(s, 'concluida')).toBe('concluida');
  });

  it('escuta e triagem passam direto', () => {
    const s = stateWith({ parts: [] });
    expect(resolveMode(s, 'escuta')).toBe('escuta');
    expect(resolveMode(s, 'triagem')).toBe('triagem');
  });
});

describe('setMode — transição de modo (redirect + efeitos)', () => {
  it('entrar em segmentacao com cenas travadas seta partsConfirmed', () => {
    const s = stateWith({ parts: [tagged('PT1')], partsConfirmed: false });
    const next = setMode(s, 'segmentacao');
    expect(next.mode).toBe('segmentacao');
    expect(next.partsConfirmed).toBe(true);
  });

  it('sempre derruba o modo de revisão', () => {
    const s = stateWith({ parts: [tagged('PT1')], review: true });
    expect(setMode(s, 'segmentacao').review).toBe(false);
    expect(setMode(s, 'escuta').review).toBe(false);
  });

  it('o redirect leva a triagem quando não há produtiva', () => {
    const s = stateWith({ parts: [mkPart('PT1', { tag_state: 'none_fit' })] });
    expect(setMode(s, 'segmentacao').mode).toBe('triagem');
  });

  it('encerrar é alcançável com zero frases (o redirect só checa produtiva)', () => {
    const s = stateWith({ parts: [tagged('PT1')], frases: [] });
    expect(setMode(s, 'concluida').mode).toBe('concluida');
  });
});
