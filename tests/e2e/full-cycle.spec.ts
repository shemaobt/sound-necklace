import { expect, test } from '@playwright/test';

import {
  ColarApp,
  SCENARIO,
  TYPED_ANSWER,
  readPersistedState,
  readPersistedStatus,
} from './support';

/**
 * Acceptance 1 (plano-de-acao §3.1): uma facilitadora completa um ciclo real inteiro
 * — áudio do bucket → sessão → Escuta 1/2 → Triagem → Segmentação → Mapeamento (voz) →
 * concluída — em DUAS sessões de trabalho (reload + retomar no meio), sem manuseio de
 * arquivo e sem perda de trabalho. Modo fixture; o Playwright dirige a UI real.
 */
test('ciclo completo em dois assentos, sem perda de trabalho', async ({ page }) => {
  const app = new ColarApp(page);

  // ——— assento 1: entrada → cenas → triagem ———
  await app.login();
  const sessionId = await app.createSession();

  await app.confirmWholeStory();
  await app.cutScenes();
  await app.triage();

  // A Triagem terminada leva o domínio ao modo `segmentacao`; o autosave contínuo
  // (§7.3) persiste o estado inteiro. Espera a gravação assentar antes do reload.
  await expect
    .poll(async () => (await readPersistedState(page, sessionId))?.mode)
    .toBe('segmentacao');
  const before = await readPersistedState(page, sessionId);
  expect(before?.parts).toHaveLength(SCENARIO.sceneEndBeads.length);

  // ——— reload = assento 2 (heap novo; só o localStorage sobrevive) ———
  await page.reload();

  // retoma EXATAMENTE na Segmentação (o hidratador lê o modo persistido).
  await expect(page.getByText('Toque no colar o começo e o fim de cada frase.')).toBeVisible();

  // zero-perda: todo estado pré-reload continua presente e idêntico.
  const after = await readPersistedState(page, sessionId);
  expect(after).toEqual(before);
  expect(after?.mode).toBe('segmentacao');

  // ——— assento 2: frases (com um seam-move) → conversa por voz → export ———
  await app.cutPhrase(SCENARIO.crossingPhrase.s, SCENARIO.crossingPhrase.e);
  await app.moveSeam(); // a frase cruzou a borda → a costura desliza
  await app.nextScene();
  await app.cutPhrase(SCENARIO.containedPhrase.s, SCENARIO.containedPhrase.e);
  await app.finishSegmentacao();

  const conversation = await app.answerConversation();
  expect(conversation.voicedLevels).toEqual([1, 2, 3]); // ≥1 por nível por voz

  // o relatório LEVA à última tela por uma ação própria: sem isto ele era um beco
  // e só o fio de contas do cabeçalho seguia adiante (chrome não é ação)
  await page.getByRole('button', { name: 'Guardar os documentos →' }).click();
  await expect(page.getByText('A história está inteira no colar.')).toBeVisible();

  await app.completeSession();
  await expect.poll(() => readPersistedStatus(page, sessionId)).toBe('completed');

  // Zero-perda de ponta a ponta: o estado FINAL (após o reload + todo o trabalho do
  // assento 2) ainda carrega as três cenas classificadas no assento 1 E a resposta
  // digitada — provando que a reidratação recuperou o estado (não só que o localStorage
  // sobreviveu ao reload) e que a resposta ≥1-digitada foi de fato gravada (§8.7/§10.4).
  const finalState = await readPersistedState(page, sessionId);
  expect(finalState?.parts).toHaveLength(SCENARIO.sceneEndBeads.length);
  expect(JSON.stringify(finalState)).toContain(TYPED_ANSWER);
});
