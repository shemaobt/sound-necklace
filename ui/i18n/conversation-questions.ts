import type { QuestionSlot } from '../../domain';

/**
 * Idioma das perguntas da conversa (ENG-279 — decisão de produto: "a entrevista
 * segue a UI"). Só EXIBIÇÃO e VOZ (ENG-280).
 *
 * O TEXTO da pergunta não mora aqui. Em PT é o `q` do domínio (byte-idêntico à
 * referência); em EN é o `q_en` do MESMO domínio — a frase que o relatório .md
 * serializa (`contracts/relatorio.ts`). Antes existia uma segunda tradução inglesa
 * neste arquivo e 7 das 21 perguntas divergiam do artefato ("the one who listens"
 * na tela vs. "whoever listens" no .md): a auditoria da ENG-345 apagou a duplicata.
 * Uma pergunta, uma frase em cada idioma, ambas congeladas em `domain/`.
 *
 * As NOTAS continuam aqui: nunca entram em artefato (o .md só serializa `q_en`),
 * então são chrome como qualquer outra cópia. Endereçadas por NÍVEL + `k` porque a
 * chave se repete entre níveis (`quem`, `onde` e `ausencia` existem em mais de um).
 */
const EN_NOTE: Record<1 | 2 | 3, Record<string, string>> = {
  1: {
    tempo: 'allow “there is none”',
    prepara: 'optional',
    ausencia: 'facilitator-led — never fill it in on their behalf',
  },
  2: {
    ausencia: 'facilitator-led',
  },
  3: {
    como: 'if it makes sense',
  },
};

/** Texto da pergunta a EXIBIR (e a falar): `q_en` com a UI em EN, senão o PT-BR. */
export function questionTextFor(slot: QuestionSlot, lang: string): string {
  return lang.startsWith('en') ? slot.question.q_en : slot.question.q;
}

/** Nota da pergunta (só existe em algumas): traduzida em EN, PT-BR caso contrário. */
export function questionNoteFor(slot: QuestionSlot, lang: string): string | undefined {
  if (!lang.startsWith('en')) return slot.question.note;
  // sem nota EN cai no PT-BR: uma nota que some é pior que uma nota no idioma errado
  return EN_NOTE[slot.level][slot.k] ?? slot.question.note;
}
