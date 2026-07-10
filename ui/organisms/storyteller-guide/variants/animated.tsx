import type { GuideVariantProps } from '../variant';
import './animated.css';

/**
 * Variante animada do guia (ENG-232, redesign §6.6, §9.7): a MESMA figura humana
 * calorosa da estática, agora viva — respira (bob) e pisca em repouso, e faz o
 * lip-sync do lábio enquanto a pergunta é apresentada (`speaking`). NÃO abstrata,
 * NÃO geométrica. Todo o movimento mora em `animated.css`, atrás da guarda
 * `prefers-reduced-motion: no-preference`; sob `reduce` a figura fica parada
 * (mesma pose da estática). O glob do index (`./variants/*.tsx`) prefere este
 * arquivo à estática sem que nada mais mude.
 */
export default function AnimatedGuide({ speaking = false, size = 220 }: GuideVariantProps) {
  return (
    <svg
      className="cds-guide-figure cds-guide-anim"
      role="img"
      aria-label="o guia da conversa"
      data-guide-variant="animated"
      data-speaking={speaking ? 'true' : 'false'}
      width={size}
      height={size}
      viewBox="0 0 220 220"
      fill="none"
    >
      {/* o corpo respira como um todo — bob suave a partir da base */}
      <g className="cds-guide-bob">
        {/* ombros / busto — o calor de uma pessoa presente */}
        <path className="cds-guide-body" d="M34 220c0-42 34-64 76-64s76 22 76 64Z" />
        {/* pescoço */}
        <path className="cds-guide-skin" d="M92 132h36v26a18 18 0 0 1-36 0Z" />
        {/* cabeça */}
        <circle className="cds-guide-skin" cx="110" cy="96" r="46" />
        {/* cabelo, emoldurando o rosto */}
        <path
          className="cds-guide-hair"
          d="M64 96a46 46 0 0 1 92 0c0-12-8-18-8-18 2-16-14-30-38-30S70 62 72 78c0 0-8 6-8 18Z"
        />
        {/* olhos que olham para você */}
        <circle className="cds-guide-eye" cx="94" cy="92" r="4.6" />
        <circle className="cds-guide-eye" cx="126" cy="92" r="4.6" />
        {/* pálpebras cor de pele: fechadas por um instante fazem o piscar */}
        <rect className="cds-guide-lid" x="87" y="85" width="14" height="9" rx="4.5" />
        <rect className="cds-guide-lid" x="119" y="85" width="14" height="9" rx="4.5" />
        {/* sobrancelhas suaves */}
        <path className="cds-guide-line" d="M85 82c4-3 12-3 16 0" />
        <path className="cds-guide-line" d="M119 82c4-3 12-3 16 0" />
        {/* o lábio: um sorriso acolhedor parado, que se move só no lip-sync */}
        <path className="cds-guide-mouth" d="M96 112c8 7 20 7 28 0" />
      </g>
    </svg>
  );
}
