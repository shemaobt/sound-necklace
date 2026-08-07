/**
 * A língua da entrevista, derivada do idioma da UI — e a consequência que ela tem
 * para o rascunho de transcrição.
 *
 * Mora aqui porque dois lados dependem da MESMA regra e ficam longe um do outro: o
 * wiring (@/ui/app/App.tsx) manda o locale ao job de STT, e a revisão do relatório
 * (@/ui/pages/report) precisa saber se o inglês que voltou passou por tradução. Duas
 * cópias da regra virariam duas convenções, e a que divergisse escreveria no artefato
 * o texto de um caminho que não foi o percorrido.
 */

/** Locale BCP-47 que o job de transcrição exige (o servidor usa como HINT, não detecção). */
export function interviewLocale(lang: string): string {
  return lang.startsWith('en') ? 'en-US' : 'pt-BR';
}

/**
 * A entrevista foi em inglês? Então o `translation_en` que voltou é o próprio
 * transcript: o servidor devolve o texto de entrada sem chamar modelo nenhum quando a
 * língua já é inglês. Não há tradução para preservar — o que a pessoa conferiu na tela
 * É o inglês do artefato.
 */
export function interviewIsEnglish(lang: string): boolean {
  return interviewLocale(lang) === 'en-US';
}
