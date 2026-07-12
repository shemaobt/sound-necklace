import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { expect, test, type Page } from '@playwright/test';

import { manifestoFilename, relatorioFilename, retornoFilename } from '../../contracts';
import { ColarApp } from './support';

/**
 * Acceptance 2 (plano-de-acao §3.2; PRD v2 §10 — o gate mais duro): dirigir a UI REAL
 * com as decisões de um caso golden produz downloads de `retorno-ancoragem.json` e
 * `manifesto-contas.json` byte-idênticos aos goldens da referência, e um
 * `relatorio-mapeamento.md` byte-idêntico ao seu golden. O golden harness já prova
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
 * Triagem de um caso golden GLEANING+none_fit. `GLEANING_SCENE` é tier ALTA (label
 * "Respiga"), fora da grade "mais comuns" — alcançado pelo filtro. A confiança "alta"
 * do caso é o rádio "Certeza". A 2ª parte é "Nenhum se encaixa".
 */
async function triageGleaningThenNoneFit(page: Page): Promise<void> {
  await page.getByRole('searchbox', { name: 'filtrar tipos' }).fill('Respiga');
  await page.getByRole('radio', { name: 'Respiga', exact: true }).click();
  await page.getByRole('radio', { name: 'Certeza', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar', exact: true }).click();
  await page.getByRole('radio', { name: 'Nenhum se encaixa', exact: true }).click();
  await page.getByRole('button', { name: 'Já classifiquei todas as cenas →' }).click();
}

/**
 * Digita as respostas do caso nas posições exatas da sequência de perguntas
 * (domain/mapping.ts): a conversa começa no índice 0 e "Próxima pergunta" avança de 1.
 * Os alvos vêm em ordem crescente; entre eles, avança clicando "Próxima pergunta".
 * Perguntas não visitadas (e a resposta vazia de `tempo`) ficam "(sem resposta)" no
 * relatório — idêntico ao golden. NENHUMA resposta por voz (poluiria o .md com paths).
 */
async function typeAnswersAt(
  app: ColarApp,
  page: Page,
  answers: readonly (readonly [number, string])[],
): Promise<void> {
  const next = page.getByRole('button', { name: 'Próxima pergunta' });
  let idx = 0;
  for (const [target, text] of answers) {
    while (idx < target) {
      await next.click();
      idx += 1;
    }
    await app.typeAnswer(text);
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
  await triageGleaningThenNoneFit(page); // PT1 GLEANING/alta, PT2 none_fit

  await app.cutPhrase(0, 4); // frase contida em PT1 (0–9) → trava direto
  await page.getByRole('button', { name: '⚑ revisar' }).click(); // flag NEEDS_REVIEW em P1
  await app.finishSegmentacao(); // 1 cena produtiva → finaliza a segmentação

  // Respostas digitadas nas posições exatas: L1 recontar(0), L2 PT1 quem(12),
  // L2 PT2 descrever(16), L3 P1 oque(21). `tempo`(4) vazio é inerte → omitido.
  await typeAnswersAt(app, page, [
    [0, 'Uma história sobre respiga e retorno ao lar.'],
    [12, 'Duas mulheres e os ceifeiros.'],
    [16, 'Um trecho que não se encaixa nos tipos.'],
    [21, 'A chegada ao campo — com acentos: coração, você, média.'],
  ]);

  await app.completeSession();

  for (const [shown, golden, filenameFor] of [
    ['retorno-ancoragem.json', 'retorno-ancoragem.json', retornoFilename],
    ['manifesto-contas.json', 'manifesto-contas.json', manifestoFilename],
    ['relatorio-mapeamento.md', 'relatorio-mapeamento.md', relatorioFilename],
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
  await app.finishSegmentacao();

  await app.completeSession(); // sem respostas: o gate de export só pede ≥1 frase produtiva

  for (const [shown, golden, filenameFor] of [
    ['retorno-ancoragem.json', 'retorno-ancoragem.json', retornoFilename],
    ['manifesto-contas.json', 'manifesto-contas.json', manifestoFilename],
  ] as const) {
    const { filename, bytes } = await downloadFromExport(page, shown);
    expect(filename).toBe(filenameFor(slug));
    const g = goldenBytes('seam-small-move', golden);
    expect(bytes.equals(g), `${golden} divergiu do golden (${bytes.length}b vs ${g.length}b)`).toBe(
      true,
    );
  }
});
