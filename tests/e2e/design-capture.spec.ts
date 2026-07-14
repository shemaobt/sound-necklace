import { expect, test } from '@playwright/test';

import { ColarApp } from './support/app';

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
  const shot = (name: string) =>
    page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  const app = new ColarApp(page);

  await page.goto('/login');
  await shot('01-login');

  await app.login();
  await shot('02-dashboard');

  await page.getByRole('button', { name: 'Comece uma nova história' }).click();
  await expect(page.getByRole('heading', { name: 'Nova sessão' })).toBeVisible();
  await shot('03-setup');

  // mesmo preenchimento do ColarApp.createSession, com foto do estado preenchido
  await page.getByText('conto-do-boto.wav').click();
  await page.getByRole('radio', { name: 'Média', exact: true }).click();
  await page.getByRole('checkbox').check();
  await shot('04-setup-preenchido');
  await page.getByRole('button', { name: 'Criar a sessão →' }).click();
  await page.waitForURL(/\/session\/[^/]+$/);
  await shot('05-escuta1');

  await app.confirmWholeStory();
  await shot('06-escuta2');
  await app.cutScenes();
  await shot('07-triagem');
  await app.triage();
  await shot('08-segmentacao');

  await app.cutPhrase(0, 1);
  await app.finishSegmentacao();
  await shot('09-mapeamento');

  await app.completeSession();
  await shot('10-export');
});
