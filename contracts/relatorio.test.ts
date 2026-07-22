import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  buildBeads,
  createSession,
  type Frase,
  type Mapping,
  type ScenePart,
  type SessionState,
} from '../domain';

import { buildMapReport, relatorioFilename } from './relatorio';

const __dirname = dirname(fileURLToPath(import.meta.url));

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
    scene_kind_confidence: 'alta',
    tag_state: 'tagged',
    ...over,
  };
}

function frase(over: Partial<Frase>): Frase {
  return {
    prop_id: 'P1',
    statement_pt: '',
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
    expect(md.startsWith('# Relatório de Mapeamento — fluxo-minimo\n\n')).toBe(true);
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

  it('sem slug, o título cai em "história" (COM acento — distinto do filename "historia")', () => {
    const md = buildMapReport(baseState({ slug: '', mapping: emptyMapping() }));
    expect(md.startsWith('# Relatório de Mapeamento — história\n')).toBe(true);
  });

  it('com mapping nulo, todas as respostas saem como _(sem resposta)_ (sem quebrar)', () => {
    const md = buildMapReport(baseState({ parts: [part({})], mapping: null }));
    expect(md).toContain('_(whole)_\n  _(sem resposta)_');
    expect(md).toContain(
      '- **Quem aparece nesse trecho? Pessoas, animais, um grupo, alguém de quem se fala?** _(sem resposta)_',
    );
  });
});

describe('buildMapReport — Nível 1', () => {
  it('cada pergunta ocupa duas linhas: título com _(field)_ e resposta indentada com 2 espaços', () => {
    const md = buildMapReport(
      baseState({ mapping: { ...emptyMapping(), level1: { recontar: 'Uma história.' } } }),
    );
    expect(md).toContain(
      '- **Conte essa história com as suas palavras, como se fosse para alguém que nunca ouviu.** _(whole)_\n  Uma história.',
    );
  });

  it('resposta ausente vira _(sem resposta)_ na linha indentada', () => {
    const md = buildMapReport(baseState({ mapping: emptyMapping() }));
    expect(md).toContain('_(whole)_\n  _(sem resposta)_');
  });

  it('resposta só de espaços é tratada como ausente', () => {
    const md = buildMapReport(
      baseState({ mapping: { ...emptyMapping(), level1: { recontar: '   ' } } }),
    );
    expect(md).toContain('_(whole)_\n  _(sem resposta)_');
  });
});

describe('buildMapReport — Nível 2', () => {
  it('cena tagged mostra o scene_kind; linha de pergunta é bold e traz a resposta na mesma linha', () => {
    const md = buildMapReport(
      baseState({
        parts: [part({})],
        mapping: { ...emptyMapping(), level2: { PT1: { quem: 'Duas mulheres.' } } },
      }),
    );
    expect(md).toContain('### Cena 1 (S1) — scene_kind: GLEANING_SCENE\n');
    expect(md).toContain(
      '- **Quem aparece nesse trecho? Pessoas, animais, um grupo, alguém de quem se fala?** Duas mulheres.',
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
    expect(md).toContain('### Cena 1 (S1) — scene_kind: (nenhum) [none_fit]');
  });
});

describe('buildMapReport — Nível 3', () => {
  it('bloco da frase traz travessão U+2014 antes de "contas" e meia-risca U+2013 entre as contas; linhas L3 NÃO são bold', () => {
    const md = buildMapReport(
      baseState({
        parts: [part({})],
        frases: [frase({})],
        mapping: { ...emptyMapping(), level3: { P1: { oque: 'A chegada.' } } },
      }),
    );
    expect(md).toContain('**Frase 1 (P1) — contas 0–4:**');
    expect(md).toContain('- O que aconteceu nesta frase? A chegada.');
    // não-bold: a linha da pergunta L3 não começa com "- **"
    expect(md).not.toContain('- **O que aconteceu nesta frase?');
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
    expect(md).toContain('### Cena 2 (S2) — GLEANING_SCENE');
    expect(md).toContain('**Frase 1 (P1) — contas 10–23:**');
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
    expect(md).toContain('### Cena 1 (S1) — GLEANING_SCENE');
    expect(md).not.toContain('**Frase 1');
  });
});

describe('buildMapReport — respostas por voz (extensão PRD §10.4)', () => {
  const voice = (): {
    recordedPaths: string[];
  } =>
    JSON.parse(
      readFileSync(join(__dirname, 'fixtures', 'relatorio', 'voice-answers.json'), 'utf8'),
    ) as { recordedPaths: string[] };

  it('sem texto, a célula recebe o caminho do recurso de voz nos três níveis', () => {
    const paths = new Set(voice().recordedPaths);
    const md = buildMapReport(
      baseState({ parts: [part({})], frases: [frase({})], mapping: emptyMapping() }),
      paths,
    );
    expect(md).toContain('_(whole)_\n  respostas/level1/recontar.webm');
    expect(md).toContain(
      '- **Quem aparece nesse trecho? Pessoas, animais, um grupo, alguém de quem se fala?** respostas/level2/PT1/quem.webm',
    );
    expect(md).toContain('- O que aconteceu nesta frase? respostas/level3/P1/oque.webm');
  });

  it('quando há texto E voz, o texto digitado vence', () => {
    const paths = new Set(voice().recordedPaths);
    const md = buildMapReport(
      baseState({ mapping: { ...emptyMapping(), level1: { recontar: 'Texto digitado.' } } }),
      paths,
    );
    expect(md).toContain('_(whole)_\n  Texto digitado.');
    expect(md).not.toContain('respostas/level1/recontar.webm');
  });
});

describe('relatorioFilename', () => {
  it('usa o slug', () => {
    expect(relatorioFilename('fluxo-minimo')).toBe('fluxo-minimo-relatorio-mapeamento.md');
  });

  it('cai no fallback "historia" (SEM acento) quando o slug é vazio', () => {
    expect(relatorioFilename('')).toBe('historia-relatorio-mapeamento.md');
  });
});
