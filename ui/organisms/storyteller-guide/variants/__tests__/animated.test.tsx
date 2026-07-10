import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { splitByGuard } from '../../../../atoms/testing/css';
import { StorytellerGuide } from '../../index';
import AnimatedGuide from '../animated';
import animatedCss from '../animated.css?raw';

/**
 * Variante animada do guia (ENG-232, redesign §6.6, §9.7): a MESMA figura humana
 * calorosa da estática, agora com respiração (bob) e piscar em repouso e lip-sync
 * do lábio enquanto a pergunta é apresentada (`speaking`). Todo movimento vive
 * atrás da guarda de opt-in — sob `prefers-reduced-motion` a figura fica parada.
 * O teste mora em `__tests__/` para o glob `./variants/*.tsx` do index não o
 * importar como se fosse uma variante (precedente ENG-231).
 */
describe('AnimatedGuide (redesign §6.6, §9.7)', () => {
  it('rende uma figura humana com nome acessível e sem dígitos', () => {
    render(<AnimatedGuide />);
    const figure = screen.getByRole('img', { name: 'o guia da conversa' });
    expect(figure.textContent ?? '').not.toMatch(/\d/);
  });

  it('em repouso não está falando (data-speaking = false)', () => {
    render(<AnimatedGuide />);
    expect(screen.getByRole('img').getAttribute('data-speaking')).toBe('false');
  });

  it('marca que está falando quando `speaking` (dirige o lip-sync)', () => {
    render(<AnimatedGuide speaking />);
    expect(screen.getByRole('img').getAttribute('data-speaking')).toBe('true');
  });

  it('aceita tamanho por prop', () => {
    render(<AnimatedGuide size={180} />);
    expect(screen.getByRole('img').getAttribute('width')).toBe('180');
  });
});

describe('mecanismo de variantes: o guia prefere a animada quando ela existe', () => {
  it('o StorytellerGuide renderiza a variante animada (glob preference)', () => {
    render(<StorytellerGuide />);
    expect(screen.getByRole('img').getAttribute('data-guide-variant')).toBe('animated');
  });
});

describe('AnimatedGuide — movimento atrás de prefers-reduced-motion (§4.5)', () => {
  const guard = /@media\s*\(prefers-reduced-motion:\s*no-preference\)/;

  it('toda animação/keyframes do css vive dentro da guarda de opt-in (pose estática sob reduce)', () => {
    expect(animatedCss).toMatch(guard);
    expect(splitByGuard(animatedCss, guard).outside).not.toMatch(/animation|@keyframes/);
  });

  it('os laços de repouso (bob e piscar) existem dentro da guarda', () => {
    const { inside } = splitByGuard(animatedCss, guard);
    expect(inside).toMatch(/@keyframes\s+cds-guide-bob/);
    expect(inside).toMatch(/@keyframes\s+cds-guide-blink/);
    expect(inside).toMatch(/\.cds-guide-bob[^{}]*\{[^}]*animation/);
    expect(inside).toMatch(/\.cds-guide-lid[^{}]*\{[^}]*animation/);
  });

  it('o lip-sync do lábio só anima quando data-speaking = true', () => {
    const { inside } = splitByGuard(animatedCss, guard);
    // a única animação do lábio está condicionada a estar falando
    expect(inside).toMatch(/data-speaking=["']true["'][^{]*\.cds-guide-mouth[^{]*\{[^}]*animation/);
    // fora do estado "falando" o lábio não recebe animação
    expect(inside).not.toMatch(/(^|[,}])\s*\.cds-guide-mouth\s*\{[^}]*animation/);
  });
});
