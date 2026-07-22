import { expect, test, type Page } from '@playwright/test';

import {
  L1_Q,
  L2_Q,
  L3_Q,
  type QuestionSlot,
  type SessionState,
  questionSequence,
  voiceAnswerPath,
} from '../../domain';
import { ColarApp, STORAGE_KEY, TYPED_ANSWER } from './support';

/**
 * Acceptance 5 (plano-de-acao §3.5): a conversa faz 100% das perguntas do roteiro
 * para a estrutura da sessão, na ordem e com o texto exatos, e cada resposta — voz
 * ou digitada — aterrissa no armazenamento sob a chave certa E no relatório.
 *
 * Estrutura montada (§8.7 / §10.4): 3 cenas travadas (2 classificadas + 1 "nenhum
 * se encaixa") e 3 frases nas 2 cenas produtivas → 11 (N1) + 5×3 (N2, none_fit
 * incluída) + 5×3 (N3) = 41 perguntas. A none_fit entra no N2 mas NÃO gera N3.
 *
 * Mix determinístico por posição i (i % 4): só-voz, só-texto, ambas (o texto vence
 * a célula), nenhuma. Ao fim prova, contra o estado persistido e o `.md` exportado:
 * a sequência apresentada == a que o domínio computa; cada texto sob a chave exata;
 * cada caminho de voz em `voice`; cada célula do `.md` correta (voz / texto / "sem
 * resposta"). O app real roda em modo fixture; o Playwright dirige a UI.
 */

/** Marcador único da resposta digitada da pergunta na posição i. */
const typedText = (i: number): string => `${TYPED_ANSWER}-q${i}`;

/** Plano de resposta determinístico por posição na sequência. */
function plan(i: number): { voice: boolean; typed: boolean } {
  const m = i % 4;
  return { voice: m === 0 || m === 2, typed: m === 1 || m === 2 };
}

/** Enunciados esperados: 11 de N1, 5 por cena travada (3), 5 por frase (3). */
const EXPECTED_WORDINGS: string[] = [
  ...L1_Q.map((q) => q.q),
  ...Array.from({ length: 3 }, () => L2_Q.map((q) => q.q)).flat(),
  ...Array.from({ length: 3 }, () => L3_Q.map((q) => q.q)).flat(),
];

/** Resposta digitada persistida para um slot (string vazia quando não há). */
function readTyped(mapping: SessionState['mapping'], slot: QuestionSlot): string {
  if (!mapping) return '';
  if (slot.level === 1) return mapping.level1[slot.k] ?? '';
  if (slot.level === 2) return mapping.level2[slot.partId]?.[slot.k] ?? '';
  return mapping.level3[slot.propId]?.[slot.k] ?? '';
}

/**
 * Lê o DTO de estado persistido (o `.state` que complete/autosave grava). O DTO é
 * um superconjunto de `SessionState` (parts/frases/mapping que o domínio lê) mais o
 * `voice` do meta (§7.3) — tipado aqui como a interseção que a spec usa.
 */
type PersistedState = SessionState & { voice: string[] };
async function readState(page: Page, id: string): Promise<PersistedState> {
  const raw = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);
  const parsed = JSON.parse(raw!) as { sessions: [string, { state?: PersistedState }][] };
  const state = parsed.sessions.find(([sid]) => sid === id)?.[1]?.state;
  if (!state) throw new Error(`sem estado persistido para ${id}`);
  return state;
}

/** Lê os bytes do `.md` guardado (o artefato = a exportação, §10.5). */
async function readReportMd(page: Page, id: string): Promise<string> {
  const raw = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);
  const parsed = JSON.parse(raw!) as {
    sessions: [string, { artifacts?: { report?: string } }][];
  };
  const md = parsed.sessions.find(([sid]) => sid === id)?.[1]?.artifacts?.report;
  if (!md) throw new Error(`sem relatório guardado para ${id}`);
  return md;
}

test('a conversa faz todas as perguntas e chaveia cada resposta', async ({ page }) => {
  const app = new ColarApp(page);

  // ——— entrada → cenas → triage (2 classificadas + 1 none_fit) ———
  await app.login();
  const sessionId = await app.createSession();
  await app.confirmWholeStory();
  await app.cutScenes(); // fins [3,7,11] → cenas 0–3, 4–7, 8–11
  await app.triage(); // Apelo (produtiva), Chegada (produtiva), Nenhum se encaixa

  // ——— segmentação: 3 frases nas 2 cenas produtivas (2 na 1ª, 1 na 2ª) ———
  await app.cutPhrase(0, 1);
  await app.cutPhrase(2, 3);
  await app.nextScene(); // "Pronto com esta cena →"
  await app.cutPhrase(4, 5);
  await app.finishPhrases(); // "Já segmentei todas as cenas →" → conversation

  // ——— a conversa inteira: 41 perguntas, enunciado a enunciado ———
  const questionText = page.locator('.cds-question-card-text');
  const next = page.getByRole('button', { name: 'Próxima pergunta' });
  for (let i = 0; i < EXPECTED_WORDINGS.length; i++) {
    // espera a tela assentar E prova a ordem/enunciado exatos da pergunta i
    await expect(questionText).toHaveText(EXPECTED_WORDINGS[i]!);
    const { voice } = plan(i);
    if (voice) await app.recordVoiceAnswer(); // a ENTREVISTA é só-voz
    await next.click(); // a última navega para a prévia do relatório
  }

  // a prévia do relatório abre com a estrutura certa: um cabeçalho colorido POR BLOCO
  // (a história · cada cena · cada frase), no lugar das seções antigas
  await expect(page.locator('.cds-report-card')).toHaveCount(EXPECTED_WORDINGS.length);
  await expect(page.locator('.cds-report-blockhead-eyebrow')).toHaveText([
    'A história inteira',
    'Cena 1 · Apelo',
    'Cena 2 · Chegada',
    'Cena 3',
    'Cena 1 · Frase 1',
    'Cena 1 · Frase 2',
    'Cena 2 · Frase 1',
  ]);

  // a digitação acontece AQUI, no relatório editável (§8.7 "a facilitadora pode
  // escrever depois — nunca por você"): a entrevista não tem campo de texto.
  for (let i = 0; i < EXPECTED_WORDINGS.length; i++) {
    if (plan(i).typed) await app.typeAnswerInReport(i, typedText(i));
  }

  // ——— conclui e guarda os documentos ———
  await app.completeSession();

  // ——— asserções contra o estado persistido + o `.md` exportado ———
  const state = await readState(page, sessionId);
  const md = await readReportMd(page, sessionId);
  const seq = questionSequence(state);

  // a sequência que o domínio computa == a apresentada (que já batia com o esperado)
  expect(seq).toHaveLength(41);
  expect(seq.map((s) => s.question.q)).toEqual(EXPECTED_WORDINGS);
  expect(seq.filter((s) => s.level === 1)).toHaveLength(11);
  expect(seq.filter((s) => s.level === 2)).toHaveLength(15);
  expect(seq.filter((s) => s.level === 3)).toHaveLength(15);

  // none_fit entra no N2 (3 cenas) mas NÃO gera N3 (só frases de cenas produtivas)
  const noneFit = state.parts.find((p) => p.tag_state === 'none_fit');
  expect(noneFit).toBeDefined();
  const l2PartIds = new Set(seq.flatMap((s) => (s.level === 2 ? [s.partId] : [])));
  expect(l2PartIds.size).toBe(3);
  expect(l2PartIds.has(noneFit!.part_id)).toBe(true);
  const l3PropIds = [...new Set(seq.flatMap((s) => (s.level === 3 ? [s.propId] : [])))];
  expect(l3PropIds).toHaveLength(3);
  const productiveIds = new Set(
    state.parts.filter((p) => p.tag_state === 'tagged').map((p) => p.part_id),
  );
  for (const pid of l3PropIds) {
    const fr = state.frases.find((f) => f.prop_id === pid);
    expect(productiveIds.has(fr!.part_link!)).toBe(true);
  }
  expect(md).toContain('[none_fit]'); // a none_fit aparece no N2 do `.md`

  // cada resposta sob a chave certa (armazenamento) e na célula certa (`.md`)
  const voicePaths = new Set(state.voice);
  let noneCount = 0;
  for (let i = 0; i < seq.length; i++) {
    const slot = seq[i]!;
    const { voice, typed } = plan(i);
    const path = voiceAnswerPath(slot);
    const storedTyped = readTyped(state.mapping, slot);

    if (typed) {
      expect(storedTyped).toBe(typedText(i)); // texto na chave level{1,2,3} exata
      expect(md).toContain(typedText(i)); // e refletido na célula
    } else {
      expect(storedTyped).toBe(''); // só-voz/nenhuma não deixam texto
    }

    if (voice) {
      expect(voicePaths.has(path)).toBe(true); // caminho canônico em `voice`
    } else {
      expect(voicePaths.has(path)).toBe(false);
    }

    // célula do `.md`: texto vence a voz; só-voz mostra o caminho; nenhuma → "sem resposta"
    if (voice && !typed) expect(md).toContain(path);
    if (voice && typed) expect(md).not.toContain(path); // texto vence → caminho ausente
    if (!voice && !typed) noneCount++;
  }

  // toda pergunta sem resposta rende exatamente uma célula "(sem resposta)"
  expect(md.match(/_\(sem resposta\)_/g) ?? []).toHaveLength(noneCount);
  expect(noneCount).toBe(10);

  // sanidade do mix: 21 caminhos de voz gravados (só-voz 11 + ambas 10)
  expect(voicePaths.size).toBe(21);
});
