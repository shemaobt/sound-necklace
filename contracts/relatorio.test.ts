import { describe, expect, it } from 'vitest';

import {
  buildBeads,
  createSession,
  questionSequence,
  voiceAnswerPath,
  type Frase,
  type Mapping,
  type ScenePart,
  type SessionState,
} from '../domain';

import { buildMapReport, relatorioFilename, reportExportStatus } from './relatorio';

function baseState(over: Partial<SessionState> = {}): SessionState {
  const beadSec = 0.5;
  const durationSec = 12;
  const s = createSession({
    durationSec,
    beadSec,
    beads: buildBeads(durationSec, beadSec),
    manifestId: 'fnv1a32:d31a8419',
    audioFilename: 'fluxo-minimo.wav',
    slug: 'fluxo-minimo',
  });
  return { ...s, ...over };
}

function part(over: Partial<ScenePart>): ScenePart {
  return {
    part_id: 'PT1',
    span: { s: 0, e: 9 },
    locked: true,
    scene_kind: 'GLEANING_SCENE',
    scene_kind_confidence: 'high',
    tag_state: 'tagged',
    ...over,
  };
}

function frase(over: Partial<Frase>): Frase {
  return {
    prop_id: 'P1',
    statement: '',
    qa: [],
    span: { s: 0, e: 4 },
    part_link: 'PT1',
    locked: true,
    ...over,
  };
}

const emptyMapping = (): Mapping => ({ level1: {}, level2: {}, level3: {} });

describe('buildMapReport — cabeçalho e esqueleto', () => {
  it('abre com o título (travessão U+2014) e o slug', () => {
    const md = buildMapReport(baseState({ mapping: emptyMapping() }));
    expect(md.startsWith('# Meaning Mapping Report — fluxo-minimo\n\n')).toBe(true);
  });

  it('emite a linha de contexto com o manifest e os pontos médios U+00B7', () => {
    const md = buildMapReport(
      baseState({ manifestId: 'fnv1a32:d31a8419', mapping: emptyMapping() }),
    );
    expect(md).toContain(
      '> `source_domain: oral_archive` · `speaker_role: LISTENER_NOT_STORYTELLER` · manifest: `fnv1a32:d31a8419`',
    );
  });

  it('sem manifest, a célula do manifest fica vazia (fallback "")', () => {
    const md = buildMapReport(baseState({ manifestId: '', mapping: emptyMapping() }));
    expect(md).toContain('manifest: ``');
  });

  it('termina com exatamente UM newline final', () => {
    const md = buildMapReport(baseState({ mapping: emptyMapping() }));
    expect(md.endsWith('\n')).toBe(true);
    expect(md.endsWith('\n\n')).toBe(false);
  });

  it('sem slug, o título cai em "story", igual ao fallback do filename (ENG-359)', () => {
    const md = buildMapReport(baseState({ slug: '', mapping: emptyMapping() }));
    expect(md.startsWith('# Meaning Mapping Report — story\n')).toBe(true);
  });

  it('com mapping nulo, todas as respostas saem como _(no answer)_ (sem quebrar)', () => {
    const md = buildMapReport(baseState({ parts: [part({})], mapping: null }));
    expect(md).toContain('_(whole)_\n  _(no answer)_');
    expect(md).toContain(
      '- **Who appears in this stretch? People, animals, a group, someone who is spoken about?** _(no answer)_',
    );
  });
});

describe('buildMapReport — Nível 1', () => {
  it('cada pergunta ocupa duas linhas: título com _(field)_ e resposta indentada com 2 espaços', () => {
    const md = buildMapReport(
      baseState({ mapping: { ...emptyMapping(), level1: { recontar: 'A story.' } } }),
    );
    expect(md).toContain(
      '- **Tell this story in your own words, as if to someone who has never heard it.** _(whole)_\n  A story.',
    );
  });

  it('resposta ausente vira _(no answer)_ na linha indentada', () => {
    const md = buildMapReport(baseState({ mapping: emptyMapping() }));
    expect(md).toContain('_(whole)_\n  _(no answer)_');
  });

  it('resposta só de espaços é tratada como ausente', () => {
    const md = buildMapReport(
      baseState({ mapping: { ...emptyMapping(), level1: { recontar: '   ' } } }),
    );
    expect(md).toContain('_(whole)_\n  _(no answer)_');
  });
});

describe('buildMapReport — Nível 2', () => {
  it('cena tagged mostra o scene_kind; linha de pergunta é bold e traz a resposta na mesma linha', () => {
    const md = buildMapReport(
      baseState({
        parts: [part({})],
        mapping: { ...emptyMapping(), level2: { PT1: { quem: 'Two women.' } } },
      }),
    );
    expect(md).toContain('### Scene 1 (S1) — scene_kind: GLEANING_SCENE\n');
    expect(md).toContain(
      '- **Who appears in this stretch? People, animals, a group, someone who is spoken about?** Two women.',
    );
  });

  it('cena none_fit mostra (nenhum) e o marcador [none_fit]', () => {
    const md = buildMapReport(
      baseState({
        parts: [
          part({
            part_id: 'PT2',
            scene_kind: null,
            scene_kind_confidence: null,
            tag_state: 'none_fit',
          }),
        ],
        mapping: emptyMapping(),
      }),
    );
    expect(md).toContain('### Scene 1 (S1) — scene_kind: (none) [none_fit]');
  });
});

describe('buildMapReport — Nível 3', () => {
  it('bloco da frase traz travessão U+2014 antes de "contas" e meia-risca U+2013 entre as contas; linhas L3 NÃO são bold', () => {
    const md = buildMapReport(
      baseState({
        parts: [part({})],
        frases: [frase({})],
        mapping: { ...emptyMapping(), level3: { P1: { oque: 'The arrival.' } } },
      }),
    );
    expect(md).toContain('**Phrase 1 (P1) — beads 0–4:**');
    expect(md).toContain('- What happened in this phrase? The arrival.');
    // não-bold: a linha da pergunta L3 não começa com "- **"
    expect(md).not.toContain('- **What happened in this phrase?');
  });

  it('numeração S# tem lacuna quando uma cena none_fit vem antes de uma produtiva', () => {
    const md = buildMapReport(
      baseState({
        parts: [
          part({
            part_id: 'PT1',
            scene_kind: null,
            scene_kind_confidence: null,
            tag_state: 'none_fit',
          }),
          part({ part_id: 'PT2', span: { s: 10, e: 23 } }),
        ],
        frases: [frase({ prop_id: 'P1', part_link: 'PT2', span: { s: 10, e: 23 } })],
        mapping: { ...emptyMapping(), level3: { P1: {} } },
      }),
    );
    // a única cena produtiva é a PT2, cujo S# é 2 (a none_fit ocupa o índice 1)
    expect(md).toContain('### Scene 2 (S2) — GLEANING_SCENE');
    expect(md).toContain('**Phrase 1 (P1) — beads 10–23:**');
  });

  it('cena produtiva sem frases travadas gera o heading sem blocos de Frase (slot dangling é ignorado)', () => {
    const md = buildMapReport(
      baseState({
        parts: [part({})],
        // slot P1 destravado (dangling): a frase existe mas não travou
        frases: [frase({ locked: false, span: null })],
        mapping: emptyMapping(),
      }),
    );
    expect(md).toContain('### Scene 1 (S1) — GLEANING_SCENE');
    expect(md).not.toContain('**Phrase 1');
  });
});

describe('buildMapReport — a voz nunca entra no artefato (ENG-356)', () => {
  it('gravação sem texto confirmado deixa a célula em _(no answer)_', () => {
    const md = buildMapReport(
      baseState({ parts: [part({})], frases: [frase({})], mapping: emptyMapping() }),
    );
    expect(md).toContain('_(whole)_\n  _(no answer)_');
    expect(md).not.toContain('respostas/');
    expect(md).not.toContain('.webm');
  });

  it('o texto confirmado é a única coisa que ocupa a célula', () => {
    const md = buildMapReport(
      baseState({ mapping: { ...emptyMapping(), level1: { recontar: 'Confirmed answer.' } } }),
    );
    expect(md).toContain('_(whole)_\n  Confirmed answer.');
  });

  it('o artefato inteiro sai em inglês — nenhum resíduo do esqueleto PT-BR', () => {
    const md = buildMapReport(
      baseState({ parts: [part({})], frases: [frase({})], mapping: emptyMapping() }),
    );
    for (const pt of [
      'Nível',
      'Relatório',
      'sem resposta',
      '### Cena ',
      '**Frase ',
      ' — contas ',
    ]) {
      expect(md, `resíduo PT-BR: ${pt}`).not.toContain(pt);
    }
describe('reportExportStatus — inglês confirmado é requisito de exportação (ENG-327)', () => {
  const stateWith = (mapping: Mapping): SessionState =>
    baseState({ parts: [part({})], frases: [frase({})], mapping });

  const allPaths = (state: SessionState): Set<string> =>
    new Set(questionSequence(state).map((slot) => voiceAnswerPath(slot)));

  it('sem gravação nenhuma, exporta — perguntas em branco não travam', () => {
    const state = stateWith(emptyMapping());
    expect(reportExportStatus(state, new Set())).toEqual({ canExport: true, pendingSlots: 0 });
  });

  it('uma resposta gravada sem texto confirmado trava a exportação', () => {
    const state = stateWith(emptyMapping());
    const voice = new Set([voiceAnswerPath({ level: 1, k: 'recontar' })]);
    expect(reportExportStatus(state, voice)).toEqual({ canExport: false, pendingSlots: 1 });
  });

  it('confirmar o texto daquela resposta libera a exportação', () => {
    const state = stateWith({ ...emptyMapping(), level1: { recontar: 'Confirmed English.' } });
    const voice = new Set([voiceAnswerPath({ level: 1, k: 'recontar' })]);
    expect(reportExportStatus(state, voice)).toEqual({ canExport: true, pendingSlots: 0 });
  });

  it('conta cada resposta gravada e ainda não confirmada, nos três níveis', () => {
    // 1 cena travada + 1 frase ⇒ 11 (N1) + 5 (N2) + 5 (N3) = 21 perguntas, todas gravadas
    const state = stateWith(emptyMapping());
    expect(reportExportStatus(state, allPaths(state))).toEqual({
      canExport: false,
      pendingSlots: 21,
    });
  });

  it('conta só as que ainda faltam quando parte já foi confirmada', () => {
    const state = stateWith({
      ...emptyMapping(),
      level1: { recontar: 'Confirmed.', arco_inicio_fim: 'Confirmed.' },
    });
    const voice = new Set([
      voiceAnswerPath({ level: 1, k: 'recontar' }),
      voiceAnswerPath({ level: 1, k: 'arco_inicio_fim' }),
      voiceAnswerPath({ level: 1, k: 'lugar' }),
      voiceAnswerPath({ level: 2, partId: 'PT1', k: 'quem' }),
    ]);
    expect(reportExportStatus(state, voice)).toEqual({ canExport: false, pendingSlots: 2 });
  });

  it('texto só de espaços não conta como confirmado (o .md também o descartaria)', () => {
    const state = stateWith({ ...emptyMapping(), level1: { recontar: '   ' } });
    const voice = new Set([voiceAnswerPath({ level: 1, k: 'recontar' })]);
    expect(reportExportStatus(state, voice)).toEqual({ canExport: false, pendingSlots: 1 });
  });
});

describe('relatorioFilename', () => {
  it('usa o slug', () => {
    expect(relatorioFilename('fluxo-minimo')).toBe('fluxo-minimo-mapping-report.md');
  });

  it('cai no mesmo fallback "story" dos JSONs (a divergência da referência caiu na ENG-359)', () => {
    expect(relatorioFilename('')).toBe('story-mapping-report.md');
  });
});
