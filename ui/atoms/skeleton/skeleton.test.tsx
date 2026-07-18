import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { splitByGuard } from '../testing/css';
import { Skeleton } from './skeleton';
import skeletonCss from './skeleton.css?raw';

describe('Skeleton (ENG-308)', () => {
  it('é decorativo (aria-hidden) e aceita medidas', () => {
    const { container } = render(<Skeleton width="70%" height={18} />);
    const el = container.querySelector('.cds-skeleton') as HTMLElement;
    expect(el.getAttribute('aria-hidden')).toBe('true');
    expect(el.style.width).toBe('70%');
    expect(el.style.height).toBe('18px');
  });

  it('todo movimento vive dentro da guarda de prefers-reduced-motion (§4.5)', () => {
    const { outside } = splitByGuard(
      skeletonCss,
      /@media[^{]*prefers-reduced-motion:\s*no-preference[^{]*/,
    );
    expect(outside).not.toMatch(/animation|@keyframes/);
  });
});
