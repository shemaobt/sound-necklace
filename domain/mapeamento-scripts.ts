/**
 * Roteiros de perguntas do Mapeamento — port VERBATIM da referência
 * (docs/reference/index.html L1030–1056). PRD v2 §8.7, §10.4.
 *
 * `q` (PT-BR) é CONTRATO byte-exato com a referência: é o que a facilitadora lê
 * na tela e o que a voz da entrevista fala. Caracteres não-ASCII de carga:
 * aspas curvas U+201C/U+201D no note de `tempo`, travessão U+2014 dentro da
 * pergunta de `funcao` e do note de `ausencia` (L1). Quirks preservados:
 * `descrever` (L2) tem `field` VAZIO (não ausente); itens L3 NÃO têm `field`.
 *
 * `q_en` (ENG-356) é a MESMA pergunta em inglês e é o que o relatório .md
 * serializa — o artefato normalizou para inglês (ENG-326). Não existe na
 * referência: é copy autoral, revisada por humano na PR congelada. `field`
 * já era inglês; `note` NUNCA sai no .md, então segue só em PT.
 *
 * `example`/`example_en` (ENG-611) são o exemplo falado do «Como assim?»: a voz
 * da entrevista os lê a pedido do ouvinte. Moram AQUI, e não em `ui/i18n`, porque
 * o carve-out da voz (PRD v2 §1.1, §12) só permite aquela voz falar string
 * CONGELADA e de autoria humana vinda deste arquivo. Nunca entram em artefato.
 * São OPCIONAIS de propósito: pergunta sem exemplo não ganha link nenhum na tela
 * (decisão do dono) — controle que não faz nada ensina que o app está quebrado.
 */

export interface MapQuestion {
  readonly k: string;
  readonly field?: string;
  /** PT-BR — tela e voz da entrevista (byte-idêntico à referência). */
  readonly q: string;
  /** Inglês — a célula do relatório .md (PRD §10.4). */
  readonly q_en: string;
  readonly note?: string;
  /** PT-BR — exemplo falado a pedido (ENG-611). Ausente = a pergunta não oferece exemplo. */
  readonly example?: string;
  /** Inglês — o mesmo exemplo sob a UI em inglês. Ausente = sem exemplo naquele idioma. */
  readonly example_en?: string;
}

export const L1_Q: readonly MapQuestion[] = [
  {
    k: 'recontar',
    field: 'whole',
    q: 'Descreva esta história, explicando o que acontece, do começo ao fim. Não é para recontar a história, é para falar sobre ela.',
    q_en: 'Describe this story, explaining what happens, from beginning to end. This is not a retelling of the story, it is talking about it.',
  },
  {
    k: 'arco_inicio_fim',
    field: 'arc',
    q: 'Como a história começa? E como ela termina?',
    q_en: 'How does the story begin? And how does it end?',
  },
  {
    k: 'arco_muda',
    field: 'arc',
    q: 'O que muda do começo para o fim? A história deixa as coisas diferentes de como começou?',
    q_en: 'What changes from the beginning to the end? Does the story leave things different from how they started?',
  },
  {
    k: 'lugar',
    field: 'context',
    q: 'Onde essa história acontece?',
    q_en: 'Where does this story take place?',
  },
  {
    k: 'tempo',
    field: 'context',
    q: 'Tem um tempo, uma época em que ela acontece? Ou a história não marca isso?',
    q_en: 'Is there a time, a period when it takes place? Or does the story not mark that?',
    note: 'permita “não tem”',
  },
  {
    k: 'saber_antes',
    field: 'context',
    q: 'Tem alguma coisa que quem escuta já precisa saber de antemão para a história fazer sentido?',
    q_en: 'Is there anything a listener already needs to know beforehand for the story to make sense?',
  },
  {
    k: 'sentimento',
    field: 'tone',
    q: 'Que sentimento essa história passa enquanto você escuta? Muda em algum momento?',
    q_en: 'What feeling does this story carry while you listen? Does it change at any point?',
  },
  {
    k: 'ritmo',
    field: 'pace',
    q: 'A história corre rápida ou devagar? Tem parte que demora mais que as outras?',
    q_en: 'Does the story run fast or slow? Is there a part that takes longer than the others?',
  },
  {
    k: 'funcao',
    field: 'function',
    q: 'Para que serve essa história? O que ela quer fazer com quem escuta — ensinar, abrir um assunto, avisar, plantar uma ideia?',
    q_en: 'What is this story for? What does it want to do to whoever listens — teach, open a subject, warn, plant an idea?',
  },
  {
    k: 'prepara',
    field: 'function',
    q: 'Se essa história faz parte de algo maior, o que ela prepara para o que vem depois?',
    q_en: 'If this story is part of something larger, what does it prepare for what comes after?',
    note: 'opcional',
  },
  {
    k: 'ausencia',
    field: 'significant_absence',
    q: 'Tem alguma coisa que você esperaria nessa história e que não aparece? Um nome, alguém no comando, um problema, um acontecimento? O narrador parece ter deixado algo de fora de propósito?',
    q_en: 'Is there anything you would expect in this story that does not appear? A name, someone in charge, a problem, an event? Does the narrator seem to have left something out on purpose?',
    note: 'conduzida pela facilitadora — nunca preencha por conta própria',
  },
];

export const L2_Q: readonly MapQuestion[] = [
  {
    k: 'descrever',
    field: '',
    q: 'Me conte o que acontece nesse trecho, com as suas palavras.',
    q_en: 'Tell me what happens in this stretch, in your own words.',
  },
  {
    k: 'quem',
    field: 'beings_in_scene',
    q: 'Quem aparece nesse trecho? Pessoas, animais, um grupo, alguém de quem se fala?',
    q_en: 'Who appears in this stretch? People, animals, a group, someone who is spoken about?',
  },
  {
    k: 'onde',
    field: 'places_in_scene',
    q: 'Onde isso acontece? É o mesmo lugar de antes ou mudou?',
    q_en: 'Where does this happen? Is it the same place as before, or has it changed?',
  },
  {
    k: 'objeto',
    field: 'objects_in_scene',
    q: 'Tem alguma coisa, algum objeto, algum elemento importante nesse trecho?',
    q_en: 'Is there anything, any object, any important element in this stretch?',
  },
  {
    k: 'ausencia',
    field: 'significant_absence',
    q: 'Tem algo que você esperaria nesse trecho e que não aparece?',
    q_en: 'Is there anything you would expect in this stretch that does not appear?',
    note: 'conduzida pela facilitadora',
  },
];

export const L3_Q: readonly MapQuestion[] = [
  { k: 'oque', q: 'O que aconteceu nesta frase?', q_en: 'What happened in this phrase?' },
  { k: 'quem', q: 'Quem?', q_en: 'Who?' },
  { k: 'onde', q: 'Onde?', q_en: 'Where?' },
  { k: 'como', q: 'Como? Por quê?', q_en: 'How? Why?', note: 'se fizer sentido' },
  { k: 'o_que_mais', q: 'O que mais tem nessa frase?', q_en: 'What else is in this phrase?' },
];
