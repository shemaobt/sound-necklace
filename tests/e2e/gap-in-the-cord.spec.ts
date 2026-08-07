import { expect, test } from '@playwright/test';

import { ColarApp, readPersistedState } from './support/app';

/**
 * Um pedaço do colar pode ficar FORA de qualquer cena (decisão do dono, 2026-08-06).
 *
 * O áudio é cru: quem gravou às vezes erra, repete, hesita. Para esse trecho não virar
 * ruído no treinamento, o usuário precisa deixá-lo de fora — e "de fora" aqui é
 * literal: não é remover o áudio, não é pular na escuta, não é excluir do artefato. É
 * o trecho não pertencer a cena nenhuma.
 *
 * Desde 2026-08-07 o corte leva dois toques (começo, depois fim), então o começo também
 * pode nascer torto por clique — mas o gesto DELIBERADO continua sendo arrastar a
 * extremidade inicial, e é ele que esta spec prova. O buraco é aferido no ESTADO
 * PERSISTIDO, não na tela: o que interessa é o que o pipeline vai receber.
 */

/** Arrasta a conta `from` até a conta `to` (o punho arma no down e anda no move). */
async function dragBead(page: import('@playwright/test').Page, from: number, to: number) {
  const box = async (i: number) =>
    (await page.locator(`.cds-necklace-bead[data-idx="${i}"]`).boundingBox())!;
  const a = await box(from);
  const b = await box(to);
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  // dois passos: o organismo só vira arrasto depois de andar ≥1 conta
  await page.mouse.move(a.x + a.width, a.y + a.height / 2);
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.up();
}

test('arrastar o começo deixa um trecho fora de qualquer cena', async ({ page }) => {
  const app = new ColarApp(page);
  await page.goto('/login');
  await app.login();
  const id = await app.createSession();
  await app.confirmWholeStory();

  // primeira cena: começo 0, fim 3
  await app.clickBead(0);
  await app.clickBead(3);
  await page.getByRole('button', { name: '✓ Confirmar esta cena' }).click();

  // a próxima: marca o começo na conta 4 (é o toque que faz nascer o punho do começo)
  // e ARRASTA esse começo até a 7, deixando 4, 5 e 6 sem dono — é ali que estaria o
  // erro de fala. Depois fecha no fim do colar.
  await app.clickBead(4);
  await dragBead(page, 4, 7);
  await app.clickBead(11);
  await page.getByRole('button', { name: '✓ Confirmar esta cena' }).click();

  await expect
    .poll(async () => (await readPersistedState(page, id))?.parts?.length)
    .toBeGreaterThanOrEqual(2);

  const state = await readPersistedState(page, id);
  const spans = (state!.parts as { span: { s: number; e: number } | null }[])
    .map((p) => p.span)
    .filter((s): s is { s: number; e: number } => s !== null)
    .sort((x, y) => x.s - y.s);

  expect(spans[0]).toEqual({ s: 0, e: 3 });
  // o buraco: a segunda cena NÃO começa em 4
  expect(spans[1]!.s).toBe(7);
  expect(spans[1]!.e).toBe(11);
});
