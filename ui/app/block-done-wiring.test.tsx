import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { toSessionDto } from '../../contracts';
import {
  buildBeads,
  createSession,
  ensureMapping,
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
 * cópia, o teclado e o foco; aqui prova-se O GATILHO — que ela sobe exatamente nos
 * dois limites estruturais, que o botão primário entrega a estação já chegada, que
 * "Guardar e descansar" volta ao painel, e que reabrir uma sessão passada do limite
 * não repete a tela.
 */

const TRIAGEM_HEADLINE = 'As cenas todas têm nome.';
const SEGMENTACAO_HEADLINE = 'Todas as frases no cordão.';
const DASHBOARD = 'Suas histórias';
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
 * Sessão que o domínio já pôs em `mapeamento`: os dois limites ficaram para trás.
 * Desde o corte de escopo (ENG-689) ela reabre nas Frases — não há estação depois.
 */
function pastBothBoundaries(): SessionState {
  return ensureMapping({
    ...base(),
    mode: 'mapeamento',
    parts: [productive('PT1', { s: 0, e: 29 })],
    frases: [phrase('P1', { s: 0, e: 4 }, 'PT1')],
  });
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
    toSessionDto(
      state,
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

/** Abre a sessão no app e espera a estação em que ela salvou aparecer. */
async function open(state: SessionState, landmark: string): Promise<void> {
  const id = await persist(state);
  act(() => navigate(`/session/${id}`));
  render(<App />);
  await screen.findByText(landmark, { exact: false });
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
   * ENG-689 — a Segmentação é o fim do fluxo. A tela que fecha o bloco fecha
   * também a sessão: não há estação atrás dela para o primário entregar, e a
   * única saída é o painel. O trabalho já está salvo pelo autosave.
   */
  it('confirmar a ÚLTIMA cena produtiva encerra a sessão e a saída é o painel', async () => {
    await open(segmenting('PT2'), FRASES);

    await userEvent.click(screen.getByRole('button', { name: 'Já segmentei todas as cenas →' }));

    expect(await screen.findByRole('heading', { name: SEGMENTACAO_HEADLINE })).toBeDefined();

    await userEvent.click(screen.getByRole('button', { name: 'Voltar às histórias' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: DASHBOARD })).toBeDefined();
    });
    expect(screen.queryByRole('heading', { name: SEGMENTACAO_HEADLINE })).toBeNull();
  });

  it('o fim da Segmentação não oferece uma segunda saída para o mesmo lugar', async () => {
    await open(segmenting('PT2'), FRASES);

    await userEvent.click(screen.getByRole('button', { name: 'Já segmentei todas as cenas →' }));
    await screen.findByRole('heading', { name: SEGMENTACAO_HEADLINE });

    expect(screen.queryByRole('button', { name: 'Guardar e descansar' })).toBeNull();
  });

  it('confirmar uma cena que NÃO é a última produtiva não fecha bloco nenhum', async () => {
    await open(segmenting('PT1'), FRASES);

    await userEvent.click(screen.getByRole('button', { name: 'Pronto com esta cena →' }));

    // a barreira é a estação ter mesmo avançado de cena, não um tempo de espera
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Já segmentei todas as cenas →' })).toBeDefined();
    });
    expect(screen.queryByRole('heading', { name: SEGMENTACAO_HEADLINE })).toBeNull();
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

  it('reabrir uma sessão já passada dos dois limites não repete a tela', async () => {
    await open(pastBothBoundaries(), FRASES);

    expect(screen.queryByRole('heading', { name: TRIAGEM_HEADLINE })).toBeNull();
    expect(screen.queryByRole('heading', { name: SEGMENTACAO_HEADLINE })).toBeNull();
  });

  it('reabrir uma sessão parada ENTRE os dois limites também não repete a tela', async () => {
    await open(segmenting('PT1'), FRASES);

    expect(screen.queryByRole('heading', { name: TRIAGEM_HEADLINE })).toBeNull();
    expect(screen.queryByRole('heading', { name: SEGMENTACAO_HEADLINE })).toBeNull();
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
