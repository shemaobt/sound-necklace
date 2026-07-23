/**
 * <slug>-relatorio-mapeamento.md — port de buildMapReportMd() da referência
 * (docs/reference/index.html L1155–1170). PRD v2 §10.4 (esqueleto + cabeçalho
 * são contrato byte-exato), §8.7 (relatório = matéria-prima; o app só coleta).
 *
 * DIVERGÊNCIA DELIBERADA E REVISADA da referência (ENG-356, política ENG-326):
 * o artefato normalizou para INGLÊS. A referência emite o mesmo esqueleto em
 * PT-BR; o golden do `.md` continua derivado dela mecanicamente, através da
 * tabela de tradução explícita em tests/golden/generate.mjs — nenhum golden é
 * escrito à mão. Estrutura, ordem, spans e respostas seguem byte-a-byte.
 *
 * Bytes de carga preservados da referência: travessão U+2014 no título e antes
 * de "beads"; meia-risca U+2013 entre as contas s–e; pontos médios U+00B7 na
 * linha de contexto. As perguntas saem de `q_en` (domain/mapeamento-scripts);
 * `field` já era inglês e `note` NUNCA é emitido. `sceneNum` = índice em
 * lockedParts (S# com lacunas quando há cenas none_fit); o push final vazio
 * garante UM único `\n` no fim.
 *
 * A célula é SÓ TEXTO (ENG-356): o `.webm` fica no bucket como proveniência e
 * nunca entra no artefato — sem texto confirmado, a resposta sai "_(no answer)_".
 */

import {
  L1_Q,
  L2_Q,
  L3_Q,
  lockedParts,
  productiveScenes,
  type Mapping,
  type SessionState,
} from '../domain';

const EMPTY_MAPPING: Mapping = { level1: {}, level2: {}, level3: {} };

const NO_ANSWER = '_(no answer)_';

/** A célula da resposta: o texto confirmado (inglês) ou o marcador de ausência. */
function answerCell(raw: string | undefined): string {
  return (raw ?? '').trim() || NO_ANSWER;
}

/** Serializa o relatório de mapeamento em Markdown (inglês, §10.4). */
export function buildMapReport(state: SessionState): string {
  const m = state.mapping ?? EMPTY_MAPPING;
  const locked = lockedParts(state);
  const sceneNum = (p: (typeof locked)[number]): number => locked.indexOf(p) + 1;
  const L: string[] = [];

  L.push('# Meaning Mapping Report — ' + (state.slug || 'story'));
  L.push('');
  L.push(
    '> Raw material for Claude Code. This is **not** the map. Free-text answers (the general questions of the method); the agent asks the contextual questions, classifies the controlled vocabulary, flags NEW_VALUE and writes the prose of the meaning map.',
  );
  L.push(
    '> `source_domain: oral_archive` · `speaker_role: LISTENER_NOT_STORYTELLER` · manifest: `' +
      (state.manifestId || '') +
      '`',
  );
  L.push('');

  L.push('## Level 1 — the whole story');
  for (const q of L1_Q) {
    L.push('- **' + q.q_en + '**' + (q.field ? ' _(' + q.field + ')_' : ''));
    L.push('  ' + answerCell(m.level1[q.k]));
  }

  L.push('');
  L.push('## Level 2 — the scenes');
  for (const p of locked) {
    L.push('');
    L.push(
      '### Scene ' +
        sceneNum(p) +
        ' (S' +
        sceneNum(p) +
        ') — scene_kind: ' +
        (p.scene_kind || '(none)') +
        (p.tag_state === 'none_fit' ? ' [none_fit]' : ''),
    );
    for (const q of L2_Q) {
      L.push('- **' + q.q_en + '** ' + answerCell(m.level2[p.part_id]?.[q.k]));
    }
  }

  L.push('');
  L.push('## Level 3 — propositions (productive scenes)');
  for (const p of productiveScenes(state)) {
    L.push('');
    L.push('### Scene ' + sceneNum(p) + ' (S' + sceneNum(p) + ') — ' + (p.scene_kind || ''));
    let idx = 0;
    for (const fr of state.frases) {
      if (!(fr.locked && fr.span && fr.part_link === p.part_id)) continue;
      idx++;
      L.push('');
      L.push(
        '**Phrase ' + idx + ' (' + fr.prop_id + ') — beads ' + fr.span.s + '–' + fr.span.e + ':**',
      );
      for (const q of L3_Q) {
        L.push('- ' + q.q_en + ' ' + answerCell(m.level3[fr.prop_id]?.[q.k]));
      }
    }
  }

  L.push('');
  return L.join('\n');
}

/** Nome do arquivo do relatório — fallback "historia" (SEM acento), fiel à
 *  referência L1151 (divergente do "colar" dos JSONs em serialize.ts). */
export function relatorioFilename(slug: string): string {
  return `${slug || 'historia'}-relatorio-mapeamento.md`;
}
