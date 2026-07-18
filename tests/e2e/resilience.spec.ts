import { expect, test, type Page } from '@playwright/test';

import { ColarApp, SCENARIO, readPersistedState } from './support';

/**
 * Acceptance 6 (plano-de-acao §3.6; PRD v2 §7.3/§13): resiliência. Três cenários
 * dirigidos pela UI real em modo fixture, provando que nenhuma decisão se perde
 * quando a conexão cai, o token de auth caduca, ou outra pessoa detém a sessão.
 *
 * Os gatilhos vêm da fiação da ENG-277: a queda de conexão pela emulação de rede do
 * Playwright (`context.setOffline`, que a window reflete no gate), e os dois seams
 * DEV-only `window.__cds` (expiração de auth + trava consultiva por outra pessoa),
 * instalados só em `import.meta.env.DEV` — o webServer E2E roda o Vite dev.
 */

/** Os dois gatilhos de resiliência sem caminho natural de UI (seam DEV-only). */
interface CdsSeam {
  expireAuth(): void;
  seedForeignLock(sessionId: string): Promise<void>;
}
type CdsWindow = Window & { __cds: CdsSeam };

/** Caduca o token do servidor (§7.1). */
function expireAuth(page: Page): Promise<void> {
  return page.evaluate(() => (window as unknown as CdsWindow).__cds.expireAuth());
}
/** Faz outra pessoa deter a trava consultiva da sessão no mesmo backend (§7.3). */
function seedForeignLock(page: Page, id: string): Promise<void> {
  return page.evaluate((sid) => (window as unknown as CdsWindow).__cds.seedForeignLock(sid), id);
}

/** Conta as cenas cuja triage já as classificou (tag firme). */
function taggedScenes(state: Awaited<ReturnType<typeof readPersistedState>>): number {
  const parts = (state?.parts ?? []) as { tag_state?: string }[];
  return parts.filter((p) => p.tag_state === 'tagged').length;
}

test.describe('acceptance 6: resiliência (§7.3/§13)', () => {
  test('queda de conexão no meio da Segmentação: pausa, playback segue, nada se perde', async ({
    page,
  }) => {
    const app = new ColarApp(page);
    await app.login();
    const id = await app.createSession();
    await app.confirmWholeStory();
    await app.cutScenes();
    await app.triage();

    // Assenta no modo Segmentação com as três cenas persistidas antes de derrubar a rede.
    await expect.poll(async () => (await readPersistedState(page, id))?.mode).toBe('segmentacao');

    // Playback já-carregado tocando ANTES da queda: a conta do playhead acende
    // (`data-play="head"`; as anteriores ficam "played" — a iluminação é cumulativa).
    const headBead = page.locator('.cds-necklace-bead[data-play="head"]');
    const headIndex = async (): Promise<number> => {
      const idx = await headBead.getAttribute('data-idx').catch(() => null);
      return idx === null ? -1 : Number(idx);
    };
    // o ▶ da cena saiu: o som nasce das contas — duas contas fecham uma seleção e o
    // colar toca o INTERVALO. Apontar a frase aqui deixa a seleção assentar no
    // autosave (que é debounced) ANTES da régua, senão ela nasce velha e a queda
    // levaria a culpa por uma mudança que foi nossa.
    const { s: phraseS, e: phraseE } = SCENARIO.containedPhrase;
    await app.clickBead(phraseS);
    await app.clickBead(phraseE);
    await expect
      .poll(async () => (await readPersistedState(page, id))?.selection)
      .toEqual({ s: phraseS, e: phraseE });
    const before = await readPersistedState(page, id);
    expect(before?.parts).toHaveLength(SCENARIO.sceneEndBeads.length);

    // reapontar as MESMAS contas retoca o intervalo e recai no mesmo estado da régua
    // (reabrir a seleção e refechá-la nas mesmas bordas) — som tocando na hora da queda.
    await app.clickBead(phraseS);
    await app.clickBead(phraseE);
    await expect(headBead).toBeVisible();
    const startHead = await headIndex();

    // ——— cai offline: aviso PT-BR + edição selada + playback continua ———
    await page.context().setOffline(true);
    await expect(page.getByText(/Sem conexão/)).toBeVisible();
    await expect(page.locator('.cds-connection-gate[data-offline="true"]')).toBeVisible();
    // o áudio é client-side: o playhead AVANÇA (a conta "head" progride) apesar da rede
    // caída — prova que o playback segue de fato, não só um atributo estático.
    await expect.poll(headIndex).toBeGreaterThan(startHead);

    // nenhuma escrita possível: apontar uma frase e acionar confirmar (forçando o
    // clique através da cobertura offline) não trava frase nenhuma…
    await app.clickBead(0);
    await app.clickBead(3);
    await page.getByRole('button', { name: '✓ Confirmar esta frase' }).click({ force: true });
    await expect(page.locator('.cds-phrases-chips li')).toHaveCount(0);
    // …e o estado persistido não mudou uma vírgula.
    expect(await readPersistedState(page, id)).toEqual(before);

    // ——— volta online: retoma sobre o MESMO estado, termina a frase, nada perdido ———
    await page.context().setOffline(false);
    await expect(page.getByText(/Sem conexão/)).toHaveCount(0);

    await app.cutPhrase(0, 3); // frase contida na 1ª cena → sem cruzar borda
    await expect
      .poll(async () => ((await readPersistedState(page, id))?.frases ?? []).length)
      .toBeGreaterThan(0);

    const after = await readPersistedState(page, id);
    // as cenas do pré-queda continuam idênticas: a costura não mexeu, nada sumiu.
    expect(after?.parts).toEqual(before?.parts);
  });

  test('expiração de auth no meio da Triage: re-login retoma no mesmo passo, decisões intactas', async ({
    page,
  }) => {
    const app = new ColarApp(page);
    await app.login();
    const id = await app.createSession();
    await app.confirmWholeStory();
    await app.cutScenes();

    // Classifica a 1ª cena (uma decisão de triage viva) antes de o token caducar.
    await page.getByRole('radio', { name: SCENARIO.triage[0].kind, exact: true }).click();
    await page.getByRole('radio', { name: SCENARIO.triage[0].confidence, exact: true }).click();
    await page.getByRole('button', { name: 'Confirmar', exact: true }).click();

    await expect
      .poll(async () => taggedScenes(await readPersistedState(page, id)))
      .toBeGreaterThan(0);
    await expect.poll(async () => (await readPersistedState(page, id))?.mode).toBe('triagem');
    const before = await readPersistedState(page, id);

    // ——— o token do servidor caduca dentro de /session/:id ———
    await expireAuth(page);
    await expect(page).toHaveURL(/\/login$/);
    // de volta ao login — asserção estável à abertura Shemá v2 (ENG-278 trocou o
    // heading para "Bem-vinda de volta."; o campo de usuário prova o formulário montado).
    await expect(page.locator('input[name="username"]')).toBeVisible();

    // ——— re-login → dashboard → retomar a mesma sessão (tudo in-SPA) ———
    await page.locator('input[name="username"]').fill('facilitadora');
    await page.locator('input[name="password"]').fill('senha');
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page.getByRole('heading', { name: 'Suas histórias' })).toBeVisible();
    await page.getByRole('button', { name: /Retomar/ }).click();
    await expect(page).toHaveURL(new RegExp(`/session/${id}$`));

    // volta EXATAMENTE à Triage, com todo o estado (incl. a classificação) intacto.
    await expect(page.getByText('Essa cena é sobre o quê?')).toBeVisible();
    // `before` foi polido em `triage`; o deep-equal prova o passo E as decisões intactos.
    expect(await readPersistedState(page, id)).toEqual(before);
  });

  test('trava consultiva: quem abre a sessão em uso vê "em uso por…" e modo revisão', async ({
    page,
  }) => {
    const app = new ColarApp(page);
    await app.login();
    const id = await app.createSession();

    // Contexto 1 (quem detém a sessão) edita à vontade: confirmar a história avança o fluxo.
    await app.confirmWholeStory();

    // Outra facilitadora (Ana) passa a deter a trava no MESMO backend (§7.3);
    // o reload re-hidrata e lê a trava alheia persistida.
    await seedForeignLock(page, id);
    await page.reload();

    // Contexto 2 (quem abre a sessão ocupada): recado da trava + revisão sem destravar.
    await expect(page.getByText(/Modo de revisão — sessão em uso por Ana\./)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Destravar para editar' })).toHaveCount(0);

    // Revisão de fato: mutar está travado — apontar o fim de uma cena e acionar a
    // ação dominante não trava cena nenhuma (nenhum colar de contas nasce), e o
    // estado persistido não muda (o holder segue com a edição protegida).
    const before = await readPersistedState(page, id);
    await app.clickBead(3);
    // Em revisão o botão fica visível-porém-inerte (o store barra a escrita, não a UI);
    // `force` clica sem depender desse invariante, para falhar rápido se ele mudar.
    await page.getByRole('button', { name: '✓ Confirmar esta cena' }).click({ force: true });
    await expect(page.locator('.cds-cut-chips li')).toHaveCount(0);
    expect(await readPersistedState(page, id)).toEqual(before);
  });
});
