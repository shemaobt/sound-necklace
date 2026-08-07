import { expect, test } from '@playwright/test';

import { ColarApp, SCENARIO } from './support/app';

/**
 * O controle principal do ouvinte continua ALCANÇÁVEL numa janela curta.
 *
 * O resto do e2e roda a 1280×900 e nunca viu o problema: com o rodapé de navegação
 * a Triagem perdeu 74px, e numa caixa de altura fechada os filhos de flex encolhem
 * abaixo do próprio conteúdo — o "Confirmar" do picker ficou VISÍVEL mas debaixo do
 * aviso do portão, que passou a interceptar o clique. Um botão que existe, aparece e
 * não recebe o toque é pior que um botão ausente: não há o que a pessoa possa fazer,
 * e a tela não diz por quê.
 *
 * 700px de altura é o pior caso realista (notebook pequeno com o navegador em janela).
 */
test('numa janela curta, o Confirmar da Triagem recebe o clique', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 700 });
  const app = new ColarApp(page);
  await page.goto('/login');
  await app.login();
  await app.createSession();
  await app.confirmWholeStory();
  await app.cutScenes(SCENARIO.sceneEndBeads);

  await page.getByRole('radio', { name: 'Apelo', exact: true }).click();
  await page.getByRole('radio', { name: 'Certeza', exact: true }).click();

  const confirm = page.getByRole('button', { name: 'Confirmar', exact: true });
  await expect(confirm).toBeVisible();
  // timeout curto de propósito: sem ele, o clique bloqueado só apareceria como o
  // timeout do teste inteiro, que é o que tornou este bug tão caro de achar.
  await confirm.click({ timeout: 8000 });

  // classificou de verdade: o foco andou para a segunda cena
  await expect(page.getByText('— por classificar')).toBeVisible();
});
