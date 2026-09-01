import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { toSessionDto } from '../../contracts';
import { buildBeads, createSession, type SessionState } from '../../domain';
import { BREAK_AFTER_MS } from '../organisms/break-suggestion/break-suggestion';
import { sessionStore } from '../state';
import { App } from './App';
import { navigate } from './router';
import { appSessionStore } from './session-adapter';

/**
 * A pausa sugerida dentro do app de verdade (ENG-650): ela se monta sobre a
 * estação aberta, e os dois botões levam aos dois lugares que a issue nomeia —
 * a mesma pergunta, ou o painel de histórias. O mecanismo (limiar, latch,
 * guardas) é provado no organismo; aqui prova-se o wiring.
 */

/** A instrução da Segmentação — onde a pessoa estava. */
const PHRASES = 'Divida a cena: toque no colar onde esta frase começa e termina.';
const HEADLINE = 'Já foi bastante coisa boa por agora.';
const DASHBOARD = 'Suas histórias';

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

/** Abre a Segmentação de uma sessão viva e deixa o limiar da pausa passar. */
async function openPhrasesPastThreshold(): Promise<void> {
  const id = await persistSegmenting();
  act(() => navigate(`/session/${id}`));
  render(<App />);
  await screen.findByText(PHRASES, { exact: false });

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
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('A pausa sugerida no shell (ENG-650)', () => {
  it('"Seguir mais um pouco" deixa a pessoa na mesma pergunta', async () => {
    await openPhrasesPastThreshold();

    await act(async () => {
      screen.getByRole('button', { name: 'Seguir mais um pouco' }).click();
    });

    expect(screen.queryByText(HEADLINE)).toBeNull();
    expect(screen.getByText(PHRASES, { exact: false })).toBeDefined();
    expect(screen.queryByRole('heading', { name: DASHBOARD })).toBeNull();
  });

  it('"Fazer uma pausa" volta ao painel de histórias', async () => {
    await openPhrasesPastThreshold();

    await act(async () => {
      screen.getByRole('button', { name: 'Fazer uma pausa' }).click();
    });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: DASHBOARD })).toBeDefined();
    });
    expect(screen.queryByText(HEADLINE)).toBeNull();
    expect(screen.queryByText(PHRASES, { exact: false })).toBeNull();
  });
});
