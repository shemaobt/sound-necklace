import { act, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FixtureAuthProvider } from '../../adapters/api';
import { FixtureSessionStore } from '../../adapters/sessions';
import { fromSessionDto, toSessionDto } from '../../contracts';
import { buildBeads, createSession, type SessionState } from '../../domain';
import { sessionStore } from '../state';
import { App } from './App';
import { appAuth } from './auth-adapter';
import { navigate } from './router';
import { appSessionBackend, appSessionStore } from './session-adapter';

const FILL = 'senha-fixture';

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

/** Persiste uma sessão de corte com estado salvo no store app-global; devolve o id. */
async function persistCuttingSession(): Promise<string> {
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
    toSessionDto(cuttingWithLockedScene(), {
      granularityLevel: 'medium',
      bucketAudioId: 'a1',
      pipelineConsent: true,
    }),
  );
  await store.flush(summary.id);
  return summary.id;
}

beforeEach(() => {
  window.history.replaceState({}, '', '/');
  sessionStore.setState(sessionStore.getInitialState(), true);
  localStorage.clear(); // a store app-global persiste no localStorage — sem bleed entre casos
});

describe('App shell', () => {
  it('as estações montam o cabeçalho do shell (pill Histórias + botão de som)', () => {
    // a rota default cai no dashboard, que tem cabeçalho PRÓPRIO — o shell só monta o
    // dele nas estações; /imports é uma delas. O header do shell é só ícone + pill de
    // voltar (protótipo Shemá v2) — sem título.
    act(() => navigate('/imports'));
    render(<App />);

    expect(screen.getByRole('button', { name: 'Voltar às histórias' })).toBeDefined();
    expect(screen.getByRole('button', { name: /som da interface/i })).toBeDefined();
  });

  it('login e dashboard têm cabeçalho próprio: o shell não empilha o dele (ENG-278)', () => {
    render(<App />); // rota default = dashboard

    // uma ÚNICA marca na página: a do cabeçalho do dashboard. E sem o botão de som do
    // shell, que vive nas estações (é lá que há áudio).
    expect(screen.getAllByRole('heading', { name: 'Colar de Sons' })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: /som da interface/i })).toBeNull();
  });

  it('resolve a estação da rota (a rota default abre o dashboard)', () => {
    // O fallback "estação em construção" para uma chave não construída é coberto
    // em station-host.test.tsx; aqui basta que o shell resolva a estação da rota.
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Suas histórias' })).toBeDefined();
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
    expect(screen.queryByRole('heading', { name: 'Suas histórias' })).toBeNull();
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
      granularityLevel: 'medium',
      beadSec: 0.25,
      manifestId: 'fnv1a32:deadbeef',
      pipelineConsent: true,
    });
    store.autosave(
      summary.id,
      toSessionDto(sampleSession(), {
        granularityLevel: 'medium',
        bucketAudioId: 'a1',
        pipelineConsent: true,
      }),
    );
    await store.flush(summary.id);

    act(() => {
      navigate(`/session/${summary.id}`);
    });
    render(<App />);
    // a barra do topo é o chrome da sessão montada: ela nomeia a etapa
    expect(await screen.findByText('Ouvir')).toBeDefined();
  });

  it('numa sessão carregada, a barra do topo diz a etapa', async () => {
    act(() => {
      navigate('/session/s1');
      sessionStore.getState().load(sampleSession());
    });
    render(<App />);
    // a estação chega quando a hidratação da rota resolve — aqui, falhando (ENG-511)
    const faixa = await screen.findByRole('region', { name: 'Progresso da sessão' });
    expect(within(faixa).getByText('Ouvir')).toBeDefined();
  });

  /**
   * ENG-668 — o fio de contas saiu. Ele era o único lugar que nomeava as estações
   * de uma vez (rótulo sr-only por conta) e a única navegação de um clique entre
   * elas; a barra do topo herdou o anúncio, e só o da etapa ATUAL.
   */
  it('as outras estações não estão em lugar nenhum da página', async () => {
    act(() => {
      navigate('/session/s1');
      sessionStore.getState().load(sampleSession());
    });
    render(<App />);
    await screen.findAllByText('Ouvir');

    for (const outra of ['Cortar', 'Triagem', 'Frases']) {
      expect(screen.queryByText(outra), `"${outra}" continua na página`).toBeNull();
    }
    expect(screen.getAllByText('Ouvir')).toHaveLength(1);
  });

  it('o anúncio da etapa acompanha a sessão quando ela avança', async () => {
    act(() => {
      navigate('/session/s1');
      sessionStore.getState().load(sampleSession());
    });
    render(<App />);
    const faixa = await screen.findByRole('region', { name: 'Progresso da sessão' });
    expect(within(faixa).getByRole('status').textContent).toBe('Ouvir');

    // a história inteira confirmada leva a sessão de Ouvir a Cortar
    act(() => {
      sessionStore.getState().load({
        ...sampleSession(),
        whole: { id: 'S1', span: { s: 0, e: 15 }, confirmed: true },
      });
    });
    await waitFor(() => {
      expect(within(faixa).getByRole('status').textContent).toBe('Cortar');
    });
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
      granularityLevel: 'medium',
      beadSec: 0.25,
      manifestId: 'fnv1a32:deadbeef',
      pipelineConsent: true,
    });
    store.autosave(
      summary.id,
      toSessionDto(sampleSession(), {
        granularityLevel: 'medium',
        bucketAudioId: 'a1',
        pipelineConsent: true,
      }),
    );
    await store.flush(summary.id);

    act(() => navigate(`/session/${summary.id}`));
    render(<App />);
    await screen.findAllByText('Ouvir'); // hidratado na Escuta 1

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
        granularityLevel: 'medium',
        beadSec: 0.25,
        manifestId: 'fnv1a32:deadbeef',
        pipelineConsent: true,
      });
      store.autosave(
        summary.id,
        toSessionDto(cuttingWithLockedScene(), {
          granularityLevel: 'medium',
          bucketAudioId: 'aud_conto_do_boto',
          pipelineConsent: true,
        }),
      );
      await store.flush(summary.id);

      act(() => navigate(`/session/${summary.id}`));
      render(<App />);

      // aguarda a hidratação + construção assíncrona do player; o transporte é o
      // toque na conta (sem botões de play — decisão do dono)
      const necklace = await waitFor(() => {
        const el = document.querySelector('.cds-necklace');
        if (!el) throw new Error('colar ainda não montou');
        return el;
      });
      await act(async () => {
        necklace.dispatchEvent(
          new MouseEvent('pointerdown', {
            bubbles: true,
            cancelable: true,
            clientX: 1,
            clientY: 1,
          }),
        );
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
});

describe('App shell — resiliência (§7.3/§13, ENG-277)', () => {
  it('cai offline pelos eventos da window: mostra o aviso e pausa as mutações; volta online sem perda', async () => {
    // uma sessão QUE EXISTE: a trava consultiva só é adquirida para uma sessão real, e
    // sem lease a edição já estaria pausada por outro motivo — o teste não veria o seu
    const id = await persistCuttingSession();
    act(() => navigate(`/session/${id}`));
    render(<App />);
    await screen.findByText('Cortar'); // a estação, e com ela o gate de conexão
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
    expect((await screen.findAllByText('Ouvir')).length).toBeGreaterThan(0);

    await act(async () => {
      // o teste dirige o fluxo fixture; o narrowing é o mesmo do seam de dev (ENG-247)
      const auth = appAuth();
      if (auth instanceof FixtureAuthProvider) auth.simulateExpiry();
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

describe('App shell — a barra da história inteira (ENG-648)', () => {
  const NOMES = ['Ouvir', 'Cortar', 'Triagem', 'Frases'];

  it('numa estação da sessão, a barra fica sob o cabeçalho, com as três marcas de etapa', async () => {
    act(() => {
      navigate('/session/s1');
      sessionStore.getState().load(sampleSession());
    });
    const { container } = render(<App />);
    await screen.findAllByText('Ouvir');
    const faixa = container.querySelector<HTMLElement>('.cds-story-progress');
    expect(faixa).not.toBeNull();
    expect(faixa!.querySelectorAll('.cds-story-progress-tick')).toHaveLength(3);
    expect(within(faixa!).getByText('Ouvir')).toBeDefined();
  });

  it('na Setup não há barra nem nome de estação', async () => {
    act(() => navigate('/setup'));
    const { container } = render(<App />);
    await screen.findByRole('radio', { name: /conto-do-boto/ });
    expect(container.querySelector('.cds-story-progress')).toBeNull();
    for (const nome of NOMES) expect(screen.queryByText(nome)).toBeNull();
  });
});
