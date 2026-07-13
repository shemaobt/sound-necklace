import { useTranslation } from 'react-i18next';

import type { GuideVariantProps } from '../variant';
import './static.css';

/**
 * Variante estática do guia (E1): uma figura humana calorosa desenhada em SVG —
 * cabeça, ombros, olhos e um leve sorriso — que olha para você (§6.6, §9.7).
 * NÃO abstrata, NÃO geométrica. É o FALLBACK: `variants/animated.tsx` (ENG-232,
 * bob/blink/lip-sync) existe e é a variante preferida pelo glob.
 */
export default function StaticGuide({ size = 220 }: GuideVariantProps) {
  const { t } = useTranslation();
  return (
    <svg
      className="cds-guide-figure"
      role="img"
      aria-label={t('guide.ariaLabel')}
      width={size}
      height={size}
      viewBox="0 0 220 220"
      fill="none"
    >
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
      {/* sobrancelhas suaves */}
      <path className="cds-guide-line" d="M85 82c4-3 12-3 16 0" />
      <path className="cds-guide-line" d="M119 82c4-3 12-3 16 0" />
      {/* um leve sorriso acolhedor */}
      <path className="cds-guide-line" d="M96 112c8 7 20 7 28 0" />
    </svg>
  );
}
