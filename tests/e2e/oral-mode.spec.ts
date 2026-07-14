import { expect, test, type Page } from '@playwright/test';

import { ColarApp, SCENARIO } from './support';

/**
 * Aceitação 4 — metade FLUXO (plano-de-acao §3.4; PRD v2 §9.1/§9.3/§9.4): o ouvinte
 * opera o ciclo inteiro por SOM + FORMA + POSIÇÃO, sem ler nem tocar em chrome. O
 * Playwright dirige o app real em modo fixture; uma sonda instalada por
 * `addInitScript` observa o DOM para provar as propriedades de modo oral:
 *
 * - SOM, NÃO TEXTO: nos pontos de decisão do ouvinte onde o áudio é DOM-observável
 *   — o playhead que o player fixture acende via `data-play` nas contas — a ação
 *   produz SOM e NÃO injeta texto novo (nó de texto fora do colar). Cobre o
 *   transporte e o toque de conta (Escuta 1) e o toque-início de frase
 *   (Segmentação). O playhead visual acende um rAF DEPOIS do render, então "som
 *   antes de texto" por ORDEM não é observável quando a ação também renderiza texto
 *   síncrono (o `player.play()` roda após o `apply` do domínio); a asserção honesta
 *   e viva é "som, e nenhum texto competindo". Onde o som NÃO é DOM-observável
 *   (toque que completa seleção, cujo confirm renderiza síncrono; e o Mapeamento,
 *   que não tem colar) a propriedade é provada pelo sinal não-textual do controle e
 *   pelo avanço in-station.
 * - NUDGE DE BORDA (§9.3): o dwell dispara o playback da janela da fronteira SEM
 *   mudar a seleção (as bandas de seleção continuam idênticas).
 * - ZERO CHROME: do momento em que a Escuta 1 assume até o relatório, nenhum
 *   clique/foco alcança o cabeçalho ou o fio de contas — as transições de estação
 *   são por modo de domínio e "Próxima pergunta", nunca pelo stepper.
 * - SINAL NÃO-TEXTUAL: as contas são `aria-hidden` e sem texto (posição/cor); a
 *   linha de instrução e a ação dominante carregam `data-role` identificável.
 */

interface OralSpy {
  events: { kind: 'sound' | 'text' }[];
  chrome: string[];
  chromeOn: boolean;
  reset(): void;
}

declare global {
  interface Window {
    __oral: OralSpy;
  }
}

/**
 * Instala a sonda antes de qualquer navegação. Um `MutationObserver` no `body`
 * registra, em ordem: `sound` quando uma conta ganha `data-play` (o playhead do
 * player), `text` quando um nó de texto novo aparece fora do colar. Listeners de
 * captura registram todo clique/foco que alcance chrome enquanto `chromeOn`.
 */
async function installOralSpy(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const spy: OralSpy = {
      events: [],
      chrome: [],
      chromeOn: false,
      reset() {
        this.events.length = 0;
      },
    };
    window.__oral = spy;

    const inNecklace = (node: Node): boolean => {
      const el = node instanceof Element ? node : node.parentElement;
      return !!el?.closest('.cds-necklace');
    };
    const hasText = (node: Node): boolean => (node.textContent ?? '').trim().length > 0;

    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === 'attributes') {
          const el = record.target as Element;
          if (record.attributeName === 'data-play' && el.hasAttribute('data-play')) {
            spy.events.push({ kind: 'sound' });
          }
        } else if (record.type === 'characterData') {
          if (hasText(record.target) && !inNecklace(record.target))
            spy.events.push({ kind: 'text' });
        } else if (record.type === 'childList') {
          for (const node of record.addedNodes) {
            if (inNecklace(node)) continue;
            const textful =
              node.nodeType === Node.TEXT_NODE
                ? hasText(node)
                : node instanceof Element && hasText(node);
            if (textful) spy.events.push({ kind: 'text' });
          }
        }
      }
    });
    const start = (): void =>
      observer.observe(document.body, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
        attributeFilter: ['data-play'],
      });
    if (document.body) start();
    else addEventListener('DOMContentLoaded', start);

    const chromeHit = (ev: Event): void => {
      if (!spy.chromeOn) return;
      const target = ev.target;
      const chrome = target instanceof Element ? target.closest('.cds-header, .cds-stepper') : null;
      if (chrome) spy.chrome.push(`${ev.type}:${chrome.className}`);
    };
    addEventListener('click', chromeHit, true);
    addEventListener('focusin', chromeHit, true);
  });
}

/**
 * Reseta a sonda, executa a ação e afirma a propriedade ear-first NO ponto em que
 * ela é DOM-observável: a ação produz SOM (uma conta acende `data-play`) e NÃO
 * injeta TEXTO (nenhum nó de texto novo fora do colar). O playhead visual acende um
 * rAF DEPOIS do render, então "som antes de texto" por ordem não é observável quando
 * a ação também renderiza texto síncrono — a asserção honesta é "som, e nenhum texto
 * competindo". É viva, não vacuosa: qualquer nó de texto novo desta ação REPROVA.
 */
async function assertPlaysWithoutText(page: Page, action: () => Promise<void>): Promise<void> {
  await page.evaluate(() => window.__oral.reset());
  await action();
  await expect
    .poll(() => page.evaluate(() => window.__oral.events.some((e) => e.kind === 'sound')))
    .toBe(true);
  // o `apply` do domínio (e qualquer texto que ele renderize) é síncrono e precede o
  // som — que espera um rAF; logo, ao ver o som, todo texto competindo já está no log.
  const kinds = await page.evaluate(() => window.__oral.events.map((e) => e.kind));
  expect(
    kinds,
    `a ação injetou texto competindo com o som; log=${JSON.stringify(kinds)}`,
  ).not.toContain('text');
}

/** Espera todo playhead apagar (nenhuma conta com `data-play`). */
async function waitForSilence(page: Page): Promise<void> {
  await expect.poll(() => page.locator('.cds-necklace-bead[data-play]').count()).toBe(0);
}

/** Retângulos (arredondados) das bandas de seleção do colar — para provar não-mudança. */
async function selectionBands(
  page: Page,
): Promise<{ x: number; y: number; w: number; h: number }[]> {
  return page.locator('.cds-necklace-selection-band').evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return {
        x: Math.round(r.x),
        y: Math.round(r.y),
        w: Math.round(r.width),
        h: Math.round(r.height),
      };
    }),
  );
}

/**
 * DoD #2: passar o ponteiro na borda da seleção ativa dispara o playback da janela
 * da fronteira (som) SEM mudar a seleção. Requer uma seleção viva e um dwell > 280ms.
 */
async function hoverEdgeKeepsSelection(page: Page, edgeIdx: number): Promise<void> {
  await waitForSilence(page);
  const before = await selectionBands(page);
  expect(before.length, 'esperava uma seleção ativa para o nudge de borda').toBeGreaterThan(0);
  await page.evaluate(() => window.__oral.reset());

  const box = await page.locator(`.cds-necklace-bead[data-idx="${edgeIdx}"]`).boundingBox();
  if (!box) throw new Error('conta de borda sem geometria');
  // sai da borda e volta, para um pointermove fresco agendar o dwell
  await page.mouse.move(box.x + box.width / 2, box.y - 50);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);

  await expect
    .poll(() => page.evaluate(() => window.__oral.events.some((e) => e.kind === 'sound')))
    .toBe(true);
  const after = await selectionBands(page);
  expect(after, 'o nudge de borda mudou a seleção').toEqual(before);
}

test('modo oral: som antes de texto, sem chrome, da Escuta 1 ao relatório', async ({ page }) => {
  await installOralSpy(page);
  const app = new ColarApp(page);

  // Setup pela facilitadora — anterior ao caminho do ouvinte.
  await app.login();
  await app.createSession();

  // ——— Escuta 1: a primeira tela do ouvinte ———
  await expect(page.getByText('Ouça a história.')).toBeVisible();
  // sinal não-textual: uma linha de instrução identificável e contas sem texto/aria.
  await expect(page.locator('.cds-escuta1 [data-role="instruction"]')).toBeVisible();
  const bead = page.locator('.cds-necklace-bead[data-idx="3"]');
  await expect(bead).toHaveText('');
  expect(await bead.locator('.cds-pearl').getAttribute('aria-hidden')).toBe('true');

  // A partir daqui, o ouvinte não deve tocar em chrome (cabeçalho/stepper).
  await page.evaluate(() => {
    window.__oral.chromeOn = true;
  });

  // decisão: tocar a história inteira (transporte) → som, nenhum texto novo.
  await assertPlaysWithoutText(page, () =>
    page.getByRole('button', { name: 'Ouvir a história' }).click(),
  );
  // decisão: tocar uma conta → som daquela conta, nenhum texto.
  await assertPlaysWithoutText(page, () => app.clickBead(3));

  await app.confirmWholeStory();

  // ——— Escuta 2: corte de cenas + nudge de borda (§9.3) ———
  const [firstEnd, ...restEnds] = SCENARIO.sceneEndBeads;
  await app.clickBead(firstEnd); // seleciona a 1ª cena {costura, firstEnd}
  await expect(
    page.locator('.cds-escuta2-confirm-scene[data-role="primary-action"]'),
  ).toBeVisible();
  await hoverEdgeKeepsSelection(page, firstEnd);
  await page.getByRole('button', { name: '✓ Confirmar esta cena' }).click();
  for (const end of restEnds) {
    await app.clickBead(end);
    await page.getByRole('button', { name: '✓ Confirmar esta cena' }).click();
  }
  await page.getByRole('button', { name: 'Continuar →' }).click();

  // ——— Triagem: classificação (controles do picker, não chrome) ———
  await app.triage();

  // ——— Segmentação: o toque-início de frase dá som antes de qualquer confirm ———
  await expect(page.getByText('Toque no colar o começo e o fim de cada frase.')).toBeVisible();
  await assertPlaysWithoutText(page, () => app.clickBead(SCENARIO.crossingPhrase.s));
  await app.clickBead(SCENARIO.crossingPhrase.e); // completa a seleção
  await page.getByRole('button', { name: '✓ Confirmar esta frase' }).click(); // cruza a borda → seam modal
  await app.moveSeam();
  await app.nextScene();
  await app.cutPhrase(SCENARIO.containedPhrase.s, SCENARIO.containedPhrase.e);
  await app.finishSegmentacao();

  // ——— Mapeamento → relatório: pergunta tocada + gravação por voz, avanço in-station ———
  await expect(page.locator('.cds-mapeamento-listen button')).toBeVisible(); // ▶ ouvir o trecho
  await app.recordVoiceAnswer(); // o microfone é sinal não-textual (forma de onda)
  for (let i = 0; i < 80; i++) {
    if (await page.getByRole('region', { name: 'relatório' }).count()) break;
    await page.getByRole('button', { name: 'Próxima pergunta' }).click();
  }
  await expect(page.getByRole('region', { name: 'relatório' })).toBeVisible();

  // ——— o caminho inteiro do ouvinte nunca tocou em chrome ———
  const chrome = await page.evaluate(() => window.__oral.chrome);
  expect(chrome, `o caminho do ouvinte interagiu com chrome: ${JSON.stringify(chrome)}`).toEqual(
    [],
  );
});
