import { expect, test } from '@playwright/test';

import { ColarApp, SCENARIO } from './support';

/**
 * A entrevista grava SOM DE VERDADE (§8.7) — a resposta em `.webm` é o artefato que
 * o Compilador consome, então "gravou" tem de significar áudio, não um caminho.
 *
 * Este é o portão que faltava: o app rodou uma semana montando o gravador FIXTURE
 * (ENG-298) e a suíte ficou verde o tempo todo, porque o e2e afirmava o CAMINHO em
 * `meta.voice` e nunca o conteúdo — 9 bytes de cabeçalho EBML passam num teste de
 * caminho. Aqui o Chromium fornece um microfone falso (`--use-fake-device-for-media-
 * capture`), então o app real grava WebM/Opus real e o tamanho do blob é o juiz.
 */

/** O placeholder do fixture tem 9 bytes; áudio real de ~1s passa de 1 KB com folga. */
const MINIMO_PLAUSIVEL = 500;

test('gravar uma resposta produz áudio audível, não um arquivo vazio', async ({ page }) => {
  // O `play()` do gravador real embrulha o blob salvo num <audio> via
  // URL.createObjectURL: é ali que dá para pesar o que o "ouvir" tocaria.
  await page.addInitScript(() => {
    const w = window as unknown as { __blobs: number[] };
    w.__blobs = [];
    const orig = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (obj: Blob | MediaSource) => {
      if (obj instanceof Blob) w.__blobs.push(obj.size);
      return orig(obj);
    };
  });

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
  await app.chooseConversationMode();

  // sem o helper: ele aperta gravar/parar de enfiada, e uma gravação de zero segundo
  // rende um WebM só de cabeçalho — real, mas inaudível. Aqui a pessoa "fala".
  await page.getByRole('button', { name: 'Gravar a resposta' }).click();

  /* ENG-393 — com o microfone aberto, o "← Histórias" do CABEÇALHO também espera.
     Ele mora em ui/app, fora da estação, e é a única saída que o palco da conversa
     não desenha: sair aqui perde a resposta que está sendo dita. A estação e o
     cabeçalho têm testes próprios; o que só um percurso real prova é que um avisa
     o outro. Aqui se afirma só o atributo: o Playwright trata `aria-disabled`
     como não-acionável e ficaria esperando o clique. Que o clique recusado chame
     o bip em vez de navegar é o que header.test.tsx prova. */
  const voltar = page.getByRole('button', { name: 'Voltar às histórias' });
  await expect(voltar).toHaveAttribute('aria-disabled', 'true');

  await page.waitForTimeout(700);
  await page.getByRole('button', { name: 'Parar' }).click();

  // parou: a saída volta a existir
  await expect(voltar).not.toHaveAttribute('aria-disabled', 'true');
  await page.getByRole('button', { name: 'Ouvir a resposta', exact: true }).click();

  await expect
    .poll(async () =>
      page.evaluate(() => {
        const b = (window as unknown as { __blobs: number[] }).__blobs;
        return b.length ? Math.max(...b) : 0;
      }),
    )
    .toBeGreaterThan(MINIMO_PLAUSIVEL);
});
