import type { QuestionSlot } from '../../domain';

/**
 * Tradução EN das perguntas da conversa (ENG-279 — decisão de produto: "a entrevista
 * segue a UI"). Só EXIBIÇÃO e VOZ (ENG-280): o relatório .md continua serializando o
 * PT-BR verbatim de `domain/conversation-scripts` (contrato byte-exato consumido pelo
 * Compilador), então nada aqui toca o artefato — o golden prova.
 *
 * Endereçado por NÍVEL + `k` porque a chave se repete entre níveis (`quem`, `onde` e
 * `ausencia` existem em mais de um). Sem entrada EN, cai no PT-BR do domínio: a
 * pergunta NUNCA some da tela.
 *
 * ⚠ Traduções pendentes de revisão humana (ENG-279).
 */
interface Translated {
  q: string;
  note?: string;
}

const EN: Record<1 | 2 | 3, Record<string, Translated>> = {
  1: {
    recontar: {
      q: 'Tell this story in your own words, as if to someone who has never heard it.',
    },
    arco_inicio_fim: { q: 'How does the story begin? And how does it end?' },
    arco_muda: {
      q: 'What changes from the beginning to the end? Does the story leave things different from how it started?',
    },
    lugar: { q: 'Where does this story take place?' },
    tempo: {
      q: 'Is there a time, a period in which it happens? Or does the story not mark that?',
      note: 'allow “there is none”',
    },
    saber_antes: {
      q: 'Is there anything a listener needs to know beforehand for the story to make sense?',
    },
    sentimento: {
      q: 'What feeling does this story carry as you listen? Does it change at any point?',
    },
    ritmo: {
      q: 'Does the story run fast or slow? Is there a part that takes longer than the others?',
    },
    funcao: {
      q: 'What is this story for? What does it want to do to the one who listens — teach, open a subject, warn, plant an idea?',
    },
    prepara: {
      q: 'If this story is part of something larger, what does it prepare for what comes next?',
      note: 'optional',
    },
    ausencia: {
      q: 'Is there anything you would expect in this story that does not appear? A name, someone in charge, a problem, an event? Does the narrator seem to have left something out on purpose?',
      note: 'facilitator-led — never fill it in on their behalf',
    },
  },
  2: {
    descrever: { q: 'Tell me what happens in this stretch, in your own words.' },
    quem: {
      q: 'Who appears in this stretch? People, animals, a group, someone spoken about?',
    },
    onde: { q: 'Where does this happen? Is it the same place as before, or has it changed?' },
    objeto: { q: 'Is there anything, any object, any important element in this stretch?' },
    ausencia: {
      q: 'Is there anything you would expect in this stretch that does not appear?',
      note: 'facilitator-led',
    },
  },
  3: {
    oque: { q: 'What happened in this phrase?' },
    quem: { q: 'Who?' },
    onde: { q: 'Where?' },
    como: { q: 'How? Why?', note: 'if it makes sense' },
    o_que_mais: { q: 'What else is in this phrase?' },
  },
};

function translated(slot: QuestionSlot, lang: string): Translated | null {
  if (!lang.startsWith('en')) return null;
  return EN[slot.level][slot.k] ?? null;
}

/** Texto da pergunta a EXIBIR (e a falar): EN quando a UI está em EN, senão o PT-BR do domínio. */
export function questionTextFor(slot: QuestionSlot, lang: string): string {
  return translated(slot, lang)?.q ?? slot.question.q;
}

/** Nota da pergunta (só existe em algumas): traduzida em EN, PT-BR do domínio caso contrário. */
export function questionNoteFor(slot: QuestionSlot, lang: string): string | undefined {
  const en = translated(slot, lang);
  return en ? en.note : slot.question.note;
}
