/**
 * O asset do guia Lottie (ENG-280) entra por ADD-A-FILE: solte um `.json` do LottieFiles
 * em `./assets/` e a variante acende sozinha — nenhum código muda. Sem arquivo, o glob
 * volta vazio, a variante cai no guia CSS (ENG-232) e o repo segue verde: a ARTE é
 * decisão de design, e o código não fica refém dela.
 *
 * Ideal: um asset com markers nomeados `idle` e `talk` (a boca só mexe no `talk`). Se
 * vier um loop único de fala, a variante congela no primeiro quadro em silêncio — ver
 * `lottie.tsx`.
 */
const assets = import.meta.glob('./assets/*.json', { eager: true }) as Record<
  string,
  { default: unknown }
>;

export function guideAnimation(): unknown | null {
  return Object.values(assets)[0]?.default ?? null;
}
