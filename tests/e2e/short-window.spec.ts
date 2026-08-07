import { expect, test, type Page } from '@playwright/test';

import { ColarApp, SCENARIO } from './support/app';

/**
 * A Triagem continua USÁVEL quando a janela é baixa.
 *
 * O resto do e2e roda a 1280×900 e nunca viu o problema: com o rodapé de navegação
 * a Triagem perdeu 74px, e numa caixa de altura fechada os filhos de flex encolhem
 * abaixo do próprio conteúdo. Duas consequências, a mesma raiz — a estação empilha
 * tudo na vertical e deixa metade da largura vazia:
 *
 * 1. A grade dos 27 tipos fica com um vão de rolagem que não mostra tipo nenhum.
 *    Uma lista que não mostra a lista não é uma lista: a pessoa rola às cegas.
 * 2. O "Confirmar" da confiança sai da área visível do próprio picker — visível
 *    para o DOM, recortado na tela, e (numa altura intermediária) por baixo do
 *    aviso do portão, que intercepta o clique. Um botão que existe, aparece no
 *    DOM e não recebe o toque é pior que um botão ausente.
 *
 * As alturas cobrem do notebook confortável (900) ao navegador em janela pequena
 * (620). Um só valor não prova nada: o defeito anterior (PR #164) foi consertado
 * a 700 e continuou de pé a 620.
 */

const ALTURAS = [900, 800, 700, 620] as const;

/** Quantos cartões de tipo cabem INTEIROS na caixa de rolagem, sem rolar. */
async function tiposInteiramenteVisiveis(page: Page): Promise<number> {
  return page.evaluate(() => {
    const caixa = document.querySelector('.cds-triage-picker-scroll');
    if (!caixa) return -1;
    const c = caixa.getBoundingClientRect();
    return Array.from(document.querySelectorAll('.cds-triage-picker-grid .cds-kind-card')).filter(
      (card) => {
        const r = card.getBoundingClientRect();
        return r.top >= c.top - 1 && r.bottom <= c.bottom + 1;
      },
    ).length;
  });
}

/** A aba da gaveta de cobertura encosta em algum cartão de tipo? */
async function abaDaCoberturaSobrepoeAlgumTipo(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const aba = document.querySelector('.cds-coverage-drawer-tab');
    if (!aba) return false;
    const a = aba.getBoundingClientRect();
    return Array.from(document.querySelectorAll('.cds-triage-picker-grid .cds-kind-card')).some(
      (card) => {
        const r = card.getBoundingClientRect();
        return r.right > a.left && r.left < a.right && r.bottom > a.top && r.top < a.bottom;
      },
    );
  });
}

/**
 * O ponto central do botão pertence mesmo ao botão?
 *
 * `toBeVisible()` do Playwright não responde isto: ele olha caixa e estilo, não
 * recorte nem sobreposição — foi assim que um "Confirmar" recortado por uma caixa
 * de rolagem de 53px passou por verde. `elementFromPoint` é o que o dedo faz.
 */
async function oCentroDoBotaoEAlcancavel(page: Page, nome: string): Promise<boolean> {
  return page.evaluate((label) => {
    const btn = Array.from(document.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === label,
    );
    if (!btn) return false;
    const r = btn.getBoundingClientRect();
    const alvo = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return !!alvo && btn.contains(alvo);
  }, nome);
}

for (const altura of ALTURAS) {
  test(`a ${altura}px de altura, a Triagem mostra os tipos e entrega o Confirmar`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: altura });
    const app = new ColarApp(page);
    await page.goto('/login');
    await app.login();
    await app.createSession();
    await app.confirmWholeStory();
    await app.cutScenes(SCENARIO.sceneEndBeads);

    // 1. a listagem mostra listagem. Seis é pouco perto de 27, mas é o piso do que
    // se pode chamar de "escolher entre opções" em vez de "rolar no escuro" — e o
    // piso, não a medida: a 1280px de largura medem-se 20 · 16 · 12 · 8 nestas
    // quatro alturas, e a folga de uma fileira é para diferenças de renderização
    // entre a máquina de quem desenvolve e a do CI. Antes deste conserto eram
    // 9 · 3 · 0 · 0.
    expect(
      await tiposInteiramenteVisiveis(page),
      'a grade dos tipos não mostra tipos: a estação a espremeu na vertical',
    ).toBeGreaterThanOrEqual(6);

    // a grade agora chega perto da borda direita, onde vive a aba da gaveta de
    // cobertura — que flutua sobre o conteúdo e comeria o último cartão da fileira
    expect(
      await abaDaCoberturaSobrepoeAlgumTipo(page),
      'a aba da Cobertura deitou sobre a última coluna de tipos',
    ).toBe(false);

    await page.getByRole('radio', { name: 'Apelo', exact: true }).click();
    await page.getByRole('radio', { name: 'Certeza', exact: true }).click();

    // 2. o Confirmar está na tela, não só no DOM — antes de qualquer rolagem que o
    // próprio Playwright faria para "consertar" o alvo do clique.
    const confirm = page.getByRole('button', { name: 'Confirmar', exact: true });
    await expect(confirm).toBeVisible();
    expect(
      await oCentroDoBotaoEAlcancavel(page, 'Confirmar'),
      'o Confirmar está recortado ou coberto: existe no DOM e o dedo não o alcança',
    ).toBe(true);

    // timeout curto de propósito: sem ele, o clique bloqueado só apareceria como o
    // timeout do teste inteiro, que é o que tornou este bug tão caro de achar.
    await confirm.click({ timeout: 8000 });

    // classificou de verdade: o foco andou para a segunda cena
    await expect(page.getByText('— por classificar')).toBeVisible();
  });
}
