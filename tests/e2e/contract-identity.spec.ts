import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { expect, test, type Page } from '@playwright/test';

import { manifestoFilename, relatorioFilename, retornoFilename } from '../../contracts';
import { ColarApp } from './support';

/**
 * Acceptance 2 (plano-de-acao §3.2; PRD v2 §10 — o gate mais duro): dirigir a UI REAL
 * com as decisões de um caso golden produz downloads de `anchoring-return.json` e
 * `bead-manifest.json` byte-idênticos aos goldens da referência, e um
 * `mapping-report.md` byte-idêntico ao seu golden. O golden harness já prova
 * domain+contracts = referência; ESTE teste fecha a última fresta: o fio da UI
 * (Setup→…→Export) não introduz nenhuma divergência de serialização ou de estado.
 *
 * Método: reproduz DOIS casos golden pela UI via a decisions-DSL da camada de suporte
 * (ColarApp) — `minimal-flow` (fluxo mínimo com flag + respostas digitadas → os três
 * artefatos) e `seam-small-move` (costura que desliza → manifesto+retorno). O PCM
 * fixture de cada caso (fixtures/bucket/audios.ts) usa o MESMO PcmSpec do caso golden,
 * então o manifest_id bate. A comparação é de BYTES CRUS (Buffer.equals) — sem
 * normalização, sem trim (§10.5). Uma divergência é um bug P0 a arquivar, não a
 * corrigir aqui (Out of scope).
 */

/** tests/golden/expected/<caso>/<arquivo> — resolvido a partir deste spec, sem cwd. */
const GOLDEN_DIR = fileURLToPath(new URL('../golden/expected', import.meta.url));
function goldenBytes(caseName: string, file: string): Buffer {
  return readFileSync(`${GOLDEN_DIR}/${caseName}/${file}`);
}

/**
 * Triage de um caso golden GLEANING+none_fit. `GLEANING_SCENE` é tier ALTA (label
 * "Respiga"), fora da grade "mais comuns" — alcançado expandindo "Ver todos os tipos
 * por tema". A confiança "high" do caso é o rádio "Certeza". A 2ª parte é "Nenhum se
 * encaixa".
 */
async function triageGleaningThenNoneFit(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Ver todos os tipos por tema' }).click();
  await page.getByRole('radio', { name: 'Respiga', exact: true }).click();
  await page.getByRole('radio', { name: 'Certeza', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar', exact: true }).click();
  await page.getByRole('radio', { name: 'Nenhum se encaixa', exact: true }).click();
  // todas classificadas → momento de revisão
  await page.getByRole('button', { name: 'Continuar →' }).click();
}

/**
 * Digita as respostas do caso nas posições exatas da sequência de perguntas
 * (domain/mapping.ts): a conversa começa no índice 0 e "Próxima pergunta" avança de 1.
 * Os alvos vêm em ordem crescente; entre eles, avança clicando "Próxima pergunta".
 * Perguntas não visitadas (e a resposta vazia de `tempo`) ficam "(no answer)" no
 * relatório — idêntico ao golden. NENHUMA resposta por voz (poluiria o .md com paths).
 * A digitação acontece no RELATÓRIO (a entrevista é só-voz): anda até a prévia e
 * preenche o card do índice exato da sequência.
 */
async function typeAnswersAt(
  app: ColarApp,
  _page: Page,
  answers: readonly (readonly [number, string])[],
): Promise<void> {
  await app.walkToReport();
  for (const [target, text] of answers) {
    await app.typeAnswerInReport(target, text);
  }
}

/** Baixa um artefato pelo card da estação Export e devolve nome sugerido + bytes crus. */
async function downloadFromExport(
  page: Page,
  shownFilename: string,
): Promise<{ filename: string; bytes: Buffer }> {
  const card = page.locator('.cds-export .cds-document-card', { hasText: shownFilename });
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    card.getByRole('button', { name: 'Baixar' }).click(),
  ]);
  return { filename: download.suggestedFilename(), bytes: readFileSync(await download.path()) };
}

test('minimal-flow: os três artefatos exportados pela UI são byte-idênticos ao golden', async ({
  page,
}) => {
  const app = new ColarApp(page);
  const slug = 'fluxo-minimo';

  await app.login();
  // sem título → slug = nome do arquivo sem extensão; granularidade Média → beadSec 0.5.
  await app.createSession('fluxo-minimo.wav');

  await app.confirmWholeStory();
  await app.cutScenes([9, 23]); // PT1 0–9, PT2 10–23
  await triageGleaningThenNoneFit(page); // PT1 GLEANING/high, PT2 none_fit

  await app.cutPhrase(0, 4); // frase contida em PT1 (0–9) → trava direto
  await app.finishPhrases(); // 1 cena produtiva → finaliza a segmentação

  // Respostas digitadas nas posições exatas: L1 recontar(0), L2 PT1 quem(12),
  // L2 PT2 descrever(16), L3 P1 oque(21). `tempo`(4) vazio é inerte → omitido.
  await typeAnswersAt(app, page, [
    [0, 'A story about gleaning and returning home.'],
    [12, 'Two women and the reapers.'],
    [16, 'A stretch that fits none of the kinds.'],
    [21, 'Arrival at the field — names kept as spoken: José, Conceição, Belém.'],
  ]);

  await app.completeSession();

  for (const [shown, golden, filenameFor] of [
    ['anchoring-return.json', 'anchoring-return.json', retornoFilename],
    ['bead-manifest.json', 'bead-manifest.json', manifestoFilename],
    ['mapping-report.md', 'mapping-report.md', relatorioFilename],
  ] as const) {
    const { filename, bytes } = await downloadFromExport(page, shown);
    expect(filename).toBe(filenameFor(slug));
    const g = goldenBytes('minimal-flow', golden);
    // falha aqui = divergência byte a byte da UI vs referência → é um P0 a arquivar
    // (Out of scope corrigir); a mensagem dá o rastro sem esconder o gate cru (§10.5).
    expect(bytes.equals(g), `${golden} divergiu do golden (${bytes.length}b vs ${g.length}b)`).toBe(
      true,
    );
  }
});

test('seam-small-move: manifesto+retorno exportados pela UI são byte-idênticos ao golden', async ({
  page,
}) => {
  const app = new ColarApp(page);
  const slug = 'costura-pequena';

  await app.login();
  await app.createSession('costura-pequena.wav');

  await app.confirmWholeStory();
  await app.cutScenes([11, 23]); // PT1 0–11, PT2 12–23
  await triageGleaningThenNoneFit(page);

  await app.cutPhrase(0, 13); // fim 13 cruza a borda 11 (delta 2 ≤ max(3, 25%)) → oferta simples
  await app.moveSeam(); // a costura desliza: PT1 → 0–13, PT2 → 14–23
  await app.finishPhrases();

  await app.completeSession(); // sem respostas: o gate de export só pede ≥1 frase produtiva

  for (const [shown, golden, filenameFor] of [
    ['anchoring-return.json', 'anchoring-return.json', retornoFilename],
    ['bead-manifest.json', 'bead-manifest.json', manifestoFilename],
  ] as const) {
    const { filename, bytes } = await downloadFromExport(page, shown);
    expect(filename).toBe(filenameFor(slug));
    const g = goldenBytes('seam-small-move', golden);
    expect(bytes.equals(g), `${golden} divergiu do golden (${bytes.length}b vs ${g.length}b)`).toBe(
      true,
    );
  }
});

test('a UI em inglês não move um byte: a mesma sessão exportada em EN bate com o golden', async ({
  page,
}) => {
  const app = new ColarApp(page);
  const slug = 'fluxo-minimo';

  // O fluxo inteiro em PT (reusa os helpers). O que este teste isola é o idioma na
  // HORA de materializar e baixar os artefatos — o caso que o golden NÃO cobre (ele
  // roda por domain+contracts, sem UI) e que o e2e em PT também não cobre.
  await app.login();
  await app.createSession('fluxo-minimo.wav');
  await app.confirmWholeStory();
  await app.cutScenes([9, 23]);
  await triageGleaningThenNoneFit(page);
  await app.cutPhrase(0, 4);
  await app.finishPhrases();
  await typeAnswersAt(app, page, [
    [0, 'A story about gleaning and returning home.'],
    [12, 'Two women and the reapers.'],
    [16, 'A stretch that fits none of the kinds.'],
    [21, 'Arrival at the field — names kept as spoken: José, Conceição, Belém.'],
  ]);

  // Troca a UI para INGLÊS. De quebra isto é um smoke test do chrome EN: o fluxo só
  // avança daqui pra frente se os rótulos ingleses existirem de verdade.
  await page.getByRole('button', { name: 'Mudar para inglês' }).click();
  await expect(page.getByRole('button', { name: 'Switch to Portuguese' })).toBeVisible();

  // Conclui e baixa com a UI em inglês.
  await app.gotoStep('Save');
  const complete = page.getByRole('button', { name: 'Finish and save the documents' });
  await expect(complete).toBeEnabled();
  await complete.click();
  await expect(page.getByRole('button', { name: 'Unlock to edit' })).toBeVisible();

  for (const [shown, golden, filenameFor] of [
    ['anchoring-return.json', 'anchoring-return.json', retornoFilename],
    ['bead-manifest.json', 'bead-manifest.json', manifestoFilename],
    ['mapping-report.md', 'mapping-report.md', relatorioFilename],
  ] as const) {
    // O nome EXIBIDO no card é o do contrato e nunca traduz — o locator vale nos dois idiomas.
    const card = page.locator('.cds-export .cds-document-card', { hasText: shown });
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      card.getByRole('button', { name: 'Download' }).click(),
    ]);
    const bytes = readFileSync(await download.path());
    expect(download.suggestedFilename()).toBe(filenameFor(slug));
    const g = goldenBytes('minimal-flow', golden);
    // Um byte diferente = o i18n vazou para o artefato (P0): o pipeline consome PT-BR.
    expect(bytes.equals(g), `${golden} mudou só por a UI estar em inglês`).toBe(true);
  }
});
