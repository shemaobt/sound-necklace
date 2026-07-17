import { avataaars } from '@dicebear/collection';
import { createAvatar } from '@dicebear/core';
import { type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';

import type { GuideVariantProps } from '../variant';
import './animated.css';

/**
 * Variante animada do guia (ENG-232; figura da ENG-295, redesign §6.6, §9.7):
 * o personagem Avataaars (arte de Pablo Stanley, via DiceBear) personalizado
 * pelo dono — um arquétipo caloroso, ninguém em particular.
 *
 * O SVG é UM só, montado uma vez, e TODO o movimento é interpolado em CSS
 * (mesma técnica do protótipo do design, §11). Isso é o ponto da issue, não um
 * detalhe: trocar markup — quadros inteiros, ou só a boca — nunca interpola, e
 * cada troca vira um salto. Um rosto que salta é mecânico por melhor que sejam
 * as expressões. Por isso as DUAS bocas (a fechada do repouso e a aberta da
 * fala) moram juntas no SVG e fazem cross-fade: o navegador tem entre o que
 * interpolar, e começar ou parar de falar deixa de ser um corte.
 *
 * O componente não tem estado nem timer: só encaminha `speaking` (o estado REAL
 * da fala, vindo do porto de voz) para `data-speaking`, e o CSS faz o resto —
 * inclusive a guarda `prefers-reduced-motion`, sob a qual a boca falante fica
 * em `opacity: 0` e a figura segura a pose de repouso (§4.5).
 */

/** A personalização decidida pelo dono (ENG-295) — cores nos hex do Avataaars original. */
const FIGURE = {
  seed: 'guia',
  top: ['shortFlat' as const],
  accessories: ['prescription02' as const],
  accessoriesProbability: 100,
  accessoriesColor: ['262e33'],
  hairColor: ['4a312c'],
  facialHair: ['beardLight' as const],
  facialHairProbability: 100,
  facialHairColor: ['4a312c'],
  clothing: ['collarAndSweater' as const],
  clothesColor: ['3c4f5c'],
  eyes: ['squint' as const],
  eyebrows: ['defaultNatural' as const],
  skinColor: ['d08b5b'],
};

const MOUTH = 'translate(78 134)';

/**
 * As âncoras que o CSS anima. O SVG do DiceBear não traz ids semânticos, mas
 * emite um `<g transform="translate(x y)">` por peça do rosto, em coordenadas
 * fixas — as mesmas para toda variante de olho/boca/sobrancelha. É por elas que
 * agarramos cada parte. Se um upgrade do DiceBear mudar essas coordenadas, o
 * teste de âncoras quebra alto em vez de a figura emudecer em silêncio.
 */
const ANCHORS: ReadonlyArray<readonly [string, string]> = [
  [MOUTH, 'cds-guide-mouth'],
  ['translate(76 90)', 'cds-guide-eyes'],
  ['translate(76 82)', 'cds-guide-brows'],
];

/** Onde o conteúdo do grupo âncora começa e termina, respeitando grupos aninhados. */
function contentRange(svg: string, anchor: string): [number, number] | null {
  const open = `<g transform="${anchor}">`;
  const start = svg.indexOf(open);
  if (start < 0) return null;
  const inner = start + open.length;

  let depth = 1;
  let i = inner;
  while (depth > 0) {
    const nextOpen = svg.indexOf('<g', i);
    const nextClose = svg.indexOf('</g>', i);
    if (nextClose < 0) return null;
    if (nextOpen >= 0 && nextOpen < nextClose) {
      depth += 1;
      i = nextOpen + 2;
    } else {
      depth -= 1;
      i = nextClose + 4;
    }
  }
  return [inner, i - 4];
}

/**
 * Envolve o CONTEÚDO do grupo âncora num `<g class="…">` novo, para o CSS ter
 * onde pegar. O wrapper é interno de propósito: em SVG o atributo
 * `transform="translate(…)"` e a propriedade CSS `transform` são a MESMA coisa,
 * então animar o próprio grupo âncora apagaria o translate dele e a peça voaria
 * para o canto do viewBox. O translate fica no pai; a animação, no filho.
 */
function wrapContent(svg: string, anchor: string, className: string): string {
  const range = contentRange(svg, anchor);
  if (!range) return svg;
  const [inner, end] = range;
  return `${svg.slice(0, inner)}<g class="${className}">${svg.slice(inner, end)}</g>${svg.slice(end)}`;
}

/** `twinkle` é o sorriso de boca fechada: a pose de quem escuta. `smile` abre a boca. */
function render(mouth: 'twinkle' | 'smile'): string {
  // o `<metadata>` RDF sai da string: é texto invisível que sujaria o textContent
  // da figura (a regra "sem dígitos" das telas do ouvinte). O crédito da arte
  // vive no docs.md.
  return createAvatar(avataaars, { ...FIGURE, mouth: [mouth] })
    .toString()
    .replace(/<metadata[\s\S]*?<\/metadata>/, '');
}

/**
 * Monta a figura: o rosto em repouso, com a boca da fala enxertada por cima da
 * boca fechada, dentro do mesmo grupo. As duas convivem — quem escolhe a que
 * aparece é a opacidade, que o CSS interpola.
 */
function buildFigure(): string {
  const rest = render('twinkle');
  const talk = render('smile');

  const talkRange = contentRange(talk, MOUTH);
  const restRange = contentRange(rest, MOUTH);
  if (!talkRange || !restRange) return wrapContent(rest, MOUTH, 'cds-guide-mouth');

  const bothMouths =
    `<g class="cds-guide-mouth-rest">${rest.slice(restRange[0], restRange[1])}</g>` +
    `<g class="cds-guide-mouth-talk">${talk.slice(talkRange[0], talkRange[1])}</g>`;

  let svg = `${rest.slice(0, restRange[0])}${bothMouths}${rest.slice(restRange[1])}`;
  for (const [anchor, className] of ANCHORS) {
    svg = wrapContent(svg, anchor, className);
  }
  return svg;
}

const FIGURE_SVG = buildFigure();

export default function AnimatedGuide({ speaking = false, size = 220 }: GuideVariantProps) {
  const { t } = useTranslation();
  return (
    <div
      className="cds-guide-figure cds-guide-anim cds-guide-bob"
      role="img"
      aria-label={t('guide.ariaLabel')}
      data-guide-variant="animated"
      data-speaking={speaking ? 'true' : 'false'}
      style={{ '--cds-guide-size': `${size}px` } as CSSProperties}
      dangerouslySetInnerHTML={{ __html: FIGURE_SVG }}
    />
  );
}

export { ANCHORS, FIGURE_SVG };
