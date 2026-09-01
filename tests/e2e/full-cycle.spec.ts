import { expect, test } from '@playwright/test';

import { ColarApp, SCENARIO, readPersistedState } from './support';

/**
 * Acceptance 1 (plano-de-acao §3.1): uma facilitadora percorre o ciclo real inteiro
 * — áudio do bucket → sessão → Escuta 1/2 → Triage → Segmentação — em DUAS sessões de
 * trabalho (reload + retomar no meio), sem manuseio de arquivo e sem perda de
 * trabalho. Modo fixture; o Playwright dirige a UI real.
 *
 * Desde o corte de escopo (ENG-689) o ciclo ACABA nas Frases: não há conversa, nem
 * relatório, nem documento a guardar. O que fecha a sessão é a última cena produtiva,
 * e o que fica é o estado salvo pelo autosave — que é o que outro sistema consome.
 */
test('ciclo completo em dois assentos, sem perda de trabalho', async ({ page }) => {
  const app = new ColarApp(page);

  // ——— assento 1: entrada → cenas → triage ———
  await app.login();
  const sessionId = await app.createSession();

  await app.confirmWholeStory();
  await app.cutScenes();
  await app.triage();

  // A Triage terminada leva o domínio ao modo `segmentacao`; o autosave contínuo
  // (§7.3) persiste o estado inteiro. Espera a gravação assentar antes do reload.
  await expect
    .poll(async () => (await readPersistedState(page, sessionId))?.mode)
    .toBe('segmentacao');
  const before = await readPersistedState(page, sessionId);
  expect(before?.parts).toHaveLength(SCENARIO.sceneEndBeads.length);

  // ——— reload = assento 2 (heap novo; só o localStorage sobrevive) ———
  await page.reload();

  // retoma EXATAMENTE na Segmentação (o hidratador lê o modo persistido).
  await expect(
    page.getByText(/Divida a cena: toque no colar onde esta frase começa e termina\./),
  ).toBeVisible();

  // zero-perda: todo estado pré-reload continua presente e idêntico.
  const after = await readPersistedState(page, sessionId);
  expect(after).toEqual(before);
  expect(after?.mode).toBe('segmentacao');

  // ——— assento 2: frases (com um seam-move) → fim ———
  await app.cutPhrase(SCENARIO.crossingPhrase.s, SCENARIO.crossingPhrase.e);
  await app.moveSeam(); // a frase cruzou a borda → a costura desliza
  await app.nextScene();
  await app.cutPhrase(SCENARIO.containedPhrase.s, SCENARIO.containedPhrase.e);
  await app.finishPhrases();

  // o fim do fluxo tem UMA saída, e ela leva ao painel — nenhuma outra estação
  await app.leaveAfterPhrases();

  // Zero-perda de ponta a ponta: o estado FINAL (após o reload + todo o trabalho do
  // assento 2) ainda carrega as três cenas classificadas no assento 1 E as frases do
  // assento 2 — provando que a reidratação recuperou o estado, e não só que o
  // localStorage sobreviveu ao reload. É este estado que o outro sistema consome.
  const finalState = await readPersistedState(page, sessionId);
  expect(finalState?.parts).toHaveLength(SCENARIO.sceneEndBeads.length);
  expect(finalState?.frases.length).toBeGreaterThanOrEqual(2);
});
