import { expect, type Page } from '@playwright/test';

/**
 * Camada de suporte E2E do Colar de Sons (ENG-252) — dirige o app REAL em modo
 * fixture pela UI, estação por estação. Importada em modo leitura pelas demais specs
 * do E6 (ENG-253..258): a `ColarApp` é o page object do fluxo inteiro, `SCENARIO`
 * é o roteiro de decisões (espelha os passos de um caso golden) e `readPersistedState`
 * lê o estado que o autosave grava no localStorage (§7.3) para a asserção de zero-perda.
 *
 * Todas as strings visíveis são cópia PT-BR verbatim das estações — se uma mudar, a
 * spec falha aqui, no ponto único, em vez de espalhar seletores frágeis pelas specs.
 */

/** Chave do FixtureSessionBackend (adapters/sessions/fixture.ts). */
export const STORAGE_KEY = 'colar-de-sons:sessions:v1';

/**
 * Roteiro determinístico de um ciclo completo sobre o áudio fixture `conto-do-boto`
 * (24000 amostras / 8000 Hz = 3 s; granularidade média 0.25 s → grade de 12 contas,
 * índices 0–11). Três cenas, duas classificadas + uma "nenhum se encaixa", e uma
 * frase que cruza a borda (delta 2 ≤ max(3, 25%) → costura desliza), espelhando o
 * caso golden `seam-small-move`.
 */
export const SCENARIO = {
  audioFilename: 'conto-do-boto.wav',
  totalBeads: 12,
  /** cortes de cena em Escuta 2: cada clique fixa o FIM da cena (o começo já está costurado). */
  sceneEndBeads: [3, 7, 11] as const,
  /** classificação de cada cena travada, na ordem em que a Triagem as foca. */
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

/** Status guardado no resumo da sessão (concluida após o Export). */
export async function readPersistedStatus(page: Page, id: string): Promise<string | null> {
  const raw = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);
  if (!raw) return null;
  const parsed = JSON.parse(raw) as {
    sessions: [string, { summary?: { status?: string } }][];
  };
  const entry = parsed.sessions.find(([sid]) => sid === id);
  return entry?.[1]?.summary?.status ?? null;
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
    await expect(this.page.getByRole('heading', { name: 'Minhas sessões' })).toBeVisible();
  }

  /**
   * Cria a sessão pelo Setup (§8.1): áudio do bucket + granularidade média + consentimento.
   * Sem file-picker (só bucket). Devolve o id da sessão criada, lido da rota.
   */
  async createSession(audioFilename = SCENARIO.audioFilename): Promise<string> {
    await this.page.getByRole('button', { name: 'Nova sessão' }).click();
    await expect(this.page.getByRole('heading', { name: 'Nova sessão' })).toBeVisible();
    // bucket-only: nenhuma entrada de arquivo em lugar nenhum.
    await expect(this.page.locator('input[type="file"]')).toHaveCount(0);

    await this.page.getByText(audioFilename).click();
    await this.page.getByRole('radio', { name: 'Média' }).click();
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
    await expect(this.page.getByText('já está costurado')).toBeVisible();
  }

  /** Corta as três cenas (um clique = fim de cada cena) e confirma o conjunto. */
  async cutScenes(endBeads: readonly number[] = SCENARIO.sceneEndBeads): Promise<void> {
    for (const end of endBeads) {
      await this.clickBead(end);
      await this.page.getByRole('button', { name: '✓ Confirmar esta cena' }).click();
    }
    await this.page.getByRole('button', { name: 'Confirmar as cenas →' }).click();
  }

  // ——— Triagem ———

  async triage(
    steps: readonly (typeof SCENARIO.triage)[number][] = SCENARIO.triage,
  ): Promise<void> {
    for (const step of steps) {
      if ('noneFit' in step && step.noneFit) {
        await this.page.getByRole('radio', { name: 'Nenhum se encaixa' }).click();
      } else if ('kind' in step) {
        await this.page.getByRole('radio', { name: step.kind }).click();
        await this.page.getByRole('radio', { name: step.confidence }).click();
        await this.page.getByRole('button', { name: 'Confirmar' }).click();
      }
    }
    await this.page.getByRole('button', { name: 'Já classifiquei todas as cenas →' }).click();
  }

  // ——— Segmentação ———

  /** Seleciona uma frase (clique no começo, clique no fim) e confirma. */
  async cutPhrase(s: number, e: number): Promise<void> {
    await this.clickBead(s);
    await this.clickBead(e);
    await this.page.getByRole('button', { name: '✓ Confirmar esta frase' }).click();
  }

  /** Move a costura na oferta simples do seam-modal ("a cena cresce, a vizinha encolhe"). */
  async moveSeam(): Promise<void> {
    await this.page.getByRole('button', { name: 'Mover a borda até aqui' }).click();
  }

  async nextScene(): Promise<void> {
    await this.page.getByRole('button', { name: 'Pronto com esta cena →' }).click();
  }

  async finishSegmentacao(): Promise<void> {
    await this.page.getByRole('button', { name: 'Já segmentei todas as cenas →' }).click();
  }

  // ——— Mapeamento ———

  /** Grava uma resposta por voz (gravador fixture): gravar → parar. */
  async recordVoiceAnswer(): Promise<void> {
    await this.page.getByRole('button', { name: 'gravar a resposta' }).click();
    await this.page.getByRole('button', { name: 'Parar' }).click();
    await expect(this.page.getByRole('button', { name: 'ouvir', exact: true })).toBeVisible();
  }

  async typeAnswer(text: string): Promise<void> {
    await this.page.getByRole('textbox', { name: 'observação da facilitadora' }).fill(text);
  }

  private async currentQuestionLevel(): Promise<1 | 2 | 3 | null> {
    if (await this.page.getByRole('button', { name: '▶ ouvir a história' }).count()) return 1;
    if (await this.page.getByRole('button', { name: '▶ ouvir a cena' }).count()) return 2;
    if (await this.page.getByRole('button', { name: '▶ ouvir a frase' }).count()) return 3;
    return null;
  }

  /**
   * Percorre a conversa respondendo ≥1 pergunta por nível por VOZ e ≥1 DIGITADA
   * (§8.7). Detecta o nível pelo botão ▶ do trecho (história/cena/frase), então grava
   * a primeira pergunta de cada nível e digita uma vez, sem depender das contagens
   * exatas da sequência. Devolve o resumo do que respondeu para a asserção.
   */
  async answerConversation(): Promise<{ voicedLevels: number[]; typed: boolean }> {
    const voiced = new Set<number>();
    let typed = false;
    for (let step = 0; step < 60; step++) {
      const level = await this.currentQuestionLevel();
      if (level !== null && !voiced.has(level)) {
        await this.recordVoiceAnswer();
        voiced.add(level);
      } else if (!typed) {
        await this.typeAnswer('uma observação da facilitadora');
        typed = true;
      }
      if (voiced.size === 3 && typed) break;
      await this.page.getByRole('button', { name: 'Próxima pergunta' }).click();
    }
    return { voicedLevels: [...voiced].sort(), typed };
  }

  // ——— fio de contas / Export ———

  /** Clica um passo do fio de contas pelo rótulo (só navega se alcançável). */
  async gotoStep(label: string): Promise<void> {
    await this.page.locator('.cds-stepper li', { hasText: label }).click({ force: true });
  }

  async completeSession(): Promise<void> {
    await this.gotoStep('Guardar');
    const complete = this.page.getByRole('button', { name: 'Concluir e guardar os documentos' });
    await expect(complete).toBeEnabled();
    await complete.click();
    await expect(this.page.getByRole('button', { name: 'Destravar para editar' })).toBeVisible();
  }
}
