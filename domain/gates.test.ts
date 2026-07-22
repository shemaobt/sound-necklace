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
    scene_kind_confidence: 'alta',
  });
}

function mkFrase(prop_id: string, over: Partial<Frase> = {}): Frase {
  return {
    prop_id,
    statement_pt: '',
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

  it('mapeamento exige ≥1 produtiva E ≥1 frase travada com span', () => {
    const prodSemFrase = stateWith({ parts: [tagged('PT1')] });
    expect(modeLocks(prodSemFrase).mapeamento).toBe(false);

    const prodComFrase = stateWith({ parts: [tagged('PT1')], frases: [mkFrase('P1')] });
    expect(modeLocks(prodComFrase).mapeamento).toBe(true);

    const fraseSemSpan = stateWith({
      parts: [tagged('PT1')],
      frases: [mkFrase('P1', { span: null })],
    });
    expect(modeLocks(fraseSemSpan).mapeamento).toBe(false);
  });
});

describe('resolveMode — redirect do fluxo guiado', () => {
  it('redireciona segmentacao/mapeamento para triagem quando não há produtiva', () => {
    const s = stateWith({ parts: [mkPart('PT1', { tag_state: 'none_fit' })] });
    expect(resolveMode(s, 'segmentacao')).toBe('triagem');
    expect(resolveMode(s, 'mapeamento')).toBe('triagem');
  });

  it('não redireciona quando há produtiva', () => {
    const s = stateWith({ parts: [tagged('PT1')] });
    expect(resolveMode(s, 'segmentacao')).toBe('segmentacao');
    expect(resolveMode(s, 'mapeamento')).toBe('mapeamento');
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

  it('mapeamento é alcançável com zero frases pelo fluxo guiado (redirect só checa produtiva)', () => {
    // aba de mapeamento fica travada sem frase, mas o fluxo guiado usa setMode direto
    const s = stateWith({ parts: [tagged('PT1')], frases: [] });
    expect(modeLocks(s).mapeamento).toBe(false);
    expect(setMode(s, 'mapeamento').mode).toBe('mapeamento');
  });
});
