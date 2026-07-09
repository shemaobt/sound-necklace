import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PlayGlyph } from './play-glyph';

function getGlyph(container: HTMLElement): SVGSVGElement {
  const el = container.querySelector('svg.cds-play-glyph');
  if (!(el instanceof SVGSVGElement)) throw new Error('glifo não renderizou');
  return el;
}

describe('PlayGlyph — ▶/⏸ como SVG (protótipos, nunca unicode)', () => {
  it('play e pause são desenhos distintos, sem texto algum', () => {
    const play = render(<PlayGlyph state="play" />);
    const pause = render(<PlayGlyph state="pause" />);
    const playGlyph = getGlyph(play.container);
    const pauseGlyph = getGlyph(pause.container);
    expect(playGlyph.getAttribute('data-state')).toBe('play');
    expect(pauseGlyph.getAttribute('data-state')).toBe('pause');
    expect(playGlyph.innerHTML).not.toBe(pauseGlyph.innerHTML);
    expect(playGlyph.textContent).toBe('');
    expect(pauseGlyph.textContent).toBe('');
  });

  it('decorativo: o botão que o contém carrega o nome acessível', () => {
    const { container } = render(<PlayGlyph state="play" />);
    const glyph = getGlyph(container);
    expect(glyph.getAttribute('aria-hidden')).toBe('true');
    expect(glyph.getAttribute('focusable')).toBe('false');
  });

  it('herda a cor do contexto (currentColor) e escala por prop', () => {
    const { container } = render(<PlayGlyph state="play" size={26} />);
    const glyph = getGlyph(container);
    expect(glyph.getAttribute('fill')).toBe('currentColor');
    expect(glyph.getAttribute('width')).toBe('26');
  });
});
