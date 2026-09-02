import { expect, test } from '@playwright/test';

import { ColarApp, SCENARIO } from './support/app';

/**
 * Captura de telas para a revisão de paridade com o protótipo
 * (docs/design/Colar de Sons - Protótipo.dc.html). NÃO é um gate: sem
 * CDS_CAPTURE=1 o spec inteiro é pulado (CI nunca o roda). Uso:
 *
 *   CDS_CAPTURE=1 CDS_E2E_PORT=5199 corepack pnpm exec playwright test design-capture
 *
 * As imagens caem em .parity-shots/ (gitignored) para inspeção manual —
 * regressão visual de verdade não aparece em jsdom nem em asserts de DOM.
 */
test.skip(!process.env.CDS_CAPTURE, 'captura manual: rode com CDS_CAPTURE=1');

const OUT = '.parity-shots';

test('percorre o fluxo e fotografa cada estação', async ({ page }) => {
  const shot = (name: string) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  const app = new ColarApp(page);

  await page.goto('/login');
  await shot('01-login');

  await app.login();
  await shot('02-dashboard');

  await page.getByRole('button', { name: 'Comece uma nova história' }).click();
  await expect(page.getByRole('heading', { name: 'Nova sessão' })).toBeVisible();
  await shot('03-setup');

  // mesmo preenchimento do ColarApp.createSession, com foto do estado preenchido
  await page.getByText(SCENARIO.audioFilename).click();
  await page.getByRole('checkbox').check();
  await shot('04-setup-preenchido');
  await page.getByRole('button', { name: 'Criar a sessão →' }).click();
  await page.waitForURL(/\/session\/[^/]+$/);
  await shot('05-listen');

  await app.confirmWholeStory();
  await shot('06-cut');
  let start = 0;
  for (const end of SCENARIO.sceneEndBeads) {
    await app.clickBead(start); // começo
    if (end !== start) await app.clickBead(end); // fim
    await page.getByRole('button', { name: '✓ Confirmar esta cena' }).click();
    start = end + 1;
  }
  await shot('06b-cut-revisao');
  await page.getByRole('button', { name: 'Continuar →' }).click();
  await shot('07-triage');
  await app.triage(SCENARIO.triage, async () => {
    // a gaveta de cobertura, cheia — mesma prova usada para confirmar que o
    // transbordo da contagem por tipo (ENG-726) era pré-existente aqui também
    await app.openCoverageDrawer();
    await shot('07c-cobertura-triagem');
    await app.closeCoverageDrawer();
  });
  await shot('08-phrases');

  await app.cutPhrase(SCENARIO.crossingPhrase.s, SCENARIO.crossingPhrase.e);
  await shot('08b-seam-modal');
  await app.moveSeam();
  await app.nextScene();
  await app.cutPhrase(SCENARIO.containedPhrase.s, SCENARIO.containedPhrase.e);
  await app.finishPhrases();
  await app.waitForFullBar();
  // a Rever (ENG-725): o panorama da história inteira
  await shot('09-rever');
  // a gaveta de cobertura (ENG-726): só-facilitadora, aberta pela aba — o
  // cenário tem uma cena "nenhum se encaixa" na lista cena a cena
  await app.openCoverageDrawer();
  await shot('09c-cobertura');
  await app.closeCoverageDrawer();
  await app.concludeStory();
  await app.waitForConcludedScreenToSettle();
  await shot('09b-concluida');
  await app.leaveAfterPhrases();
  await shot('10-dashboard-depois');
});
