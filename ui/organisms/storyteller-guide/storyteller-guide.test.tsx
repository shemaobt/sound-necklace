import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { splitByGuard } from '../../atoms/testing/css';
import { StorytellerGuide } from './index';
import staticCss from './variants/static.css?raw';
import { pickVariantPath } from './variant';
import guideCss from './storyteller-guide.css?raw';

/**
 * O guia da conversa (redesign §6.6, §9.7): uma figura humana calorosa que olha
 * para você. Esta issue traz só a variante estática; o mecanismo de variantes
 * prefere a animada (E4) quando o arquivo existir, sem editar arquivos.
 */
describe('StorytellerGuide (redesign §6.6, §9.7)', () => {
  it('rende uma figura humana com nome acessível e sem dígitos', () => {
    render(<StorytellerGuide />);
    const figure = screen.getByRole('img', { name: 'o guia da conversa' });
    expect(figure.textContent ?? '').not.toMatch(/\d/);
  });
});

describe('mecanismo de variantes (doc de arquitetura §4)', () => {
  it('prefere a variante animada quando o arquivo existe', () => {
    expect(pickVariantPath(['./variants/static.tsx', './variants/animated.tsx'])).toBe(
      './variants/animated.tsx',
    );
  });

  it('cai para a estática quando só ela existe', () => {
    expect(pickVariantPath(['./variants/static.tsx'])).toBe('./variants/static.tsx');
  });

  it('falha claramente quando nenhuma variante existe', () => {
    expect(() => pickVariantPath([])).toThrow();
  });
});

describe('guia: movimento respeita prefers-reduced-motion (§4.5)', () => {
  it('nenhuma animação vive fora da guarda de movimento', () => {
    const guard = /@media\s*\(prefers-reduced-motion:\s*no-preference\)/;
    for (const css of [guideCss, staticCss]) {
      const { outside } = splitByGuard(css, guard);
      expect(outside).not.toMatch(/animation|@keyframes/);
    }
  });
});
