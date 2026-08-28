import { expect, test } from '@playwright/test';

import { ColarApp, SCENARIO } from './support';

/**
 * "Mãos livres" no app INTEIRO (ENG-649): escolhido o modo, a conversa anda sozinha
 * depois de uma resposta, e a saída de volta ao modo quieto continua alcançável.
 *
 * O que esta spec NÃO afirma, e por quê: a perna do "microfone abre sozinho" depende
 * da porta de voz REAL, e um probe mostrou o que ela faz num Chromium headless —
 * `speak` → `start` → nada, para sempre, sem nunca emitir o fim. Isso não é um
 * defeito do teste, é um caso de verdade (o navegador recusando tocar o áudio
 * sozinho se parece com ele), e está coberto em
 * `ui/pages/conversation/hands-free.test.tsx` com relógio controlado, junto do teto
 * que o destrava. Afirmá-lo aqui significaria esperar esse teto — vinte segundos
 * somados a um gate para provar mais devagar o que já está provado.
 *
 * O que sobra é o que só a pilha inteira responde: com os adapters reais, o shell
 * real e o gravador real ligados, a espera de fato arma ao parar a gravação, a
 * pergunta seguinte de fato chega sem ninguém tocar, e a pílula de fato leva de
 * volta — com o microfone tendo acabado de gravar.
 */

test('em mãos livres a próxima pergunta chega sozinha, e a saída continua ali', async ({
  page,
}) => {
  const app = new ColarApp(page);
  await app.login();
  await app.createSession();
  await app.confirmWholeStory();
  await app.cutScenes();
  await app.triage();
  await app.cutPhrase(SCENARIO.crossingPhrase.s, SCENARIO.crossingPhrase.e);
  await app.moveSeam();
  await app.nextScene();
  await app.cutPhrase(SCENARIO.containedPhrase.s, SCENARIO.containedPhrase.e);
  await app.finishPhrases();

  await app.chooseConversationMode('auto');

  const pergunta = page.locator('.cds-question-card-text');
  const primeira = await pergunta.innerText();

  await app.recordVoiceAnswer();

  // a espera é VISÍVEL antes de acontecer — a chegada se vê vindo
  await expect(
    page.getByText('a próxima chega num instante — o botão lá em cima segura o passo'),
  ).toBeVisible();

  // …e daqui em diante ninguém toca em nada: a pergunta troca sozinha
  await expect(pergunta).not.toHaveText(primeira);

  // a saída para o modo quieto continua alcançável logo depois de gravar
  await page.getByRole('button', { name: 'mãos livres · trocar' }).click();
  await expect(page.getByRole('button', { name: 'toque a toque · trocar' })).toBeVisible();
});
