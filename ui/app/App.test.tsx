import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { toSessionDto } from '../../contracts';
import { buildBeads, createSession, type SessionState } from '../../domain';
import { sessionStore } from '../state';
import { App } from './App';
import { navigate } from './router';
import { appSessionStore } from './session-adapter';

function sampleSession(): SessionState {
  return createSession({
    durationSec: 4,
    beadSec: 0.25,
    beads: buildBeads(4, 0.25),
    manifestId: 'fnv1a32:deadbeef',
    audioFilename: 'h.wav',
    slug: 'h',
  });
}

/** Sessão pronta para concluir: história confirmada + cena produtiva com frase travada. */
function completableSession(): SessionState {
  return {
    ...sampleSession(),
    mode: 'mapeamento',
    whole: { id: 'S1', span: { s: 0, e: 15 }, confirmed: true },
    partsConfirmed: true,
    parts: [
      {
        part_id: 'PT1',
        span: { s: 0, e: 15 },
        locked: true,
        scene_kind: 'BIRTH_SCENE',
        scene_kind_confidence: 'alta',
        tag_state: 'tagged',
      },
    ],
    frases: [
      {
        prop_id: 'P1',
        statement_pt: '',
        qa: [],
        span: { s: 0, e: 1 },
        part_link: 'PT1',
        locked: true,
        flagged: false,
      },
    ],
  };
}

beforeEach(() => {
  window.history.replaceState({}, '', '/');
  sessionStore.setState(sessionStore.getInitialState(), true);
  localStorage.clear(); // a store app-global persiste no localStorage — sem bleed entre casos
});

describe('App shell', () => {
  it('mostra a marca no cabeçalho', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Colar de Sons' })).toBeDefined();
  });

  it('resolve a estação da rota (a rota default abre o dashboard)', () => {
    // O fallback "estação em construção" para uma chave não construída é coberto
    // em station-host.test.tsx; aqui basta que o shell resolva a estação da rota.
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Minhas sessões' })).toBeDefined();
  });

  it('a rota /setup abre a estação Setup', async () => {
    act(() => navigate('/setup'));
    render(<App />);
    // aguarda o Setup montar por completo (a listagem fixture do bucket resolve)
    await screen.findByRole('radio', { name: /conto-do-boto/ });
    expect(screen.getByRole('heading', { name: 'Nova sessão' })).toBeDefined();
  });

  it('a rota /imports abre a estação de arquivos do pipeline (não o dashboard)', () => {
    act(() => navigate('/imports'));
    render(<App />);
    // sem sessão viva, a estação de imports orienta a abrir uma — o que importa é que
    // a rota resolve a estação imports (ENG-248), não recai no dashboard.
    expect(screen.getByText('Abra uma sessão para carregar arquivos do pipeline.')).toBeDefined();
    expect(screen.queryByRole('heading', { name: 'Minhas sessões' })).toBeNull();
  });

  it('reidrata a sessão do store ao (re)abrir /session/:id com o ui/state vazio', async () => {
    // Um reload/retomada: a sessão está persistida na store app-global, mas o
    // ui/state em memória está vazio. O shell deve reidratar em vez de travar em
    // "carregando a sessão…".
    const store = appSessionStore();
    const summary = await store.create({
      projectId: 'p1',
      storyName: 'H',
      storySlug: 'h',
      audioId: 'a1',
      granularityLevel: 'media',
      beadSec: 0.25,
      manifestId: 'fnv1a32:deadbeef',
      pipelineConsent: true,
    });
    store.autosave(
      summary.id,
      toSessionDto(sampleSession(), {
        granularityLevel: 'media',
        bucketAudioId: 'a1',
        voice: [],
        pipelineConsent: true,
      }),
    );
    await store.flush(summary.id);

    act(() => {
      navigate(`/session/${summary.id}`);
    });
    render(<App />);
    expect(await screen.findByText('Ouvir')).toBeDefined();
    expect(screen.getByText('Guardar')).toBeDefined();
  });

  it('numa sessão carregada, mostra o fio de contas', () => {
    act(() => {
      navigate('/session/s1');
      sessionStore.getState().load(sampleSession());
    });
    render(<App />);
    expect(screen.getByText('Ouvir')).toBeDefined();
    expect(screen.getByText('Guardar')).toBeDefined();
  });

  it('entrar em Guardar leva à Export e conclui pela store injetada pelo shell', async () => {
    const store = appSessionStore();
    const summary = await store.create({
      projectId: 'p1',
      storyName: 'H',
      storySlug: 'h',
      audioId: 'a1',
      granularityLevel: 'media',
      beadSec: 0.25,
      manifestId: 'fnv1a32:deadbeef',
      pipelineConsent: true,
    });
    await act(async () => {
      navigate(`/session/${summary.id}`);
      sessionStore.getState().load(completableSession());
    });
    render(<App />);

    await act(async () => {
      screen.getByText('Guardar').click();
    });
    expect(screen.getByText('A história está inteira no colar.')).toBeDefined();

    // O shell passou store + sessionId: concluir vira status "concluída" na store.
    const concluir = await screen.findByRole('button', {
      name: 'Concluir e guardar os documentos',
    });
    await act(async () => {
      concluir.click();
    });
    const after = await store.get(summary.id);
    expect(after.status).toBe('concluida');
  });

  it('não vaza viewingExport ao trocar de sessão (remonta por rota)', async () => {
    const store = appSessionStore();
    const a = await store.create({
      projectId: 'p1',
      storyName: 'A',
      storySlug: 'a',
      audioId: 'a1',
      granularityLevel: 'media',
      beadSec: 0.25,
      manifestId: 'fnv1a32:deadbeef',
      pipelineConsent: true,
    });
    await act(async () => {
      navigate(`/session/${a.id}`);
      sessionStore.getState().load(completableSession());
    });
    render(<App />);
    await act(async () => {
      screen.getByText('Guardar').click();
    });
    expect(screen.getByText('A história está inteira no colar.')).toBeDefined();

    // Abrir outra sessão que NÃO chegou ao gate: a Export não pode "grudar".
    await act(async () => {
      navigate('/session/outra');
      sessionStore.getState().load(sampleSession());
    });
    expect(screen.queryByText('A história está inteira no colar.')).toBeNull();
  });
});
