import { describe, expect, it } from 'vitest';

import './tokens.css';
import './base.css';
import '../app/app.css';
import '../atoms/button/button.css';
import '../atoms/chip/chip.css';
import '../atoms/pearl/pearl.css';
import '../molecules/kind-card/kind-card.css';
import '../molecules/question-card/question-card.css';
import '../molecules/document-card/document-card.css';
import '../pages/setup/setup.css';
import '../pages/dashboard/dashboard.css';
import '../pages/cut/cut.css';
import '../pages/phrases/phrases.css';
import '../pages/triage/triage.css';
import '../pages/report/report.css';
import '../pages/settings/settings.css';
import '../pages/login/login.css';
import '../organisms/session-list/session-list.css';
import '../organisms/triage-picker/triage-picker.css';
import '../organisms/tutorial-popup/tutorial-popup.css';
import '../organisms/coverage-drawer/coverage-drawer.css';

import { THEME_ATTRIBUTE } from '../app/theme';

/**
 * ENG-391 — o tema escuro precisa MUDAR alguma coisa.
 *
 * Um tema que troca só um atributo é um tema que não existe: a folha de tokens
 * pode declarar os dois conjuntos e a tela continuar creme se nenhum componente
 * ler os papéis. É a falha mais provável desta migração, e é invisível para
 * qualquer teste de comportamento — daí este, que mede a cor RESOLVIDA de cada
 * superfície nos dois temas e exige que ela mude.
 *
 * Roda no Chromium de verdade: jsdom não computa a cascata de custom properties.
 *
 * FORA desta guarda, de propósito (identidade, não superfície):
 *   · telas cerimoniais (Ouça a história, Mapeamento) — olive nos dois temas
 *   · botões telha e o creme sobre eles
 *   · scenePalette/phrasePalette — a cor de uma cena é o dado, não o chrome
 */

/**
 * Superfícies de chrome que TÊM de responder ao tema.
 *
 * Duas entradas da primeira versão desta lista saíram, e a razão de cada uma
 * vale ficar escrita — as duas eram asserções que nenhuma migração correta
 * poderia satisfazer:
 *
 *  · `cds-question-card` não tem fundo NENHUM, nos dois temas, e não é
 *    descuido: ela só existe dentro do palco da conversa, que é cerimonial
 *    (olive sempre) e já está declarado fora desta guarda no cabeçalho acima.
 *    Dar-lhe um fundo de cartão repintaria o Mapeamento no tema claro.
 *  · `cds-dashboard-card` não existe no app: o cartão do painel é
 *    `cds-session-card` (dashboard/index.tsx). A superfície continua coberta —
 *    só que pelo seletor que de fato é usado.
 */
const SURFACES: ReadonlyArray<{ selector: string; className: string; prop: string }> = [
  { selector: 'app', className: 'cds-app', prop: 'background-color' },
  { selector: 'cartão de tipo', className: 'cds-kind-card', prop: 'background-color' },
  { selector: 'cartão de documento', className: 'cds-document-card', prop: 'background-color' },
  { selector: 'linha de áudio da setup', className: 'cds-setup-audio', prop: 'background-color' },
  { selector: 'cartão do painel', className: 'cds-session-card', prop: 'background-color' },
  { selector: 'painel', className: 'cds-dashboard', prop: 'background-color' },
  { selector: 'estação de corte', className: 'cds-cut', prop: 'background-color' },
  { selector: 'estação de frases', className: 'cds-phrases', prop: 'background-color' },
  { selector: 'estação de triagem', className: 'cds-triage', prop: 'background-color' },
  { selector: 'cartão do relatório', className: 'cds-report-card', prop: 'background-color' },
  { selector: 'cartão de configurações', className: 'cds-settings-card', prop: 'background-color' },
  { selector: 'campo do login', className: 'cds-login-input', prop: 'background-color' },
  { selector: 'pílula', className: 'cds-chip', prop: 'background-color' },
  {
    selector: 'tipo escolhido na triagem',
    className: 'cds-triage-picker-chosen',
    prop: 'background-color',
  },
  { selector: 'balão do tutorial', className: 'cds-tutorial-popup', prop: 'background-color' },
  { selector: 'título do painel', className: 'cds-dashboard-title', prop: 'color' },
  { selector: 'eyebrow da setup', className: 'cds-setup-eyebrow', prop: 'color' },
  {
    selector: 'linha do relatório',
    className: 'cds-report-blockhead-rule',
    prop: 'background-color',
  },
];

function resolved(className: string, prop: string, theme: 'light' | 'dark'): string {
  document.documentElement.setAttribute(THEME_ATTRIBUTE, theme);
  const el = document.createElement('div');
  el.className = className;
  document.body.appendChild(el);
  const value = getComputedStyle(el).getPropertyValue(prop);
  el.remove();
  return value;
}

describe('o tema escuro alcança as superfícies de verdade', () => {
  it.each(SURFACES)('$selector troca de cor entre os dois temas', ({ className, prop }) => {
    const claro = resolved(className, prop, 'light');
    const escuro = resolved(className, prop, 'dark');

    expect(claro, `${className} não resolve ${prop} em tema algum`).not.toBe('');
    expect(escuro).not.toBe(claro);
  });

  it('o texto acompanha o fundo — senão o contraste inverte e some', () => {
    const claro = resolved('cds-app', 'color', 'light');
    const escuro = resolved('cds-app', 'color', 'dark');

    expect(escuro).not.toBe(claro);
  });

  it('a conta NÃO TOCADA vira pérola translúcida no escuro (entrega §8, "unDark")', () => {
    /* A pérola-aveia é quase branca: sobre a página escura ela viraria um furo
       de luz em cada conta. O tratamento da entrega é translucidez, e ele entra
       pelo FALLBACK do gradiente — que é justamente o caminho de quem não tem
       tinta de cena. */
    const claro = resolved('cds-pearl', 'background-image', 'light');
    const escuro = resolved('cds-pearl', 'background-image', 'dark');

    expect(claro).toContain('rgb(251, 250, 243)');
    expect(escuro).not.toBe(claro);
  });
});

describe('o tema CLARO não se mexeu', () => {
  /**
   * A restrição dura desta migração: no claro, cada papel tem de RESOLVER
   * exatamente a cor que estava escrita antes na regra. Os papéis que apontam
   * para um token de marca já estão cobertos em tokens.test.tsx (comparação de
   * texto); os que carregam um literal próprio só se conferem RESOLVIDOS — é o
   * que este bloco faz, no Chromium, onde `color-mix` e `rgba(var(...))` de
   * fato computam.
   *
   * Três valores mudaram DE PROPÓSITO, e por isso não estão aqui: o disco de
   * papel do relatório (#ede7d6 → --cds-ui-chip), o bloco de rascunho
   * (#f6f1e4 → --cds-ui-paper) e o cartão do colar da triagem (branco a 55% →
   * --cds-ui-wash, 50%). São literais de uma casa só, a menos de nove unidades
   * do papel vizinho; colapsá-los evitou três papéis usados uma vez cada.
   */
  const LITERAIS: ReadonlyArray<[role: string, luz: string]> = [
    ['--cds-ui-card', 'rgb(255, 255, 255)'],
    ['--cds-ui-selected-bg', 'color(srgb 0.984706 0.957412 0.940235)'],
    ['--cds-ui-chip-hover', 'rgb(229, 226, 210)'],
    ['--cds-ui-inset', 'rgb(238, 236, 224)'],
    ['--cds-ui-paper', 'rgb(246, 241, 230)'],
    ['--cds-ui-cta-disabled', 'rgb(216, 183, 158)'],
    ['--cds-ui-positive', 'rgb(88, 93, 49)'],
    ['--cds-ui-done-bg', 'color(srgb 0.914667 0.918431 0.883294)'],
    ['--cds-ui-done-fg', 'color(srgb 0.373333 0.392157 0.216471)'],
    ['--cds-ui-error-bg', 'rgba(143, 55, 1, 0.1)'],
    ['--cds-ui-hairline-strong', 'rgba(63, 62, 32, 0.32)'],
    ['--cds-ui-wash', 'rgba(255, 255, 255, 0.5)'],
  ];

  function role(name: string, theme: 'light' | 'dark'): string {
    document.documentElement.setAttribute(THEME_ATTRIBUTE, theme);
    const el = document.createElement('div');
    el.style.setProperty('background-color', `var(${name})`);
    document.body.appendChild(el);
    const value = getComputedStyle(el).backgroundColor;
    el.remove();
    return value;
  }

  it.each(LITERAIS)('%s resolve no claro exatamente a cor de antes', (name, luz) => {
    expect(role(name, 'light')).toBe(luz);
  });

  it('o canal das linhas devolve o mesmo olive de sempre no claro', () => {
    document.documentElement.setAttribute(THEME_ATTRIBUTE, 'light');
    const el = document.createElement('div');
    el.style.setProperty('background-color', 'rgba(var(--cds-ui-line-rgb), 0.12)');
    document.body.appendChild(el);
    const value = getComputedStyle(el).backgroundColor;
    el.remove();

    expect(value).toBe('rgba(63, 62, 32, 0.12)');
  });
});

describe('o que NÃO muda com o tema', () => {
  /* O cerimonial não é uma classe: é `.cds-app:has(.cds-listen)` e irmãs
     (app.css). Um `.cds-app` vazio NÃO dispara a regra — e uma asserção sobre
     uma classe inexistente passaria de graça, com os dois temas resolvendo o
     mesmo nada. Por isso aqui se monta a árvore de verdade e se ancora no valor
     olive esperado, não só na igualdade entre os temas. */
  function ceremonialBg(theme: 'light' | 'dark'): string {
    document.documentElement.setAttribute(THEME_ATTRIBUTE, theme);
    const app = document.createElement('div');
    app.className = 'cds-app';
    const palco = document.createElement('div');
    palco.className = 'cds-listen';
    app.appendChild(palco);
    document.body.appendChild(app);
    const value = getComputedStyle(app).backgroundColor;
    app.remove();
    return value;
  }

  it('a tela cerimonial fica olive nos dois temas', () => {
    /* Ouça a história e Mapeamento são o momento cerimonial: o olive é a
       identidade daquele instante, não uma escolha de conforto de tela. */
    const OLIVE = 'rgb(63, 62, 32)';

    expect(ceremonialBg('light'), 'a regra :has() do cerimonial não disparou').toBe(OLIVE);
    expect(ceremonialBg('dark')).toBe(OLIVE);
  });

  it('o botão de ação segue telha com creme por cima nos dois temas', () => {
    /* A ação única é marca, não superfície: mudá-la no escuro seria trocar o
       ponto de referência da tela inteira. */
    function primary(theme: 'light' | 'dark'): { bg: string; fg: string } {
      document.documentElement.setAttribute(THEME_ATTRIBUTE, theme);
      const btn = document.createElement('button');
      btn.className = 'cds-button';
      btn.dataset.variant = 'primary';
      document.body.appendChild(btn);
      const style = getComputedStyle(btn);
      const read = { bg: style.backgroundColor, fg: style.color };
      btn.remove();
      return read;
    }

    expect(primary('light')).toEqual({ bg: 'rgb(190, 74, 1)', fg: 'rgb(246, 245, 235)' });
    expect(primary('dark')).toEqual({ bg: 'rgb(190, 74, 1)', fg: 'rgb(246, 245, 235)' });
  });

  it('a conta TINGIDA guarda a cor da cena nos dois temas', () => {
    /* A cor de uma cena é o dado (scenePalette), e o dado não tem tema: a
       mesma cena tem de sair da mesma cor no colar, no fio e no relatório. */
    function tinted(theme: 'light' | 'dark'): string {
      document.documentElement.setAttribute(THEME_ATTRIBUTE, theme);
      const pearl = document.createElement('span');
      pearl.className = 'cds-pearl';
      pearl.style.setProperty('--cds-pearl-base', '#4e7a6a');
      pearl.style.setProperty('--cds-pearl-lit', '#7ba595');
      document.body.appendChild(pearl);
      const value = getComputedStyle(pearl).backgroundImage;
      pearl.remove();
      return value;
    }

    expect(tinted('light')).toContain('rgb(78, 122, 106)');
    expect(tinted('dark')).toBe(tinted('light'));
  });
});
