import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { FixtureVoiceRecorder } from '../../../adapters/voice/fixture';
import type { VoiceRecorder } from '../../../adapters/voice/types';
import { buildMapReport, type ResourcePath } from '../../../contracts';
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
import Report from './index';

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

/** Sessão em Conversation com o answer store garantido: 1 cena tagged, 2 frases. */
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

/** Semeia uma gravação no caminho da resposta (has(path) → true), com ~9 s de
 *  duração no relógio falso do fixture (90 quadros × 0,1 s) para a linha de voz. */
async function seedVoice(recorder: FixtureVoiceRecorder, path: string): Promise<void> {
  const rec = await recorder.start(path);
  for (let i = 0; i < 90; i += 1) rec.tick();
  await rec.stop();
}

/** O cartão que contém o texto exato da pergunta. */
function cardFor(q: string): HTMLElement {
  const card = screen.getByText(q).closest('.cds-report-card');
  if (!card) throw new Error(`sem cartão para: ${q}`);
  return card as HTMLElement;
}

/**
 * Recorder com `has()` controlado por caminho: os listados resolvem já; os demais
 * ficam pendurados para sempre — é o que prova que uma resposta NÃO espera as
 * outras (a barreira do Promise.all seguraria tudo).
 */
function controllableRecorder(known: Record<string, boolean>): VoiceRecorder {
  return {
    start: () => Promise.reject(new Error('não usado neste teste')),
    play: () => Promise.resolve(),
    duration: () => Promise.resolve(9),
    stopPlayback: () => {},
    has: (p: ResourcePath) =>
      p in known ? Promise.resolve(known[p]!) : new Promise<boolean>(() => {}),
    delete: () => Promise.resolve(),
    onPlayback: () => () => {},
  };
}

beforeEach(() => {
  sessionStore.setState({ session: null, review: false, lock: null, online: true });
});
afterEach(() => {
  sessionStore.setState({ session: null, review: false, lock: null, online: true });
});

describe('Relatório — reprodução com cara de reprodução (ENG-323)', () => {
  it('clicar em ouvir mostra "abrindo…" até o som começar; tocando vira pausar; pausar volta', async () => {
    const q = L1_Q[0]!;
    const path = voiceAnswerPath({ level: 1, k: q.k });
    let emit: ((p: string | null) => void) | null = null;
    let releasePlay: (() => void) | null = null;
    const recorder: VoiceRecorder = {
      start: () => Promise.reject(new Error('não usado')),
      play: () =>
        new Promise((res) => {
          releasePlay = () => {
            emit?.(path);
            res();
          };
        }),
      duration: () => Promise.resolve(9),
      stopPlayback: () => emit?.(null),
      has: () => Promise.resolve(true),
      delete: () => Promise.resolve(),
      onPlayback: (cb) => {
        emit = cb;
        return () => {
          emit = null;
        };
      },
    };
    load(report());
    render(<Report recorder={recorder} />);

    const card = cardFor(q.q);
    await userEvent.click(await within(card).findByRole('button', { name: /ouvir a resposta/ }));
    // entre o toque e o som: o botão diz que está abrindo, sem aceitar clique
    const opening = within(card).getByRole('button', { name: /abrindo a resposta/ });
    expect((opening as HTMLButtonElement).disabled).toBe(true);

    await act(async () => releasePlay?.());
    // tocando: pausar + ondas acesas
    await userEvent.click(within(card).getByRole('button', { name: /pausar a resposta/ }));
    // pausado: volta ao ouvir
    expect(within(card).getByRole('button', { name: /ouvir a resposta/ })).toBeTruthy();
  });
});

describe('Relatório — a voz aparece conforme cada resposta resolve (ENG-319)', () => {
  it('uma resposta verificada aparece mesmo com outra verificação ainda no ar', async () => {
    const fastQ = L1_Q[0]!;
    const fastPath = voiceAnswerPath({ level: 1, k: fastQ.k });
    const recorder = controllableRecorder({ [fastPath]: true }); // as demais nunca resolvem

    load(report());
    render(<Report recorder={recorder} />);

    const card = cardFor(fastQ.q);
    expect(await within(card).findByRole('button', { name: /ouvir a resposta/ })).toBeTruthy();
  });

  it('enquanto a verificação voa, o cartão mostra "procurando", não "sem resposta"', () => {
    const pendingQ = L1_Q[1]!;
    const recorder = controllableRecorder({}); // nada resolve
    load(report());
    render(<Report recorder={recorder} />);

    const card = cardFor(pendingQ.q);
    expect(within(card).getByLabelText('procurando a resposta gravada')).toBeTruthy();
    expect(within(card).queryByPlaceholderText('ainda sem resposta gravada')).toBeNull();
  });

  it('descoberta pré-carregada abre a linha pronta, sem "procurando" (ENG-337)', () => {
    const knownQ = L1_Q[0]!;
    const knownPath = voiceAnswerPath({ level: 1, k: knownQ.k });
    const emptyQ = L1_Q[1]!;
    const emptyPath = voiceAnswerPath({ level: 1, k: emptyQ.k });
    const recorder = controllableRecorder({}); // nada resolve por conta própria

    load(report());
    render(
      <Report
        recorder={recorder}
        preloaded={{ checked: new Set([knownPath, emptyPath]), has: new Set([knownPath]) }}
      />,
    );

    // com gravação conhecida: a linha de voz já está lá, sem espera
    const known = cardFor(knownQ.q);
    expect(within(known).getByRole('button', { name: /ouvir a resposta/ })).toBeTruthy();
    expect(within(known).queryByLabelText('procurando a resposta gravada')).toBeNull();
    // conhecida SEM gravação: o vazio normal, também sem espera
    const empty = cardFor(emptyQ.q);
    expect(within(empty).getByPlaceholderText('ainda sem resposta gravada')).toBeTruthy();
    expect(within(empty).queryByLabelText('procurando a resposta gravada')).toBeNull();
  });

  it('verificada SEM gravação perde o "procurando" e volta ao vazio normal', async () => {
    const q = L1_Q[2]!;
    const path = voiceAnswerPath({ level: 1, k: q.k });
    const recorder = controllableRecorder({ [path]: false });
    load(report());
    render(<Report recorder={recorder} />);

    const card = cardFor(q.q);
    expect(await within(card).findByPlaceholderText('ainda sem resposta gravada')).toBeTruthy();
    expect(within(card).queryByLabelText('procurando a resposta gravada')).toBeNull();
  });
});

describe('Relatório — cabeçalho do protótipo (redesign §6.6)', () => {
  it('mostra o cabeçalho do protótipo (eyebrow + manchete serifada)', () => {
    load(report());
    render(<Report />);

    expect(screen.getByText('A conversa sobre o sentido')).toBeTruthy();
    expect(screen.getByText('Tudo que vocês falaram, reunido.')).toBeTruthy();
  });
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
    render(<Report recorder={recorder} />);

    // só-voz: ▶ ouvir a resposta + forma de onda + duração (resolvido assíncrono via has())
    const voiceCard = cardFor(voiceQ.q);
    expect(await within(voiceCard).findByRole('button', { name: /ouvir a resposta/ })).toBeTruthy();
    expect(voiceCard.querySelectorAll('.cds-waveform-bar').length).toBeGreaterThan(0);
    const duration = await within(voiceCard).findByLabelText('duração da resposta');
    expect(duration.textContent).toMatch(/^\d+:\d{2}$/); // duração real formatada, não "—"
    expect(duration.textContent).not.toBe('—');

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
    render(<Report />);

    const textarea = within(cardFor(q.q)).getByRole('textbox');
    await userEvent.type(textarea, 'resposta nova');

    expect(sessionStore.getState().session!.mapping!.level1[q.k]).toBe('resposta nova');
  });

  it('a nota persiste no estado da sessão (relida no re-mount) e NÃO sai no .md exportado', async () => {
    const q = L1_Q[0]!;
    load(report());
    const view = render(<Report />);

    const before = buildMapReport(sessionStore.getState().session!);

    const card = cardFor(q.q);
    await userEvent.click(within(card).getByRole('button', { name: 'acrescentar uma observação' }));
    await userEvent.type(
      within(card).getByLabelText('observação da facilitadora'),
      'checar vocabulário',
    );

    // a nota volta a aparecer num re-mount → está no estado da sessão (blackbox)
    view.unmount();
    render(<Report />);
    expect(
      (within(cardFor(q.q)).getByLabelText('observação da facilitadora') as HTMLTextAreaElement)
        .value,
    ).toBe('checar vocabulário');

    // o .md é byte-idêntico ao de antes da nota e não a contém
    const after = buildMapReport(sessionStore.getState().session!);
    expect(after).toBe(before);
    expect(after).not.toContain('checar vocabulário');
  });
});
