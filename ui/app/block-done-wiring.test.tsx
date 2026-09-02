import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { toSessionDto } from '../../contracts';
import {
  buildBeads,
  createSession,
  type Frase,
  type ScenePart,
  type SessionState,
  type Span,
} from '../../domain';
import { BREAK_AFTER_MS } from '../organisms';
import { goalStore, sessionStore } from '../state';
import { App } from './App';
import { navigate } from './router';
import { appSessionStore } from './session-adapter';

/**
 * A tela de fim de bloco dentro do app de verdade (ENG-651). O organismo prova a
 * cópia, o teclado e o foco; aqui prova-se O GATILHO — que ela sobe no limite da
 * Triagem e no fim da Rever (ENG-725), que a última frase leva à Rever e NÃO a uma
 * tela cheia, que concluir é um ato consciente (dois toques com cena na dúvida ou
 * sem tipo), que "Olhar de novo" devolve à Rever com o panorama intacto, e que
 * reabrir uma sessão passada dos limites não repete a tela.
 */

const TRIAGEM_HEADLINE = 'As cenas todas têm nome.';
const HISTORIA_HEADLINE = 'A história está completa.';
const DASHBOARD = 'Suas histórias';
/** A quinta estação (ENG-725): o título da Rever é a prova de que se chegou nela. */
const REVER = 'Olhem a história inteira';
const CONCLUDE = 'Concluir a história';
const OLHAR_DE_NOVO = 'Olhar de novo';
const WARN =
  'Algumas cenas ficaram na dúvida ou sem nome — dá para seguir assim mesmo. Toque de novo para concluir.';
/** A outra tela cheia que pode querer o ecrã ao mesmo tempo (ENG-650). */
const PAUSA = 'Já foi bastante coisa boa por agora.';
/** A terceira tela cheia da família (ENG-653). */
const META = 'A meta de hoje está no cordão.';
/** O texto próprio de cada estação de destino — a prova de onde a pessoa caiu.
 *  Casam por trecho: a instrução das Frases ganha uma segunda frase quando a cena
 *  já tem frases prontas. */
const FRASES = 'Divida a cena: toque no colar onde esta frase começa e termina.';
/** Triagem com tudo já classificado abre no seu momento de revisão. */
const TRIAGEM_STATION = 'Todas as cenas classificadas.';

const DURATION = 7.5; // 30 contas (0…29)
const BEAD_SEC = 0.25;

function base(): SessionState {
  const seed = createSession({
    durationSec: DURATION,
    beadSec: BEAD_SEC,
    beads: buildBeads(DURATION, BEAD_SEC),
    manifestId: 'fnv1a32:deadbeef',
    audioFilename: 'historia.wav',
    slug: 'historia',
  });
  return { ...seed, whole: { ...seed.whole, confirmed: true }, partsConfirmed: true };
}

function productive(id: string, span: Span): ScenePart {
  return {
    part_id: id,
    span,
    locked: true,
    scene_kind: 'BIRTH_SCENE',
    scene_kind_confidence: 'high',
    tag_state: 'tagged',
  };
}

function phrase(id: string, span: Span, part: string): Frase {
  return { prop_id: id, statement: '', qa: [], span, part_link: part, locked: true };
}

/** Triagem com tudo classificado: o portão "Continuar →" está aberto. */
function triageReady(): SessionState {
  return {
    ...base(),
    mode: 'triagem',
    parts: [productive('PT1', { s: 0, e: 14 }), productive('PT2', { s: 15, e: 29 })],
    current: { layer: 'parts', index: -1 },
  };
}

/**
 * Segmentação com DUAS cenas produtivas. `active` escolhe qual está em foco: a
 * segunda é a última produtiva (fecha o bloco), a primeira não (não fecha nada).
 * A frase travada não cobre a cena inteira — sem isso a estação entra no seu
 * momento de revisão e troca o rótulo do botão.
 */
function segmenting(active: 'PT1' | 'PT2'): SessionState {
  return {
    ...base(),
    mode: 'segmentacao',
    parts: [productive('PT1', { s: 0, e: 14 }), productive('PT2', { s: 15, e: 29 })],
    activeSceneId: active,
    frases: [phrase('P1', { s: 0, e: 4 }, 'PT1'), phrase('P2', { s: 15, e: 19 }, 'PT2')],
    current: { layer: 'frases', index: -1 },
  };
}

/**
 * Sessão que o domínio já encerrou: os dois limites ficaram para trás. Ela reabre
 * na Rever (ENG-725). A história é LIMPA — toda cena com tipo, nenhuma na dúvida.
 */
function concludedClean(): SessionState {
  return {
    ...base(),
    mode: 'concluida',
    parts: [productive('PT1', { s: 0, e: 29 })],
    frases: [phrase('P1', { s: 0, e: 4 }, 'PT1')],
  };
}

/** Sessão encerrada com uma cena FORA DOS TIPOS: concluir pede dois toques. */
function concludedDoubtful(): SessionState {
  return {
    ...base(),
    mode: 'concluida',
    parts: [
      productive('PT1', { s: 0, e: 14 }),
      {
        part_id: 'PT2',
        span: { s: 15, e: 29 },
        locked: true,
        scene_kind: null,
        scene_kind_confidence: null,
        tag_state: 'none_fit',
      },
    ],
    frases: [phrase('P1', { s: 0, e: 4 }, 'PT1')],
  };
}

async function persist(state: SessionState): Promise<string> {
  const store = appSessionStore();
  const summary = await store.create({
    projectId: 'p1',
    storyName: 'Historia',
    storySlug: 'historia',
    audioId: 'a1',
    granularityLevel: 'medium',
    beadSec: BEAD_SEC,
    manifestId: 'fnv1a32:deadbeef',
    pipelineConsent: true,
  });
  store.autosave(
    summary.id,
    toSessionDto(state, {
      granularityLevel: 'medium',
      bucketAudioId: 'a1',
      pipelineConsent: true,
    }),
  );
  await store.flush(summary.id);
  return summary.id;
}

/** Abre a sessão no app, espera a estação em que ela salvou aparecer, e devolve o id. */
async function open(state: SessionState, landmark: string): Promise<string> {
  const id = await persist(state);
  act(() => navigate(`/session/${id}`));
  render(<App />);
  await screen.findByText(landmark, { exact: false });
  return id;
}

beforeEach(() => {
  window.history.replaceState({}, '', '/');
  sessionStore.setState(sessionStore.getInitialState(), true);
  goalStore.setState(goalStore.getInitialState(), true);
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('O fim de bloco no shell (ENG-651)', () => {
  it('confirmar a triagem fecha o bloco da Triagem e o primário entrega as Frases', async () => {
    await open(triageReady(), TRIAGEM_STATION);

    await userEvent.click(screen.getByRole('button', { name: 'Continuar →' }));

    expect(await screen.findByRole('heading', { name: TRIAGEM_HEADLINE })).toBeDefined();

    await userEvent.click(screen.getByRole('button', { name: 'Seguir para as frases' }));

    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: TRIAGEM_HEADLINE })).toBeNull();
    });
    expect(screen.getByText(FRASES, { exact: false })).toBeDefined();
  });

  /**
   * ENG-725 — fechar a última cena produtiva não sobe tela nenhuma: a Rever é a
   * estação seguinte, e ela é que fecha a história.
   */
  it('confirmar a ÚLTIMA cena produtiva leva à Rever, sem tela cheia', async () => {
    await open(segmenting('PT2'), FRASES);

    await userEvent.click(screen.getByRole('button', { name: 'Já segmentei todas as cenas →' }));

    expect(await screen.findByRole('heading', { name: REVER })).toBeDefined();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('heading', { name: HISTORIA_HEADLINE })).toBeNull();
  });

  it('na Rever, com cena na dúvida ou sem tipo, o primeiro toque em Concluir avisa e não conclui; o segundo conclui', async () => {
    await open(concludedDoubtful(), REVER);

    await userEvent.click(screen.getByRole('button', { name: CONCLUDE }));

    expect(screen.getByText(WARN)).toBeDefined();
    expect(screen.queryByRole('heading', { name: HISTORIA_HEADLINE })).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: CONCLUDE }));

    expect(await screen.findByRole('heading', { name: HISTORIA_HEADLINE })).toBeDefined();
  });

  it('na Rever, com a história limpa, o primeiro toque em Concluir conclui direto', async () => {
    await open(concludedClean(), REVER);

    await userEvent.click(screen.getByRole('button', { name: CONCLUDE }));

    expect(await screen.findByRole('heading', { name: HISTORIA_HEADLINE })).toBeDefined();
    expect(screen.queryByText(WARN)).toBeNull();
  });

  it('concluída, a tela oliva tem duas ações, e "Olhar de novo" devolve à Rever com o panorama intacto', async () => {
    await open(concludedClean(), REVER);
    const beadsBefore = document.querySelectorAll('.cds-necklace-bead').length;
    expect(beadsBefore).toBe(30);

    await userEvent.click(screen.getByRole('button', { name: CONCLUDE }));
    await screen.findByRole('heading', { name: HISTORIA_HEADLINE });
    expect(screen.getByRole('button', { name: 'Voltar às histórias' })).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Guardar e descansar' })).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: OLHAR_DE_NOVO }));

    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: HISTORIA_HEADLINE })).toBeNull();
    });
    expect(screen.getByRole('heading', { name: REVER })).toBeDefined();
    expect(document.querySelectorAll('.cds-necklace-bead')).toHaveLength(beadsBefore);
  });

  /**
   * A meta de hoje se cumpre ao chegar à Rever — a barra enche —, mas a celebração
   * NÃO sobe por cima do panorama (ENG-725): a Rever existe para a dupla ver a
   * história inteira, e o fecho celebratório já é a tela oliva. A meta fica
   * cumprida em silêncio.
   */
  it('na Rever, a meta cumprida fica em silêncio: nenhuma celebração cobre o panorama', async () => {
    goalStore.getState().chooseGoal('wholeStory');
    await open(concludedClean(), REVER);

    expect(screen.queryByText(META)).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: CONCLUDE }));
    await screen.findByRole('heading', { name: HISTORIA_HEADLINE });
    expect(screen.queryByText(META)).toBeNull();
  });

  it('concluída, a tela oliva mostra uma pérola por cena, com a confiança de cada uma', async () => {
    await open(concludedDoubtful(), REVER);
    await userEvent.click(screen.getByRole('button', { name: CONCLUDE }));
    await userEvent.click(screen.getByRole('button', { name: CONCLUDE }));
    await screen.findByRole('heading', { name: HISTORIA_HEADLINE });

    const discs = screen.getByRole('dialog').querySelectorAll('.cds-scene-pearl-disc');
    expect([...discs].map((d) => d.getAttribute('data-fill'))).toEqual(['high', 'none']);
  });

  it('concluída, "Voltar às histórias" leva ao painel', async () => {
    await open(concludedClean(), REVER);
    await userEvent.click(screen.getByRole('button', { name: CONCLUDE }));
    await screen.findByRole('heading', { name: HISTORIA_HEADLINE });

    await userEvent.click(screen.getByRole('button', { name: 'Voltar às histórias' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: DASHBOARD })).toBeDefined();
    });
    expect(screen.queryByRole('heading', { name: HISTORIA_HEADLINE })).toBeNull();
  });

  /**
   * ENG-702 — o bug relatado: a sessão concluída na Rever nunca chegava a marcar
   * `completed` no armazenamento, e o painel a mostrava "Em andamento" para sempre.
   * Prova o efeito no ARMAZENAMENTO, não só na tela (o painel ler esse status
   * corretamente é o que `ui/pages/dashboard/dashboard.test.tsx` já prova, isolado).
   */
  it('concluir na Rever marca a sessão como concluída no armazenamento, não só na tela', async () => {
    const id = await open(concludedClean(), REVER);

    expect((await appSessionStore().get(id)).status).toBe('in_progress');

    await userEvent.click(screen.getByRole('button', { name: CONCLUDE }));
    await screen.findByRole('heading', { name: HISTORIA_HEADLINE });

    expect((await appSessionStore().get(id)).status).toBe('completed');
  });

  it('dois toques seguidos em Concluir (história limpa) não quebram nada — o servidor é idempotente', async () => {
    const id = await open(concludedClean(), REVER);

    const button = screen.getByRole('button', { name: CONCLUDE });
    fireEvent.click(button);
    fireEvent.click(button);

    await screen.findByRole('heading', { name: HISTORIA_HEADLINE });
    expect(screen.queryByRole('alert')).toBeNull();
    await waitFor(async () => {
      expect((await appSessionStore().get(id)).status).toBe('completed');
    });
  });

  /**
   * §9.4 — nunca punir: uma falha de rede não deixa a pessoa presa nem mostra a
   * tela de parabéns mentindo. O erro orienta e o mesmo toque tenta de novo.
   */
  it('se concluir falhar (rede fora), a Rever não mostra a tela de parabéns mentindo — orienta e deixa tentar de novo', async () => {
    const id = await open(concludedClean(), REVER);
    const completeSpy = vi
      .spyOn(appSessionStore(), 'complete')
      .mockRejectedValueOnce(new Error('rede fora'));

    await userEvent.click(screen.getByRole('button', { name: CONCLUDE }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Não consegui concluir');
    expect(screen.queryByRole('heading', { name: HISTORIA_HEADLINE })).toBeNull();
    // ainda na Rever — o mesmo botão segue de pé para tentar de novo
    expect(screen.getByRole('heading', { name: REVER })).toBeDefined();

    await userEvent.click(screen.getByRole('button', { name: CONCLUDE }));

    expect(await screen.findByRole('heading', { name: HISTORIA_HEADLINE })).toBeDefined();
    expect((await appSessionStore().get(id)).status).toBe('completed');
    completeSpy.mockRestore();
  });

  it('"Olhar de novo" devolve à Rever sem desconcluir a sessão no armazenamento', async () => {
    const id = await open(concludedClean(), REVER);
    await userEvent.click(screen.getByRole('button', { name: CONCLUDE }));
    await screen.findByRole('heading', { name: HISTORIA_HEADLINE });
    expect((await appSessionStore().get(id)).status).toBe('completed');

    await userEvent.click(screen.getByRole('button', { name: OLHAR_DE_NOVO }));

    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: HISTORIA_HEADLINE })).toBeNull();
    });
    expect((await appSessionStore().get(id)).status).toBe('completed');
  });

  it('confirmar uma cena que NÃO é a última produtiva não fecha bloco nenhum', async () => {
    await open(segmenting('PT1'), FRASES);

    await userEvent.click(screen.getByRole('button', { name: 'Pronto com esta cena →' }));

    // a barreira é a estação ter mesmo avançado de cena, não um tempo de espera
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Já segmentei todas as cenas →' })).toBeDefined();
    });
    expect(screen.queryByRole('heading', { name: HISTORIA_HEADLINE })).toBeNull();
    expect(screen.queryByRole('heading', { name: TRIAGEM_HEADLINE })).toBeNull();
  });

  it('"Guardar e descansar" volta ao painel de histórias', async () => {
    await open(triageReady(), TRIAGEM_STATION);
    await userEvent.click(screen.getByRole('button', { name: 'Continuar →' }));
    await screen.findByRole('heading', { name: TRIAGEM_HEADLINE });

    await userEvent.click(screen.getByRole('button', { name: 'Guardar e descansar' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: DASHBOARD })).toBeDefined();
    });
    expect(screen.queryByRole('heading', { name: TRIAGEM_HEADLINE })).toBeNull();
  });

  it('reabrir uma sessão já concluída abre na Rever e não repete tela nenhuma', async () => {
    await open(concludedClean(), REVER);

    expect(screen.queryByRole('heading', { name: TRIAGEM_HEADLINE })).toBeNull();
    expect(screen.queryByRole('heading', { name: HISTORIA_HEADLINE })).toBeNull();
  });

  it('reabrir uma sessão parada ENTRE os dois limites também não repete a tela', async () => {
    await open(segmenting('PT1'), FRASES);

    expect(screen.queryByRole('heading', { name: TRIAGEM_HEADLINE })).toBeNull();
    expect(screen.queryByRole('heading', { name: HISTORIA_HEADLINE })).toBeNull();
  });

  /**
   * Precedência entre as duas telas DERIVADAS. No fluxo normal elas não colidem: a
   * meta cruza a marca quando o trabalho da estação termina, o que é ANTES do
   * clique que fecha o bloco. O que as torna simultâneas é as duas estarem adiadas
   * pela mesma pressa e serem soltas juntas — e é isso que se monta aqui.
   *
   * O fim de bloco vem primeiro (protótipo L1022/L1030: `pausaShow` e `metaShow`
   * guardam em `!blockDone`, e o `blockDone` não guarda em nada), e a meta vem
   * logo atrás — adiada, não perdida. Este teste também é a rede contra oscilação:
   * se as duas derivações se olhassem, este render entraria em laço infinito.
   */
  it('com o fim de bloco na tela, a meta alcançada espera a vez — e não se perde', async () => {
    await open(triageReady(), TRIAGEM_STATION);
    await userEvent.click(screen.getByRole('button', { name: 'Continuar →' }));
    expect(await screen.findByRole('heading', { name: TRIAGEM_HEADLINE })).toBeDefined();

    // a meta se cumpre com o fim de bloco de pé: uma tela cheia de cada vez
    act(() => goalStore.getState().chooseGoal('triage'));
    expect(screen.queryByText(META)).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Seguir para as frases' }));

    expect(await screen.findByText(META)).toBeDefined();
  });

  it('enquanto o fim de bloco está na tela, a pausa sugerida espera a vez', async () => {
    // relógio falso ANTES da montagem: o poll da pausa é criado na montagem, e um
    // intervalo nascido no relógio real não anda com `advanceTimersByTime`.
    // `shouldAdvanceTime` mantém o tempo real por baixo, para a hidratação resolver.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await open(triageReady(), TRIAGEM_STATION);
    await act(async () => {
      screen.getByRole('button', { name: 'Continuar →' }).click();
    });
    await screen.findByRole('heading', { name: TRIAGEM_HEADLINE });

    // o limiar da pausa passa INTEIRO por baixo da tela de fim de bloco
    act(() => {
      vi.advanceTimersByTime(BREAK_AFTER_MS + 60_000);
    });

    expect(screen.queryByText(PAUSA)).toBeNull();
    expect(screen.getByRole('heading', { name: TRIAGEM_HEADLINE })).toBeDefined();
  });
});
