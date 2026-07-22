import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { buildManifesto, buildRetorno, serializeArtifact } from '../../contracts';
import { type SessionState } from '../../domain';

import { replaySessionSteps, type GoldenCase, type GoldenStep } from './registry';

const __dirname = dirname(fileURLToPath(import.meta.url));

function minimalFlow(): GoldenCase {
  return JSON.parse(
    readFileSync(join(__dirname, 'cases', 'minimal-flow.json'), 'utf8'),
  ) as GoldenCase;
}

/** Prefixo comum: história confirmada, 2 cenas cortadas, triadas, segmentação. */
function toSegmentacao(segment: GoldenStep): GoldenStep[] {
  return [
    segment,
    { type: 'confirmWhole' },
    { type: 'cutScene', endBead: 9 },
    { type: 'cutScene', endBead: 23 },
    { type: 'confirmParts' },
    { type: 'triage', partIndex: 0, kind: 'GLEANING_SCENE', confidence: 'alta' },
    { type: 'triage', partIndex: 1, none_fit: true },
    { type: 'triagemDone' },
  ];
}

describe('replaySessionSteps — passos de cena + triagem + frases do golden case 2', () => {
  it('replaya o minimal-flow até as respostas e para pendente no export (ENG-227/233)', () => {
    const { steps } = minimalFlow();
    const r = replaySessionSteps(steps);

    // status documentado: cenas + triagem + frases + respostas consumidos;
    // export pendente
    expect(r.pendingAt).toEqual({ index: 16, type: 'export' });

    // 96000 amostras / 8000 Hz = 12 s a 0.5 s/conta → 24 contas
    expect(r.state.totalBeads).toBe(24);
    expect(r.state.whole.confirmed).toBe(true);
    expect(r.state.parts.map((p) => ({ id: p.part_id, span: p.span, locked: p.locked }))).toEqual([
      { id: 'PT1', span: { s: 0, e: 9 }, locked: true },
      { id: 'PT2', span: { s: 10, e: 23 }, locked: true },
    ]);
    expect(r.state.partsConfirmed).toBe(true);

    // triagem: PT1 = GLEANING alta (produtiva); PT2 = nenhum se encaixa
    expect(r.state.parts[0]).toMatchObject({
      tag_state: 'tagged',
      scene_kind: 'GLEANING_SCENE',
      scene_kind_confidence: 'alta',
    });
    expect(r.state.parts[1]).toMatchObject({
      tag_state: 'none_fit',
      scene_kind: null,
      scene_kind_confidence: null,
    });

    // frases: P1 travada {0..4} em PT1; slot P2 dangling
    expect(r.state.frases[0]).toMatchObject({
      prop_id: 'P1',
      locked: true,
      span: { s: 0, e: 4 },
      part_link: 'PT1',
    });
    expect(r.state.frases[1]).toMatchObject({ prop_id: 'P2', locked: false, span: null });

    // sceneDone na última produtiva → o fluxo guiado avançou ao Mapeamento
    expect(r.state.mode).toBe('mapeamento');

    // respostas do caso nos buckets certos; não respondidas semeadas com ""
    expect(r.state.mapping?.level1['recontar']).toBe(
      'Uma história sobre respiga e retorno ao lar.',
    );
    expect(r.state.mapping?.level1['tempo']).toBe('');
    expect(r.state.mapping?.level1['lugar']).toBe('');
    expect(r.state.mapping?.level2['PT1']?.['quem']).toBe('Duas mulheres e os ceifeiros.');
    expect(r.state.mapping?.level2['PT2']?.['descrever']).toBe(
      'Um trecho que não se encaixa nos tipos.',
    );
    expect(r.state.mapping?.level3['P1']?.['oque']).toBe(
      'A chegada ao campo — com acentos: coração, você, média.',
    );
  });

  it('confirmPhrase com borderDecision=move desliza a costura (doMove)', () => {
    const { steps } = minimalFlow();
    const replayed = replaySessionSteps([
      ...toSegmentacao(steps[0] as GoldenStep),
      // PT1 {0..9}: seleção até 12 cruza o fim (delta 3 = limiar de cena de 10)
      { type: 'phraseSelect', s: 0, e: 12 },
      { type: 'confirmPhrase', borderDecision: 'move' },
    ]);

    expect(replayed.pendingAt).toBeNull();
    expect(replayed.state.parts[0]!.span).toEqual({ s: 0, e: 12 }); // cresceu
    expect(replayed.state.parts[1]!.span).toEqual({ s: 13, e: 23 }); // encolheu
    expect(replayed.state.frases[0]).toMatchObject({
      locked: true,
      span: { s: 0, e: 12 },
      part_link: 'PT1',
    });
  });

  it('confirmPhrase com borderDecision=reanchor re-ancora na fronteira sem travar', () => {
    const { steps } = minimalFlow();
    const replayed = replaySessionSteps([
      ...toSegmentacao(steps[0] as GoldenStep),
      { type: 'phraseSelect', s: 0, e: 12 },
      { type: 'confirmPhrase', borderDecision: 'reanchor' },
    ]);
    expect(replayed.state.frases[0]!.locked).toBe(false);
    // um-toque (primeFrase): reancorar re-semeia o início na fronteira (0), não null
    expect(replayed.state.selection).toEqual({ s: 0, e: 0 });
    expect(replayed.state.pendingStart).toBe(0);
    expect(replayed.state.parts[0]!.span).toEqual({ s: 0, e: 9 }); // costura intacta
  });

  it('removePhrase reusa o P# e mantém o replay íntegro', () => {
    const { steps } = minimalFlow();
    const replayed = replaySessionSteps([
      ...toSegmentacao(steps[0] as GoldenStep),
      { type: 'phraseSelect', s: 0, e: 4 },
      { type: 'confirmPhrase' }, // P1 travada; P2 auto-add
      { type: 'removePhrase', index: 0 }, // P1 some; P# volta ao pool
      { type: 'phraseSelect', s: 0, e: 3 },
      { type: 'confirmPhrase' },
    ]);

    expect(replayed.pendingAt).toBeNull();
    const locked = replayed.state.frases.filter((f) => f.locked);
    expect(locked).toHaveLength(1);
    expect(locked[0]).toMatchObject({ span: { s: 0, e: 3 }, part_link: 'PT1' });
    // o próximo slot auto-add reusa o P1 liberado
    expect(replayed.state.frases.map((f) => f.prop_id)).toContain('P1');
  });

  it('sceneDone com forceEmpty atravessa o aviso de cena vazia (2ª chamada)', () => {
    const { steps } = minimalFlow();
    const replayed = replaySessionSteps([
      ...toSegmentacao(steps[0] as GoldenStep),
      { type: 'sceneDone', forceEmpty: true },
    ]);
    // única produtiva sem frases → Mapeamento alcançado com zero frases (quirk)
    expect(replayed.state.mode).toBe('mapeamento');
    expect(replayed.state.frases.filter((f) => f.locked)).toHaveLength(0);
  });

  it('golden case 2: os DOIS JSONs saem byte-idênticos pelos mappers reais (ENG-227)', () => {
    // o caso segue PENDENTE no golden.test (relatório .md = ENG-233), mas os
    // artefatos JSON já são byte-comparáveis: com os passos `answer` do ENG-226
    // já na main, o replay avança por eles e para no `export`, exportando via
    // contracts/
    const { steps } = minimalFlow();
    const r = replaySessionSteps(steps);
    expect(r.pendingAt).toEqual({ index: 16, type: 'export' });

    const golden = (file: string): Buffer =>
      readFileSync(join(__dirname, 'expected', 'minimal-flow', file));
    expect(
      Buffer.from(serializeArtifact(buildManifesto(r.state)), 'utf8').equals(
        golden('manifesto-contas.json'),
      ),
      'manifesto-contas.json: bytes divergem do golden',
    ).toBe(true);
    expect(
      Buffer.from(serializeArtifact(buildRetorno(r.state)), 'utf8').equals(
        golden('retorno-ancoragem.json'),
      ),
      'retorno-ancoragem.json: bytes divergem do golden',
    ).toBe(true);
  });

  it('importReturn: semear pela via de retorno → export sai byte-idêntico (ENG-234)', () => {
    const segment = minimalFlow().steps[0] as GoldenStep;
    const seg = replaySessionSteps([segment]);
    const N = seg.state.totalBeads; // 24

    // um retorno "de origem" cujos mappers reais dão o byte-golden desta prova
    const source: SessionState = {
      ...seg.state,
      whole: { id: 'S1', span: { s: 0, e: N - 1 }, confirmed: true },
      parts: [
        {
          part_id: 'PT1',
          span: { s: 0, e: 9 },
          locked: true,
          scene_kind: 'GLEANING_SCENE',
          scene_kind_confidence: 'alta',
          tag_state: 'tagged',
        },
        {
          part_id: 'PT2',
          span: { s: 10, e: N - 1 },
          locked: true,
          scene_kind: null,
          scene_kind_confidence: null,
          tag_state: 'none_fit',
        },
      ],
      partsConfirmed: true,
      frases: [
        {
          prop_id: 'P1',
          statement_pt: '',
          qa: [],
          span: { s: 0, e: 4 },
          part_link: 'PT1',
          locked: true,
        },
      ],
    };
    const seedBytes = serializeArtifact(buildRetorno(source));

    // semeia uma sessão FRESCA (mesma grade/slug/manifest) e re-exporta
    const r = replaySessionSteps([
      segment,
      { type: 'importReturn', dto: JSON.parse(seedBytes) as unknown },
    ]);
    expect(r.pendingAt).toBeNull();
    expect(serializeArtifact(buildRetorno(r.state))).toBe(seedBytes);
  });

  it('recusa passo de sessão antes do segment', () => {
    expect(() => replaySessionSteps([{ type: 'confirmWhole' }])).toThrow(/segment/);
  });

  it('falha ALTO quando o domínio recusa um passo — nunca replay pela metade', () => {
    const { steps } = minimalFlow();
    const segment = steps[0] as GoldenStep;
    // confirmParts sem nenhuma cena travada → NO_LOCKED_SCENE
    expect(() =>
      replaySessionSteps([segment, { type: 'confirmWhole' }, { type: 'confirmParts' }]),
    ).toThrow(/NO_LOCKED_SCENE/);
  });
});
