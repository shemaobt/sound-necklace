import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { WaveformBar } from './waveform-bar';

function getBar(container: HTMLElement): HTMLElement {
  const el = container.querySelector('.cds-waveform-bar');
  if (!(el instanceof HTMLElement)) throw new Error('barra não renderizou');
  return el;
}

describe('WaveformBar — barra vertical da forma de onda (gravação ao vivo)', () => {
  it('a altura vem das props', () => {
    const { container } = render(<WaveformBar height={34} />);
    expect(getBar(container).style.getPropertyValue('--cds-bar-height')).toBe('34px');
  });

  it('em repouso por padrão', () => {
    const { container } = render(<WaveformBar height={8} />);
    expect(getBar(container).getAttribute('data-state')).toBe('rest');
  });

  it('ativa enquanto grava', () => {
    const { container } = render(<WaveformBar height={34} active />);
    expect(getBar(container).getAttribute('data-state')).toBe('active');
  });

  it('decorativa: o estado da gravação é anunciado pela molécula, não pela barra', () => {
    const { container } = render(<WaveformBar height={34} active />);
    const bar = getBar(container);
    expect(bar.getAttribute('aria-hidden')).toBe('true');
    expect(bar.textContent).toBe('');
  });
});
