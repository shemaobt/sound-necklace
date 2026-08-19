import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FixtureAuthProvider } from '../../adapters/api';
import { FixtureSessionStore } from '../../adapters/sessions';
import { fromSessionDto, toSessionDto } from '../../contracts';
import {
  buildBeads,
  createSession,
  ensureMapping,
  questionSequence,
  setAnswer,
  voiceAnswerPath,
  type SessionState,
} from '../../domain';
import { sessionStore } from '../state';
import { App } from './App';
import { appAuth } from './auth-adapter';
import { navigate } from './router';
import { appSessionBackend, appSessionStore } from './session-adapter';

/**
 * Latência do RESUMO da sessão (`get`), e só dele: o estado continua chegando na
 * hora. É o cenário do caso B — o shell sabe o estado antes de saber o status.
 */
const slowSummary = vi.hoisted(() => ({ ms: 0 }));
vi.mock('./session-adapter', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./session-adapter')>();
  const { FixtureSessionStore: Slow } = await import('../../adapters/sessions');
  return {
    ...actual,
    appSessionStore: () => {
      const store = actual.appSessionStore();
      if (slowSummary.ms === 0) return store;
      const slow = new Slow({ backend: actual.appSessionBackend(), latencyMs: slowSummary.ms });
      // delegação com `this` amarrado ao store real: os campos privados dele não
      // sobrevivem a um `this` que seja o proxy
      return new Proxy(store, {
        get: (target, prop) => {
          if (prop === 'get') return slow.get.bind(slow);
          const value = Reflect.get(target, prop, target) as unknown;
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
    },
  };
});

const FILL = 'senha-fixture';

/** A tela de espera da revisão (ui/i18n `conversation.preparingReview`). */
const PREPARING_REVIEW = 'Trazendo os áudios de volta para a revisão…';
/** A primeira pergunta da entrevista (domain `L1_Q`) — âncora de "abriu na Conversa". */
const FIRST_QUESTION =
  'Conte essa história com as suas palavras, como se fosse para alguém que nunca ouviu.';
/** O palco da Export. */
const EXPORT_HEADLINE = 'A história está inteira no colar.';

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
      voice: [],
      voiceVersion: {},
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
  };
}

/**
 * Sessão de mapeamento com TODAS as perguntas respondidas por escrito — a entrevista
 * chegou ao fim e não sobrou rascunho por confirmar (nenhuma gravação existe). O texto
 * é do chamador para que as respostas de uma sessão sejam reconhecíveis noutra.
 */
function fullyAnsweredSession(answer = 'resposta'): SessionState {
  let s = ensureMapping(completableSession());
  for (const slot of questionSequence(s)) s = setAnswer(s, slot, answer);
  return s;
}

/**
 * A entrevista terminou, mas UMA resposta foi gravada e nunca virou texto confirmado:
 * a revisão ainda tem trabalho dentro (`reportExportStatus` recusa a exportação). A
 * pendência fica na PRIMEIRA pergunta — a última respondida é o que leva à revisão.
 */
function answeredWithPendingDraft(answer = 'resposta'): {
  state: SessionState;
  voice: string[];
} {
  const full = fullyAnsweredSession(answer);
  const first = questionSequence(full)[0]!;
  return { state: setAnswer(full, first, ''), voice: [voiceAnswerPath(first)] };
}

/**
 * Vigia o DOM enquanto a rota troca: a revisão que MONTA e depois é trocada não
 * aparece numa asserção final. Amostra o documento a cada lote de mutações — inclusive
 * de atributo, porque o React reusa a `<section>` da conversa e só troca o `aria-label`
 * (observar apenas nós adicionados dá falso negativo).
 */
function watchWhileRouting(needle: string): () => { review: boolean; needle: boolean } {
  const seen = { review: false, needle: false };
  const sample = (): void => {
    if (document.querySelector(`[aria-label="relatório"], [aria-label="${PREPARING_REVIEW}"]`))
      seen.review = true;
    if (document.body.textContent?.includes(needle)) seen.needle = true;
  };
  const obs = new MutationObserver(sample);
  obs.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['aria-label'],
  });
  return () => {
    obs.takeRecords();
    sample();
    obs.disconnect();
    return seen;
  };
}

/** Persiste um estado de mapeamento no store app-global; devolve o id da sessão. */
async function persistMapeamento(state: SessionState, voice: string[] = []): Promise<string> {
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
    toSessionDto(state, {
      granularityLevel: 'medium',
      bucketAudioId: 'a1',
      voice,
      voiceVersion: {},
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
  slowSummary.ms = 0;
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
        voice: [],
        voiceVersion: {},
        pipelineConsent: true,
      }),
    );
    await store.flush(summary.id);

    act(() => {
      navigate(`/session/${summary.id}`);
    });
    render(<App />);
    // 'Ouvir' aparece 2×: no rótulo sr-only do li E no nome visível da etapa atual
    expect((await screen.findAllByText('Ouvir')).length).toBeGreaterThan(0);
    expect(screen.getByText('Guardar')).toBeDefined();
  });

  it('numa sessão carregada, mostra o fio de contas', async () => {
    act(() => {
      navigate('/session/s1');
      sessionStore.getState().load(sampleSession());
    });
    render(<App />);
    // a estação chega quando a hidratação da rota resolve — aqui, falhando (ENG-511)
    expect((await screen.findAllByText('Ouvir')).length).toBeGreaterThan(0);
    expect(screen.getByText('Guardar')).toBeDefined();
  });

  it('entrar em Guardar leva à Export e conclui pela store injetada pelo shell', async () => {
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
    await act(async () => {
      navigate(`/session/${summary.id}`);
      sessionStore.getState().load(completableSession());
    });
    render(<App />);

    const guardar = await screen.findByText('Guardar');
    await act(async () => {
      guardar.click();
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
    expect(after.status).toBe('completed');
  });

  it('sessão concluída reabre direto na Export, não na entrevista (ENG-320)', async () => {
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
    // o estado salvo ficou no Conversation (o último modo do domínio) — é o que hoje
    // faz a reentrada cair na entrevista
    const dto = toSessionDto(completableSession(), {
      granularityLevel: 'medium',
      bucketAudioId: 'a1',
      voice: [],
      voiceVersion: {},
      pipelineConsent: true,
    });
    store.autosave(summary.id, dto);
    await store.flush(summary.id);
    await store.complete(summary.id, dto, {
      manifest: '{"m":1}',
      anchoring: '{"a":1}',
      report: '# r',
    });

    act(() => {
      navigate(`/session/${summary.id}`);
    });
    render(<App />);
    // a Export abre SEM nenhum clique — palco da conclusão visível
    expect(await screen.findByText('A história está inteira no colar.')).toBeDefined();
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
        voice: [],
        voiceVersion: {},
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

  // Sob `VITE_VOICE=fixture` (vitest.config: jsdom não tem MediaRecorder) o shell monta
  // o DUBLÊ. Este teste prova a fiação da estação, NÃO que existe áudio: quem exige som
  // de verdade é `tests/e2e/voice-really-records.spec.ts`, onde o gravador é o real. O
  // título anterior dizia "o microfone grava" e foi exatamente essa a ilusão que deixou
  // o app mudo por uma semana (ENG-298) — um teste verde afirmando o que não acontecia.
  it('liga o gravador no Conversation: o botão de voz abre a gravação', async () => {
    await act(async () => {
      navigate('/session/s1');
      sessionStore.getState().load(completableSession());
    });
    render(<App />);

    const mic = await screen.findByRole('button', { name: 'Gravar a resposta' });
    await act(async () => {
      mic.click();
    });
    expect(await screen.findByRole('button', { name: 'Parar' })).toBeDefined();
  });

  it('persiste o caminho da resposta de voz em meta.voice — e sem inglês confirmado, não exporta', async () => {
    // Gravar voz no Conversation (§8.7) deve entrar no `meta.voice` da sessão persistida,
    // de modo que o Export/relatório reflita a resposta como caminho `respostas/…` em vez
    // de "Sem resposta" (ENG-276). O gravador em si já funciona; o que faltava era o shell
    // fiar o caminho salvo de volta ao DTO.
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
      toSessionDto(completableSession(), {
        granularityLevel: 'medium',
        bucketAudioId: 'a1',
        voice: [],
        voiceVersion: {},
        pipelineConsent: true,
      }),
    );
    await store.flush(summary.id);

    act(() => navigate(`/session/${summary.id}`));
    render(<App />);

    // grava a resposta de voz da primeira pergunta (L1 "recontar")
    const mic = await screen.findByRole('button', { name: 'Gravar a resposta' });
    await act(async () => {
      mic.click();
    });
    const stop = await screen.findByRole('button', { name: 'Parar' });
    await act(async () => {
      stop.click();
    });

    // o caminho canônico foi persistido no meta.voice da sessão
    await waitFor(async () => {
      expect((await store.load(summary.id)).voice).toContain('respostas/level1/recontar.webm');
    });

    // ...mas gravar não basta para exportar (ENG-327): sem o inglês confirmado, a
    // resposta não vira texto nenhum, e guardar assim perderia em silêncio o que
    // foi dito. Então concluir é recusado, com o motivo na tela.
    await act(async () => {
      screen.getByText('Guardar').click();
    });
    const concluir = await screen.findByRole('button', {
      name: 'Concluir e guardar os documentos',
    });
    await act(async () => {
      concluir.click();
    });
    expect((await store.get(summary.id)).status).toBe('in_progress');
    expect(screen.getByText(/sem o texto em inglês confirmado/i)).toBeTruthy();
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
          voice: [],
          voiceVersion: {},
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

  it('não vaza viewingExport ao trocar de sessão (remonta por rota)', async () => {
    const store = appSessionStore();
    const a = await store.create({
      projectId: 'p1',
      storyName: 'A',
      storySlug: 'a',
      audioId: 'a1',
      granularityLevel: 'medium',
      beadSec: 0.25,
      manifestId: 'fnv1a32:deadbeef',
      pipelineConsent: true,
    });
    await act(async () => {
      navigate(`/session/${a.id}`);
      sessionStore.getState().load(completableSession());
    });
    render(<App />);
    const guardar = await screen.findByText('Guardar');
    await act(async () => {
      guardar.click();
    });
    expect(screen.getByText('A história está inteira no colar.')).toBeDefined();

    // Abrir outra sessão que NÃO chegou ao gate: a Export não pode "grudar".
    await act(async () => {
      navigate('/session/outra');
      sessionStore.getState().load(sampleSession());
    });
    // espera a estação da OUTRA sessão montar: sem isso o null abaixo seria o
    // placeholder da hidratação, não a prova de que a Export não grudou
    await screen.findAllByText('Ouvir');
    expect(screen.queryByText('A história está inteira no colar.')).toBeNull();
  });
});

describe('App shell — resiliência (§7.3/§13, ENG-277)', () => {
  it('cai offline pelos eventos da window: mostra o aviso e pausa as mutações; volta online sem perda', async () => {
    // uma sessão QUE EXISTE: a trava consultiva só é adquirida para uma sessão real, e
    // sem lease a edição já estaria pausada por outro motivo — o teste não veria o seu
    const id = await persistCuttingSession();
    act(() => navigate(`/session/${id}`));
    render(<App />);
    await screen.findAllByText('Ouvir'); // a estação, e com ela o gate de conexão
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

/**
 * Onde uma sessão retomada ABRE (ENG-511). O critério é a estação que a pessoa vê ao
 * cair na rota — o interior (hidratação, ordem dos efeitos) é caixa-preta.
 */
describe('App shell — onde a sessão retomada abre (ENG-511)', () => {
  it('em andamento com a revisão inteira confirmada: abre em Guardar, não na revisão', async () => {
    const id = await persistMapeamento(fullyAnsweredSession());

    act(() => navigate(`/session/${id}`));
    render(<App />);

    expect(await screen.findByText(EXPORT_HEADLINE)).toBeDefined();
    expect(screen.queryByRole('region', { name: 'relatório' })).toBeNull();
  });

  it('abrir a concluída vindo de outra sessão: nem a revisão nem as respostas da anterior', async () => {
    // A abre na revisão por direito (uma resposta gravada ainda sem texto), e é dela o
    // texto que serve de marca. B é a concluída, que deve abrir em Guardar.
    const anterior = answeredWithPendingDraft('memória da sessão anterior');
    const a = await persistMapeamento(anterior.state, anterior.voice);
    const b = await persistMapeamento(fullyAnsweredSession('resposta da concluída'));
    const store = appSessionStore();
    await store.complete(b, await store.load(b), {
      manifest: '{"m":1}',
      anchoring: '{"a":1}',
      report: '# r',
    });
    act(() => navigate(`/session/${a}`));
    render(<App />);
    await screen.findByRole('region', { name: 'relatório' });

    // o resumo lento não é a causa — é o agravante que torna a janela visível
    slowSummary.ms = 40;
    const watch = watchWhileRouting('memória da sessão anterior');
    act(() => navigate(`/session/${b}`));

    expect(await screen.findByText(EXPORT_HEADLINE)).toBeDefined();
    const seen = watch();
    expect(seen.review).toBe(false);
    // o que importa mais: conteúdo de UMA sessão não renderiza sob a rota de OUTRA
    expect(seen.needle).toBe(false);
  });

  it('com uma resposta gravada por confirmar, continua abrindo na revisão', async () => {
    const pendente = answeredWithPendingDraft();
    const id = await persistMapeamento(pendente.state, pendente.voice);

    act(() => navigate(`/session/${id}`));
    render(<App />);

    expect(await screen.findByRole('region', { name: 'relatório' })).toBeDefined();
    expect(screen.queryByText(EXPORT_HEADLINE)).toBeNull();
  });

  it('em mapeamento sem nenhuma resposta, abre na entrevista', async () => {
    const id = await persistMapeamento(ensureMapping(completableSession()));

    act(() => navigate(`/session/${id}`));
    render(<App />);

    expect(await screen.findByText(FIRST_QUESTION)).toBeDefined();
    expect(screen.queryByText(EXPORT_HEADLINE)).toBeNull();
  });

  it('de Guardar dá para voltar à entrevista: o clique manda, a hidratação não desfaz', async () => {
    const id = await persistMapeamento(fullyAnsweredSession());

    act(() => navigate(`/session/${id}`));
    render(<App />);
    await screen.findByText(EXPORT_HEADLINE);

    await act(async () => {
      screen.getByText('Conversa').click();
    });
    expect(screen.queryByText(EXPORT_HEADLINE)).toBeNull();
    expect(await screen.findByRole('region', { name: 'relatório' })).toBeDefined();
  });
});
