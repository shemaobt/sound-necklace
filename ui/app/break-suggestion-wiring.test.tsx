import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { toSessionDto } from '../../contracts';
import { buildBeads, createSession, ensureMapping, type SessionState } from '../../domain';
import { BREAK_AFTER_MS } from '../organisms/break-suggestion/break-suggestion';
import { appStore, sessionStore } from '../state';
import { App } from './App';
import { navigate } from './router';
import { appSessionStore } from './session-adapter';

/**
 * A pausa sugerida dentro do app de verdade (ENG-650): ela se monta sobre a
 * estação aberta, e os dois botões levam aos dois lugares que a issue nomeia —
 * a mesma pergunta, ou o painel de histórias. O mecanismo (limiar, latch,
 * guardas) é provado no organismo; aqui prova-se o wiring.
 */

/** A primeira pergunta da entrevista (domain `L1_Q`) — onde a pessoa estava. */
const FIRST_QUESTION =
  'Descreva esta história, explicando o que acontece, do começo ao fim. Não é para recontar a história, é para falar sobre ela.';
const HEADLINE = 'Já foi bastante coisa boa por agora.';
const DASHBOARD = 'Suas histórias';

/** Sessão em mapeamento, sem nenhuma resposta: abre na entrevista. */
function interviewSession(): SessionState {
  const base = createSession({
    durationSec: 4,
    beadSec: 0.25,
    beads: buildBeads(4, 0.25),
    manifestId: 'fnv1a32:deadbeef',
    audioFilename: 'h.wav',
    slug: 'h',
  });
  return ensureMapping({
    ...base,
    mode: 'mapeamento',
    whole: { id: 'S1', span: { s: 0, e: 15 }, confirmed: true },
    partsConfirmed: true,
    parts: [
      {
        part_id: 'PT1',
        span: { s: 0, e: 15 },
        locked: true,
        scene_kind: 'BIRTH_SCENE',
        scene_kind_confidence: 'high',
        tag_state: 'tagged',
      },
    ],
    frases: [
      {
        prop_id: 'P1',
        statement: '',
        qa: [],
        span: { s: 0, e: 1 },
        part_link: 'PT1',
        locked: true,
      },
    ],
  });
}

async function persistInterview(): Promise<string> {
  const store = appSessionStore();
  const summary = await store.create({
    projectId: 'p1',
    storyName: 'H',
    storySlug: 'h',
    audioId: 'a1',
    granularityLevel: 'medium',
    beadSec: 0.25,
    manifestId: 'fnv1a32:deadbeef',
    pipelineConsent: true,
  });
  store.autosave(
    summary.id,
    toSessionDto(
      interviewSession(),
      {
        granularityLevel: 'medium',
        bucketAudioId: 'a1',
        voice: [],
        voiceVersion: {},
        pipelineConsent: true,
      },
      false,
    ),
  );
  await store.flush(summary.id);
  return summary.id;
}

/** Abre a entrevista de uma sessão viva e deixa o limiar da pausa passar. */
async function openInterviewPastThreshold(): Promise<void> {
  const id = await persistInterview();
  act(() => navigate(`/session/${id}`));
  render(<App />);
  await screen.findByText(FIRST_QUESTION);

  act(() => {
    vi.advanceTimersByTime(BREAK_AFTER_MS + 60_000);
  });
  await screen.findByText(HEADLINE);
}

beforeEach(() => {
  // relógio falso para caber 45 minutos num teste; `shouldAdvanceTime` mantém o
  // tempo real correndo por baixo, para que a hidratação da sessão (promessas +
  // findBy) resolva como sempre em vez de travar num relógio parado.
  vi.useFakeTimers({ shouldAdvanceTime: true });
  window.history.replaceState({}, '', '/');
  sessionStore.setState(sessionStore.getInitialState(), true);
  appStore.setState({ recording: false });
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('A pausa sugerida no shell (ENG-650)', () => {
  it('"Seguir mais um pouco" deixa a pessoa na mesma pergunta', async () => {
    await openInterviewPastThreshold();

    await act(async () => {
      screen.getByRole('button', { name: 'Seguir mais um pouco' }).click();
    });

    expect(screen.queryByText(HEADLINE)).toBeNull();
    expect(screen.getByText(FIRST_QUESTION)).toBeDefined();
    expect(screen.queryByRole('heading', { name: DASHBOARD })).toBeNull();
  });

  it('"Fazer uma pausa" volta ao painel de histórias', async () => {
    await openInterviewPastThreshold();

    await act(async () => {
      screen.getByRole('button', { name: 'Fazer uma pausa' }).click();
    });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: DASHBOARD })).toBeDefined();
    });
    expect(screen.queryByText(HEADLINE)).toBeNull();
    expect(screen.queryByText(FIRST_QUESTION)).toBeNull();
  });

  it('com o microfone aberto, a sugestão não sobe por cima da gravação', async () => {
    const id = await persistInterview();
    act(() => navigate(`/session/${id}`));
    render(<App />);
    await screen.findByText(FIRST_QUESTION);

    act(() => appStore.getState().setRecording(true));
    act(() => {
      vi.advanceTimersByTime(BREAK_AFTER_MS + 60_000);
    });

    expect(screen.queryByText(HEADLINE)).toBeNull();
    expect(screen.getByText(FIRST_QUESTION)).toBeDefined();
  });
});
