import { expect, type Page } from '@playwright/test';

/**
 * Camada de suporte E2E do Colar de Sons (ENG-252) — dirige o app REAL em modo
 * fixture pela UI, estação por estação. Importada em modo leitura pelas demais specs
 * do E6 (ENG-253..258): a `ColarApp` é o page object do fluxo inteiro — Ouvir,
 * Cortar, Triagem, Frases, e nada depois (ENG-689) —, `SCENARIO` é o roteiro de
 * decisões e `readPersistedState` lê o estado que o autosave grava no localStorage
 * (§7.3) para a asserção de zero-perda.
 *
 * Todas as strings visíveis são cópia PT-BR verbatim das estações — se uma mudar, a
 * spec falha aqui, no ponto único, em vez de espalhar seletores frágeis pelas specs.
 */

/** Chave do FixtureSessionBackend (adapters/sessions/fixture.ts). */
export const STORAGE_KEY = 'colar-de-sons:sessions:v1';

/**
 * Roteiro determinístico de um ciclo completo sobre o áudio fixture `jornada-do-boto`
 * (48000 amostras / 8000 Hz = 6 s; granularidade média 0.5 s → grade de 12 contas,
 * índices 0–11). Três cenas, duas classificadas + uma "nenhum se encaixa", e uma
 * frase que cruza a borda (delta 2 ≤ max(3, 25%) → costura desliza), herdado do caso
 * `seam-small-move` do harness dourado (removido na ENG-691).
 */
export const SCENARIO = {
  audioFilename: 'jornada-do-boto.wav',
  totalBeads: 12,
  /** cortes de cena em Escuta 2: cada cena leva DOIS toques, começo e fim (2026-08-07).
   *  Os começos saem daqui por contiguidade: 0, e depois fim anterior + 1. */
  sceneEndBeads: [3, 7, 11] as const,
  /** classificação de cada cena travada, na ordem em que a Triage as foca. */
  triage: [
    { kind: 'Apelo', confidence: 'Certeza' },
    { kind: 'Chegada', confidence: 'Quase' },
    { noneFit: true },
  ] as const,
  /** frase que cruza a borda da 1ª cena (fim 5 > fim de cena 3) → seam-move. */
  crossingPhrase: { s: 0, e: 5 } as const,
  /** frase contida na 2ª cena (após a costura deslizar, a cena vira 6–7). */
  containedPhrase: { s: 6, e: 7 } as const,
} as const;

interface PersistedSessionState {
  mode: string;
  parts: unknown[];
  frases: unknown[];
  [k: string]: unknown;
}

/** Lê o DTO de estado que o autosave persistiu para a sessão `id` (ou null). */
export async function readPersistedState(
  page: Page,
  id: string,
): Promise<PersistedSessionState | null> {
  const raw = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);
  if (!raw) return null;
  const parsed = JSON.parse(raw) as { sessions: [string, { state?: PersistedSessionState }][] };
  const entry = parsed.sessions.find(([sid]) => sid === id);
  return entry?.[1]?.state ?? null;
}

export class ColarApp {
  constructor(readonly page: Page) {}

  // ——— entrada ———

  /** Login (§7.1): a auth fixture aceita `facilitadora`/`admin` com qualquer senha não vazia. */
  async login(username = 'facilitadora', password = 'senha'): Promise<void> {
    await this.page.goto('/login');
    await this.page.locator('input[name="username"]').fill(username);
    await this.page.locator('input[name="password"]').fill(password);
    await this.page.getByRole('button', { name: 'Entrar' }).click();
    await expect(this.page.getByRole('heading', { name: 'Suas histórias' })).toBeVisible();
  }

  /**
   * Cria a sessão pelo Setup (§8.1): áudio do bucket + consentimento. A granularidade
   * NÃO se escolhe aqui desde a ENG-352 — vem do projeto (a fixture abre em Média, que
   * é o que dá o beadSec 0.5 do cenário). Sem file-picker (só bucket). Devolve o id da
   * sessão criada, lido da rota.
   */
  async createSession(audioFilename: string = SCENARIO.audioFilename): Promise<string> {
    await this.page.getByRole('button', { name: 'Comece uma nova história' }).click();
    await expect(this.page.getByRole('heading', { name: 'Nova sessão' })).toBeVisible();
    // bucket-only: nenhuma entrada de arquivo em lugar nenhum.
    await expect(this.page.locator('input[type="file"]')).toHaveCount(0);

    await this.page.getByText(audioFilename).click();
    await this.page.getByRole('checkbox').check();
    await this.page.getByRole('button', { name: 'Criar a sessão →' }).click();

    await this.page.waitForURL(/\/session\/[^/]+$/);
    const id = /\/session\/([^/]+)$/.exec(new URL(this.page.url()).pathname)?.[1];
    if (!id) throw new Error(`sessão não criada; URL=${this.page.url()}`);
    return id;
  }

  // ——— necklace ———

  /** Clica a conta de índice `idx` (pointerdown delegado → geometria → índice). */
  async clickBead(idx: number): Promise<void> {
    await this.page.locator(`.cds-necklace-bead[data-idx="${idx}"]`).click({ force: true });
  }

  // ——— Escuta 1 / 2 ———

  async confirmWholeStory(): Promise<void> {
    await this.page.getByRole('button', { name: 'Já ouvi a história completa' }).click();
    // aguarda a Escuta 2 (corte de cenas) assumir — o colar da Escuta 1 é transporte.
    // Âncora no TÍTULO da estação, não na instrução: a instrução muda com o tempo do
    // corte (começo/fim) e já derrubou 14 e2e de uma vez quando o texto mudou.
    await expect(
      this.page.getByRole('heading', { name: 'Corte a história em cenas' }),
    ).toBeVisible();
  }

  /**
   * Corta as cenas e segue. Desde 2026-08-07 cada cena leva DOIS toques — o começo
   * (a história corre dali) e o fim — porque o slot não vem mais pré-ancorado. Os
   * começos são derivados por contiguidade para o cenário seguir ladrilhando a
   * história inteira, sem vão entre cenas.
   * Cobrindo tudo, o app entra no momento de revisão ("Continuar →"); cobertura
   * parcial mantém o "Confirmar as cenas →" do PRD.
   */
  async cutScenes(endBeads: readonly number[] = SCENARIO.sceneEndBeads): Promise<void> {
    let start = 0;
    for (const end of endBeads) {
      await this.clickBead(start); // marca o começo
      if (end !== start) await this.clickBead(end); // e o fim
      await this.page.getByRole('button', { name: '✓ Confirmar esta cena' }).click();
      start = end + 1;
    }
    const continuar = this.page.getByRole('button', { name: 'Continuar →' });
    if (await continuar.count()) await continuar.click();
    else await this.page.getByRole('button', { name: 'Confirmar as cenas →' }).click();
  }

  // ——— Triage ———

  async triage(
    steps: readonly (typeof SCENARIO.triage)[number][] = SCENARIO.triage,
  ): Promise<void> {
    for (const step of steps) {
      if ('noneFit' in step && step.noneFit) {
        await this.page.getByRole('radio', { name: 'Nenhum se encaixa', exact: true }).click();
      } else if ('kind' in step) {
        await this.page.getByRole('radio', { name: step.kind, exact: true }).click();
        await this.page.getByRole('radio', { name: step.confidence, exact: true }).click();
        await this.page.getByRole('button', { name: 'Confirmar', exact: true }).click();
      }
    }
    // todas classificadas → momento de revisão
    await this.page.getByRole('button', { name: 'Continuar →' }).click();
    await this.passBlockDone('Seguir para as frases');
  }

  /**
   * O fim de bloco (ENG-651) sobe no limite da Triagem, por cima da estação já
   * chegada, e o primário continua para as Frases. Fechar a Segmentação não sobe
   * nada (ENG-725): a Rever é a estação seguinte — ver `finishPhrases` e
   * `concludeStory`. O `click` do Playwright já espera o botão aparecer.
   */
  async passBlockDone(primary: 'Seguir para as frases'): Promise<void> {
    await this.page.getByRole('button', { name: primary }).click();
  }

  // ——— Segmentação ———

  /** Seleciona uma frase (clique no começo, clique no fim) e confirma — dois toques,
   *  como as cenas, desde que a pré-ancoragem saiu (2026-08-07). */
  async cutPhrase(s: number, e: number): Promise<void> {
    await this.clickBead(s);
    if (e !== s) await this.clickBead(e);
    await this.page.getByRole('button', { name: '✓ Confirmar esta frase' }).click();
  }

  /** Move a costura na oferta simples do seam-modal ("a cena cresce, a vizinha encolhe"). */
  async moveSeam(): Promise<void> {
    await this.page.getByRole('button', { name: 'Mover a borda até aqui' }).click();
  }

  /** Avança de cena: revisão ("Continuar →") quando as frases cobrem a cena; senão o botão do PRD. */
  async nextScene(): Promise<void> {
    const continuar = this.page.getByRole('button', { name: 'Continuar →' });
    if (await continuar.count()) await continuar.click();
    else await this.page.getByRole('button', { name: 'Pronto com esta cena →' }).click();
  }

  /**
   * Fecha a última cena produtiva e chega à Rever (ENG-725), a quinta estação: o
   * panorama da história inteira — uma conta por conta de áudio, uma pérola por
   * cena. Nada sobe por cima dela; quem fecha a história é `concludeStory`.
   */
  async finishPhrases(): Promise<void> {
    const continuar = this.page.getByRole('button', { name: 'Continuar →' });
    if (await continuar.count()) await continuar.click();
    else await this.page.getByRole('button', { name: 'Já segmentei todas as cenas →' }).click();
    await expect(
      this.page.getByRole('heading', { name: 'Olhem a história inteira' }),
    ).toBeVisible();
    await expect(this.page.locator('.cds-necklace-bead')).toHaveCount(SCENARIO.totalBeads);
    await expect(this.page.locator('.cds-scene-pearl')).toHaveCount(SCENARIO.sceneEndBeads.length);
  }

  /**
   * Conclui a história na Rever. O cenário tem uma cena fora dos tipos, então o
   * primeiro toque só avisa e o segundo conclui (com a história limpa um toque
   * bastaria). Termina com a tela oliva de conclusão à vista.
   */
  async concludeStory(): Promise<void> {
    const conclude = this.page.getByRole('button', { name: 'Concluir a história' });
    await conclude.click();
    await expect(this.page.getByText('Toque de novo para concluir.')).toBeVisible();
    await conclude.click();
    await expect(
      this.page.getByRole('heading', { name: 'A história está completa.' }),
    ).toBeVisible();
  }

  /**
   * A barra do topo DESLIZA até o valor novo (350 ms, story-progress-bar.css) e a
   * tela de conclusão aparece num fade (250 ms, block-done.css): o navegador do e2e
   * NÃO honra a emulação de `prefers-reduced-motion` (`matchMedia` devolve falso),
   * então uma captura tirada no instante seguinte pega os dois a meio caminho. As
   * capturas de referência esperam os dois assentarem.
   */
  async waitForFullBar(): Promise<void> {
    await expect
      .poll(() =>
        this.page.evaluate(() => {
          const fill = document.querySelector<HTMLElement>('.cds-story-progress-fill');
          if (!fill) return false;
          return getComputedStyle(fill).width === getComputedStyle(fill.parentElement!).width;
        }),
      )
      .toBe(true);
  }

  async waitForConcludedScreenToSettle(): Promise<void> {
    await expect(this.page.locator('.cds-block-done')).toHaveCSS('opacity', '1');
  }

  /** Da tela de conclusão de volta ao painel — a saída primária. */
  async leaveAfterPhrases(): Promise<void> {
    await this.page.getByRole('button', { name: 'Voltar às histórias' }).click();
    await expect(this.page.getByRole('heading', { name: 'Suas histórias' })).toBeVisible();
  }
}
