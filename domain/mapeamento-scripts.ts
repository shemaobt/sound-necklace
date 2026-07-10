/**
 * Roteiros de perguntas do Mapeamento — port VERBATIM da referência
 * (docs/reference/index.html L1030–1056). PRD v2 §8.7, §10.4.
 *
 * As strings são CONTRATO byte-exato: o relatório .md (ENG-233) serializa
 * `q`/`field`/`note` tal como estão aqui. Caracteres não-ASCII de carga:
 * aspas curvas U+201C/U+201D no note de `tempo`, travessão U+2014 dentro da
 * pergunta de `funcao` e do note de `ausencia` (L1). Quirks preservados:
 * `descrever` (L2) tem `field` VAZIO (não ausente); itens L3 NÃO têm `field`.
 */

export interface MapQuestion {
  readonly k: string;
  readonly field?: string;
  readonly q: string;
  readonly note?: string;
}

export const L1_Q: readonly MapQuestion[] = [
  {
    k: 'recontar',
    field: 'whole',
    q: 'Conte essa história com as suas palavras, como se fosse para alguém que nunca ouviu.',
  },
  { k: 'arco_inicio_fim', field: 'arc', q: 'Como a história começa? E como ela termina?' },
  {
    k: 'arco_muda',
    field: 'arc',
    q: 'O que muda do começo para o fim? A história deixa as coisas diferentes de como começou?',
  },
  { k: 'lugar', field: 'context', q: 'Onde essa história acontece?' },
  {
    k: 'tempo',
    field: 'context',
    q: 'Tem um tempo, uma época em que ela acontece? Ou a história não marca isso?',
    note: 'permita “não tem”',
  },
  {
    k: 'saber_antes',
    field: 'context',
    q: 'Tem alguma coisa que quem escuta já precisa saber de antemão para a história fazer sentido?',
  },
  {
    k: 'sentimento',
    field: 'tone',
    q: 'Que sentimento essa história passa enquanto você escuta? Muda em algum momento?',
  },
  {
    k: 'ritmo',
    field: 'pace',
    q: 'A história corre rápida ou devagar? Tem parte que demora mais que as outras?',
  },
  {
    k: 'funcao',
    field: 'function',
    q: 'Para que serve essa história? O que ela quer fazer com quem escuta — ensinar, abrir um assunto, avisar, plantar uma ideia?',
  },
  {
    k: 'prepara',
    field: 'function',
    q: 'Se essa história faz parte de algo maior, o que ela prepara para o que vem depois?',
    note: 'opcional',
  },
  {
    k: 'ausencia',
    field: 'significant_absence',
    q: 'Tem alguma coisa que você esperaria nessa história e que não aparece? Um nome, alguém no comando, um problema, um acontecimento? O narrador parece ter deixado algo de fora de propósito?',
    note: 'conduzida pela facilitadora — nunca preencha por conta própria',
  },
];

export const L2_Q: readonly MapQuestion[] = [
  { k: 'descrever', field: '', q: 'Me conte o que acontece nesse trecho, com as suas palavras.' },
  {
    k: 'quem',
    field: 'beings_in_scene',
    q: 'Quem aparece nesse trecho? Pessoas, animais, um grupo, alguém de quem se fala?',
  },
  {
    k: 'onde',
    field: 'places_in_scene',
    q: 'Onde isso acontece? É o mesmo lugar de antes ou mudou?',
  },
  {
    k: 'objeto',
    field: 'objects_in_scene',
    q: 'Tem alguma coisa, algum objeto, algum elemento importante nesse trecho?',
  },
  {
    k: 'ausencia',
    field: 'significant_absence',
    q: 'Tem algo que você esperaria nesse trecho e que não aparece?',
    note: 'conduzida pela facilitadora',
  },
];

export const L3_Q: readonly MapQuestion[] = [
  { k: 'oque', q: 'O que aconteceu nesta frase?' },
  { k: 'quem', q: 'Quem?' },
  { k: 'onde', q: 'Onde?' },
  { k: 'como', q: 'Como? Por quê?', note: 'se fizer sentido' },
  { k: 'o_que_mais', q: 'O que mais tem nessa frase?' },
];
