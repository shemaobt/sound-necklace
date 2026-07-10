import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { L1_Q, L2_Q, L3_Q, type MapQuestion } from './mapeamento-scripts';

/**
 * Byte-igualdade contra a FONTE autoritativa: extrai os literais L1_Q/L2_Q/L3_Q
 * do próprio docs/reference/index.html em runtime e compara com o port. Isso
 * elimina o vetor real de divergência (homóglifo/NFD colado à mão) — a
 * toolchain não altera literais unicode (RESEARCH-NOTES, ENG-226).
 */
const html = readFileSync(join(__dirname, '..', 'docs', 'reference', 'index.html'), 'utf8');

function extractFromReference(name: 'L1_Q' | 'L2_Q' | 'L3_Q'): MapQuestion[] {
  const m = html.match(new RegExp(`var ${name} = (\\[[\\s\\S]*?\\]);`));
  if (!m) throw new Error(`${name} não encontrado na referência`);
  return new Function(`return ${m[1]};`)() as MapQuestion[];
}

describe('roteiros do Mapeamento — port verbatim da referência (L1030–1056)', () => {
  it('L1_Q é byte-idêntico ao literal da referência (11 perguntas)', () => {
    expect(L1_Q).toStrictEqual(extractFromReference('L1_Q'));
    expect(L1_Q).toHaveLength(11);
  });

  it('L2_Q é byte-idêntico ao literal da referência (5 perguntas)', () => {
    expect(L2_Q).toStrictEqual(extractFromReference('L2_Q'));
    expect(L2_Q).toHaveLength(5);
  });

  it('L3_Q é byte-idêntico ao literal da referência (5 perguntas)', () => {
    expect(L3_Q).toStrictEqual(extractFromReference('L3_Q'));
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
      for (const s of [q.k, q.q, q.field, q.note]) {
        if (s != null) expect(s.normalize('NFC')).toBe(s);
      }
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
