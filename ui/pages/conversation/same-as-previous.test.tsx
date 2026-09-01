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
  L2_Q,
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
function mapping(scenes = 2): SessionState {
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
    parts: Array.from({ length: scenes }, (_, i) =>
      tagged(`PT${i + 1}`, { s: 2 + i * 7, e: 8 + i * 7 }),
    ),
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
  /** Quantas cenas travadas a sessão tem (padrão 2). */
  scenes?: number;
}

function openAt(index: number, opts: OpenOptions = {}): void {
  let state = mapping(opts.scenes);
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

/** O texto do chip do eco, ou '' quando ele não está na tela. */
function chipText(): string {
  return document.querySelector('.cds-conversation-stage-same-previous')?.textContent ?? '';
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
   * ENG-678 (decisão do orquestrador, 01/09): onde NÃO HÁ o que ecoar, o atalho não
   * é oferecido. "É igual ao de antes" não quer dizer nada quando não existe "antes"
   * registrado, e botões pedindo confirmação de uma repetição invisível são um chute.
   * De brinde: o relatório não pode mais trazer "Same people as the previous scene."
   * apontando para uma célula que lê `_(no answer)_`.
   *
   * Isto INVERTE o comportamento da primeira leva da ENG-671, que oferecia o atalho
   * sempre que uma cena anterior tivesse PERGUNTADO o mesmo, respondido ou não.
   */
  it('a cena anterior SEM resposta nenhuma não oferece atalho nem chip', () => {
    const state = mapping();
    const anterior = questionSequence(state)[indexOfL2(state, 'PT1', 'quem')]!;
    openAt(indexOfL2(state, 'PT2', 'quem'), {
      then: (s) => setAnswer(s, anterior, ''),
    });

    expect(cellOf('PT1', 'quem')).toBe('');
    expect(shortcut('São as mesmas pessoas')).toBeNull();
    expect(shortcut('Mudou')).toBeNull();
    expect(screen.queryByText(/na cena anterior/)).toBeNull();
    // e a gravação de sempre está lá, como em qualquer pergunta sem atalho
    expect(shortcut('Gravar a resposta')).toBeTruthy();
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
 * Um gravador cujo `has()` só responde quando o teste mandar. A pergunta "a cena
 * anterior tem gravação?" é uma ida à rede no modo real, e é DENTRO dessa espera que
 * a tela decide se oferece o atalho — afirmar "não há nada a ecoar" antes da resposta
 * chegar é a mesma mentira que o esqueleto da onda existe para não contar.
 */
class DeferredHasRecorder extends FixtureVoiceRecorder {
  #release: (() => void) | null = null;
  readonly #deferred: string;

  /** Segura APENAS `deferred`: a procura da pergunta atual segue resolvendo, senão a
   *  tela ficaria em `checking` e o atalho sumiria por outro motivo que não este. */
  constructor(store: MemoryVoiceStore, deferred: string) {
    super(store);
    this.#deferred = deferred;
  }

  override async has(path: ResourcePath): Promise<boolean> {
    if (path === this.#deferred) {
      await new Promise<void>((resolve) => {
        this.#release = resolve;
      });
    }
    return super.has(path);
  }

  release(): void {
    this.#release?.();
    this.#release = null;
  }
}

/** Tem a gravação, mas a reprodução falha — a rede caiu entre o `has` e o `play`. */
class FailingPlayRecorder extends FixtureVoiceRecorder {
  override async play(): Promise<void> {
    throw new Error('sem rede');
  }
}

/**
 * O que só se vê com uma porta de voz de verdade ligada: a pergunta que JÁ TEM
 * gravação, a que está reabrindo o microfone, o microfone que abre sozinho, e a
 * resposta anterior que existe em VOZ e ainda não tem palavras (ENG-678).
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

  /**
   * O caso COMUM da entrevista de verdade: ela é só-voz, e o texto das respostas só
   * chega na revisão, depois da conversa. Então a cena anterior quase sempre tem uma
   * gravação e nenhuma palavra — e o chip tem de dizer isso sem inventar o conteúdo.
   */
  it('a cena anterior respondida só por VOZ oferece o atalho, e o chip não inventa palavras', async () => {
    const state = mapping();
    const seq = questionSequence(state);
    const anterior = seq[indexOfL2(state, 'PT1', 'quem')]!;
    const store = new MemoryVoiceStore();
    await store.put(voiceAnswerPath(anterior), new Uint8Array([1, 2, 3]));

    openAt(indexOfL2(state, 'PT2', 'quem'), {
      recorder: new FixtureVoiceRecorder(store),
      then: (s) => setAnswer(s, anterior, ''),
    });
    await settle();

    expect(chipText()).toContain('gravada');
    expect(chipText()).not.toMatch(/[“"]/); // nada entre aspas: não há palavras
    expect(shortcut('São as mesmas pessoas')).toBeTruthy();
  });

  it('enquanto ainda se procura a gravação anterior, nada é oferecido', async () => {
    const state = mapping();
    const seq = questionSequence(state);
    const anterior = seq[indexOfL2(state, 'PT1', 'quem')]!;
    const store = new MemoryVoiceStore();
    await store.put(voiceAnswerPath(anterior), new Uint8Array([1, 2, 3]));
    const recorder = new DeferredHasRecorder(store, voiceAnswerPath(anterior));

    openAt(indexOfL2(state, 'PT2', 'quem'), {
      recorder,
      then: (s) => setAnswer(s, anterior, ''),
    });
    await settle();

    // a procura DESTA pergunta já respondeu — o microfone está à mão
    expect(screen.getByRole('button', { name: 'Gravar a resposta' })).toBeTruthy();
    expect(shortcut('São as mesmas pessoas')).toBeNull();
    expect(screen.queryByText(/na cena anterior/)).toBeNull();

    recorder.release();
    await settle();
    expect(shortcut('São as mesmas pessoas')).toBeTruthy();
  });

  /** Uma sessão com a resposta de `quem` da CENA 1 gravada e nada mais. */
  async function voiceInScene1(): Promise<{
    store: MemoryVoiceStore;
    open: (r: VoiceRecorder) => void;
  }> {
    const state = mapping();
    const anterior = questionSequence(state)[indexOfL2(state, 'PT1', 'quem')]!;
    const store = new MemoryVoiceStore();
    await store.put(voiceAnswerPath(anterior), new Uint8Array([1, 2, 3]));
    return {
      store,
      open: (recorder) =>
        openAt(indexOfL2(state, 'PT2', 'quem'), {
          recorder,
          speaker: new FixtureSpeechSynthesizer(),
          then: (s) => setAnswer(s, anterior, ''),
        }),
    };
  }

  const OUVIR_ANTERIOR = 'Ouvir a resposta da cena anterior';
  const PAUSAR_ANTERIOR = 'Pausar a resposta da cena anterior';

  /**
   * Quem ouve NÃO LÊ. Durante a entrevista o eco quase sempre é uma gravação sem
   * palavras, e "ver o que a cena anterior respondeu" só pode significar OUVI-LA —
   * senão o chip promete um contexto que não entrega justamente onde a decisão é
   * tomada. A porta que toca é a mesma que responde `has` (adapters/voice/types.ts).
   */
  it('o chip de voz oferece ouvir a resposta anterior, e tocar acende o pausar', async () => {
    const { store, open } = await voiceInScene1();
    open(new FixtureVoiceRecorder(store));
    await settle();

    fireEvent.click(screen.getByRole('button', { name: OUVIR_ANTERIOR }));
    await settle();

    expect(screen.getByRole('button', { name: PAUSAR_ANTERIOR })).toBeTruthy();
  });

  it('o mesmo controle pausa a resposta anterior', async () => {
    const { store, open } = await voiceInScene1();
    open(new FixtureVoiceRecorder(store));
    await settle();

    fireEvent.click(screen.getByRole('button', { name: OUVIR_ANTERIOR }));
    await settle();
    fireEvent.click(screen.getByRole('button', { name: PAUSAR_ANTERIOR }));
    await settle();

    expect(screen.getByRole('button', { name: OUVIR_ANTERIOR })).toBeTruthy();
  });

  /** A recusa se responde ao ouvido (§9.4) — e o controle volta ao repouso, sem
   *  prometer uma reprodução que não aconteceu. */
  it('falha ao tocar não deixa o chip dizendo que está tocando', async () => {
    const { store, open } = await voiceInScene1();
    open(new FailingPlayRecorder(store));
    await settle();

    fireEvent.click(screen.getByRole('button', { name: OUVIR_ANTERIOR }));
    await settle();

    expect(screen.getByRole('button', { name: OUVIR_ANTERIOR })).toBeTruthy();
    expect(screen.queryByRole('button', { name: PAUSAR_ANTERIOR })).toBeNull();
  });

  /**
   * Chegar na pergunta a faz ser FALADA (ENG-280). Tocar a resposta anterior por
   * cima da guia seriam duas vozes no mesmo ar — e a que interessa é a gravada.
   */
  it('tocar a resposta anterior cala a pergunta que estava sendo falada', async () => {
    const { store, open } = await voiceInScene1();
    open(new FixtureVoiceRecorder(store));
    await settle();
    expect(screen.getByRole('button', { name: 'Pausar a pergunta' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: OUVIR_ANTERIOR }));
    await settle();

    expect(screen.getByRole('button', { name: 'Ouvir a pergunta' })).toBeTruthy();
  });

  it('a cena anterior sem texto E sem gravação não oferece nada', async () => {
    const state = mapping();
    const anterior = questionSequence(state)[indexOfL2(state, 'PT1', 'quem')]!;
    openAt(indexOfL2(state, 'PT2', 'quem'), {
      recorder: new FixtureVoiceRecorder(),
      then: (s) => setAnswer(s, anterior, ''),
    });
    await settle();

    expect(shortcut('São as mesmas pessoas')).toBeNull();
    expect(screen.queryByText(/na cena anterior/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Gravar a resposta' })).toBeTruthy();
  });
});

/**
 * O chip que mostra O QUE a cena anterior respondeu, antes de perguntar se é o mesmo
 * (ENG-678). Sem ele, a dupla confirma uma repetição sem ver o que se repete — e quem
 * ouve não lê. O protótipo chumba «Noemi e Rute» ali e nunca diz de onde viria o dado
 * real; aqui o dado é a célula da cena anterior, e onde não há dado não há chip.
 */
describe('Conversation — o chip da resposta anterior (ENG-678)', () => {
  /** O placeholder do protótipo. Nunca pode chegar à tela, venha de onde vier. */
  const AMOSTRA_DO_PROTOTIPO = /Noemi e Rute|no campo de colheita/;

  it('ecoa a resposta de TEXTO que a cena anterior deu à mesma pergunta', () => {
    const state = mapping();
    const anterior = questionSequence(state)[indexOfL2(state, 'PT1', 'quem')]!;
    openAt(indexOfL2(state, 'PT2', 'quem'), {
      then: (s) => setAnswer(s, anterior, 'as duas mulheres e os ceifeiros'),
    });

    expect(chipText()).toContain('as duas mulheres e os ceifeiros');
    expect(shortcut('São as mesmas pessoas')).toBeTruthy();
  });

  it('ecoa a resposta da MESMA pergunta, não a da pergunta vizinha', () => {
    const state = mapping();
    const seq = questionSequence(state);
    openAt(indexOfL2(state, 'PT2', 'onde'), {
      then: (s) =>
        setAnswer(
          setAnswer(s, seq[indexOfL2(state, 'PT1', 'quem')]!, 'as duas mulheres'),
          seq[indexOfL2(state, 'PT1', 'onde')]!,
          'na estrada de Moabe',
        ),
    });

    expect(chipText()).toContain('na estrada de Moabe');
    expect(chipText()).not.toContain('as duas mulheres');
  });

  /**
   * "Na cena anterior" é a ÚLTIMA que perguntou, não a primeira. Com três cenas o
   * protótipo não distingue as duas leituras (ele só quer um booleano), e aqui a
   * diferença é o conteúdo do chip: ecoar a cena 1 na cena 3 seria mostrar à dupla
   * uma resposta que não é a de antes, e pedir que confirmem a repetição dela.
   */
  it('com três cenas, ecoa a cena IMEDIATAMENTE anterior', () => {
    const state = mapping(3);
    const seq = questionSequence(state);
    openAt(indexOfL2(state, 'PT3', 'quem'), {
      scenes: 3,
      then: (s) =>
        setAnswer(
          setAnswer(s, seq[indexOfL2(state, 'PT1', 'quem')]!, 'Noemi sozinha'),
          seq[indexOfL2(state, 'PT2', 'quem')]!,
          'as duas mulheres e os ceifeiros',
        ),
    });

    expect(chipText()).toContain('as duas mulheres e os ceifeiros');
    expect(chipText()).not.toContain('Noemi sozinha');
  });

  it('o chip de TEXTO não oferece controle de ouvir: não há gravação a tocar', () => {
    const state = mapping();
    const anterior = questionSequence(state)[indexOfL2(state, 'PT1', 'quem')]!;
    openAt(indexOfL2(state, 'PT2', 'quem'), {
      then: (s) => setAnswer(s, anterior, 'as duas mulheres e os ceifeiros'),
    });

    expect(chipText()).toContain('as duas mulheres e os ceifeiros');
    expect(shortcut('Ouvir a resposta da cena anterior')).toBeNull();
  });

  it('nunca mostra o texto de amostra do protótipo', () => {
    const state = mapping();
    openAt(indexOfL2(state, 'PT2', 'quem'));

    expect(screen.queryByText(AMOSTRA_DO_PROTOTIPO)).toBeNull();
  });
});

/**
 * O eco de um eco (correção de revisão). Uma cena respondida PELO ATALHO guarda na
 * célula a frase inglesa congelada — que é valor de ARTEFATO. Ecoá-la na cena
 * seguinte punha inglês na tela de quem ouve, sob uma UI em português, e ainda por
 * cima não informava nada ("a resposta anterior foi: igual à anterior") nem podia ser
 * tocada, porque uma resposta de atalho não tem gravação.
 *
 * A célula que É a frase congelada não é resposta: é ponteiro. A busca continua para
 * trás até a última resposta de verdade — e a cadeia sempre termina, porque a primeira
 * cena nunca tem atalho.
 */
describe('Conversation — o eco atravessa cenas respondidas pelo próprio atalho (ENG-678)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    if (appStore.getState().muted) appStore.getState().toggleMuted();
  });
  afterEach(() => {
    vi.useRealTimers();
    if (appStore.getState().muted) appStore.getState().toggleMuted();
  });

  async function settle(): Promise<void> {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
  }

  /** Célula de `quem` da cena `partId`, dentro do `then` do `openAt`. */
  const write = (state: SessionState, scenes: number, partId: string, text: string): SessionState =>
    setAnswer(
      state,
      questionSequence(mapping(scenes))[indexOfL2(mapping(scenes), partId, 'quem')]!,
      text,
    );

  it('cena 1 por VOZ e cena 2 pelo atalho: a cena 3 ecoa e TOCA a resposta da cena 1', async () => {
    const state = mapping(3);
    const cena1 = questionSequence(state)[indexOfL2(state, 'PT1', 'quem')]!;
    const store = new MemoryVoiceStore();
    await store.put(voiceAnswerPath(cena1), new Uint8Array([1, 2, 3]));

    openAt(indexOfL2(state, 'PT3', 'quem'), {
      scenes: 3,
      recorder: new FixtureVoiceRecorder(store),
      then: (s) => write(write(s, 3, 'PT1', ''), 3, 'PT2', SAME_PEOPLE),
    });
    await settle();

    expect(chipText()).toContain('gravada');
    // e o que toca é a gravação da CENA 1: é a única que existe no armazenamento,
    // então tocar a da cena 2 (que não tem nenhuma) nunca acenderia o pausar
    fireEvent.click(screen.getByRole('button', { name: 'Ouvir a resposta da cena anterior' }));
    await settle();
    expect(screen.getByRole('button', { name: 'Pausar a resposta da cena anterior' })).toBeTruthy();
  });

  it('cena 1 por TEXTO e cenas 2 e 3 pelo atalho: a cena 4 ecoa o texto da cena 1', () => {
    const state = mapping(4);
    openAt(indexOfL2(state, 'PT4', 'quem'), {
      scenes: 4,
      then: (s) =>
        write(
          write(write(s, 4, 'PT1', 'as duas mulheres e os ceifeiros'), 4, 'PT2', SAME_PEOPLE),
          4,
          'PT3',
          SAME_PEOPLE,
        ),
    });

    expect(chipText()).toContain('as duas mulheres e os ceifeiros');
  });

  /**
   * O invariante, e não um caso: NENHUMA frase congelada do roteiro pode aparecer no
   * chip. A lista sai do próprio `domain/` — se alguém acrescentar uma terceira, ela
   * entra nesta guarda sozinha, e se o vazamento voltar por outro caminho ele cai aqui.
   */
  it('o chip nunca mostra uma frase congelada do roteiro', () => {
    const state = mapping(4);
    openAt(indexOfL2(state, 'PT4', 'quem'), {
      scenes: 4,
      then: (s) =>
        write(
          write(write(s, 4, 'PT1', 'as duas mulheres e os ceifeiros'), 4, 'PT2', SAME_PEOPLE),
          4,
          'PT3',
          SAME_PEOPLE,
        ),
    });

    const congeladas = L2_Q.map((q) => q.same_as_previous_en).filter(
      (frase): frase is string => frase !== undefined,
    );
    expect(congeladas.length).toBeGreaterThan(0);
    for (const frase of congeladas) expect(chipText()).not.toContain(frase);
  });

  it('cadeia inteira sem nenhuma resposta real: nem chip nem atalho', async () => {
    const state = mapping(3);
    openAt(indexOfL2(state, 'PT3', 'quem'), {
      scenes: 3,
      recorder: new FixtureVoiceRecorder(),
      then: (s) => write(write(s, 3, 'PT1', ''), 3, 'PT2', SAME_PEOPLE),
    });
    await settle();

    expect(chipText()).toBe('');
    expect(shortcut('São as mesmas pessoas')).toBeNull();
    expect(screen.getByRole('button', { name: 'Gravar a resposta' })).toBeTruthy();
  });
});
