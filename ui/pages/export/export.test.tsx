import { render, screen, within } from '@testing-library/react';
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
  type Frase,
  type ScenePart,
  type SessionState,
  type Span,
} from '../../../domain';
import { splitByGuard } from '../../atoms/testing/css';
import { sessionStore } from '../../state';
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
  pipelineConsent: true,
};

function lockedTagged(part_id: string, span: Span): ScenePart {
  return {
    part_id,
    span,
    locked: true,
    scene_kind: 'APPEAL_SCENE',
    scene_kind_confidence: 'alta',
    tag_state: 'tagged',
  };
}

function frase(over: Partial<Frase>): Frase {
  return {
    prop_id: 'P1',
    statement_pt: '',
    qa: [],
    span: null,
    part_link: null,
    locked: false,
    flagged: false,
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
  sessionStore.setState({ session: null, review: false, lock: null, online: true });
});
afterEach(() => {
  sessionStore.setState({ session: null, review: false, lock: null, online: true });
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

    await userEvent.click(cardButton('retorno-ancoragem.json'));
    await userEvent.click(cardButton('manifesto-contas.json'));
    await userEvent.click(cardButton('relatorio-mapeamento.md'));

    const sent = Object.fromEntries(save.mock.calls.map(([name, bytes]) => [name, bytes]));
    expect(sent['historia-retorno-ancoragem.json']).toBe(stored.anchoring);
    expect(sent['historia-manifesto-contas.json']).toBe(stored.manifest);
    expect(sent['historia-relatorio-mapeamento.md']).toBe(stored.report);

    expect(cardButton('retorno-ancoragem.json').textContent).toContain('baixado');
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

    await userEvent.click(cardButton('retorno-ancoragem.json'));

    expect(screen.getByText('Confirme o colar antes de exportar.')).toBeTruthy();
    expect(save).not.toHaveBeenCalled();
    expect(cardButton('retorno-ancoragem.json').textContent).toContain('Baixar');
  });

  it('avisa quantas frases estão sem fim travado com a contagem exata', async () => {
    const state = exportable({
      frases: [
        frase({ prop_id: 'P1', statement_pt: 'algo', locked: false }),
        frase({ prop_id: 'P2', statement_pt: 'outra', locked: false }),
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
    expect(exportCss).toMatch(/\.cds-export\s*\{[^}]*var\(--cds-cream\)/);
    const guard = /@media\s*\(prefers-reduced-motion:\s*no-preference\)/;
    const { outside } = splitByGuard(exportCss, guard);
    expect(outside).not.toMatch(/animation|@keyframes/);
  });
});
