import { render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import LottieGuide from '../lottie';

/**
 * Variante Lottie do guia (ENG-280): a figura ganha um personagem ilustrado que abre a
 * boca enquanto a voz fala. O ASSET é arte, não código — enquanto ele não estiver no repo
 * a variante cai, de graça, no guia CSS (ENG-232), e o app nunca fica sem guia.
 *
 * O que se testa é o CONTRATO com a lib (carregar sob demanda e sem autoplay, alternar
 * falando/parado, respeitar reduced-motion, destruir no unmount) — não as entranhas do
 * lottie-web, que é mockado.
 */

interface FakeAnim {
  playSegments: ReturnType<typeof vi.fn>;
  play: ReturnType<typeof vi.fn>;
  goToAndStop: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
}

const anim: FakeAnim = {
  playSegments: vi.fn(),
  play: vi.fn(),
  goToAndStop: vi.fn(),
  destroy: vi.fn(),
};
const loadAnimation = vi.fn<(opts: Record<string, unknown>) => FakeAnim>(() => anim);

vi.mock('lottie-web/build/player/lottie_light', () => ({ default: { loadAnimation } }));

/** Asset mínimo, sem markers: um único loop de fala (o formato mais comum). */
const ASSET = { v: '5.7.4', fr: 30, ip: 0, op: 60, w: 220, h: 220, layers: [] };

/** Asset com markers nomeados idle/talk (o formato ideal, quando o asset traz). */
const ASSET_MARKERS = {
  ...ASSET,
  markers: [
    { tm: 0, cm: 'idle', dr: 30 },
    { tm: 30, cm: 'talk', dr: 30 },
  ],
};

function setReducedMotion(reduce: boolean): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduce && query.includes('reduce'),
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  setReducedMotion(false);
});
afterEach(() => vi.unstubAllGlobals());

describe('LottieGuide — sem asset (o estado do repo até a arte chegar)', () => {
  it('cai no guia CSS e continua fazendo lip-sync — o app nunca fica sem guia', () => {
    const { container } = render(<LottieGuide speaking animationData={null} />);

    const figure = container.querySelector('[data-guide-variant="animated"]');
    expect(figure).not.toBeNull();
    expect(figure!.getAttribute('data-speaking')).toBe('true');
  });

  it('NÃO carrega o lottie-web sem asset (a lib toca canvas e quebraria o jsdom)', () => {
    render(<LottieGuide animationData={null} />);
    expect(loadAnimation).not.toHaveBeenCalled();
  });
});

describe('LottieGuide — com asset', () => {
  it('carrega SEM autoplay: a boca não mexe antes de haver voz', async () => {
    render(<LottieGuide animationData={ASSET} />);

    await waitFor(() => expect(loadAnimation).toHaveBeenCalledTimes(1));
    const opts = loadAnimation.mock.calls[0]![0];
    expect(opts.autoplay).toBe(false);
    expect(opts.renderer).toBe('svg');
    expect(opts.animationData).toBe(ASSET);
  });

  it('parado, congela no primeiro quadro (boca fechada)', async () => {
    render(<LottieGuide speaking={false} animationData={ASSET} />);

    await waitFor(() => expect(anim.goToAndStop).toHaveBeenCalledWith(0, true));
    expect(anim.play).not.toHaveBeenCalled();
  });

  it('falando, roda a animação em loop', async () => {
    render(<LottieGuide speaking animationData={ASSET} />);

    await waitFor(() => expect(anim.play).toHaveBeenCalled());
  });

  it('com markers idle/talk, toca o SEGMENTO certo de cada estado', async () => {
    const { rerender } = render(<LottieGuide speaking={false} animationData={ASSET_MARKERS} />);
    await waitFor(() => expect(anim.playSegments).toHaveBeenLastCalledWith([0, 30], true));

    rerender(<LottieGuide speaking animationData={ASSET_MARKERS} />);
    await waitFor(() => expect(anim.playSegments).toHaveBeenLastCalledWith([30, 60], true));
  });

  it('destrói a animação no unmount (sem vazar o rAF do lottie)', async () => {
    const { unmount } = render(<LottieGuide animationData={ASSET} />);
    await waitFor(() => expect(loadAnimation).toHaveBeenCalled());

    unmount();

    expect(anim.destroy).toHaveBeenCalledTimes(1);
  });
});

describe('LottieGuide — prefers-reduced-motion', () => {
  it('sob reduce, NUNCA anima: fica no quadro estático mesmo falando', async () => {
    setReducedMotion(true);

    render(<LottieGuide speaking animationData={ASSET} />);

    // O CSS guarda a variante antiga, mas o Lottie desenha por JS: a guarda tem de ser
    // explícita, senão a figura mexe justamente para quem pediu que nada se mexesse.
    await waitFor(() => expect(anim.goToAndStop).toHaveBeenCalledWith(0, true));
    expect(anim.play).not.toHaveBeenCalled();
    expect(anim.playSegments).not.toHaveBeenCalled();
  });
});
