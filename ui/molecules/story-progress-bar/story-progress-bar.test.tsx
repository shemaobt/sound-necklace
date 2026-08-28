import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { splitByGuard } from '../../atoms/testing/css';
import { StoryProgressBar } from './story-progress-bar';
import barCss from './story-progress-bar.css?raw';

/** As fronteiras cumulativas das seis etapas (ui/app/story-progress-model). */
const DIVIDERS = [8, 22, 34, 60, 92] as const;

function fillWidth(container: HTMLElement): number {
  const fill = container.querySelector<HTMLElement>('.cds-story-progress-fill');
  return Number.parseFloat(fill!.style.width);
}

describe('StoryProgressBar — a história inteira numa barra (protótipo v4)', () => {
  it('rende exatamente cinco divisórias — as fronteiras entre as seis etapas', () => {
    const { container } = render(<StoryProgressBar percent={40} dividers={DIVIDERS} />);
    expect(container.querySelectorAll('.cds-story-progress-tick')).toHaveLength(5);
  });

  it('mais progresso, preenchimento mais comprido', () => {
    const pouco = render(<StoryProgressBar percent={10} dividers={DIVIDERS} />);
    const muito = render(<StoryProgressBar percent={70} dividers={DIVIDERS} />);
    expect(fillWidth(muito.container)).toBeGreaterThan(fillWidth(pouco.container));
  });

  it('progresso indefinido não vaza NaN nem Infinity para estilo nenhum', () => {
    for (const percent of [Number.NaN, Number.POSITIVE_INFINITY]) {
      const { container } = render(<StoryProgressBar percent={percent} dividers={DIVIDERS} />);
      for (const el of container.querySelectorAll('[style]')) {
        expect(el.getAttribute('style')).not.toMatch(/NaN|Infinity/);
      }
    }
  });

  it('não passa de ponta a ponta: progresso acima de 100 fica na ponta', () => {
    const cheia = render(<StoryProgressBar percent={100} dividers={DIVIDERS} />);
    const demais = render(<StoryProgressBar percent={420} dividers={DIVIDERS} />);
    expect(fillWidth(demais.container)).toBe(fillWidth(cheia.container));
  });

  it('o deslize do preenchimento e do marcador só existe sob prefers-reduced-motion (§9.3)', () => {
    const guard = /@media\s*\(prefers-reduced-motion:\s*no-preference\)/;
    const { outside } = splitByGuard(barCss, guard);
    expect(outside).not.toMatch(/transition|animation|@keyframes/);
  });
});
