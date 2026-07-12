import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FixtureSessionStore } from '../../adapters/sessions';
import { fromSessionDto, toSessionDto } from '../../contracts';
import { buildBeads, createSession, type SessionState } from '../../domain';
import { sessionStore } from '../state';
import { App } from './App';
import { appAuth } from './auth-adapter';
import { navigate } from './router';
import { appSessionBackend, appSessionStore } from './session-adapter';

const FILL = 'senha-fixture';

/** Persiste uma sessão de corte com estado salvo no store app-global; devolve o id. */
async function persistCuttingSession(): Promise<string> {
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
    toSessionDto(cuttingWithLockedScene(), {
      granularityLevel: 'media',
      bucketAudioId: 'a1',
      voice: [],
      pipelineConsent: true,
    }),
  );
  await store.flush(summary.id);
  return summary.id;
}

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

  it('persiste o caminho da resposta de voz em meta.voice → o relatório exportado a referencia', async () => {
    // Gravar voz no Mapeamento (§8.7) deve entrar no `meta.voice` da sessão persistida,
    // de modo que o Export/relatório reflita a resposta como caminho `respostas/…` em vez
    // de "sem resposta" (ENG-276). O gravador em si já funciona; o que faltava era o shell
    // fiar o caminho salvo de volta ao DTO.
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
      toSessionDto(completableSession(), {
        granularityLevel: 'media',
        bucketAudioId: 'a1',
        voice: [],
        pipelineConsent: true,
      }),
    );
    await store.flush(summary.id);

    act(() => navigate(`/session/${summary.id}`));
    render(<App />);

    // grava a resposta de voz da primeira pergunta (L1 "recontar")
    const mic = await screen.findByRole('button', { name: 'gravar a resposta' });
    await act(async () => {
      mic.click();
    });
    const stop = await screen.findByText('Parar');
    await act(async () => {
      stop.click();
    });

    // o caminho canônico foi persistido no meta.voice da sessão
    await waitFor(async () => {
      expect((await store.load(summary.id)).voice).toContain('respostas/level1/recontar.webm');
    });

    // e o relatório concluído a referencia como caminho de voz (não "sem resposta")
    await act(async () => {
      screen.getByText('Guardar').click();
    });
    const concluir = await screen.findByRole('button', {
      name: 'Concluir e guardar os documentos',
    });
    await act(async () => {
      concluir.click();
    });
    const artifacts = await store.getArtifacts(summary.id);
    expect(artifacts.relatorio).toContain('respostas/level1/recontar.webm');
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

describe('App shell — resiliência (§7.3/§13, ENG-277)', () => {
  it('cai offline pelos eventos da window: mostra o aviso e pausa as mutações; volta online sem perda', async () => {
    await act(async () => {
      navigate('/session/s1');
      sessionStore.getState().load(sampleSession());
    });
    render(<App />);
    expect(screen.queryByText(/Sem conexão/)).toBeNull();

    // context.setOffline do Playwright dispara o evento 'offline' na window.
    act(() => window.dispatchEvent(new Event('offline')));
    expect(screen.getByText(/Sem conexão/)).toBeDefined();

    // edição pausada: uma mutação não altera o estado (mas nada se perde).
    const before = sessionStore.getState().session;
    act(() => sessionStore.getState().apply((s) => ({ ...s, slug: 'x' })));
    expect(sessionStore.getState().session).toBe(before);

    // volta online: o aviso some e a edição retoma sobre o MESMO estado preservado.
    act(() => window.dispatchEvent(new Event('online')));
    expect(screen.queryByText(/Sem conexão/)).toBeNull();
    act(() => sessionStore.getState().apply((s) => ({ ...s, slug: 'retomada' })));
    expect(sessionStore.getState().session?.slug).toBe('retomada');
  });

  it('expira a auth dentro de /session/:id: volta ao login preservando o estado em memória', async () => {
    // A facilitadora está logada (tem token); só então a expiração tem o que caducar.
    await appAuth().login({ username: 'facilitadora', password: FILL });
    await act(async () => {
      navigate('/session/s1');
      sessionStore.getState().load(sampleSession());
    });
    render(<App />);
    expect(screen.getByText('Ouvir')).toBeDefined();

    await act(async () => {
      appAuth().simulateExpiry();
    });

    expect(window.location.pathname).toBe('/login');
    // estado em memória intocado: o re-login retoma no mesmo passo.
    expect(sessionStore.getState().session).not.toBeNull();
  });

  it('abre uma sessão travada por outra pessoa: mostra "em uso por" + chrome de revisão', async () => {
    const id = await persistCuttingSession();
    // outra facilitadora detém a trava no MESMO backend (dois usuários, um servidor).
    const other = new FixtureSessionStore({
      backend: appSessionBackend(),
      user: { user_id: 'u-ana', display_name: 'Ana' },
    });
    await other.acquireLock(id);

    act(() => navigate(`/session/${id}`));
    render(<App />);

    expect(await screen.findByText(/Modo de revisão — sessão em uso por Ana\./)).toBeDefined();
    // a trava força a revisão: NÃO se oferece "Destravar para editar".
    expect(screen.queryByRole('button', { name: 'Destravar para editar' })).toBeNull();
  });

  it('trocar de uma sessão travada para uma saudável NÃO vaza o chrome de trava', async () => {
    const locked = await persistCuttingSession();
    const other = new FixtureSessionStore({
      backend: appSessionBackend(),
      user: { user_id: 'u-ana', display_name: 'Ana' },
    });
    await other.acquireLock(locked);
    const healthy = await persistCuttingSession();

    act(() => navigate(`/session/${locked}`));
    render(<App />);
    expect(await screen.findByText(/em uso por Ana/)).toBeDefined();

    // troca in-SPA (voltar ao dashboard e abrir outra sessão, sem reload): a trava
    // da sessão anterior não pode persistir no store singleton para esta saudável.
    act(() => navigate(`/session/${healthy}`));
    await waitFor(() => {
      expect(screen.queryByText(/em uso por Ana/)).toBeNull();
    });
  });
});
