import { readFileSync } from 'node:fs';

import { expect, test, type Download, type Page } from '@playwright/test';

import { manifestoFilename, relatorioFilename, retornoFilename } from '../../contracts';
import { ColarApp, STORAGE_KEY } from './support';

/**
 * Acceptance 3 (plano-de-acao §3.3): os três artefatos de uma sessão CONCLUÍDA são
 * baixados direto do card do Dashboard, SEM abrir a sessão — e cada download é
 * byte-idêntico aos bytes que a conclusão guardou (§7.2 downloads diretos, §10.5
 * custódia opaca: bytes servidos = bytes guardados). Modo fixture; Playwright dirige
 * a UI real e captura os bytes do download.
 */

type ArtifactBytes = { anchoring: string; manifest: string; report: string };

/** O que a conclusão gravou no localStorage: o slug + o trio de artefatos opaco. */
async function readStored(
  page: Page,
  id: string,
): Promise<{ slug: string; artifacts: ArtifactBytes }> {
  const raw = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);
  if (!raw) throw new Error('localStorage vazio — a sessão não foi persistida');
  const parsed = JSON.parse(raw) as {
    sessions: [string, { summary: { story_slug: string }; artifacts?: ArtifactBytes }][];
  };
  const rec = parsed.sessions.find(([sid]) => sid === id)?.[1];
  if (!rec?.artifacts) throw new Error(`artefatos não guardados para a sessão ${id}`);
  return { slug: rec.summary.story_slug, artifacts: rec.artifacts };
}

/** Os três documentos §8.8: chave guardada + helper do filename. */
const ARTIFACTS = [
  { key: 'anchoring', filenameFor: retornoFilename },
  { key: 'manifest', filenameFor: manifestoFilename },
  { key: 'report', filenameFor: relatorioFilename },
] as const;

test('baixa os três artefatos direto do dashboard, byte-idênticos, sem abrir a sessão', async ({
  page,
}) => {
  const app = new ColarApp(page);

  // ——— completa uma sessão pelo fluxo real (mesmo roteiro do acceptance 1) ———
  await app.login();
  const sessionId = await app.createSession();

  await app.confirmWholeStory();
  await app.cutScenes();
  await app.triage();

  await app.cutPhrase(0, 5);
  await app.moveSeam(); // a frase cruza a borda → a costura desliza
  await app.nextScene();
  await app.cutPhrase(6, 7);
  await app.finishPhrases();

  await app.answerConversation();
  await app.completeSession();

  // os bytes que a conclusão guardou (a referência da comparação).
  const stored = await readStored(page, sessionId);

  // ——— vai ao Dashboard (SEM abrir a sessão) ———
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'Suas histórias' })).toBeVisible();

  // o menu de ações vive no cartão (ENG-281: em TODOS eles; aqui só há um na grade)
  const trigger = page.getByRole('button', { name: /^Ações em / });
  await expect(trigger).toHaveCount(1);
  await trigger.click();

  // ——— uma escolha só, e os três documentos saem (ENG-281) ———
  const saved: Download[] = [];
  page.on('download', (d) => saved.push(d));
  await page.getByRole('button', { name: 'Baixar os documentos' }).click();
  await expect.poll(() => saved.length).toBe(3);

  for (const { key, filenameFor } of ARTIFACTS) {
    // filename exato (§8.8: <slug>-<nome-do-artefato>).
    const wanted = filenameFor(stored.slug);
    const download = saved.find((d) => d.suggestedFilename() === wanted);
    expect(download, `nenhum download chamado ${wanted}`).toBeTruthy();

    // bytes crus idênticos aos guardados — sem normalização, sem trim (§10.5).
    const bytes = readFileSync(await download!.path());
    expect(bytes.equals(Buffer.from(stored.artifacts[key], 'utf8'))).toBe(true);
  }

  // nunca navegou para dentro da sessão: a rota continua no dashboard.
  expect(new URL(page.url()).pathname).toBe('/dashboard');
});
