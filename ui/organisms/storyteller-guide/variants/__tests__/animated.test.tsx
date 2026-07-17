import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { splitByGuard } from '../../../../atoms/testing/css';
import { StorytellerGuide } from '../../index';
import AnimatedGuide, { ANCHORS, FIGURE_SVG } from '../animated';
import animatedCss from '../animated.css?raw';

/**
 * Variante animada do guia (ENG-232; figura da ENG-295, redesign §6.6, §9.7):
 * o personagem Avataaars, com o movimento interpolado em CSS. O que se testa é
 * o CONTRATO — o rosto expõe as âncoras que o CSS anima, as duas bocas convivem
 * para poder haver cross-fade, o movimento segue a voz e some sob reduce — não
 * o desenho, que é arte. O teste mora em `__tests__/` para o glob
 * `./variants/*.tsx` do index não o importar como variante (precedente ENG-231).
 */

describe('AnimatedGuide (redesign §6.6, §9.7)', () => {
  it('rende uma figura humana com nome acessível e sem dígitos', () => {
    render(<AnimatedGuide />);
    const figure = screen.getByRole('img', { name: 'o guia da conversa' });
    expect(figure.textContent ?? '').not.toMatch(/\d/);
    expect(figure.querySelector('svg')).not.toBeNull();
  });

  it('em repouso não está falando (data-speaking = false)', () => {
    render(<AnimatedGuide />);
    expect(screen.getByRole('img').getAttribute('data-speaking')).toBe('false');
  });

  it('marca que está falando quando `speaking` — é o que o CSS escuta', () => {
    render(<AnimatedGuide speaking />);
    expect(screen.getByRole('img').getAttribute('data-speaking')).toBe('true');
  });

  it('aceita tamanho por prop (via variável CSS, para o palco poder sobrescrever)', () => {
    render(<AnimatedGuide size={180} />);
    expect(screen.getByRole('img').getAttribute('style')).toContain('--cds-guide-size: 180px');
  });
});

describe('mecanismo de variantes: o guia prefere a animada quando ela existe', () => {
  it('o StorytellerGuide renderiza a variante animada (glob preference)', () => {
    render(<StorytellerGuide />);
    expect(screen.getByRole('img').getAttribute('data-guide-variant')).toBe('animated');
  });
});

describe('AnimatedGuide — as âncoras que o CSS anima (contrato com o DiceBear)', () => {
  /*
   * O SVG do DiceBear não tem ids semânticos: agarramos cada parte do rosto pelo
   * `translate` do seu grupo. Se um upgrade mudar essas coordenadas, o rosto
   * pararia de se mexer SEM nenhum erro — daí este teste.
   */
  it.each(ANCHORS)('a âncora %s existe e envolve o conteúdo em %s', (anchor, className) => {
    // o wrapper é INTERNO: o translate fica no pai, senão o CSS o apagaria e a
    // peça voaria para o canto do viewBox (atributo e propriedade são o mesmo)
    expect(FIGURE_SVG).toContain(`<g transform="${anchor}"><g class="${className}">`);
  });

  it('o grupo animado não carrega transform próprio — ele apagaria o translate', () => {
    render(<AnimatedGuide />);
    for (const [, className] of ANCHORS) {
      const part = screen.getByRole('img').querySelector(`.${className}`);
      expect(part?.getAttribute('transform')).toBeNull();
      expect(part?.parentElement?.getAttribute('transform')).toMatch(/^translate\(/);
    }
  });
});

describe('AnimatedGuide — as duas bocas convivem, para haver o que interpolar', () => {
  /*
   * O ponto da ENG-295: trocar o markup da boca ao começar/parar de falar é um
   * corte seco, e um rosto que corta é mecânico. As duas bocas montadas juntas
   * são o que permite o cross-fade.
   */
  it('a boca parada e a que fala estão as duas no SVG, dentro do mesmo grupo', () => {
    render(<AnimatedGuide />);
    const mouth = screen.getByRole('img').querySelector('.cds-guide-mouth');
    expect(mouth?.querySelector('.cds-guide-mouth-rest')).not.toBeNull();
    expect(mouth?.querySelector('.cds-guide-mouth-talk')).not.toBeNull();
  });

  it('a figura é a MESMA falando ou calada — quem muda é só o data-speaking', () => {
    const { rerender } = render(<AnimatedGuide />);
    const quiet = screen.getByRole('img').innerHTML;
    rerender(<AnimatedGuide speaking />);
    // se o markup mudasse aqui, não haveria transição possível: seria um salto
    expect(screen.getByRole('img').innerHTML).toBe(quiet);
  });
});

describe('AnimatedGuide — todo o movimento vive atrás da guarda de opt-in (§4.5)', () => {
  const guard = /@media\s*\(prefers-reduced-motion:\s*no-preference\)/;
  const { inside, outside } = splitByGuard(animatedCss, guard);

  it('nenhuma animação ou transição escapa da guarda', () => {
    expect(animatedCss).toMatch(guard);
    expect(outside).not.toMatch(/animation|@keyframes|transition/);
  });

  it('sob reduce a pose é intencional: a boca que fala fica invisível', () => {
    // sem as animações do CSS, a boca aberta ficaria escancarada por cima da outra
    expect(outside).toMatch(/\.cds-guide-mouth-talk\s*\{[^}]*opacity:\s*0/);
    expect(outside).toMatch(/\.cds-guide-mouth-rest\s*\{[^}]*opacity:\s*1/);
  });

  it('os laços de repouso (respirar e piscar) existem dentro da guarda', () => {
    expect(inside).toMatch(/@keyframes\s+cds-guide-bob/);
    expect(inside).toMatch(/@keyframes\s+cds-guide-blink/);
    expect(inside).toMatch(/\.cds-guide-bob[^{}]*\{[^}]*animation/);
    expect(inside).toMatch(/\.cds-guide-eyes[^{}]*\{[^}]*animation/);
  });

  it('a boca e as sobrancelhas só se mexem quando data-speaking = true', () => {
    expect(inside).toMatch(
      /data-speaking=["']true["'][^{]*\.cds-guide-mouth-talk[^{]*\{[^}]*animation/,
    );
    expect(inside).toMatch(/data-speaking=["']true["'][^{]*\.cds-guide-brows[^{]*\{[^}]*transform/);
    // fora do estado "falando" a boca não recebe animação nenhuma
    expect(inside).not.toMatch(/(^|[,}])\s*\.cds-guide-mouth-talk\s*\{[^}]*animation/);
  });

  it('começar e parar de falar são um cross-fade, não um corte', () => {
    expect(inside).toMatch(/\.cds-guide-mouth-talk[^{}]*\{[^}]*transition:\s*opacity/);
    expect(inside).toMatch(/\.cds-guide-mouth-rest[^{}]*\{[^}]*transition:\s*opacity/);
  });
});
