import { expect, test, type Page } from '@playwright/test';

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
 * confiança) → Segmentação (ancoragem/aviso-de-cena-vazia/seam-modal) → Conversation
 * (níveis história/cena/frase + gravando).
 */

const LISTEN = {
  1: '▶ ouvir a história',
  2: '▶ ouvir a cena',
  3: '▶ ouvir a frase',
} as const;

/** Nível da pergunta em foco no Conversation, pelo ▶ do trecho (exatamente um por tela). */
async function currentLevel(page: Page): Promise<1 | 2 | 3> {
  await expect(page.locator('button', { hasText: '▶ ouvir a' })).toBeVisible();
  if (await page.getByRole('button', { name: LISTEN[1] }).count()) return 1;
  if (await page.getByRole('button', { name: LISTEN[2] }).count()) return 2;
  if (await page.getByRole('button', { name: LISTEN[3] }).count()) return 3;
  throw new Error('pergunta do Conversation sem ▶ de nível reconhecível');
}

/** Avança "Próxima pergunta" até a primeira pergunta do nível pedido. */
async function advanceToLevel(page: Page, target: 1 | 2 | 3): Promise<void> {
  for (let i = 0; i < 60; i++) {
    if ((await currentLevel(page)) === target) return;
    await page.getByRole('button', { name: 'Próxima pergunta' }).click();
  }
  throw new Error(`não alcançou o nível ${target} do Conversation`);
}

test('§9.2 — cada tela do ouvinte passa no scan de minimalismo', async ({ page }) => {
  const app = new ColarApp(page);
  const main = page.locator('main.cds-app-main');
  const scan = (label: string) => scanListenerSurface(main, { label });

  await app.login();
  await app.createSession();

  // ——— Escuta 1 ———
  await expect(page.getByRole('button', { name: 'Já ouvi a história completa' })).toBeVisible();
  await scan('Escuta 1');

  // ——— Escuta 2: ancoragem ativa ———
  await app.confirmWholeStory();
  await expect(page.getByText('já está costurado')).toBeVisible();
  await scan('Escuta 2 — ancoragem');

  // ——— Escuta 2: com uma cena travada (chips visíveis) ———
  await app.clickBead(SCENARIO.sceneEndBeads[0]);
  await page.getByRole('button', { name: '✓ Confirmar esta cena' }).click();
  await scan('Escuta 2 — cena travada');

  // termina o corte e confirma as cenas
  await app.clickBead(SCENARIO.sceneEndBeads[1]);
  await page.getByRole('button', { name: '✓ Confirmar esta cena' }).click();
  await app.clickBead(SCENARIO.sceneEndBeads[2]);
  await page.getByRole('button', { name: '✓ Confirmar esta cena' }).click();
  // história toda coberta → momento de revisão (uma manchete + Continuar)
  await scan('Escuta 2 — revisão das cenas');
  await page.getByRole('button', { name: 'Continuar →' }).click();

  // ——— Triage: foco na cena / picker (grade "Mais comuns") ———
  await expect(page.getByText('Essa cena é sobre o quê?')).toBeVisible();
  await scan('Triage — foco/picker');

  // ——— Triage: todos os tipos por tema (picker expandido) ———
  await page.getByRole('button', { name: 'Ver todos os tipos por tema' }).click();
  await scan('Triage — todos os tipos');
  await page.getByRole('button', { name: 'recolher' }).click();

  // ——— Triage: passo de confiança ———
  await page.getByRole('radio', { name: SCENARIO.triage[0].kind, exact: true }).click();
  await expect(page.getByText('O quanto isso parece certo pra você?')).toBeVisible();
  await scan('Triage — confiança');

  // classifica as três cenas para avançar (2 tipos + nenhum se encaixa)
  await page.getByRole('radio', { name: SCENARIO.triage[0].confidence, exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar', exact: true }).click();
  await page.getByRole('radio', { name: SCENARIO.triage[1].kind, exact: true }).click();
  await page.getByRole('radio', { name: SCENARIO.triage[1].confidence, exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar', exact: true }).click();
  await page.getByRole('radio', { name: 'Nenhum se encaixa', exact: true }).click();
  // todas classificadas → momento de revisão
  await scan('Triage — revisão');
  await page.getByRole('button', { name: 'Continuar →' }).click();

  // ——— Segmentação: ancoragem (primeira cena produtiva, sem frases) ———
  await expect(page.getByText(/Toque no colar onde cada frase termina/)).toBeVisible();
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

  // ——— Conversation: nível história (L1) ———
  await expect(page.getByRole('button', { name: LISTEN[1] })).toBeVisible();
  await scan('Conversation — nível história');

  // ——— Conversation: nível cena (L2) ———
  await advanceToLevel(page, 2);
  await scan('Conversation — nível cena');

  // ——— Conversation: nível frase (L3) ———
  await advanceToLevel(page, 3);
  await scan('Conversation — nível frase');

  // ——— Conversation: gravando ———
  await page.getByRole('button', { name: 'gravar a resposta' }).click();
  await expect(page.getByRole('button', { name: 'Parar' })).toBeVisible();
  await scan('Conversation — gravando');
});
