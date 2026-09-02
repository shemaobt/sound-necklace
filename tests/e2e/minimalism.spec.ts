import { expect, test } from '@playwright/test';

import { ColarApp, SCENARIO } from './support';
import { scanListenerSurface } from './support/minimalism';

/**
 * §9.2 checklist automatizado (ENG-258): dirige o app REAL (fixture) por CADA
 * estado de decisão do ouvinte e aplica o scan de minimalismo (uma instrução, uma
 * ação dominante, nenhum dígito/ID/tabela). As telas do ouvinte soletram os
 * números por extenso ("Cena um"), então a allowlist de dígitos fica VAZIA; um
 * dígito que apareça é bug da estação dona, não do teste.
 *
 * Um único percurso (o mesmo roteiro do acceptance 1) visita os estados em ordem:
 * Escuta 1 → Escuta 2 (ancoragem + cena travada) → Triage (foco/todos-os-tipos/
 * confiança) → Segmentação (ancoragem/aviso-de-cena-vazia/seam-modal) → o fim do
 * fluxo (ENG-689).
 */

test('§9.2 — cada tela do ouvinte passa no scan de minimalismo', async ({ page }) => {
  const app = new ColarApp(page);
  const main = page.locator('main.cds-app-main');
  const scan = (label: string) => scanListenerSurface(main, { label });

  /**
   * A ÚNICA exceção viva ao digit-free (ENG-389, decisão do dono, 2026-08-04): o
   * indicador de cena da Triagem passou a numerar as cenas. Ele reusa a linguagem
   * visual da conta do colar, e sem número o usuário o lia como "uma conta" — não
   * sabia em que cena estava nem quais faltavam.
   *
   * A exceção é a SUBÁRVORE do indicador, não um padrão de texto. Um padrão como
   * "um ordinal solto" perdoaria qualquer outro número que vazasse nessa forma —
   * uma contagem de contas renderizada como "12", por exemplo. Excisando o
   * componente, a dispensa fica presa a ele: no resto da triagem, contagem, ID e
   * duração continuam reprovando, como nas demais estações.
   */
  const scanTriagem = (label: string) =>
    scanListenerSurface(main, {
      label,
      except: [
        {
          selector: '.cds-progress-dots',
          reason:
            'PRD §9.2 + ENG-389: o indicador de cena da Triagem numera as cenas — exceção ' +
            'única, aprovada pelo dono; contas do colar e fio do rodapé seguem sem dígito.',
        },
      ],
    });

  await app.login();
  await app.createSession();

  // ——— Escuta 1 ———
  await expect(page.getByRole('button', { name: 'Já ouvi a história completa' })).toBeVisible();
  await scan('Escuta 1');

  // ——— Escuta 2: ancoragem ativa ———
  await app.confirmWholeStory();
  await expect(page.getByRole('heading', { name: 'Corte a história em cenas' })).toBeVisible();
  await scan('Escuta 2 — ancoragem');

  // ——— Escuta 2: com uma cena travada (chips visíveis) ———
  // dois toques por cena desde 2026-08-07: começo, depois fim
  await app.clickBead(0);
  await app.clickBead(SCENARIO.sceneEndBeads[0]);
  await page.getByRole('button', { name: '✓ Confirmar esta cena' }).click();
  await scan('Escuta 2 — cena travada');

  // termina o corte e confirma as cenas
  await app.clickBead(SCENARIO.sceneEndBeads[0] + 1);
  await app.clickBead(SCENARIO.sceneEndBeads[1]);
  await page.getByRole('button', { name: '✓ Confirmar esta cena' }).click();
  await app.clickBead(SCENARIO.sceneEndBeads[1] + 1);
  await app.clickBead(SCENARIO.sceneEndBeads[2]);
  await page.getByRole('button', { name: '✓ Confirmar esta cena' }).click();
  // história toda coberta → momento de revisão (uma manchete + Continuar)
  await scan('Escuta 2 — revisão das cenas');
  await page.getByRole('button', { name: 'Continuar →' }).click();

  // ——— Triage: foco na cena / picker (os 27 tipos, ENG-390) ———
  await expect(page.getByText('Essa cena é sobre o quê?')).toBeVisible();
  await scanTriagem('Triage — foco/picker');

  // ——— Triage: passo de confiança ———
  await page.getByRole('radio', { name: SCENARIO.triage[0].kind, exact: true }).click();
  await expect(page.getByText('O quanto isso parece certo pra você?')).toBeVisible();
  await scanTriagem('Triage — confiança');

  // classifica as três cenas para avançar (2 tipos + nenhum se encaixa)
  await page.getByRole('radio', { name: SCENARIO.triage[0].confidence, exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar', exact: true }).click();
  await page.getByRole('radio', { name: SCENARIO.triage[1].kind, exact: true }).click();
  await page.getByRole('radio', { name: SCENARIO.triage[1].confidence, exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar', exact: true }).click();
  await page.getByRole('radio', { name: 'Nenhum se encaixa', exact: true }).click();
  // todas classificadas → momento de revisão
  await scanTriagem('Triage — revisão');
  await page.getByRole('button', { name: 'Continuar →' }).click();

  // ——— Fim de bloco: a tela que fecha a Triagem (ENG-651) ———
  // ela vive num portal, FORA do `main`: o scan tem de apontar para a própria tela,
  // senão mediria a estação que ficou atrás dela.
  await scanListenerSurface(page.locator('.cds-block-done'), {
    label: 'Fim de bloco — a Triagem fechada',
  });
  await page.getByRole('button', { name: 'Seguir para as frases' }).click();

  // ——— Segmentação: ancoragem (primeira cena produtiva, sem frases) ———
  await expect(
    page.getByText(/Divida a cena: toque no colar onde esta frase começa e termina\./),
  ).toBeVisible();
  await scan('Segmentação — ancoragem');

  // ——— Segmentação: aviso de cena vazia ———
  await page.getByRole('button', { name: 'Pronto com esta cena →' }).click();
  await expect(page.getByText('Esta cena ficou sem frases.')).toBeVisible();
  await scan('Segmentação — aviso de cena vazia');

  // ——— Segmentação: seam-modal (frase que cruza a borda) ———
  await app.clickBead(SCENARIO.crossingPhrase.s);
  await app.clickBead(SCENARIO.crossingPhrase.e);
  await page.getByRole('button', { name: '✓ Confirmar esta frase' }).click();
  const seam = page.locator('.cds-seam-modal');
  await expect(seam).toBeVisible();
  await scanListenerSurface(seam, { label: 'Segmentação — seam-modal' });
  await app.moveSeam();
  await app.nextScene();

  // segunda cena produtiva + conclui a segmentação
  await app.cutPhrase(SCENARIO.containedPhrase.s, SCENARIO.containedPhrase.e);
  await app.finishPhrases();

  // ——— a Rever (ENG-725): a história inteira, os dois a veem ———
  // O panorama todo — colar, pérolas de cena, legenda — e o aviso antes de
  // concluir: nenhum dígito em nenhum deles, com CSS e layout de verdade.
  await scan('Rever — panorama');
  await page.getByRole('button', { name: 'Concluir a história' }).click();
  await expect(page.getByText('Toque de novo para concluir.')).toBeVisible();
  await scan('Rever — aviso antes de concluir');
  await page.getByRole('button', { name: 'Concluir a história' }).click();

  // ——— a história concluída ———
  // A tela que fecha a história é a última que o ouvinte vê, e é portalada — o
  // scan aponta para o diálogo, não para o `main`.
  await expect(page.getByRole('heading', { name: 'A história está completa.' })).toBeVisible();
  await scanListenerSurface(page.getByRole('dialog'), { label: 'História concluída' });
});
