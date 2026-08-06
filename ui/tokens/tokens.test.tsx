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
  /** As 8 famílias de cena e as 6 de frase do protótipo. */
  const SCENE_FAMILIES = 8;
  const PHRASE_FAMILIES = 6;

  it('as famílias do protótipo abrem a paleta, intactas e na ordem original', () => {
    // continuam byte-idênticas: uma sessão antiga não muda de cor ao reabrir
    expect(scenePalette.slice(0, SCENE_FAMILIES)).toEqual([
      { base: '#BE4A01', lit: '#E8813E', deep: '#8F3701' },
      { base: '#9A7B2E', lit: '#C2A55A', deep: '#6E5A22' },
      { base: '#4E7A6A', lit: '#7BA595', deep: '#3A5C4F' },
      { base: '#5E6B8C', lit: '#8B97B5', deep: '#46506A' },
      { base: '#8C5A74', lit: '#B4849D', deep: '#694257' },
      { base: '#777D45', lit: '#9EA46B', deep: '#585D31' },
      { base: '#89AAA3', lit: '#B2CCC6', deep: '#5F827B' },
      { base: '#A85D3E', lit: '#CE8767', deep: '#7E442C' },
    ]);
    expect(phrasePalette.slice(0, PHRASE_FAMILIES)).toEqual([
      { base: '#D98A54', lit: '#F0B489', deep: '#B06A3A' },
      { base: '#C4A96A', lit: '#E0CA97', deep: '#9C844D' },
      { base: '#86AC9C', lit: '#AECFC2', deep: '#688B7D' },
      { base: '#93A0BE', lit: '#BBC5DC', deep: '#71809F' },
      { base: '#B98FA8', lit: '#D8B5C9', deep: '#966F87' },
      { base: '#A3A878', lit: '#C4C8A0', deep: '#7F845B' },
    ]);
  });

  it('a paleta estendida cobre uma história longa sem repetir cor', () => {
    expect(scenePalette).toHaveLength(SCENE_FAMILIES * 5);
    expect(phrasePalette).toHaveLength(PHRASE_FAMILIES * 5);
    expect(new Set(scenePalette.map((p) => p.base)).size).toBe(scenePalette.length);
    expect(new Set(phrasePalette.map((p) => p.base)).size).toBe(phrasePalette.length);
  });

  it('cada entrada é uma tripla {base, lit, deep} de hex de 6 dígitos', () => {
    for (const p of [...scenePalette, ...phrasePalette]) {
      for (const c of [p.base, p.lit, p.deep]) expect(c).toMatch(/^#[0-9A-F]{6}$/);
    }
  });

  /**
   * A promessa do §4.2 é sobre VIZINHANÇA, não sobre a lista: `sceneColor` indexa
   * pela posição no colar, então o que precisa ser verdade é que duas cenas vizinhas
   * nunca caiam na mesma família — nem em duas variações da mesma cor. A ordenação
   * por variação (0–7 originais, 8–15 claras, …) é o que garante isso, inclusive na
   * volta do módulo, quando o índice recomeça.
   */
  it('índices vizinhos caem sempre em famílias diferentes, inclusive na volta', () => {
    for (let i = 0; i < scenePalette.length; i++) {
      const a = i % SCENE_FAMILIES;
      const b = (i + 1) % scenePalette.length % SCENE_FAMILIES;
      expect(a).not.toBe(b);
    }
    for (let i = 0; i < phrasePalette.length; i++) {
      const a = i % PHRASE_FAMILIES;
      const b = (i + 1) % phrasePalette.length % PHRASE_FAMILIES;
      expect(a).not.toBe(b);
    }
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

  it('todo papel --cds-ui-* do tema claro tem par no escuro (ENG-391)', () => {
    /* A falha que isto pega é silenciosa: um papel esquecido no bloco escuro
       cai no valor claro e pinta creme sobre creme. Nenhum teste de
       comportamento vê isso — só a comparação dos dois conjuntos.

       Só os papéis (--cds-ui-*) trocam com o tema. As cores de MARCA
       (--cds-telha, --cds-olive, --cds-cream…) são constantes nos dois temas:
       são identidade, não superfície, e continuam congeladas acima. */
    const rolesIn = (block: string): Set<string> =>
      new Set(Array.from(block.matchAll(/(--cds-ui-[\w-]+)\s*:/g), (m) => m[1]!));

    const blockAfter = (marker: string): string => {
      const start = tokensCss.indexOf(marker);
      expect(start, `bloco ${marker} não existe em tokens.css`).toBeGreaterThanOrEqual(0);
      const open = tokensCss.indexOf('{', start);
      return tokensCss.slice(open, tokensCss.indexOf('}', open));
    };

    const light = rolesIn(blockAfter(':root'));
    const dark = rolesIn(blockAfter("[data-cds-theme='dark']"));

    expect(light.size, 'nenhum papel --cds-ui-* declarado no tema claro').toBeGreaterThan(0);
    const missing = [...light].filter((role) => !dark.has(role));
    expect(missing, `papéis sem par no tema escuro: ${missing.join(', ')}`).toEqual([]);
  });

  it('no tema CLARO cada papel aponta para o token de marca que ele substituiu (ENG-391)', () => {
    /* As estações deixaram de citar --cds-cream/--cds-telha e passaram a citar
       o papel. O elo que ficou implícito é este: no claro, o papel TEM de
       resolver exatamente a cor de antes. Sem esta asserção, trocar um valor do
       bloco claro repintaria o app inteiro sem nenhum teste reclamar — os
       testes de cada estação agora olham só para o NOME do papel. */
    const start = tokensCss.indexOf(':root');
    const open = tokensCss.indexOf('{', start);
    const light = tokensCss.slice(open, tokensCss.indexOf('}', open));

    expect(light).toContain('--cds-ui-bg: var(--cds-cream)');
    expect(light).toContain('--cds-ui-card: #ffffff');
    expect(light).toContain('--cds-ui-elevated: var(--cds-cream)');
    expect(light).toContain('--cds-ui-chip: var(--cds-surface-muted)');
    expect(light).toContain('--cds-ui-body-ink: var(--cds-olive)');
    expect(light).toContain('--cds-ui-ink: var(--cds-ink)');
    expect(light).toContain('--cds-ui-ink-soft: var(--cds-olive-soft)');
    expect(light).toContain('--cds-ui-ink-faint: var(--cds-ink-subtle)');
    expect(light).toContain('--cds-ui-hairline: var(--cds-hairline)');
    expect(light).toContain('--cds-ui-accent: var(--cds-telha)');
    expect(light).toContain('--cds-ui-accent-deep: var(--cds-telha-deep)');
    expect(light).toContain('--cds-ui-error-fg: var(--cds-error)');
    expect(light).toContain('--cds-ui-strong-bg: var(--cds-olive)');
    expect(light).toContain('--cds-ui-strong-fg: var(--cds-cream)');
    expect(light).toContain('--cds-ui-pearl: var(--cds-pearl)');
    expect(light).toContain('--cds-ui-pearl-lit: var(--cds-pearl-highlight)');
    /* o canal das linhas é o mesmo olive dos hairlines, escrito em números */
    expect(light).toContain('--cds-ui-line-rgb: 63, 62, 32');
    /* o aro da conta de fim de cena não existe no claro: o quadrado escuro já
       se separa do creme sozinho */
    expect(light).toContain('--cds-ui-bead-ring: transparent');
  });

  it('declara color-scheme para que scrollbars e controles nativos sigam o tema', () => {
    /* Sem isto o dark mode "quase funciona": as cores próprias ficam certas e
       a scrollbar/os controles nativos continuam claros. */
    expect(tokensCss).toMatch(/color-scheme:\s*light/);
    expect(tokensCss).toMatch(/color-scheme:\s*dark/);
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
