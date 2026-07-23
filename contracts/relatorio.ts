/**
 * <slug>-mapping-report.md — port de buildMapReportMd() da referência
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
 * Daí `reportExportStatus` (ENG-327): uma resposta GRAVADA sem texto confirmado
 * trava a exportação, senão ela sairia vazia e perderia em silêncio o que a
 * pessoa disse.
 */

import {
  L1_Q,
  L2_Q,
  L3_Q,
  lockedParts,
  productiveScenes,
  questionSequence,
  voiceAnswerPath,
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

export interface ReportExportStatus {
  /** gate de guardar/baixar: falso enquanto houver gravação sem texto confirmado */
  canExport: boolean;
  /** quantas respostas gravadas ainda esperam o inglês confirmado */
  pendingSlots: number;
}

/**
 * O inglês confirmado é REQUISITO de exportação (ENG-326/§8.7): como a gravação
 * não entra no artefato, uma resposta só-voz não exporta nada — exportá-la
 * silenciosamente perderia o que a pessoa disse. Então ela trava, e a saída é
 * confirmar o rascunho (ou digitar/traduzir na mão, sempre possível: sem beco).
 *
 * Uma pergunta SEM gravação não trava nada — segue `_(no answer)_`, como
 * sempre foi. O trim espelha `answerCell`: o que o `.md` descartaria não conta
 * como confirmado aqui, senão gate e célula discordariam.
 *
 * @param voice caminhos (`respostas/…`) que TÊM gravação nesta sessão.
 */
export function reportExportStatus(
  state: SessionState,
  voice: ReadonlySet<string>,
): ReportExportStatus {
  const m = state.mapping ?? EMPTY_MAPPING;
  let pendingSlots = 0;
  for (const slot of questionSequence(state)) {
    if (!voice.has(voiceAnswerPath(slot))) continue;
    const confirmed =
      slot.level === 1
        ? m.level1[slot.k]
        : slot.level === 2
          ? m.level2[slot.partId]?.[slot.k]
          : m.level3[slot.propId]?.[slot.k];
    if (!(confirmed ?? '').trim()) pendingSlots++;
  }
  return { canExport: pendingSlots === 0, pendingSlots };
}

/** Nome do arquivo do relatório (ENG-359) — mesmo fallback "story" dos JSONs;
 *  a divergência da referência ("historia" aqui, "colar" lá) morreu junto. */
export function relatorioFilename(slug: string): string {
  return `${slug || 'story'}-mapping-report.md`;
}
