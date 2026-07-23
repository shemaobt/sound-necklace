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
 * Marcador único da resposta DIGITADA — distinto o bastante para a spec provar que a
 * resposta foi de fato gravada no estado persistido (não um booleano auto-reportado).
 */
export const TYPED_ANSWER = 'observação-e2e-a1b2c3';

/**
 * Roteiro determinístico de um ciclo completo sobre o áudio fixture `jornada-do-boto`
 * (48000 amostras / 8000 Hz = 6 s; granularidade média 0.5 s → grade de 12 contas,
 * índices 0–11). Três cenas, duas classificadas + uma "nenhum se encaixa", e uma
 * frase que cruza a borda (delta 2 ≤ max(3, 25%) → costura desliza), espelhando o
 * caso golden `seam-small-move`.
 */
export const SCENARIO = {
  audioFilename: 'jornada-do-boto.wav',
  totalBeads: 12,
  /** cortes de cena em Escuta 2: cada clique fixa o FIM da cena (o começo já está costurado). */
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

/**
 * Um microfone sintético para o runner, que não tem hardware de áudio: lá o
 * `getUserMedia` morre com `NotFoundError: Requested device not found` (medido no
 * CI), e as flags `--use-fake-device-for-media-capture` do Chromium não resolvem —
 * passam num Mac com microfone de verdade atrás e falham no Linux headless.
 *
 * Trocamos SÓ a borda do sistema operacional: um oscilador vira um `MediaStream` de
 * verdade, então o `WebVoiceRecorder`, o `MediaRecorder`, o medidor de nível e o blob
 * gravado seguem todos reais. Sem isto, o e2e só conseguiria exercitar o dublê — e foi
 * um dublê convincente que deixou a entrevista muda por uma semana (ENG-298).
 */
async function microfoneSintetico(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    osc.frequency.value = 440;
    osc.start();
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      configurable: true,
      value: async () => {
        // o contexto nasce suspenso pela política de autoplay, e um oscilador parado
        // grava silêncio (110 bytes de cabeçalho, indistinguível do dublê); a captura
        // sempre vem depois de cliques reais, então aqui já é permitido retomá-lo
        await ctx.resume();
        // um destino NOVO por captura: o recorder encerra a gravação com
        // `stopTracks(stream)`, então um stream reaproveitado volta com as tracks
        // mortas e a 2ª resposta morre em `MediaRecorder.start()` (NotSupportedError).
        // A entrevista grava 21 respostas — reutilizar quebraria da segunda em diante.
        const destino = ctx.createMediaStreamDestination();
        osc.connect(destino);
        return destino.stream;
      },
    });
  });
}

export class ColarApp {
  constructor(readonly page: Page) {}

  // ——— entrada ———

  /** Login (§7.1): a auth fixture aceita `facilitadora`/`admin` com qualquer senha não vazia. */
  async login(username = 'facilitadora', password = 'senha'): Promise<void> {
    await microfoneSintetico(this.page);
    await this.page.goto('/login');
    await this.page.locator('input[name="username"]').fill(username);
    await this.page.locator('input[name="password"]').fill(password);
    await this.page.getByRole('button', { name: 'Entrar' }).click();
    await expect(this.page.getByRole('heading', { name: 'Suas histórias' })).toBeVisible();
  }

  /**
   * Cria a sessão pelo Setup (§8.1): áudio do bucket + granularidade média + consentimento.
   * Sem file-picker (só bucket). Devolve o id da sessão criada, lido da rota.
   */
  async createSession(audioFilename: string = SCENARIO.audioFilename): Promise<string> {
    await this.page.getByRole('button', { name: 'Comece uma nova história' }).click();
    await expect(this.page.getByRole('heading', { name: 'Nova sessão' })).toBeVisible();
    // bucket-only: nenhuma entrada de arquivo em lugar nenhum.
    await expect(this.page.locator('input[type="file"]')).toHaveCount(0);

    await this.page.getByText(audioFilename).click();
    await this.page.getByRole('radio', { name: 'Média', exact: true }).click();
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

  /**
   * Corta as três cenas (um clique = fim de cada cena) e segue. Cobrindo a
   * história inteira o app entra no momento de revisão ("Continuar →");
   * cobertura parcial mantém o "Confirmar as cenas →" do PRD.
   */
  async cutScenes(endBeads: readonly number[] = SCENARIO.sceneEndBeads): Promise<void> {
    for (const end of endBeads) {
      await this.clickBead(end);
      await this.page.getByRole('button', { name: '✓ Confirmar esta cena' }).click();
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
  }

  // ——— Segmentação ———

  /** Seleciona uma frase (clique no começo, clique no fim) e confirma. */
  // um-toque como as cenas (primeFrase): o início já é a fronteira automática;
  // `s` documenta o início esperado (= fronteira), só o fim `e` é tocado.
  async cutPhrase(s: number, e: number): Promise<void> {
    void s;
    await this.clickBead(e);
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

  async finishPhrases(): Promise<void> {
    const continuar = this.page.getByRole('button', { name: 'Continuar →' });
    if (await continuar.count()) await continuar.click();
    else await this.page.getByRole('button', { name: 'Já segmentei todas as cenas →' }).click();
  }

  // ——— Conversation ———

  /** Grava uma resposta por voz (gravador fixture): gravar → parar. */
  async recordVoiceAnswer(): Promise<void> {
    await this.page.getByRole('button', { name: 'gravar a resposta' }).click();
    await this.page.getByRole('button', { name: 'Parar' }).click();
    await expect(this.page.getByRole('button', { name: 'ouvir', exact: true })).toBeVisible();
  }

  /** A digitação vive no RELATÓRIO (a facilitadora escreve depois — §8.7). */
  async typeAnswerInReport(index: number, text: string): Promise<void> {
    await this.page.getByRole('textbox', { name: 'resposta' }).nth(index).fill(text);
  }

  /**
   * Confirma o inglês sugerido no cartão `index` (ENG-327). Espera o rascunho
   * chegar (o job é assíncrono) e devolve o texto que virou a resposta.
   */
  async confirmDraftInReport(index: number): Promise<string> {
    const card = this.page.locator('.cds-report-card').nth(index);
    const confirm = card.getByRole('button', { name: /confirmar o inglês/i });
    await confirm.waitFor({ state: 'visible', timeout: 15000 });
    const en = await card.locator('.cds-report-draft-en').inputValue();
    await confirm.click();
    return en;
  }

  /** Anda até a prévia do relatório clicando "Próxima pergunta" até a conversa acabar. */
  async walkToReport(): Promise<void> {
    for (let step = 0; step < 60; step++) {
      if (await this.page.locator('.cds-report').count()) return;
      await this.page.getByRole('button', { name: 'Próxima pergunta' }).click();
    }
    throw new Error('relatório não apareceu após 60 passos');
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
    // voz durante a conversa (a entrevista é só-voz)…
    for (let step = 0; step < 60 && voiced.size < 3; step++) {
      const level = await this.currentQuestionLevel();
      if (level !== null && !voiced.has(level)) {
        await this.recordVoiceAnswer();
        voiced.add(level);
      }
      await this.page.getByRole('button', { name: 'Próxima pergunta' }).click();
    }
    // …texto DEPOIS, no relatório (§8.7 "a facilitadora pode escrever depois")
    await this.walkToReport();
    await this.typeAnswerInReport(0, TYPED_ANSWER);
    // e o inglês das respostas gravadas é CONFIRMADO (ENG-327): sem isso elas não
    // viram texto nenhum, e a exportação fica travada — como no app de verdade.
    await this.confirmAllDrafts();
    return { voicedLevels: [...voiced].sort(), typed: true };
  }

  /**
   * Confirma o inglês sugerido em TODOS os cartões que ainda mostram um rascunho
   * (ENG-327). Percorre por posição porque confirmar um cartão remove o próprio
   * botão, e a lista encolhe a cada clique.
   */
  async confirmAllDrafts(): Promise<number> {
    const buttons = this.page.getByRole('button', { name: /confirmar o inglês/i });
    // o job é assíncrono: sem esperar o PRIMEIRO rascunho, a contagem seria 0 e o
    // laço sairia sem confirmar nada
    try {
      await buttons.first().waitFor({ state: 'visible', timeout: 15000 });
    } catch {
      return 0; // nenhuma resposta gravada nesta sessão
    }
    let confirmed = 0;
    for (let guard = 0; guard < 60; guard++) {
      if ((await buttons.count()) === 0) break;
      await buttons.first().click();
      confirmed++;
    }
    return confirmed;
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
