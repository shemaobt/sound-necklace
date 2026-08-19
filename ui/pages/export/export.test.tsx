import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CreateSessionInput, FixtureSessionStore } from '../../../adapters/sessions';
import {
  type ArtifactTriple,
  buildManifesto,
  buildMapReport,
  buildRetorno,
  type SessionMeta,
  serializeArtifact,
  toSessionDto,
} from '../../../contracts';
import {
  buildBeads,
  createSession,
  ensureMapping,
  type Frase,
  L1_Q,
  type ScenePart,
  setAnswer,
  type SessionState,
  type Span,
  voiceAnswerPath,
} from '../../../domain';
import { splitByGuard } from '../../atoms/testing/css';
import { freezeClock, markActivity, readClock, sessionStore, startClock } from '../../state';
import exportCss from './export.css?raw';
import Export from './index';

/**
 * A estação Export/Completion (PRD v2 §8.8): o colar inteiro sob "A história está
 * inteira no colar.", os três document cards explicados, a conclusão que guarda o
 * trio de artefatos BYTE-IDÊNTICO no SessionStore e vira a sessão para concluída,
 * os downloads que reusam os bytes guardados, e o modo de revisão ("Destravar para
 * editar" → reopen). Os testes afirmam a custódia de artefatos e os gates pelo
 * comportamento das portas (contracts builders + adapter SessionStore).
 */

const DURATION = 2.5;
const BEAD_SEC = 0.25; // 10 contas (0…9)

const META: SessionMeta = {
  granularityLevel: 'medium',
  bucketAudioId: 'aud-1',
  voice: [],
  voiceVersion: {},
  pipelineConsent: true,
};

function lockedTagged(part_id: string, span: Span): ScenePart {
  return {
    part_id,
    span,
    locked: true,
    scene_kind: 'APPEAL_SCENE',
    scene_kind_confidence: 'high',
    tag_state: 'tagged',
  };
}

function frase(over: Partial<Frase>): Frase {
  return {
    prop_id: 'P1',
    statement: '',
    qa: [],
    span: null,
    part_link: null,
    locked: false,
    ...over,
  };
}

/** Sessão pronta para exportar: história confirmada, cenas travadas+classificadas. */
function exportable(over: Partial<SessionState> = {}): SessionState {
  const beads = buildBeads(DURATION, BEAD_SEC);
  const base = createSession({
    durationSec: DURATION,
    beadSec: BEAD_SEC,
    beads,
    manifestId: 'fnv1a32:00000000',
    audioFilename: 'historia.wav',
    slug: 'historia',
  });
  return {
    ...base,
    whole: { ...base.whole, confirmed: true },
    partsConfirmed: true,
    mode: 'mapeamento',
    parts: [lockedTagged('PT1', { s: 0, e: 4 }), lockedTagged('PT2', { s: 5, e: 9 })],
    frases: [frase({ prop_id: 'P1', part_link: 'PT1', span: { s: 0, e: 2 }, locked: true })],
    current: { layer: 'frases', index: -1 },
    activeSceneId: 'PT1',
    ...over,
  };
}

function tripleOf(state: SessionState): ArtifactTriple {
  return {
    manifest: serializeArtifact(buildManifesto(state)),
    anchoring: serializeArtifact(buildRetorno(state)),
    report: buildMapReport(state),
  };
}

function createInput(state: SessionState): CreateSessionInput {
  return {
    projectId: 'proj-1',
    storyName: 'História',
    storySlug: state.slug,
    audioId: META.bucketAudioId,
    granularityLevel: META.granularityLevel,
    beadSec: state.beadSec,
    manifestId: state.manifestId,
    pipelineConsent: META.pipelineConsent,
  };
}

async function seedInProgress(store: FixtureSessionStore, state: SessionState): Promise<string> {
  const summary = await store.create(createInput(state));
  return summary.id;
}

async function seedCompleted(store: FixtureSessionStore, state: SessionState): Promise<string> {
  const id = await seedInProgress(store, state);
  await store.complete(id, toSessionDto(state, META), tripleOf(state));
  return id;
}

function load(state: SessionState): void {
  sessionStore.getState().load(state);
}

/** Botão de download do card cujo nome de arquivo é `filename` (organism verbatim). */
function cardButton(filename: string): HTMLElement {
  const card = screen.getByText(filename).closest('.cds-document-card');
  if (!card) throw new Error(`card não encontrado: ${filename}`);
  return within(card as HTMLElement).getByRole('button');
}

beforeEach(() => {
  localStorage.clear();
  sessionStore.setState({ session: null, review: false, lock: null, online: true });
});
afterEach(() => {
  sessionStore.setState({ session: null, review: false, lock: null, online: true });
});

describe('Export — guardar mostra o estado no próprio botão (ENG-324)', () => {
  it("enquanto o persist voa, o botão vira 'Guardando…' e não aceita clique", async () => {
    const state = exportable();
    const store = new FixtureSessionStore();
    const id = await seedInProgress(store, state);
    const real = store.complete.bind(store);
    let release: (() => void) | null = null;
    vi.spyOn(store, 'complete').mockImplementation(
      (...args) =>
        new Promise((res) => {
          release = () => void real(...args).then(res);
        }),
    );
    load(state);

    render(<Export store={store} sessionId={id} saveBytes={vi.fn()} />);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Concluir e guardar os documentos' }),
    );

    const saving = screen.getByRole('button', { name: 'Guardando…' });
    expect((saving as HTMLButtonElement).disabled).toBe(true);

    await act(async () => release?.());
    expect((await store.get(id)).status).toBe('completed');
  });
});

describe('Export — conclusão guarda o trio byte-idêntico (PRD v2 §8.8/§10.5)', () => {
  it('“Concluir e guardar” envia ao SessionStore exatamente os bytes dos builders e vira concluída', async () => {
    const state = exportable();
    const store = new FixtureSessionStore();
    const id = await seedInProgress(store, state);
    load(state);

    render(<Export store={store} sessionId={id} saveBytes={vi.fn()} />);

    await userEvent.click(
      await screen.findByRole('button', { name: 'Concluir e guardar os documentos' }),
    );

    expect(await store.getArtifacts(id)).toEqual(tripleOf(state));
    expect((await store.get(id)).status).toBe('completed');
  });
});

describe('Export — downloads reusam os bytes guardados (PRD v2 §10.5)', () => {
  it('cada card baixa os MESMOS bytes que o dashboard serve depois, e passa a “baixado”', async () => {
    const state = exportable();
    const store = new FixtureSessionStore();
    const id = await seedCompleted(store, state);
    const save = vi.fn();
    load(state);

    render(<Export store={store} sessionId={id} saveBytes={save} />);
    await screen.findByRole('button', { name: 'Destravar para editar' });

    const stored = await store.getArtifacts(id);

    await userEvent.click(cardButton('anchoring-return.json'));
    await userEvent.click(cardButton('bead-manifest.json'));
    await userEvent.click(cardButton('mapping-report.md'));

    const sent = Object.fromEntries(save.mock.calls.map(([name, bytes]) => [name, bytes]));
    expect(sent['historia-anchoring-return.json']).toBe(stored.anchoring);
    expect(sent['historia-bead-manifest.json']).toBe(stored.manifest);
    expect(sent['historia-mapping-report.md']).toBe(stored.report);

    expect(cardButton('anchoring-return.json').textContent).toContain('Baixado');
  });
});

describe('Export — gate do retorno (PRD v2 §8.8)', () => {
  it('história não confirmada bloqueia o retorno com a cópia exata e não baixa', async () => {
    const state = exportable({ whole: { id: 'S1', span: { s: 0, e: 9 }, confirmed: false } });
    const store = new FixtureSessionStore();
    const id = await seedInProgress(store, state);
    const save = vi.fn();
    load(state);

    render(<Export store={store} sessionId={id} saveBytes={save} />);
    await screen.findByRole('button', { name: 'Concluir e guardar os documentos' });

    await userEvent.click(cardButton('anchoring-return.json'));

    expect(screen.getByText('Confirme o colar antes de exportar.')).toBeTruthy();
    expect(save).not.toHaveBeenCalled();
    expect(cardButton('anchoring-return.json').textContent).toContain('Baixar');
  });

  it('avisa quantas frases estão sem fim travado com a contagem exata', async () => {
    const state = exportable({
      frases: [
        frase({ prop_id: 'P1', statement: 'algo', locked: false }),
        frase({ prop_id: 'P2', statement: 'outra', locked: false }),
      ],
    });
    const store = new FixtureSessionStore();
    const id = await seedInProgress(store, state);
    load(state);

    render(<Export store={store} sessionId={id} saveBytes={vi.fn()} />);
    await screen.findByRole('button', { name: 'Concluir e guardar os documentos' });

    expect(screen.getByText('2 frase(s) ainda sem fim travado.')).toBeTruthy();
  });
});

describe('Export — modo de revisão / reabrir (PRD v2 §7.3/§8.10)', () => {
  it('“Destravar para editar” reabre a sessão e a nova conclusão re-materializa os artefatos', async () => {
    const state = exportable();
    const store = new FixtureSessionStore();
    const id = await seedCompleted(store, state);
    load(state);

    render(<Export store={store} sessionId={id} saveBytes={vi.fn()} />);

    await userEvent.click(await screen.findByRole('button', { name: 'Destravar para editar' }));
    expect((await store.get(id)).status).toBe('in_progress');

    await userEvent.click(
      await screen.findByRole('button', { name: 'Concluir e guardar os documentos' }),
    );
    expect((await store.get(id)).status).toBe('completed');
    expect(await store.getArtifacts(id)).toEqual(tripleOf(state));
  });
});

describe('Export — colar inteiro + tratamento creme (redesign §6.7)', () => {
  it('mostra o título de conclusão e o colar enfiado', async () => {
    const state = exportable();
    const store = new FixtureSessionStore();
    const id = await seedInProgress(store, state);
    load(state);

    const { container } = render(<Export store={store} sessionId={id} saveBytes={vi.fn()} />);
    await screen.findByRole('button', { name: 'Concluir e guardar os documentos' });

    expect(screen.getByText('A história está inteira no colar.')).toBeTruthy();
    expect(container.querySelector('.cds-necklace')).not.toBeNull();
  });

  it('o palco aplica o fundo creme via token e não anima fora do prefers-reduced-motion', () => {
    expect(exportCss).toMatch(/\.cds-export\s*\{[^}]*var\(--cds-ui-bg\)/);
    const guard = /@media\s*\(prefers-reduced-motion:\s*no-preference\)/;
    const { outside } = splitByGuard(exportCss, guard);
    expect(outside).not.toMatch(/animation|@keyframes/);
  });
});

describe('Export — fronteiras de IO real (ENG-247)', () => {
  it('falha ao concluir vira aviso e o botão volta — o segundo clique pode resolver', async () => {
    const state = exportable();
    const store = new FixtureSessionStore();
    const id = await seedInProgress(store, state);
    load(state);
    vi.spyOn(store, 'complete').mockRejectedValue(new Error('rede caiu'));

    render(<Export store={store} sessionId={id} saveBytes={vi.fn()} />);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Concluir e guardar os documentos' }),
    );

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Não consegui guardar agora.');
    // segue editável, com o botão lá para tentar de novo (§9: nunca punir)
    expect(screen.getByRole('button', { name: 'Concluir e guardar os documentos' })).toBeTruthy();
  });

  it('falha ao baixar da API (sessão concluída) vira aviso, não silêncio', async () => {
    const state = exportable();
    const store = new FixtureSessionStore();
    const id = await seedCompleted(store, state);
    load(state);
    const save = vi.fn();
    vi.spyOn(store, 'getArtifacts').mockRejectedValue(new Error('rede caiu'));

    render(<Export store={store} sessionId={id} saveBytes={save} />);
    await screen.findByRole('button', { name: 'Destravar para editar' });

    await userEvent.click(cardButton('anchoring-return.json'));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Não consegui baixar o documento.');
    expect(save).not.toHaveBeenCalled();
  });
});

describe('Export — inglês confirmado é requisito para guardar (ENG-327)', () => {
  const Q = L1_Q[0]!;
  const PATH = voiceAnswerPath({ level: 1, k: Q.k });

  /** Semeia a sessão com UMA resposta gravada, e o texto que a confirma (ou nenhum). */
  async function seedWithRecording(
    store: FixtureSessionStore,
    confirmedText: string | null,
  ): Promise<{ id: string; state: SessionState }> {
    let state = ensureMapping(exportable());
    if (confirmedText !== null) state = setAnswer(state, { level: 1, k: Q.k }, confirmedText);
    const id = await seedInProgress(store, state);
    store.autosave(id, toSessionDto(state, { ...META, voice: [PATH] }));
    await store.flush(id);
    return { id, state };
  }

  it('uma resposta gravada sem inglês confirmado impede concluir, e explica por quê', async () => {
    const store = new FixtureSessionStore();
    const { id, state } = await seedWithRecording(store, null);
    load(state);

    render(<Export store={store} sessionId={id} saveBytes={vi.fn()} />);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Concluir e guardar os documentos' }),
    );

    expect((await store.get(id)).status).toBe('in_progress');
    expect(screen.getByText(/sem o texto em inglês confirmado/i)).toBeTruthy();
  });

  it('confirmado o inglês, concluir volta a funcionar', async () => {
    const store = new FixtureSessionStore();
    const { id, state } = await seedWithRecording(store, 'He told of the dolphin.');
    load(state);

    render(<Export store={store} sessionId={id} saveBytes={vi.fn()} />);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Concluir e guardar os documentos' }),
    );

    expect((await store.get(id)).status).toBe('completed');
  });

  it('se a custódia não carrega, RECUSA em vez de exportar às cegas', async () => {
    const store = new FixtureSessionStore();
    const { id, state } = await seedWithRecording(store, 'He told of the dolphin.');
    // a rede cai justamente ao ler quais respostas foram gravadas
    vi.spyOn(store, 'load').mockRejectedValue(new Error('rede fora'));
    load(state);

    render(<Export store={store} sessionId={id} saveBytes={vi.fn()} />);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Concluir e guardar os documentos' }),
    );

    // sem saber o que foi gravado, deixar passar exportaria "(no answer)" no lugar
    // do que a pessoa disse — o gate falha FECHADO
    expect((await store.get(id)).status).toBe('in_progress');
    expect(screen.getByText(/não consegui conferir/i)).toBeTruthy();
  });

  /**
   * A recusa mudou de FORMA (virou o cartão da casa, não uma faixa de texto solta) e não
   * de comportamento. Estes dois casos são o cinto: o download do relatório continua
   * recusando e continua explicando, e a recusa que falha FECHADO continua fechando.
   */
  it('o download do relatório recusado explica o motivo e não baixa nada', async () => {
    const store = new FixtureSessionStore();
    const { id, state } = await seedWithRecording(store, null);
    const save = vi.fn();
    load(state);

    render(<Export store={store} sessionId={id} saveBytes={save} />);
    await screen.findByRole('button', { name: 'Concluir e guardar os documentos' });

    await userEvent.click(cardButton('mapping-report.md'));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/sem o texto em inglês confirmado/i);
    expect(save).not.toHaveBeenCalled();
    expect(cardButton('mapping-report.md').textContent).toContain('Baixar');
  });

  it('sem saber o que foi gravado, o download do relatório também recusa', async () => {
    const store = new FixtureSessionStore();
    const { id, state } = await seedWithRecording(store, 'He told of the dolphin.');
    // a rede cai justamente ao ler quais respostas foram gravadas
    vi.spyOn(store, 'load').mockRejectedValue(new Error('rede fora'));
    const save = vi.fn();
    load(state);

    render(<Export store={store} sessionId={id} saveBytes={save} />);
    await screen.findByRole('button', { name: 'Concluir e guardar os documentos' });

    await userEvent.click(cardButton('mapping-report.md'));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/não consegui conferir/i);
    expect(save).not.toHaveBeenCalled();
  });

  it('o .md guardado leva o texto confirmado e nenhum caminho de gravação', async () => {
    const store = new FixtureSessionStore();
    const { id, state } = await seedWithRecording(store, 'He told of the dolphin.');
    load(state);

    render(<Export store={store} sessionId={id} saveBytes={vi.fn()} />);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Concluir e guardar os documentos' }),
    );

    const { report } = await store.getArtifacts(id);
    expect(report).toContain('He told of the dolphin.');
    expect(report).not.toContain('respostas/');
  });
});

/**
 * A recusa desta tela era uma faixa de texto quieto, sem parentesco com nada: a única
 * mensagem consequente do app que não vinha num cartão. Aqui ela passa a usar o mesmo
 * registro dos diálogos do Dashboard — cartão creme, título e explicação — sem virar
 * modal: recusar um download é resposta a um clique, e um véu que rouba o foco a cada
 * falha de rede puniria quem só quer clicar de novo (§9: orientar, nunca punir).
 */
describe('Export — a recusa no registro da casa', () => {
  it('traz um título e a explicação, e não só a linha solta', async () => {
    const state = exportable({ whole: { id: 'S1', span: { s: 0, e: 9 }, confirmed: false } });
    const store = new FixtureSessionStore();
    const id = await seedInProgress(store, state);
    load(state);

    render(<Export store={store} sessionId={id} saveBytes={vi.fn()} />);
    await screen.findByRole('button', { name: 'Concluir e guardar os documentos' });

    await userEvent.click(cardButton('anchoring-return.json'));

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('Falta um passo.')).toBeTruthy();
    expect(within(alert).getByText('Confirme o colar antes de exportar.')).toBeTruthy();
  });

  it('a falha de IO se anuncia como falha, não como gate', async () => {
    const state = exportable();
    const store = new FixtureSessionStore();
    const id = await seedInProgress(store, state);
    load(state);
    vi.spyOn(store, 'complete').mockRejectedValue(new Error('rede caiu'));

    render(<Export store={store} sessionId={id} saveBytes={vi.fn()} />);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Concluir e guardar os documentos' }),
    );

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('Não consegui agora.')).toBeTruthy();
    expect(alert.textContent).toContain('Não consegui guardar agora.');
  });

  it('é pintada como cartão da casa, não como faixa de texto', () => {
    const notice = /\.cds-export-notice\s*\{[^}]*\}/.exec(exportCss)?.[0] ?? '';
    expect(notice).toContain('var(--cds-ui-card)');
    expect(notice).toContain('var(--cds-shadow-card)');
  });
});

/**
 * Quanto tempo esta sessão custou — a pergunta que a facilitadora faz ao fim, e
 * só ao fim. O número é LÍQUIDO (@/ui/state/session-clock): tempo de sessão aberta
 * com a aba à vista, descontadas as pausas longas. Ele mora neste browser e não
 * entra em artefato nenhum.
 */
describe('Export — o tempo líquido da sessão (só ao concluir)', () => {
  it('antes de concluir, a tela não fala de tempo: o relógio não é uma cobrança durante o trabalho', async () => {
    const state = exportable();
    const store = new FixtureSessionStore();
    const id = await seedInProgress(store, state);
    startClock(id, 0);
    markActivity(id, 60_000);
    load(state);

    render(<Export store={store} sessionId={id} saveBytes={vi.fn()} />);
    await screen.findByRole('button', { name: 'Concluir e guardar os documentos' });

    expect(screen.queryByText(/tempo de trabalho/i)).toBeNull();
  });

  it('concluída, o chip mostra o tempo de trabalho — e o número para de andar', async () => {
    const state = exportable();
    const store = new FixtureSessionStore();
    const id = await seedInProgress(store, state);
    startClock(id, 0);
    markActivity(id, 60_000);
    load(state);

    render(<Export store={store} sessionId={id} saveBytes={vi.fn()} />);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Concluir e guardar os documentos' }),
    );

    expect(await screen.findByText(/tempo de trabalho/i)).toBeTruthy();
    expect(screen.getByText('1 min')).toBeTruthy();
    // ficar na tela de conclusão não é trabalho: o número exibido é o congelado
    markActivity(id, 10 * 60_000);
    expect(readClock(id).netMs).toBe(60_000);
  });

  it('destravar para editar tira o chip e volta a contar', async () => {
    const state = exportable();
    const store = new FixtureSessionStore();
    const id = await seedCompleted(store, state);
    startClock(id, 0);
    markActivity(id, 60_000);
    freezeClock(id);
    load(state);

    render(<Export store={store} sessionId={id} saveBytes={vi.fn()} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Destravar para editar' }));

    expect(screen.queryByText(/tempo de trabalho/i)).toBeNull();
    expect(readClock(id).frozen).toBe(false);
  });
});
