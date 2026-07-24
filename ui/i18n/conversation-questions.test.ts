import { describe, expect, it } from 'vitest';

import { L1_Q, L2_Q, L3_Q, type QuestionSlot } from '../../domain';
import { questionNoteFor, questionTextFor } from './conversation-questions';

/**
 * A pergunta EXIBIDA da conversa segue o idioma da UI (ENG-279, decisão de produto:
 * "a entrevista segue a UI"). Em EN ela é EXATAMENTE o `q_en` do domínio — a mesma
 * frase que o relatório .md serializa (`contracts/relatorio.ts`), não uma segunda
 * tradução (ENG-345).
 *
 * A chave `k` se repete entre níveis (`quem`/`onde`/`ausencia`), então o mapa de
 * notas EN é endereçado por NÍVEL + k.
 */
function slotL1(k: string): QuestionSlot {
  return { level: 1, k, question: L1_Q.find((q) => q.k === k)! };
}
function slotL2(k: string): QuestionSlot {
  return { level: 2, partId: 'PT1', k, question: L2_Q.find((q) => q.k === k)! };
}
function slotL3(k: string): QuestionSlot {
  return { level: 3, propId: 'P1', k, question: L3_Q.find((q) => q.k === k)! };
}

describe('questionTextFor (ENG-279)', () => {
  it('em pt mostra o texto PT-BR do domínio, verbatim', () => {
    expect(questionTextFor(slotL1('lugar'), 'pt')).toBe('Onde essa história acontece?');
    expect(questionTextFor(slotL3('oque'), 'pt')).toBe('O que aconteceu nesta frase?');
  });

  it('em en mostra a tradução inglesa', () => {
    expect(questionTextFor(slotL1('lugar'), 'en')).toBe('Where does this story take place?');
    expect(questionTextFor(slotL3('oque'), 'en')).toBe('What happened in this phrase?');
  });

  it('desambigua a mesma chave em níveis diferentes (quem: cena vs frase)', () => {
    expect(questionTextFor(slotL2('quem'), 'en')).toBe(
      'Who appears in this stretch? People, animals, a group, someone who is spoken about?',
    );
    expect(questionTextFor(slotL3('quem'), 'en')).toBe('Who?');
  });

  /**
   * ENG-345: a tela em EN e o relatório .md diziam DUAS traduções diferentes da
   * mesma pergunta (7 das 21 divergiam — "the one who listens" na tela vs.
   * "whoever listens" no artefato). Uma frase por pergunta: `q_en`.
   */
  it('em en devolve o q_en do domínio — a mesma frase que o relatório .md', () => {
    const slots: QuestionSlot[] = [
      ...L1_Q.map((q) => slotL1(q.k)),
      ...L2_Q.map((q) => slotL2(q.k)),
      ...L3_Q.map((q) => slotL3(q.k)),
    ];
    expect(slots).toHaveLength(21);
    for (const slot of slots) {
      expect(questionTextFor(slot, 'en'), `L${slot.level}.${slot.k}`).toBe(slot.question.q_en);
    }
  });
});

describe('questionNoteFor (ENG-279)', () => {
  it('traduz a nota da pergunta conduzida pela facilitadora', () => {
    expect(questionNoteFor(slotL1('ausencia'), 'pt')).toBe(
      'conduzida pela facilitadora — nunca preencha por conta própria',
    );
    expect(questionNoteFor(slotL1('ausencia'), 'en')).toBe(
      'facilitator-led — never fill it in on their behalf',
    );
  });

  it('pergunta sem nota não ganha nota inventada', () => {
    expect(questionNoteFor(slotL1('lugar'), 'pt')).toBeUndefined();
    expect(questionNoteFor(slotL1('lugar'), 'en')).toBeUndefined();
  });
});
