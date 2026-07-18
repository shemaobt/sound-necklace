import { expect, test } from '@playwright/test';

import { ColarApp } from './support/app';

/**
 * ENG-328 — a MESMA conta abre a MESMA sessão numa segunda aba. A trava do
 * backend é por conta (a segunda aba adquire "a própria" trava), então até aqui
 * as duas abas editavam em silêncio. O canal por sessão (BroadcastChannel)
 * detecta a colisão no mesmo browser: a aba NOVA assume a edição e a antiga cai
 * para revisão com a cópia própria. Duas páginas do MESMO contexto compartilham
 * localStorage (backend fixture) e auth — exatamente o cenário reportado.
 */
test('a mesma história numa segunda aba põe a primeira em revisão', async ({ page, context }) => {
  const app = new ColarApp(page);
  await app.login();
  await app.createSession();
  const url = page.url();

  const second = await context.newPage();
  await second.goto(url);

  // a aba antiga cai para revisão com a cópia de "outra aba"
  await expect(page.getByText('esta história está aberta em outra aba')).toBeVisible();
  // a aba nova segue editável: sem banner de revisão nela
  await expect(second.getByText('esta história está aberta em outra aba')).toHaveCount(0);

  await second.close();
});
