import { expect, test } from '@playwright/test';

import { ColarApp } from './support/app';

/**
 * ENG-391 — o tema, ligado no app de verdade.
 *
 * `ui/app/theme.ts` tem os seus testes, o `Header` tem os dele e
 * `dark-surfaces.browser.test.tsx` prova que o CSS responde. O que nenhum deles
 * alcança é o ELO: que o `App` entregue `theme`/`onToggleTheme` ao cabeçalho.
 * Sem esta asserção, apagar `useTheme()` de `ui/app/App.tsx` faz o botão sumir do
 * produto com a suíte inteira verde — e o teste "sem quem trate a troca, não há
 * botão" passaria a descrever o bug em vez de proibi-lo.
 *
 * É o mesmo elo que a ENG-393 já fecha em `voice-really-records.spec.ts`.
 */

const CHAVE = 'colar-de-sons:theme:v1';

test('o botão do cabeçalho troca o tema, e a escolha sobrevive ao recarregamento', async ({
  page,
}) => {
  const app = new ColarApp(page);
  await app.login();
  await app.createSession();

  const raiz = page.locator('html');
  await expect(raiz).toHaveAttribute('data-cds-theme', /light|dark/);
  const inicial = await raiz.getAttribute('data-cds-theme');
  const alvo = inicial === 'dark' ? 'light' : 'dark';

  await page.getByRole('button', { name: /^Mudar para o tema/ }).click();
  await expect(raiz).toHaveAttribute('data-cds-theme', alvo);

  await page.reload();
  await expect(raiz).toHaveAttribute('data-cds-theme', alvo);
});

test('a escolha guardada é aplicada antes da primeira pintura, sem flash', async ({ page }) => {
  /* O script de boot vive no index.html justamente porque um efeito do React roda
     depois de pintar. Aqui se afirma o observável: quando o primeiro elemento da
     tela existe, o tema JÁ está no documento — nenhuma janela em que o app está
     montado e ainda claro. */
  await page.addInitScript((k) => localStorage.setItem(k, 'dark'), CHAVE);

  await page.goto('/login');
  await page.locator('#root *').first().waitFor();

  await expect(page.locator('html')).toHaveAttribute('data-cds-theme', 'dark');
});

test('as telas cerimoniais ficam olive nos dois temas', async ({ page }) => {
  /* Ouça a história é o momento da história, não uma preferência de tela. Se o
     tema escuro vazar para cá, o palco cerimonial deixa de existir. */
  const app = new ColarApp(page);
  await page.addInitScript((k) => localStorage.setItem(k, 'dark'), CHAVE);
  await app.login();
  await app.createSession();

  const palco = page.locator('.cds-app:has(.cds-listen)');
  await expect(palco).toBeVisible();
  await expect(palco).toHaveCSS('background-color', 'rgb(63, 62, 32)');
});
