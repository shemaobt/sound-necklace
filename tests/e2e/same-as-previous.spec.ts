import { expect, test, type Page } from '@playwright/test';

import { L2_Q } from '../../domain';
import { ColarApp, STORAGE_KEY } from './support';

/**
 * O atalho "é igual à cena anterior" (ENG-671) com o chip que diz o que a cena
 * anterior respondeu (ENG-678), no navegador e de ponta a ponta: da entrevista até o
 * `.md` guardado.
 *
 * Existe como spec PRÓPRIA porque o plano determinístico da
 * `interview-completeness.spec.ts` (i % 4) não cai em nenhuma pergunta com eco — a
 * cena anterior daquelas posições ou não é respondida na entrevista, ou é digitada
 * depois, na revisão. Ou seja: sem esta spec, nenhum teste de navegador chega perto
 * do atalho, e a única prova de que a frase congelada entra no artefato seria de
 * unidade. Ela é o oposto daquela: uma passagem estreita, uma pergunta só.
 */

const QUEM = L2_Q.find((q) => q.k === 'quem')!;

/** A frase congelada do roteiro que o toque escreve na célula (domain). */
const SAME_PEOPLE = QUEM.same_as_previous_en!;

/** Lê os bytes do `.md` guardado (o artefato = a exportação, §10.5). */
async function readReportMd(page: Page, id: string): Promise<string> {
  const raw = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);
  const parsed = JSON.parse(raw!) as {
    sessions: [string, { artifacts?: { report?: string } }][];
  };
  const md = parsed.sessions.find(([sid]) => sid === id)?.[1]?.artifacts?.report;
  if (!md) throw new Error(`sem relatório guardado para ${id}`);
  return md;
}

/**
 * Avança até a PRÓXIMA vez que a pergunta em foco for `text`. As perguntas de nível 2
 * se repetem cena a cena, então "a próxima vez" é a próxima cena — que é exatamente a
 * relação que o atalho existe para servir.
 */
async function advanceUntilQuestion(page: Page, text: string): Promise<void> {
  const asked = page.locator('.cds-question-card-text');
  for (let step = 0; step < 60; step++) {
    if ((await asked.textContent()) === text) return;
    await page.getByRole('button', { name: 'Próxima pergunta' }).click();
  }
  throw new Error(`a pergunta não chegou em 60 passos: ${text}`);
}

test('responder "são as mesmas" num toque leva a frase inglesa ao relatório', async ({ page }) => {
  const app = new ColarApp(page);

  await app.login();
  const sessionId = await app.createSession();
  await app.confirmWholeStory();
  await app.cutScenes(); // 3 cenas: 2 classificadas + 1 "nenhum se encaixa"
  await app.triage();
  await app.cutPhrase(0, 1);
  await app.nextScene();
  await app.cutPhrase(4, 5);
  await app.finishPhrases();
  await app.chooseConversationMode();

  // ——— cena 1: a pergunta "quem" é respondida por VOZ ———
  await advanceUntilQuestion(page, QUEM.q);
  // na PRIMEIRA cena não há atalho: não existe cena anterior que tenha perguntado
  await expect(page.getByRole('button', { name: 'São as mesmas pessoas' })).toBeHidden();
  await app.recordVoiceAnswer();
  await page.getByRole('button', { name: 'Próxima pergunta' }).click();

  // ——— cena 2: a mesma pergunta, agora com o atalho ———
  await advanceUntilQuestion(page, QUEM.q);

  // o chip diz o que a cena anterior deixou. A entrevista é só-voz e o texto só chega
  // na revisão, então aqui o eco honesto é a gravação — nunca palavras inventadas.
  const chip = page.locator('.cds-conversation-stage-same-previous');
  await expect(chip).toHaveText(/na cena anterior/);
  await expect(chip).toHaveText(/gravada/);
  await expect(chip).not.toHaveText(/Noemi e Rute/); // a amostra do protótipo, nunca

  // enquanto o atalho está de pé, a gravação de sempre não está na tela
  await expect(page.getByRole('button', { name: 'Gravar a resposta' })).toBeHidden();

  /* E o eco TOCA: quem ouve não lê, e durante a entrevista esta é a única forma de
     ver o que a cena anterior respondeu. O que só o navegador prova é que o controle
     EXISTE, tem nome de ação e é alcançável por um toque — e que tocá-lo não derruba
     o atalho por baixo de quem ainda vai decidir.

     O alternar ouvir⇄pausar NÃO é afirmado aqui: a resposta gravada pelo fixture dura
     uma fração de segundo, então o estado "pausar" é uma janela de corrida real, e
     esperá-la seria um teste que passa por sorte. Ele é provado em jsdom, contra a
     porta de voz de verdade, onde a emissão é determinística. */
  const ouvirAnterior = page.getByRole('button', { name: 'Ouvir a resposta da cena anterior' });
  await expect(ouvirAnterior).toBeVisible();
  await ouvirAnterior.click();
  await expect(chip).toBeVisible();
  await expect(page.getByRole('button', { name: 'São as mesmas pessoas' })).toBeVisible();

  await page.getByRole('button', { name: 'São as mesmas pessoas' }).click();

  // respondida, a pergunta volta a ser uma pergunta comum
  await expect(page.getByRole('button', { name: 'São as mesmas pessoas' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Gravar a resposta' })).toBeVisible();

  // ——— a revisão e a exportação ———
  await app.walkToReport();
  await app.confirmAllDrafts(); // a gravação da cena 1 vira texto confirmado
  await app.completeSession();

  const md = await readReportMd(page, sessionId);
  // a célula da cena 2 traz a frase inglesa como texto comum: sem distintivo, sem
  // estado novo, sem PT-BR — e sem "_(no answer)_" pendurado na cena que ela cita
  expect(md).toContain('- **' + QUEM.q_en + '** ' + SAME_PEOPLE);
});
