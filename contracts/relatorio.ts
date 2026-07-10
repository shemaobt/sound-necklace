/**
 * <slug>-relatorio-mapeamento.md — port 1:1 de buildMapReportMd() da referência
 * (docs/reference/index.html L1155–1170). PRD v2 §10.4 (esqueleto + cabeçalho
 * são contrato byte-exato), §8.7 (relatório = matéria-prima; o app só coleta).
 *
 * Bytes de carga espelhados da referência: travessão U+2014 no título e antes de
 * "contas"; meia-risca U+2013 entre as contas s–e; pontos médios U+00B7 na linha
 * de contexto. As perguntas (q/field) vêm VERBATIM de domain/mapeamento-scripts.
 * `note` NUNCA é emitido; `sceneNum` = índice em lockedParts (S# com lacunas
 * quando há cenas none_fit); o push final vazio garante UM único `\n` no fim.
 *
 * Extensão de voz (PRD §10.4, NÃO na referência — ver fixtures/relatorio/README):
 * sem texto digitado, a célula recebe o caminho do recurso de voz do slot; com
 * texto E voz, o texto vence. Sem gravações, a saída é byte-idêntica à referência.
 */

import {
  L1_Q,
  L2_Q,
  L3_Q,
  lockedParts,
  productiveScenes,
  voiceAnswerPath,
  type AnswerSlot,
  type Mapping,
  type SessionState,
} from '../domain';

const EMPTY_MAPPING: Mapping = { level1: {}, level2: {}, level3: {} };

/** Resolve a célula da resposta: texto digitado > caminho de voz > sem resposta. */
function answerCell(raw: string | undefined, slot: AnswerSlot, voice: ReadonlySet<string>): string {
  const typed = (raw ?? '').trim();
  if (typed) return typed;
  const path = voiceAnswerPath(slot);
  if (voice.has(path)) return path;
  return '_(sem resposta)_';
}

/**
 * Serializa o relatório de mapeamento em Markdown.
 * @param voice caminhos de recurso (`respostas/…`) que TÊM gravação; vazio por
 *   padrão ⇒ saída byte-idêntica à referência (só texto).
 */
export function buildMapReport(
  state: SessionState,
  voice: ReadonlySet<string> = new Set(),
): string {
  const m = state.mapping ?? EMPTY_MAPPING;
  const locked = lockedParts(state);
  const sceneNum = (p: (typeof locked)[number]): number => locked.indexOf(p) + 1;
  const L: string[] = [];

  L.push('# Relatório de Mapeamento — ' + (state.slug || 'história'));
  L.push('');
  L.push(
    '> Matéria-prima para o Claude Code. **Não** é o mapa. Respostas em texto livre (perguntas gerais do método); o agente faz as perguntas contextuais, classifica o vocabulário controlado, sinaliza NEW_VALUE e escreve a prosa do meaning map.',
  );
  L.push(
    '> `source_domain: oral_archive` · `speaker_role: LISTENER_NOT_STORYTELLER` · manifest: `' +
      (state.manifestId || '') +
      '`',
  );
  L.push('');

  L.push('## Nível 1 — a história inteira');
  for (const q of L1_Q) {
    L.push('- **' + q.q + '**' + (q.field ? ' _(' + q.field + ')_' : ''));
    L.push('  ' + answerCell(m.level1[q.k], { level: 1, k: q.k }, voice));
  }

  L.push('');
  L.push('## Nível 2 — as cenas');
  for (const p of locked) {
    L.push('');
    L.push(
      '### Cena ' +
        sceneNum(p) +
        ' (S' +
        sceneNum(p) +
        ') — scene_kind: ' +
        (p.scene_kind || '(nenhum)') +
        (p.tag_state === 'none_fit' ? ' [none_fit]' : ''),
    );
    for (const q of L2_Q) {
      L.push(
        '- **' +
          q.q +
          '** ' +
          answerCell(m.level2[p.part_id]?.[q.k], { level: 2, partId: p.part_id, k: q.k }, voice),
      );
    }
  }

  L.push('');
  L.push('## Nível 3 — proposições (cenas produtivas)');
  for (const p of productiveScenes(state)) {
    L.push('');
    L.push('### Cena ' + sceneNum(p) + ' (S' + sceneNum(p) + ') — ' + (p.scene_kind || ''));
    let idx = 0;
    for (const fr of state.frases) {
      if (!(fr.locked && fr.span && fr.part_link === p.part_id)) continue;
      idx++;
      L.push('');
      L.push(
        '**Frase ' + idx + ' (' + fr.prop_id + ') — contas ' + fr.span.s + '–' + fr.span.e + ':**',
      );
      for (const q of L3_Q) {
        L.push(
          '- ' +
            q.q +
            ' ' +
            answerCell(
              m.level3[fr.prop_id]?.[q.k],
              { level: 3, propId: fr.prop_id, k: q.k },
              voice,
            ),
        );
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
