import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { L1_Q, L2_Q, L3_Q, type MapQuestion } from './mapeamento-scripts';

/**
 * Byte-igualdade contra a FONTE autoritativa: extrai os literais L1_Q/L2_Q/L3_Q
 * do próprio docs/reference/index.html em runtime e compara com o port. Isso
 * elimina o vetor real de divergência (homóglifo/NFD colado à mão) — a
 * toolchain não altera literais unicode (RESEARCH-NOTES, ENG-226).
 *
 * `q_en` (ENG-356) não existe na referência, então a comparação projeta os
 * campos que ELA define — o rigor sobre o PT-BR é o mesmo de antes; o inglês
 * tem provas próprias (totalidade + ausência de PT vazado) logo abaixo.
 */
const html = readFileSync(join(__dirname, '..', 'docs', 'reference', 'index.html'), 'utf8');

type ReferenceQuestion = Omit<MapQuestion, 'q_en'>;

function extractFromReference(name: 'L1_Q' | 'L2_Q' | 'L3_Q'): ReferenceQuestion[] {
  const m = html.match(new RegExp(`var ${name} = (\\[[\\s\\S]*?\\]);`));
  if (!m) throw new Error(`${name} não encontrado na referência`);
  return new Function(`return ${m[1]};`)() as ReferenceQuestion[];
}

/** Os campos que a referência define — `field`/`note` só entram quando existem,
 *  porque "ausente" e "undefined" são distintos para o toStrictEqual. */
const REFERENCE_KEYS = ['k', 'field', 'q', 'note'] as const;

/** Projeta o port nos campos da referência (tudo menos `q_en`). */
function asReference(qs: readonly MapQuestion[]): ReferenceQuestion[] {
  return qs.map(
    (q) =>
      Object.fromEntries(
        REFERENCE_KEYS.filter((key) => key in q).map((key) => [key, q[key]]),
      ) as ReferenceQuestion,
  );
}

describe('roteiros do Mapeamento — port verbatim da referência (L1030–1056)', () => {
  it('L1_Q é byte-idêntico ao literal da referência (11 perguntas)', () => {
    expect(asReference(L1_Q)).toStrictEqual(extractFromReference('L1_Q'));
    expect(L1_Q).toHaveLength(11);
  });

  it('L2_Q é byte-idêntico ao literal da referência (5 perguntas)', () => {
    expect(asReference(L2_Q)).toStrictEqual(extractFromReference('L2_Q'));
    expect(L2_Q).toHaveLength(5);
  });

  it('L3_Q é byte-idêntico ao literal da referência (5 perguntas)', () => {
    expect(asReference(L3_Q)).toStrictEqual(extractFromReference('L3_Q'));
    expect(L3_Q).toHaveLength(5);
  });

  it('preserva os code points de carga: U+201C/U+201D no note de tempo, U+2014 em funcao e ausencia', () => {
    expect(L1_Q[4]!.note).toBe('permita “não tem”');
    expect(L1_Q[8]!.q).toContain(' — ');
    expect(L1_Q[10]!.note).toBe('conduzida pela facilitadora — nunca preencha por conta própria');
    expect(L2_Q[4]!.note).toBe('conduzida pela facilitadora');
  });

  it('todas as strings estão em NFC (nenhum NFD colado por engano)', () => {
    for (const q of [...L1_Q, ...L2_Q, ...L3_Q]) {
      for (const s of [q.k, q.q, q.q_en, q.field, q.note]) {
        if (s != null) expect(s.normalize('NFC')).toBe(s);
      }
    }
  });

  it('toda pergunta tem um q_en próprio, não-vazio e distinto do PT (ENG-356)', () => {
    for (const q of [...L1_Q, ...L2_Q, ...L3_Q]) {
      expect(q.q_en.trim(), `${q.k} sem q_en`).not.toBe('');
      expect(q.q_en, `${q.k}: q_en repete o PT`).not.toBe(q.q);
    }
  });

  it('nenhum q_en carrega letra acentuada — o artefato é inglês (ENG-356)', () => {
    // U+2014 (travessão) é permitido: só letras latinas estendidas denunciariam PT vazado
    for (const q of [...L1_Q, ...L2_Q, ...L3_Q]) {
      expect(q.q_en, `${q.k}: acento em q_en`).not.toMatch(/[À-ɏ]/);
    }
  });

  it('chaves e fields seguem o contrato do PRD §10.4 na ordem fixa', () => {
    expect(L1_Q.map((q) => q.k)).toEqual([
      'recontar',
      'arco_inicio_fim',
      'arco_muda',
      'lugar',
      'tempo',
      'saber_antes',
      'sentimento',
      'ritmo',
      'funcao',
      'prepara',
      'ausencia',
    ]);
    expect(L1_Q.map((q) => q.field)).toEqual([
      'whole',
      'arc',
      'arc',
      'context',
      'context',
      'context',
      'tone',
      'pace',
      'function',
      'function',
      'significant_absence',
    ]);
    expect(L2_Q.map((q) => q.k)).toEqual(['descrever', 'quem', 'onde', 'objeto', 'ausencia']);
    // quirk contratual: descrever tem field VAZIO (não ausente)
    expect(L2_Q[0]!.field).toBe('');
    expect(L3_Q.map((q) => q.k)).toEqual(['oque', 'quem', 'onde', 'como', 'o_que_mais']);
    // itens L3 NÃO têm a propriedade field (≠ field vazio)
    for (const q of L3_Q) expect('field' in q).toBe(false);
  });
});
