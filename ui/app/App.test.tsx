import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fromSessionDto, toSessionDto } from '../../contracts';
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

/**
 * Sessão de corte (Escuta 2) com UMA cena travada — a grade casa o áudio fixture
 * `aud_conto_do_boto` (3 s / beadSec 0,25 → 12 contas) para o player que o shell
 * re-decodifica bater com o colar renderizado.
 */
function cuttingWithLockedScene(): SessionState {
  const base = createSession({
    durationSec: 3,
    beadSec: 0.25,
    beads: buildBeads(3, 0.25),
    manifestId: 'fnv1a32:deadbeef',
    audioFilename: 'conto-do-boto.wav',
    slug: 'conto-do-boto',
  });
  return {
    ...base,
    mode: 'escuta',
    whole: { id: 'S1', span: { s: 0, e: 11 }, confirmed: true },
    partsConfirmed: false,
    parts: [
      {
        part_id: 'PT1',
        span: { s: 0, e: 9 },
        locked: true,
        scene_kind: null,
        scene_kind_confidence: null,
        tag_state: 'pending',
      },
    ],
    current: { layer: 'parts', index: 0 },
  };
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

  it('persiste continuamente cada decisão no store app-global e retoma no passo exato', async () => {
    // Setup persistiu o DTO inicial (mode=escuta). O shell reidrata e, a partir daí,
    // toda mutação do domínio deve ser autossalva no store app-global — sem isso um
    // reload retomaria na Escuta 1, perdendo as decisões (§7.3).
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

    act(() => navigate(`/session/${summary.id}`));
    render(<App />);
    await screen.findByText('Ouvir'); // hidratado na Escuta 1

    // Uma decisão pós-Setup, sem flush explícito (o app real não chama flush).
    act(() => sessionStore.getState().apply((s) => ({ ...s, slug: 'avancada' })));
    // A saída/descarregamento da página força o flush do autosave pendente.
    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });

    await waitFor(async () => {
      const persisted = fromSessionDto(await store.load(summary.id)).state;
      expect(persisted).toEqual(sessionStore.getState().session);
    });
    const persisted = fromSessionDto(await store.load(summary.id)).state;
    expect(persisted.slug).toBe('avancada');
  });

  it('liga o gravador de voz fixture no Mapeamento (o microfone grava)', async () => {
    await act(async () => {
      navigate('/session/s1');
      sessionStore.getState().load(completableSession());
    });
    render(<App />);

    const mic = await screen.findByRole('button', { name: 'gravar a resposta' });
    await act(async () => {
      mic.click();
    });
    // A fixture inicia a gravação → surge o controle "Parar" (microfone vivo).
    expect(await screen.findByText('Parar')).toBeDefined();
  });

  it('fia o player de áudio: tocar a cena acende a cabeça de reprodução no colar', async () => {
    // O shell re-decodifica o áudio do bucket da sessão e injeta o player na estação
    // ativa; a ponte de relógio (rAF→advance) é dirigida aqui de forma determinística.
    const frames: FrameRequestCallback[] = [];
    const raf = vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb) => {
      frames.push(cb);
      return frames.length;
    });
    const caf = vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => undefined);
    try {
      const store = appSessionStore();
      const summary = await store.create({
        projectId: 'p1',
        storyName: 'H',
        storySlug: 'h',
        audioId: 'aud_conto_do_boto',
        granularityLevel: 'media',
        beadSec: 0.25,
        manifestId: 'fnv1a32:deadbeef',
        pipelineConsent: true,
      });
      store.autosave(
        summary.id,
        toSessionDto(cuttingWithLockedScene(), {
          granularityLevel: 'media',
          bucketAudioId: 'aud_conto_do_boto',
          voice: [],
          pipelineConsent: true,
        }),
      );
      await store.flush(summary.id);

      act(() => navigate(`/session/${summary.id}`));
      render(<App />);

      // aguarda a hidratação + construção assíncrona do player (chip ▶ da cena travada)
      const play = await screen.findByRole('button', { name: 'Tocar' });
      await act(async () => {
        play.click();
      });

      // dirige o relógio do fixture por rAF: baseline + 1 frame de 0,1 s → cabeça na conta 0
      act(() => frames[0]?.(0));
      act(() => frames[1]?.(100));

      expect(document.querySelector('.cds-necklace-bead[data-play]')).not.toBeNull();
    } finally {
      raf.mockRestore();
      caf.mockRestore();
    }
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
