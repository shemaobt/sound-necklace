import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import baseCss from './base.css?inline';
import fontsSource from './fonts.ts?raw';
import { ShemaIcon } from './icon';
import { colors, iconColorways, motion, phrasePalette, scenePalette } from './tokens';
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
    expect(colors.ink).toBe('#0A0703');
    expect(colors.oliveSoft).toBe('#5A5A3E');
    expect(colors.inkSubtle).toBe('#6D6C56');
    expect(colors.surfaceMuted).toBe('#ECEADF');
    expect(colors.frame).toBe('#EDEBE0');
    expect(colors.accentSoft).toBe('#F2D8C2');
    expect(colors.sand).toBe('#C5C29F');
    expect(colors.sandMuted).toBe('#B8B79E');
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

  it('cada entrada expõe {base, lit, deep} com as triplas exatas do Protótipo.dc.html (PAL/PALF)', () => {
    expect(scenePalette).toEqual([
      { base: '#BE4A01', lit: '#E8813E', deep: '#8F3701' },
      { base: '#9A7B2E', lit: '#C2A55A', deep: '#6E5A22' },
      { base: '#4E7A6A', lit: '#7BA595', deep: '#3A5C4F' },
      { base: '#5E6B8C', lit: '#8B97B5', deep: '#46506A' },
      { base: '#8C5A74', lit: '#B4849D', deep: '#694257' },
      { base: '#777D45', lit: '#9EA46B', deep: '#585D31' },
      { base: '#89AAA3', lit: '#B2CCC6', deep: '#5F827B' },
      { base: '#A85D3E', lit: '#CE8767', deep: '#7E442C' },
    ]);
    expect(phrasePalette).toEqual([
      { base: '#D98A54', lit: '#F0B489', deep: '#B06A3A' },
      { base: '#C4A96A', lit: '#E0CA97', deep: '#9C844D' },
      { base: '#86AC9C', lit: '#AECFC2', deep: '#688B7D' },
      { base: '#93A0BE', lit: '#BBC5DC', deep: '#71809F' },
      { base: '#B98FA8', lit: '#D8B5C9', deep: '#966F87' },
      { base: '#A3A878', lit: '#C4C8A0', deep: '#7F845B' },
    ]);
  });
});

describe('css base e tokens (§4.5, PRD §13, LGPD)', () => {
  it('expõe custom properties com os valores centrais (hex minúsculo = forma canônica do prettier)', () => {
    expect(tokensCss).toContain('--cds-cream: #f6f5eb');
    expect(tokensCss).toContain('--cds-olive: #3f3e20');
    expect(tokensCss).toContain('--cds-telha: #be4a01');
    expect(tokensCss).toContain('--cds-telha-deep: #8f3701');
    expect(tokensCss).toContain('--cds-motion-duration: 220ms');
    expect(tokensCss).toContain('--cds-ink: #0a0703');
    expect(tokensCss).toContain('--cds-olive-soft: #5a5a3e');
    expect(tokensCss).toContain('--cds-ink-subtle: #6d6c56');
    expect(tokensCss).toContain('--cds-surface-muted: #eceadf');
    expect(tokensCss).toContain('--cds-frame: #edebe0');
    expect(tokensCss).toContain('--cds-accent-soft: #f2d8c2');
    expect(tokensCss).toContain('--cds-radius-input: 12px');
    expect(tokensCss).toContain('--cds-radius-tile: 14px');
    expect(tokensCss).toContain('--cds-radius-card-sm: 18px');
    expect(tokensCss).toContain('--cds-radius-card: 22px');
    expect(tokensCss).toContain('--cds-radius-frame: 26px');
    expect(tokensCss).toContain('--cds-shadow-card: 0 2px 6px rgba(63, 62, 32, 0.08)');
    expect(tokensCss).toContain('--cds-shadow-menu: 0 8px 26px rgba(10, 7, 3, 0.18)');
    expect(tokensCss).toContain('--cds-shadow-modal: 0 24px 60px -12px rgba(10, 7, 3, 0.5)');
    expect(tokensCss).toContain('--cds-shadow-cta: 0 4px 14px rgba(190, 74, 1, 0.28)');
    expect(tokensCss).toContain(
      '--cds-shadow-play: 0 6px 20px rgba(190, 74, 1, 0.4), inset 0 2px 0 rgba(255, 255, 255, 0.16)',
    );
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
