import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { toSessionDto } from '../../contracts';
import { buildBeads, createSession, type SessionState } from '../../domain';
import { BREAK_AFTER_MS } from '../organisms/break-suggestion/break-suggestion';
import { goalStore, sessionStore } from '../state';
import { App } from './App';
import { navigate } from './router';
import { appSessionStore } from './session-adapter';

/**
 * A meta de hoje dentro do app de verdade (ENG-653): escolhida no Setup, ela vira
 * uma marca na barra do topo e, quando o trabalho a alcança, uma tela que diz isso
 * e oferece parar. O mecanismo (latch, guardas, teclado) é provado no organismo;
 * aqui prova-se o wiring — e, sobretudo, que as telas cheias não se cobrem.
 */

/** A instrução da Segmentação — onde a pessoa está. */
const PHRASES = 'Divida a cena: toque no colar onde esta frase começa e termina.';
const GOAL_HEADLINE = 'A meta de hoje está no cordão.';
const BREAK_HEADLINE = 'Já foi bastante coisa boa por agora.';
const DASHBOARD = 'Suas histórias';
const KEEP_GOING = 'Seguir mais um pouco';

/** Sessão na Segmentação, com uma cena produtiva ainda por fechar. */
function segmentingSession(): SessionState {
  const base = createSession({
    durationSec: 7.5,
    beadSec: 0.25,
    beads: buildBeads(7.5, 0.25),
    manifestId: 'fnv1a32:deadbeef',
    audioFilename: 'h.wav',
    slug: 'h',
  });
  return {
    ...base,
    mode: 'segmentacao',
    whole: { id: 'S1', span: { s: 0, e: 29 }, confirmed: true },
    partsConfirmed: true,
    parts: [
      {
        part_id: 'PT1',
        span: { s: 0, e: 29 },
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
        span: { s: 0, e: 4 },
        part_link: 'PT1',
        locked: true,
      },
    ],
    activeSceneId: 'PT1',
    current: { layer: 'frases', index: -1 },
  };
}

async function persistSegmenting(): Promise<string> {
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
      segmentingSession(),
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

/** Abre a Segmentação de uma sessão viva. */
async function openPhrases(): Promise<void> {
  const id = await persistSegmenting();
  act(() => navigate(`/session/${id}`));
  render(<App />);
  await screen.findByText(PHRASES, { exact: false });
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
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('A meta de hoje no shell (ENG-653)', () => {
  it('sem meta escolhida, nada aparece por mais que o trabalho ande', async () => {
    await openPhrases();

    expect(screen.queryByText(GOAL_HEADLINE)).toBeNull();
    expect(screen.getByText(PHRASES, { exact: false })).toBeDefined();
  });

  it('alcançada a meta, a tela aparece e "Seguir mais um pouco" deixa na mesma pergunta', async () => {
    goalStore.getState().chooseGoal('triage');
    await openPhrases();

    await screen.findByText(GOAL_HEADLINE);
    await act(async () => {
      screen.getByRole('button', { name: KEEP_GOING }).click();
    });

    expect(screen.queryByText(GOAL_HEADLINE)).toBeNull();
    expect(screen.getByText(PHRASES, { exact: false })).toBeDefined();
    expect(screen.queryByRole('heading', { name: DASHBOARD })).toBeNull();
  });

  it('"Guardar por hoje" volta ao painel de histórias', async () => {
    goalStore.getState().chooseGoal('triage');
    await openPhrases();
    await screen.findByText(GOAL_HEADLINE);

    await act(async () => {
      screen.getByRole('button', { name: 'Guardar por hoje' }).click();
    });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: DASHBOARD })).toBeDefined();
    });
    expect(screen.queryByText(GOAL_HEADLINE)).toBeNull();
  });

  it('a meta não sobe por cima da pausa sugerida — espera ela sair', async () => {
    await openPhrases();
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
    await openPhrases();
    await screen.findByText(GOAL_HEADLINE);

    passBreakThreshold();

    expect(screen.queryByText(BREAK_HEADLINE)).toBeNull();
    expect(screen.getByText(GOAL_HEADLINE)).toBeDefined();
  });
});
