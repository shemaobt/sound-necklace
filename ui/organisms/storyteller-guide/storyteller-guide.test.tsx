import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { splitByGuard } from '../../atoms/testing/css';
import { StorytellerGuide } from './index';
import { pickVariantPath } from './variant';
import guideCss from './storyteller-guide.css?raw';

/**
 * O guia da conversa (redesign §6.6, §9.7): uma figura humana calorosa que olha
 * para você. O mecanismo de variantes prefere a lottie (dormente, sem asset) e
 * cai na animada — a figura Avataaars da ENG-295.
 */
describe('StorytellerGuide (redesign §6.6, §9.7)', () => {
  it('rende uma figura humana com nome acessível e sem dígitos', () => {
    render(<StorytellerGuide />);
    const figure = screen.getByRole('img', { name: 'o guia da conversa' });
    expect(figure.textContent ?? '').not.toMatch(/\d/);
  });
});

describe('mecanismo de variantes (doc de arquitetura §4)', () => {
  it('prefere a lottie quando o arquivo existe (ela cai na animada sem asset)', () => {
    expect(pickVariantPath(['./variants/animated.tsx', './variants/lottie.tsx'])).toBe(
      './variants/lottie.tsx',
    );
  });

  it('cai para a animada quando só ela existe', () => {
    expect(pickVariantPath(['./variants/animated.tsx'])).toBe('./variants/animated.tsx');
  });

  it('falha claramente quando nenhuma variante existe', () => {
    expect(() => pickVariantPath([])).toThrow();
  });
});

describe('guia: movimento respeita prefers-reduced-motion (§4.5)', () => {
  it('nenhuma animação vive fora da guarda de movimento', () => {
    const guard = /@media\s*\(prefers-reduced-motion:\s*no-preference\)/;
    const { outside } = splitByGuard(guideCss, guard);
    expect(outside).not.toMatch(/animation|@keyframes/);
  });
});
