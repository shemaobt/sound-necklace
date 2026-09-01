import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FixtureSpeechSynthesizer } from '../../../adapters/tts/fixture';
import { type FixtureRecording, FixtureVoiceRecorder } from '../../../adapters/voice/fixture';
import { MemoryVoiceStore } from '../../../adapters/voice/memory-store';
import type { SpeechSynthesizer } from '../../../adapters/tts/types';
import type { VoiceRecorder } from '../../../adapters/voice/types';
import type { ResourcePath } from '../../../contracts';
import {
  buildBeads,
  createSession,
  ensureMapping,
  type Frase,
  questionSequence,
  type ScenePart,
  type SessionState,
  setAnswer,
  type Span,
  voiceAnswerPath,
} from '../../../domain';
import { NavFooterOutlet, NavFooterProvider } from '../../organisms/nav-footer/nav-footer';
import { appStore, sessionStore } from '../../state';
import Conversation from './index';

/**
 * O atalho "é igual à cena anterior" (ENG-671, revisão v4 da Márcia · item 06).
 *
 * Da SEGUNDA cena em diante, as duas perguntas de nível 2 sobre quem e onde
 * oferecem um toque em vez de uma segunda gravação da mesma resposta. O toque
 * escreve uma frase inglesa CONGELADA direto na célula da resposta (decisão do
 * dono, 2026-08-31) — não é um novo tipo de resposta, é uma pessoa confirmando
 * num ato que a resposta é a mesma. "Mudou" não escreve nada: só devolve a
 * gravação de sempre.
 *
 * Os casos andam pela estação de verdade — o que se mede é o que a dupla vê e o
 * que fica guardado na sessão, nunca a máquina por dentro.
 */

const DURATION = 7.5; // 30 contas (0…29)
const BEAD_SEC = 0.25;

/** As duas frases congeladas. Literais aqui de propósito: é o texto que o dono
 *  aprovou, e é ele que precisa ser provado — não o que o código guarda. */
const SAME_PEOPLE = 'Same people as the previous scene.';
const SAME_PLACE = 'Same place as the previous scene.';

function part(overrides: Partial<ScenePart>): ScenePart {
  return {
    part_id: 'PT1',
    span: null,
    locked: false,
    scene_kind: null,
    scene_kind_confidence: null,
    tag_state: 'pending',
    ...overrides,
  };
}

function frase(overrides: Partial<Frase>): Frase {
  return {
    prop_id: 'P1',
    statement: '',
    qa: [],
    span: null,
    part_link: null,
    locked: false,
    ...overrides,
  };
}

function tagged(id: string, span: Span): ScenePart {
  return part({
    part_id: id,
    span,
    locked: true,
    scene_kind: 'BIRTH_SCENE',
    scene_kind_confidence: 'high',
    tag_state: 'tagged',
  });
}

/** Sessão em Conversation com DUAS cenas travadas e duas frases na primeira. */
function mapping(): SessionState {
  const base = createSession({
    durationSec: DURATION,
    beadSec: BEAD_SEC,
    beads: buildBeads(DURATION, BEAD_SEC),
    manifestId: 'fnv1a32:00000000',
    audioFilename: 'historia.wav',
    slug: 'historia',
  });
  return ensureMapping({
    ...base,
    whole: { ...base.whole, confirmed: true },
    partsConfirmed: true,
    mode: 'mapeamento',
    parts: [tagged('PT1', { s: 2, e: 8 }), tagged('PT2', { s: 9, e: 15 })],
    frases: [
      frase({ prop_id: 'P1', span: { s: 2, e: 4 }, part_link: 'PT1', locked: true }),
      frase({ prop_id: 'P2', span: { s: 5, e: 8 }, part_link: 'PT1', locked: true }),
    ],
  });
}

/** Índice da pergunta `k` no bloco de nível 2 da cena `partId`. */
function indexOfL2(state: SessionState, partId: string, k: string): number {
  return questionSequence(state).findIndex(
    (s) => s.level === 2 && s.partId === partId && s.k === k,
  );
}

/** Índice da pergunta `k` no bloco de nível 3 da frase `propId`. */
function indexOfL3(state: SessionState, propId: string, k: string): number {
  return questionSequence(state).findIndex(
    (s) => s.level === 3 && s.propId === propId && s.k === k,
  );
}

/** Índice da pergunta `k` no nível 1. */
function indexOfL1(state: SessionState, k: string): number {
  return questionSequence(state).findIndex((s) => s.level === 1 && s.k === k);
}

/**
 * Abre a conversa PARADA na pergunta `index`: a retomada (ENG-321) segue a última
 * resposta, então respondendo tudo o que vem antes a estação abre exatamente ali.
 * As perguntas anteriores ficam respondidas por TEXTO — é assim que a facilitadora
 * digita, e nenhuma gravação é necessária para chegar à pergunta que interessa.
 */
interface OpenOptions {
  /** "Mãos livres" em vez do modo quieto (ENG-649). */
  handsFree?: boolean;
  speaker?: SpeechSynthesizer;
  recorder?: VoiceRecorder;
  /** Última palavra sobre a sessão, depois da semeadura das respostas anteriores. */
  then?: (state: SessionState) => SessionState;
}

function openAt(index: number, opts: OpenOptions = {}): void {
  let state = mapping();
  const seq = questionSequence(state);
  for (const slot of seq.slice(0, index)) state = setAnswer(state, slot, 'respondido');
  sessionStore.getState().load(opts.then ? opts.then(state) : state);
  render(
    <NavFooterProvider>
      <Conversation speaker={opts.speaker} recorder={opts.recorder} />
      <NavFooterOutlet />
    </NavFooterProvider>,
  );
  // a conversa abre perguntando COMO ela vai andar (ENG-649)
  fireEvent.click(
    screen.getByRole('button', {
      name: opts.handsFree ? /^Mãos livres/ : /^Toque a toque/,
    }),
  );
}

function shortcut(name: RegExp | string): HTMLElement | null {
  return screen.queryByRole('button', { name });
}

function cellOf(partId: string, k: string): string {
  return sessionStore.getState().session?.mapping?.level2[partId]?.[k] ?? '';
}

beforeEach(() => {
  sessionStore.setState({ session: null, review: false, lock: null, online: true });
});
afterEach(() => {
  sessionStore.setState({ session: null, review: false, lock: null, online: true });
});

describe('Conversation — o atalho "é igual à cena anterior" (ENG-671)', () => {
  it('na PRIMEIRA cena não há atalho: não existe cena anterior que tenha perguntado o mesmo', () => {
    const state = mapping();
    openAt(indexOfL2(state, 'PT1', 'quem'));

    expect(shortcut('São as mesmas pessoas')).toBeNull();
    expect(shortcut('Mudou')).toBeNull();
    // e a gravação de sempre continua à vista
    expect(shortcut('Gravar a resposta')).toBeTruthy();
  });

  it('da SEGUNDA cena em diante o atalho aparece na pergunta de quem', () => {
    const state = mapping();
    openAt(indexOfL2(state, 'PT2', 'quem'));

    expect(shortcut('São as mesmas pessoas')).toBeTruthy();
    expect(shortcut('Mudou')).toBeTruthy();
  });

  it('da SEGUNDA cena em diante o atalho aparece na pergunta de onde', () => {
    const state = mapping();
    openAt(indexOfL2(state, 'PT2', 'onde'));

    expect(shortcut('É o mesmo lugar de antes')).toBeTruthy();
    expect(shortcut('Mudou')).toBeTruthy();
  });

  it('enquanto o atalho está de pé, a gravação de sempre não está na tela', () => {
    const state = mapping();
    openAt(indexOfL2(state, 'PT2', 'quem'));

    expect(shortcut('Gravar a resposta')).toBeNull();
  });

  it('nunca aparece numa pergunta de nível 1, nem na que também fala de lugar', () => {
    const state = mapping();
    openAt(indexOfL1(state, 'lugar'));

    expect(shortcut(/São as mesmas pessoas|É o mesmo lugar de antes|^Mudou$/)).toBeNull();
  });

  it('nunca aparece numa pergunta de nível 3, mesmo na SEGUNDA frase', () => {
    const state = mapping();
    openAt(indexOfL3(state, 'P2', 'quem'));

    expect(shortcut(/São as mesmas pessoas|É o mesmo lugar de antes|^Mudou$/)).toBeNull();
  });

  it('não aparece quando a pergunta JÁ tem resposta', async () => {
    const state = mapping();
    const onde = indexOfL2(state, 'PT2', 'onde');
    // responde tudo até `onde` — inclusive o `quem` de PT2, que fica para trás
    openAt(onde);
    expect(shortcut('É o mesmo lugar de antes')).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: '← Anterior' }));

    expect(shortcut('São as mesmas pessoas')).toBeNull();
    expect(shortcut('Mudou')).toBeNull();
  });

  it('tocar "São as mesmas pessoas" escreve a frase inglesa de PESSOAS na célula', async () => {
    const state = mapping();
    openAt(indexOfL2(state, 'PT2', 'quem'));

    await userEvent.click(screen.getByRole('button', { name: 'São as mesmas pessoas' }));

    expect(cellOf('PT2', 'quem')).toBe(SAME_PEOPLE);
  });

  it('tocar "É o mesmo lugar de antes" escreve a frase inglesa de LUGAR na célula', async () => {
    const state = mapping();
    openAt(indexOfL2(state, 'PT2', 'onde'));

    await userEvent.click(screen.getByRole('button', { name: 'É o mesmo lugar de antes' }));

    expect(cellOf('PT2', 'onde')).toBe(SAME_PLACE);
  });

  it('respondido pelo atalho, o atalho sai da tela', async () => {
    const state = mapping();
    openAt(indexOfL2(state, 'PT2', 'quem'));

    await userEvent.click(screen.getByRole('button', { name: 'São as mesmas pessoas' }));

    expect(shortcut('São as mesmas pessoas')).toBeNull();
    expect(shortcut('Mudou')).toBeNull();
  });

  it('"Mudou" não escreve nada e devolve a gravação de sempre', async () => {
    const state = mapping();
    openAt(indexOfL2(state, 'PT2', 'quem'));

    await userEvent.click(screen.getByRole('button', { name: 'Mudou' }));

    expect(cellOf('PT2', 'quem')).toBe('');
    expect(shortcut('São as mesmas pessoas')).toBeNull();
    expect(shortcut('Gravar a resposta')).toBeTruthy();
  });

  /**
   * A condição é "uma cena anterior JÁ FEZ a mesma pergunta" — perguntou, não
   * respondeu (protótipo v4 `_hasPrevSame`). A cena anterior pode ter ficado sem
   * resposta, e o atalho continua sendo oferecido. Fica pinado aqui porque a
   * consequência é visível no artefato: o relatório pode trazer `_(no answer)_` na
   * cena N-1 e "Same people as the previous scene." na cena N.
   */
  it('é oferecido mesmo quando a cena anterior ficou SEM responder a mesma pergunta', () => {
    const state = mapping();
    const anterior = questionSequence(state)[indexOfL2(state, 'PT1', 'quem')]!;
    openAt(indexOfL2(state, 'PT2', 'quem'), {
      then: (s) => setAnswer(s, anterior, ''),
    });

    expect(cellOf('PT1', 'quem')).toBe('');
    expect(shortcut('São as mesmas pessoas')).toBeTruthy();
  });

  /**
   * Dispensado, fica dispensado NA PASSAGEM (protótipo v4 `quickOpen`): sair da
   * pergunta e voltar não desfaz a decisão. Sem isto o atalho reaparecia por cima da
   * gravação de quem já tinha dito que mudou, a cada ida e volta.
   */
  it('dispensado, não volta a se oferecer ao sair e voltar à pergunta', async () => {
    const state = mapping();
    openAt(indexOfL2(state, 'PT2', 'quem'));

    await userEvent.click(screen.getByRole('button', { name: 'Mudou' }));
    await userEvent.click(screen.getByRole('button', { name: 'Próxima pergunta' }));
    await userEvent.click(screen.getByRole('button', { name: '← Anterior' }));

    expect(shortcut('São as mesmas pessoas')).toBeNull();
    expect(shortcut('Gravar a resposta')).toBeTruthy();
  });
});

/**
 * O atalho é uma PERGUNTA feita antes de gravar. Em mãos livres o microfone abre
 * sozinho assim que a pergunta acaba de ser falada (ENG-649) — e abri-lo por baixo
 * do atalho responderia pela dupla, com o atalho sumindo da tela antes de alguém o
 * ter lido. A prova precisa do par: a mesma sessão, a mesma fala, e o microfone
 * abrindo onde não há atalho.
 */
describe('Conversation — em mãos livres o microfone espera o atalho (ENG-671)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    if (appStore.getState().muted) appStore.getState().toggleMuted(); // som LIGADO
  });
  afterEach(() => {
    vi.useRealTimers();
    if (appStore.getState().muted) appStore.getState().toggleMuted();
  });

  /** Drena as idas à porta de voz sem depender de barreira de tempo. */
  async function settle(): Promise<void> {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
  }

  it('sem atalho, o microfone abre sozinho quando a pergunta acaba de ser falada', async () => {
    const speaker = new FixtureSpeechSynthesizer();
    const state = mapping();
    openAt(indexOfL2(state, 'PT1', 'quem'), {
      handsFree: true,
      speaker,
      recorder: new FixtureVoiceRecorder(),
    });
    await settle();

    act(() => speaker.stop()); // a fala terminou
    await settle();

    expect(screen.getByRole('button', { name: 'Parar' })).toBeTruthy();
  });

  it('com o atalho de pé, o microfone NÃO abre — e o atalho continua na tela', async () => {
    const speaker = new FixtureSpeechSynthesizer();
    const state = mapping();
    openAt(indexOfL2(state, 'PT2', 'quem'), {
      handsFree: true,
      speaker,
      recorder: new FixtureVoiceRecorder(),
    });
    await settle();

    act(() => speaker.stop());
    await settle();

    expect(screen.queryByRole('button', { name: 'Parar' })).toBeNull();
    expect(shortcut('São as mesmas pessoas')).toBeTruthy();
  });
});

/**
 * Um gravador cujo `start()` só resolve quando o teste mandar. Abrir o microfone é
 * uma ida à porta — no adapter real inclui o pedido de permissão —, e é DENTRO desse
 * intervalo que a tela decide o que desenhar. Sem poder segurá-lo, a janela em que o
 * atalho podia reaparecer por cima da gravação que começa é invisível ao teste.
 */
class DeferredStartRecorder extends FixtureVoiceRecorder {
  #release: (() => void) | null = null;

  override async start(path: ResourcePath): Promise<FixtureRecording> {
    await new Promise<void>((resolve) => {
      this.#release = resolve;
    });
    return super.start(path);
  }

  /** Solta a abertura que estava segurada. */
  release(): void {
    this.#release?.();
    this.#release = null;
  }
}

/**
 * O que só se vê com uma porta de voz de verdade ligada: a pergunta que JÁ TEM
 * gravação, a que está reabrindo o microfone, e o microfone que abre sozinho.
 */
describe('Conversation — o atalho diante de uma gravação (ENG-671)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    if (appStore.getState().muted) appStore.getState().toggleMuted(); // som LIGADO
  });
  afterEach(() => {
    vi.useRealTimers();
    if (appStore.getState().muted) appStore.getState().toggleMuted();
  });

  /** Drena as idas à porta de voz sem depender de barreira de tempo. */
  async function settle(): Promise<void> {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
  }

  /** Uma sessão em que a pergunta `index` já tem resposta gravada. */
  async function storeWithAnswerAt(index: number): Promise<MemoryVoiceStore> {
    const store = new MemoryVoiceStore();
    const slot = questionSequence(mapping())[index]!;
    await store.put(voiceAnswerPath(slot), new Uint8Array([1, 2, 3]));
    return store;
  }

  it('a pergunta que já tem resposta GRAVADA não oferece o atalho', async () => {
    const state = mapping();
    const quem = indexOfL2(state, 'PT2', 'quem');
    const recorder = new FixtureVoiceRecorder(await storeWithAnswerAt(quem));
    openAt(quem, { recorder });
    await settle();

    expect(screen.getByRole('button', { name: 'Ouvir a resposta' })).toBeTruthy();
    expect(shortcut('São as mesmas pessoas')).toBeNull();
  });

  it('regravar não faz o atalho reaparecer por cima da gravação que começa', async () => {
    const state = mapping();
    const quem = indexOfL2(state, 'PT2', 'quem');
    const recorder = new DeferredStartRecorder(await storeWithAnswerAt(quem));
    openAt(quem, { recorder });
    await settle();

    fireEvent.click(screen.getByRole('button', { name: 'Gravar de novo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Apagar e gravar de novo' }));
    await settle(); // o microfone está ABRINDO — e a célula desta pergunta está vazia

    expect(shortcut('São as mesmas pessoas')).toBeNull();

    recorder.release();
    await settle();
    expect(screen.getByRole('button', { name: 'Parar' })).toBeTruthy();
  });

  it('em mãos livres, responder pelo atalho NÃO abre o microfone em seguida', async () => {
    const speaker = new FixtureSpeechSynthesizer();
    const state = mapping();
    openAt(indexOfL2(state, 'PT2', 'quem'), {
      handsFree: true,
      speaker,
      recorder: new FixtureVoiceRecorder(),
    });
    await settle();
    act(() => speaker.stop()); // a fala terminou: sem o atalho, o microfone abriria
    await settle();

    fireEvent.click(screen.getByRole('button', { name: 'São as mesmas pessoas' }));
    await settle();

    expect(cellOf('PT2', 'quem')).toBe(SAME_PEOPLE);
    // a sala NÃO passa a ser gravada por cima da resposta que acabou de ser dada
    expect(screen.queryByRole('button', { name: 'Parar' })).toBeNull();
  });
});
