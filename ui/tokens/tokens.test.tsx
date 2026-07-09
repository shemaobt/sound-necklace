import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import baseCss from './base.css?inline';
import fontsSource from './fonts.ts?raw';
import { ShemaIcon } from './icon';
import { colors, darken30, iconColorways, motion, phrasePalette, scenePalette } from './tokens';
import tokensCss from './tokens.css?inline';

/**
 * Vocabulário visual CONGELADO (redesign PRD §4.1/§4.2/§4.4/§4.5).
 * Mudar um hex aqui é mudança de design system — não "ajuste".
 */
describe('tokens Shemá — valores congelados (§4.1/§4.4)', () => {
  it('fundos, acento e intenções têm os hex exatos do redesign', () => {
    expect(colors.cream).toBe('#F6F5EB');
    expect(colors.olive).toBe('#3F3E20');
    expect(colors.telha).toBe('#BE4A01');
    expect(colors.telhaDeep).toBe('#8F3701');
    expect(colors.confidenceFilled).toBe('#777D45');
    expect(colors.confidenceHalf).toBe('#9A7B2E');
    expect(colors.warningBg).toBe('#F5E9D2');
    expect(colors.warningInk).toBe('#755C20');
    expect(colors.error).toBe('#8F3701');
    expect(colors.pearl).toBe('#E7E3D3');
    expect(colors.pearlHighlight).toBe('#FBFAF3');
  });

  it('motion: ease-out ~220ms, sem bounces', () => {
    expect(motion.durationMs).toBe(220);
    expect(motion.easing).toBe('ease-out');
  });
});

describe('paletas de identidade de segmento (§4.2)', () => {
  it('cena tem 8 matizes exatos e frase 6 tons mais claros', () => {
    expect(scenePalette.map((p) => p.base)).toEqual([
      '#BE4A01',
      '#9A7B2E',
      '#4E7A6A',
      '#5E6B8C',
      '#8C5A74',
      '#777D45',
      '#89AAA3',
      '#A85D3E',
    ]);
    expect(phrasePalette.map((p) => p.base)).toEqual([
      '#D98A54',
      '#C4A96A',
      '#86AC9C',
      '#93A0BE',
      '#B98FA8',
      '#A3A878',
    ]);
  });

  it('cada entrada expõe {base, lit, deep}: lit = base; deep = base 30% mais escuro (fórmula do shade() da referência)', () => {
    for (const entry of [...scenePalette, ...phrasePalette]) {
      expect(entry.lit).toBe(entry.base);
      expect(entry.deep).toBe(darken30(entry.base));
    }
    // vetor conhecido: telha #BE4A01 → r 190→133 (0x85), g 74→52 (0x34), b 1→1 (0x01)
    expect(darken30('#BE4A01')).toBe('#853401');
  });
});

describe('css base e tokens (§4.5, PRD §13, LGPD)', () => {
  it('expõe custom properties com os valores centrais (hex minúsculo = forma canônica do prettier)', () => {
    expect(tokensCss).toContain('--cds-cream: #f6f5eb');
    expect(tokensCss).toContain('--cds-olive: #3f3e20');
    expect(tokensCss).toContain('--cds-telha: #be4a01');
    expect(tokensCss).toContain('--cds-telha-deep: #8f3701');
    expect(tokensCss).toContain('--cds-motion-duration: 220ms');
  });

  it('respeita prefers-reduced-motion e foco visível de 3px telha', () => {
    expect(baseCss).toContain('prefers-reduced-motion');
    expect(baseCss).toContain(':focus-visible');
    expect(baseCss).toMatch(/outline:\s*3px solid var\(--cds-telha\)/);
  });

  it('nenhum css/fonte aponta para a rede (offline + LGPD)', () => {
    expect(tokensCss).not.toMatch(/https?:\/\//);
    expect(baseCss).not.toMatch(/https?:\/\//);
  });

  it('fontes self-hosted: Montserrat 400/500/600/700/900 e Merriweather 300/400/400-italic/700 via @fontsource', () => {
    for (const w of ['400', '500', '600', '700', '900']) {
      expect(fontsSource).toContain(`@fontsource/montserrat/${w}.css`);
    }
    for (const w of ['300', '400', '700']) {
      expect(fontsSource).toContain(`@fontsource/merriweather/${w}.css`);
    }
    expect(fontsSource).toContain('@fontsource/merriweather/400-italic.css');
  });
});

describe('ícone Shemá (colorways §4.4)', () => {
  it('renderiza o SVG na colorway pedida', () => {
    expect(iconColorways.branco).toBe('#F6F5EB');
    expect(iconColorways.telha).toBe('#BE4A01');
    expect(iconColorways.verde).toBe('#3F3E20');
    const { container } = render(<ShemaIcon colorway="telha" />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg?.querySelectorAll('path[fill="#BE4A01"]').length).toBeGreaterThan(0);
  });
});
