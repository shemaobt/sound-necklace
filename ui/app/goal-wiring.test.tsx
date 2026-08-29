import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { toSessionDto } from '../../contracts';
import { buildBeads, createSession, ensureMapping, type SessionState } from '../../domain';
import { BREAK_AFTER_MS } from '../organisms/break-suggestion/break-suggestion';
import { appStore, goalStore, sessionStore } from '../state';
import { App } from './App';
import { navigate } from './router';
import { appSessionStore } from './session-adapter';

/**
 * A meta de hoje dentro do app de verdade (ENG-653): escolhida no Setup, ela vira
 * uma marca na barra do topo e, quando o trabalho a alcança, uma tela que diz isso
 * e oferece parar. O mecanismo (latch, guardas, teclado) é provado no organismo;
 * aqui prova-se o wiring — e, sobretudo, que as telas cheias não se cobrem.
 */

/** A primeira pergunta da entrevista (domain `L1_Q`) — onde a pessoa está. */
const FIRST_QUESTION =
  'Descreva esta história, explicando o que acontece, do começo ao fim. Não é para recontar a história, é para falar sobre ela.';
const GOAL_HEADLINE = 'A meta de hoje está no cordão.';
const BREAK_HEADLINE = 'Já foi bastante coisa boa por agora.';
const DASHBOARD = 'Suas histórias';
const KEEP_GOING = 'Seguir mais um pouco';

/** Sessão em mapeamento: a Conversa já passou de longe a meta de fechar a Triagem. */
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

/** Abre a entrevista de uma sessão viva. */
async function openInterview(): Promise<void> {
  const id = await persistInterview();
  act(() => navigate(`/session/${id}`));
  render(<App />);
  await screen.findByText(FIRST_QUESTION);
  /* Estar NA entrevista quer dizer que a dupla já escolheu como ela anda (ENG-649):
     enquanto o pedido do modo está de pé ele é a tela da vez, e as telas cheias do
     shell esperam por ele como esperam umas pelas outras. */
  await act(async () => {
    screen.getByRole('button', { name: /^Toque a toque/ }).click();
  });
}

/** Deixa o limiar da pausa sugerida passar. */
function passBreakThreshold(): void {
  act(() => {
    vi.advanceTimersByTime(BREAK_AFTER_MS + 60_000);
  });
}

beforeEach(() => {
  // relógio falso para caber 45 minutos num teste; `shouldAdvanceTime` mantém o
  // tempo real correndo por baixo, para que a hidratação da sessão resolva.
  vi.useFakeTimers({ shouldAdvanceTime: true });
  window.history.replaceState({}, '', '/');
  sessionStore.setState(sessionStore.getInitialState(), true);
  goalStore.setState(goalStore.getInitialState(), true);
  appStore.setState({ recording: false });
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('A meta de hoje no shell (ENG-653)', () => {
  it('sem meta escolhida, nada aparece por mais que o trabalho ande', async () => {
    await openInterview();

    expect(screen.queryByText(GOAL_HEADLINE)).toBeNull();
    expect(screen.getByText(FIRST_QUESTION)).toBeDefined();
  });

  it('alcançada a meta, a tela aparece e "Seguir mais um pouco" deixa na mesma pergunta', async () => {
    goalStore.getState().chooseGoal('triage');
    await openInterview();

    await screen.findByText(GOAL_HEADLINE);
    await act(async () => {
      screen.getByRole('button', { name: KEEP_GOING }).click();
    });

    expect(screen.queryByText(GOAL_HEADLINE)).toBeNull();
    expect(screen.getByText(FIRST_QUESTION)).toBeDefined();
    expect(screen.queryByRole('heading', { name: DASHBOARD })).toBeNull();
  });

  it('"Guardar por hoje" volta ao painel de histórias', async () => {
    goalStore.getState().chooseGoal('triage');
    await openInterview();
    await screen.findByText(GOAL_HEADLINE);

    await act(async () => {
      screen.getByRole('button', { name: 'Guardar por hoje' }).click();
    });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: DASHBOARD })).toBeDefined();
    });
    expect(screen.queryByText(GOAL_HEADLINE)).toBeNull();
  });

  it('com o microfone aberto, a tela espera a resposta terminar', async () => {
    // a gravação se liga DEPOIS de abrir a entrevista: o palco publica o próprio
    // estado de gravador ao montar, e sobrescreveria uma marcação anterior
    await openInterview();
    act(() => appStore.getState().setRecording(true));

    act(() => goalStore.getState().chooseGoal('triage'));

    expect(screen.queryByText(GOAL_HEADLINE)).toBeNull();
    expect(screen.getByText(FIRST_QUESTION)).toBeDefined();

    // terminada a resposta, a meta chega — não se perde por ter chegado na hora errada
    act(() => appStore.getState().setRecording(false));
    await screen.findByText(GOAL_HEADLINE);
  });

  it('a meta não sobe por cima da pausa sugerida — espera ela sair', async () => {
    await openInterview();
    passBreakThreshold();
    await screen.findByText(BREAK_HEADLINE);

    // a meta se cumpre com a pausa na tela: uma tela cheia de cada vez
    act(() => goalStore.getState().chooseGoal('triage'));
    expect(screen.queryByText(GOAL_HEADLINE)).toBeNull();

    // dispensada a pausa, a meta chega
    await act(async () => {
      screen.getByRole('button', { name: KEEP_GOING }).click();
    });
    await screen.findByText(GOAL_HEADLINE);
  });

  it('a pausa sugerida não sobe por cima da meta alcançada', async () => {
    goalStore.getState().chooseGoal('triage');
    await openInterview();
    await screen.findByText(GOAL_HEADLINE);

    passBreakThreshold();

    expect(screen.queryByText(BREAK_HEADLINE)).toBeNull();
    expect(screen.getByText(GOAL_HEADLINE)).toBeDefined();
  });
});
