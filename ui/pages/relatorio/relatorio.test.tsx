import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FixtureVoiceRecorder } from '../../../adapters/voice/fixture';
import {
  buildMapReport,
  buildRetorno,
  relatorioFilename,
  retornoFilename,
  serializeArtifact,
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
import { sessionStore } from '../../state';
import Relatorio from './index';

/**
 * A estação Relatório (PRD v2 §8.7, redesign §6.6): o artefato consolidado e
 * EDITÁVEL — um cartão por pergunta (na ordem de `questionSequence`), com a
 * resposta digitada editável, a linha de voz (▶ + forma de onda + duração) quando
 * a resposta é uma gravação, o vazio "ainda sem resposta gravada", o marcador de
 * papel das perguntas conduzidas e a nota opcional da facilitadora. Exporta o
 * `.md` pelo builder de contracts (byte-idêntico) e a nota NUNCA sai no `.md`.
 */

const DURATION = 7.5;
const BEAD_SEC = 0.25;

function part(overrides: Partial<ScenePart>): ScenePart {
  return {
    part_id: 'PT1',
    span: null,
    locked: false,
    scene_kind: null,
    scene_kind_confidence: null,
    tag_state: 'pending',
    ...overrides,
  };
}

function tagged(id: string, span: Span, kind = 'BIRTH_SCENE'): ScenePart {
  return part({
    part_id: id,
    span,
    locked: true,
    scene_kind: kind,
    scene_kind_confidence: 'alta',
    tag_state: 'tagged',
  });
}

function frase(overrides: Partial<Frase>): Frase {
  return {
    prop_id: 'P1',
    statement_pt: '',
    qa: [],
    span: null,
    part_link: null,
    locked: false,
    flagged: false,
    ...overrides,
  };
}

/** Sessão em Mapeamento com o answer store garantido: 1 cena tagged, 2 frases. */
function report(overrides: Partial<SessionState> = {}): SessionState {
  const base = createSession({
    durationSec: DURATION,
    beadSec: BEAD_SEC,
    beads: buildBeads(DURATION, BEAD_SEC),
    manifestId: 'fnv1a32:00000000',
    audioFilename: 'historia.wav',
    slug: 'historia',
  });
  const state: SessionState = {
    ...base,
    whole: { ...base.whole, confirmed: true },
    partsConfirmed: true,
    mode: 'mapeamento',
    parts: [tagged('PT1', { s: 2, e: 8 })],
    frases: [frase({ prop_id: 'P1', span: { s: 2, e: 4 }, part_link: 'PT1', locked: true })],
    ...overrides,
  };
  return ensureMapping(state);
}

function load(state: SessionState): void {
  sessionStore.getState().load(state);
}

/** Semeia uma gravação no caminho da resposta (has(path) → true). */
async function seedVoice(recorder: FixtureVoiceRecorder, path: string): Promise<void> {
  const rec = await recorder.start(path);
  await rec.stop();
}

/** O cartão que contém o texto exato da pergunta. */
function cardFor(q: string): HTMLElement {
  const card = screen.getByText(q).closest('.cds-relatorio-card');
  if (!card) throw new Error(`sem cartão para: ${q}`);
  return card as HTMLElement;
}

beforeEach(() => {
  sessionStore.setState({ session: null, review: false, lock: null, online: true });
});
afterEach(() => {
  sessionStore.setState({ session: null, review: false, lock: null, online: true });
});

describe('Relatório — renderização por tipo de resposta (redesign §6.6)', () => {
  it('digitada mostra texto editável; só-voz mostra a linha de voz; vazia mostra "ainda sem resposta gravada"; conduzida traz o marcador de papel', async () => {
    const typedQ = L1_Q[0]!; // recontar
    const voiceQ = L1_Q[1]!; // arco_inicio_fim
    const emptyQ = L1_Q[2]!; // arco_muda
    const ledQ = L1_Q[10]!; // ausencia (conduzida pela facilitadora)

    const recorder = new FixtureVoiceRecorder();
    const voicePath = voiceAnswerPath({ level: 1, k: voiceQ.k });
    await seedVoice(recorder, voicePath);

    load(setAnswer(report(), { level: 1, k: typedQ.k }, 'era uma vez'));
    render(<Relatorio recorder={recorder} />);

    // só-voz: ▶ ouvir a resposta + forma de onda + duração (resolvido assíncrono via has())
    const voiceCard = cardFor(voiceQ.q);
    expect(await within(voiceCard).findByRole('button', { name: /ouvir a resposta/ })).toBeTruthy();
    expect(voiceCard.querySelectorAll('.cds-waveform-bar').length).toBeGreaterThan(0);
    expect(within(voiceCard).getByLabelText('duração da resposta')).toBeTruthy();

    // digitada: textarea editável com o valor
    const typedCard = cardFor(typedQ.q);
    expect((within(typedCard).getByRole('textbox') as HTMLTextAreaElement).value).toBe(
      'era uma vez',
    );

    // vazia: estado "ainda sem resposta gravada"
    const emptyCard = cardFor(emptyQ.q);
    expect(within(emptyCard).getByPlaceholderText('ainda sem resposta gravada')).toBeTruthy();

    // conduzida pela facilitadora: marcador de papel
    const ledCard = cardFor(ledQ.q);
    expect(within(ledCard).getByRole('img', { name: 'conduzida pela facilitadora' })).toBeTruthy();
  });
});

describe('Relatório — edição e nota da facilitadora (PRD v2 §8.7, §10.4)', () => {
  it('digitar atualiza o answer store do domínio', async () => {
    const q = L1_Q[0]!;
    load(report());
    render(<Relatorio />);

    const textarea = within(cardFor(q.q)).getByRole('textbox');
    await userEvent.type(textarea, 'resposta nova');

    expect(sessionStore.getState().session!.mapping!.level1[q.k]).toBe('resposta nova');
  });

  it('a nota persiste no estado da sessão (relida no re-mount) e NÃO sai no .md exportado', async () => {
    const q = L1_Q[0]!;
    const saveBytes = vi.fn();
    load(report());
    const view = render(<Relatorio saveBytes={saveBytes} />);

    const before = buildMapReport(sessionStore.getState().session!);

    const card = cardFor(q.q);
    await userEvent.click(within(card).getByRole('button', { name: 'acrescentar uma observação' }));
    await userEvent.type(
      within(card).getByLabelText('observação da facilitadora'),
      'checar vocabulário',
    );

    // a nota volta a aparecer num re-mount → está no estado da sessão (blackbox)
    view.unmount();
    render(<Relatorio saveBytes={saveBytes} />);
    expect(
      (within(cardFor(q.q)).getByLabelText('observação da facilitadora') as HTMLTextAreaElement)
        .value,
    ).toBe('checar vocabulário');

    // o .md é byte-idêntico ao de antes da nota e não a contém
    const after = buildMapReport(sessionStore.getState().session!);
    expect(after).toBe(before);
    expect(after).not.toContain('checar vocabulário');

    await userEvent.click(screen.getByRole('button', { name: /baixar relatório/i }));
    const [, bytes] = saveBytes.mock.calls.at(-1)!;
    expect(bytes).not.toContain('checar vocabulário');
  });
});

describe('Relatório — export dos artefatos (referência renderMapReport L1147–1150)', () => {
  it('baixa o .md byte-idêntico ao buildMapReport do estado atual', async () => {
    const saveBytes = vi.fn();
    load(setAnswer(report(), { level: 1, k: L1_Q[0]!.k }, 'era uma vez'));
    render(<Relatorio saveBytes={saveBytes} />);

    await userEvent.click(screen.getByRole('button', { name: /baixar relatório/i }));

    const session = sessionStore.getState().session!;
    expect(saveBytes).toHaveBeenLastCalledWith(
      relatorioFilename(session.slug),
      buildMapReport(session),
    );
  });

  it('o atalho da ancoragem (.json) respeita o gate whole.confirmed', async () => {
    const saveBytes = vi.fn();
    load(report({ whole: { id: 'S1', span: { s: 0, e: 29 }, confirmed: false } }));
    const view = render(<Relatorio saveBytes={saveBytes} />);

    // história não confirmada → o atalho não baixa
    await userEvent.click(screen.getByRole('button', { name: /baixar a ancoragem/i }));
    expect(saveBytes).not.toHaveBeenCalled();

    // confirmada → baixa o retorno pelos builders reais
    view.unmount();
    load(report({ whole: { id: 'S1', span: { s: 0, e: 29 }, confirmed: true } }));
    render(<Relatorio saveBytes={saveBytes} />);
    await userEvent.click(screen.getByRole('button', { name: /baixar a ancoragem/i }));

    const session = sessionStore.getState().session!;
    expect(saveBytes).toHaveBeenLastCalledWith(
      retornoFilename(session.slug),
      serializeArtifact(buildRetorno(session)),
    );
  });
});
