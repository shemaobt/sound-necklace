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
  await page.getByRole('radio', { name: 'Média', exact: true }).click();
  await page.getByRole('checkbox').check();
  await shot('04-setup-preenchido');
  await page.getByRole('button', { name: 'Criar a sessão →' }).click();
  await page.waitForURL(/\/session\/[^/]+$/);
  await shot('05-listen');

  await app.confirmWholeStory();
  await shot('06-cut');
  for (const end of SCENARIO.sceneEndBeads) {
    await app.clickBead(end);
    await page.getByRole('button', { name: '✓ Confirmar esta cena' }).click();
  }
  await shot('06b-cut-revisao');
  await page.getByRole('button', { name: 'Continuar →' }).click();
  await shot('07-triage');
  await app.triage();
  await shot('08-phrases');

  await app.cutPhrase(SCENARIO.crossingPhrase.s, SCENARIO.crossingPhrase.e);
  await shot('08b-seam-modal');
  await app.moveSeam();
  await app.nextScene();
  await app.cutPhrase(SCENARIO.containedPhrase.s, SCENARIO.containedPhrase.e);
  await app.finishPhrases();
  await shot('09-conversation');

  // os três estados da resposta em voz: vazio (acima) → gravando → pronta. É onde
  // moram o contraste dos ghost sobre o oliva e as barras da forma de onda.
  await page.getByRole('button', { name: 'gravar a resposta' }).click();
  await shot('09b-conversation-gravando');
  await page.getByRole('button', { name: 'Parar' }).click();
  await expect(page.getByRole('button', { name: 'ouvir', exact: true })).toBeVisible();
  await shot('09c-conversation-resposta-pronta');

  // a prévia do relatório (a "revisão"): a conversa reunida, antes de guardar
  await app.walkToReport();
  await shot('09d-report');

  await app.completeSession();
  await shot('10-export');
});
