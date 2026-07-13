import type { AnimationItem } from 'lottie-web';
import { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import type { GuideVariantProps } from '../variant';
import AnimatedGuide from './animated';
import { guideAnimation } from './lottie-asset';

/**
 * Variante Lottie do guia (ENG-280, redesign §6.6): um personagem ilustrado que abre a
 * boca enquanto a VOZ fala (`speaking` vem do estado real da porta de fala), pisca e
 * respira.
 *
 * SEM ASSET devolve o guia CSS (`animated.tsx`): a arte é decisão de design e entra por
 * add-a-file (ver `lottie-asset.ts`). O app nunca fica sem guia, e o dia em que o `.json`
 * cair no repo isto acende sem tocar em código.
 *
 * Três armadilhas que este arquivo existe para evitar:
 *  1. **A lib é carregada SOB DEMANDA.** `lottie-web` toca `canvas.getContext('2d')` no
 *     carregamento do módulo; em jsdom isso é `null` e ele lança. Como o glob de variantes
 *     é eager, um import estático quebraria TODO teste que renderize o guia. O import
 *     dinâmico também evita ~250 KB no bundle enquanto não há asset — que é o estado hoje.
 *  2. `autoplay: false` — a boca não pode mexer antes de haver voz (guia mudo gesticulando).
 *  3. `prefers-reduced-motion` NÃO chega ao Lottie: ele desenha por JS e não herda a guarda
 *     `@media` que protege as outras animações. A guarda aqui é explícita — sem ela a figura
 *     se mexeria justamente para quem pediu que nada se mexesse.
 */

interface Marker {
  tm: number;
  cm: string;
  dr: number;
}

/** Segmento [primeiro, último] de um marker nomeado — só quando o asset traz markers. */
function segment(data: unknown, name: string): [number, number] | null {
  const marker = (data as { markers?: Marker[] } | null)?.markers?.find((m) => m.cm === name);
  return marker ? [marker.tm, marker.tm + marker.dr] : null;
}

function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export default function LottieGuide({
  speaking = false,
  size = 220,
  animationData = guideAnimation(),
}: GuideVariantProps & { animationData?: unknown }) {
  const { t } = useTranslation();
  const hostRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<AnimationItem | null>(null);
  // A fala pode mudar enquanto a lib ainda carrega: o ref garante que, ao terminar o
  // import, o estado aplicado seja o ATUAL — não o que valia quando o import começou.
  // Escrito só em efeito (escrever ref no render é proibido: react-hooks/refs).
  const speakingRef = useRef(speaking);

  /** Reflete `speakingRef` + reduced-motion na animação carregada. Só chamado de efeitos. */
  const applyMotion = useCallback(() => {
    const anim = animRef.current;
    if (!anim) return;

    if (prefersReducedMotion()) {
      anim.goToAndStop(0, true);
      return;
    }

    const talk = segment(animationData, 'talk');
    const idle = segment(animationData, 'idle');

    if (speakingRef.current) {
      if (talk) anim.playSegments(talk, true);
      else anim.play(); // asset de loop único: roda inteiro enquanto fala
      return;
    }
    if (idle) anim.playSegments(idle, true);
    else anim.goToAndStop(0, true); // sem markers, o silêncio é o 1º quadro (boca fechada)
  }, [animationData]);

  useEffect(() => {
    speakingRef.current = speaking;
    applyMotion();
  }, [speaking, applyMotion]);

  useEffect(() => {
    const container = hostRef.current;
    if (!animationData || !container) return;
    let alive = true;

    void import('lottie-web/build/player/lottie_light').then(({ default: lottie }) => {
      if (!alive) return;
      animRef.current = lottie.loadAnimation({
        container,
        renderer: 'svg',
        loop: true,
        autoplay: false,
        animationData,
      });
      applyMotion(); // a fala pode já estar em curso quando o import termina
    });

    return () => {
      alive = false;
      animRef.current?.destroy(); // sem isto o rAF do lottie segue rodando após desmontar
      animRef.current = null;
    };
  }, [animationData, applyMotion]);

  if (!animationData) return <AnimatedGuide speaking={speaking} size={size} />;

  return (
    <div
      className="cds-guide-lottie"
      ref={hostRef}
      role="img"
      aria-label={t('guide.ariaLabel')}
      data-guide-variant="lottie"
      data-speaking={speaking ? 'true' : 'false'}
      style={{ width: size, height: size }}
    />
  );
}
