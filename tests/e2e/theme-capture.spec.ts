import { expect, test } from '@playwright/test';

import { ColarApp, SCENARIO } from './support/app';

/**
 * Captura manual dos dois temas (ENG-391) — ferramenta de inspeção, NÃO um gate:
 * sem CDS_CAPTURE o spec inteiro é pulado e o CI nunca o roda. Irmão do
 * design-capture; existe porque regressão visual de tema não aparece em asserção
 * de DOM. O que o tema PRECISA garantir tem teste próprio em theme.spec.ts.
 *
 *   CDS_CAPTURE=1 CDS_THEME=dark CDS_E2E_PORT=5199 corepack pnpm exec playwright test theme-capture
 */
test.skip(!process.env.CDS_CAPTURE, 'captura manual');

const THEME = process.env.CDS_THEME ?? 'dark';
const OUT = `.theme-shots/${THEME}`;

test('percorre o fluxo nos dois temas', async ({ page }) => {
  await page.addInitScript((t) => {
    localStorage.setItem('colar-de-sons:theme:v1', t);
  }, THEME);

  const shot = (name: string) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  const app = new ColarApp(page);

  await page.goto('/login');
  await shot('01-login');

  await app.login();
  await shot('02-dashboard');

  await page.getByRole('button', { name: 'Comece uma nova história' }).click();
  await expect(page.getByRole('heading', { name: 'Nova sessão' })).toBeVisible();
  await shot('03-setup');

  await page.getByText(SCENARIO.audioFilename).click();
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

  await app.walkToReport();
  await shot('09d-report');

  await app.completeSession();
  await shot('10-export');
});
