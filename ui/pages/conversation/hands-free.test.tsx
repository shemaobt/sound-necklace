import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FixtureSpeechSynthesizer } from '../../../adapters/tts/fixture';
import { FixtureVoiceRecorder } from '../../../adapters/voice/fixture';
import { MemoryVoiceStore } from '../../../adapters/voice/memory-store';
import type { Recording, Unsubscribe, VoiceRecorder } from '../../../adapters/voice/types';
import type { ResourcePath } from '../../../contracts';
import {
  buildBeads,
  createSession,
  ensureMapping,
  questionSequence,
  type SessionState,
  voiceAnswerPath,
} from '../../../domain';
import i18n from '../../i18n';
import { NavFooterOutlet, NavFooterProvider } from '../../organisms/nav-footer/nav-footer';
import { appStore, sessionStore } from '../../state';
import { SPEECH_CEILING_MS, SPEECH_WATCHDOG_MS } from './hands-free';
import Conversation from './index';

/**
 * "Mãos livres" e "Toque a toque" (ENG-649): antes da entrevista a dupla escolhe
 * COMO a conversa anda, e pode trocar a qualquer momento pela pílula do cabeçalho.
 *
 * O que estes testes afirmam é o que uma pessoa diante da tela vive: o pedido do
 * modo aparece e some ao escolher; em mãos livres a pergunta é falada, o microfone
 * abre sozinho e a próxima chega sozinha; em toque a toque NADA disso acontece sem
 * um toque. A fala é medida pela porta de voz de verdade e o microfone pelo que o
 * botão diz — com UMA exceção, marcada onde está: abrir o microfone duas vezes por
 * cima de uma gravação em curso não muda um pixel, e lá a observação é no porto.
 */

const DURATION = 7.5; // 30 contas (0…29)
const BEAD_SEC = 0.25;

/** Sessão em Conversa: história+cenas confirmadas, uma cena travada, sem frases. */
function mapping(): SessionState {
  const base = createSession({
    durationSec: DURATION,
    beadSec: BEAD_SEC,
    beads: buildBeads(DURATION, BEAD_SEC),
    manifestId: 'fnv1a32:00000000',
    audioFilename: 'historia.wav',
    slug: 'historia',
  });
  return {
    ...base,
    whole: { ...base.whole, confirmed: true },
    partsConfirmed: true,
    mode: 'mapeamento',
    parts: [
      {
        part_id: 'PT1',
        span: { s: 2, e: 8 },
        locked: true,
        scene_kind: 'BIRTH_SCENE',
        scene_kind_confidence: 'high',
        tag_state: 'tagged',
      },
    ],
    frases: [],
  };
}

function load(state: SessionState): void {
  sessionStore.getState().load(state);
}

/** O caminho canônico da pergunta de índice `i` do roteiro desta sessão. */
function pathAt(state: SessionState, i: number): string {
  const seq = questionSequence(ensureMapping(state));
  return voiceAnswerPath(seq[i]!);
}

function totalQuestions(state: SessionState): number {
  return questionSequence(ensureMapping(state)).length;
}

function questionText(): string {
  return document.querySelector('.cds-question-card-text')?.textContent ?? '';
}

function renderConversation(ui: ReactElement): ReturnType<typeof render> {
  return render(
    <NavFooterProvider>
      {ui}
      <NavFooterOutlet />
    </NavFooterProvider>,
  );
}

/**
 * Deixa as idas à porta de voz (`has`/`duration`) assentarem sem depender de
 * barreira de tempo: com o relógio falso, esperar por tempo real é justamente onde
 * esta suíte ficaria intermitente. Drena as microtarefas pendentes sem adivinhar
 * quantas são — um número fixo de flushes calaria por baixo se a cadeia crescesse,
 * e a falha pareceria bug de produto.
 */
async function settle(): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

const AUTO_ADVANCE_MS = 2600;

/** Passa o tempo do avanço automático, com folga. */
async function passCountdown(): Promise<void> {
  await act(async () => {
    vi.advanceTimersByTime(AUTO_ADVANCE_MS + 100);
    await Promise.resolve();
  });
  await settle();
}

/**
 * Um toque. `fireEvent`, e não `userEvent`: com o relógio falso — que esta suíte
 * PRECISA ter, porque o que ela mede é uma espera de 2,6 s — o userEvent espera
 * por temporizadores próprios e o teste inteiro trava.
 */
async function touch(el: HTMLElement): Promise<void> {
  fireEvent.click(el);
  await settle();
}

/** A linha da espera, da MESMA fonte que a tela lê — não um pedaço de cópia colado. */
const ESPERA = (): string => i18n.t('conversationMode.autoAdvance');

const HANDS_FREE = /^Mãos livres/;
const TOUCH_BY_TOUCH = /^Toque a toque/;

async function choose(mode: RegExp): Promise<void> {
  await touch(screen.getByRole('button', { name: mode }));
}

/**
 * Um VoiceRecorder de verdade (o fixture da porta) que conta quantas vezes o
 * microfone foi ABERTO. Abrir duas vezes por cima de uma gravação em curso não
 * muda um pixel da tela — some com o que a pessoa está dizendo, e essa perda é
 * exatamente o que a contagem torna observável.
 */
class CountingRecorder implements VoiceRecorder {
  readonly #inner: FixtureVoiceRecorder;
  opened = 0;

  constructor(store = new MemoryVoiceStore()) {
    this.#inner = new FixtureVoiceRecorder(store);
  }

  async start(path: ResourcePath): Promise<Recording> {
    this.opened += 1;
    return this.#inner.start(path);
  }
  play(path: ResourcePath): Promise<void> {
    return this.#inner.play(path);
  }
  duration(path: ResourcePath): Promise<number> {
    return this.#inner.duration(path);
  }
  stopPlayback(): void {
    this.#inner.stopPlayback();
  }
  has(path: ResourcePath): Promise<boolean> {
    return this.#inner.has(path);
  }
  onPlayback(cb: (path: ResourcePath | null) => void): Unsubscribe {
    return this.#inner.onPlayback(cb);
  }
  delete(path: ResourcePath): Promise<void> {
    return this.#inner.delete(path);
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  sessionStore.setState({ session: null, review: false, lock: null, online: true });
  if (appStore.getState().muted) appStore.getState().toggleMuted(); // som LIGADO por padrão
});
afterEach(() => {
  vi.useRealTimers();
  sessionStore.setState({ session: null, review: false, lock: null, online: true });
  if (appStore.getState().muted) appStore.getState().toggleMuted();
});

describe('Conversa — a escolha do modo abre a entrevista (ENG-649)', () => {
  it('chegar sem modo escolhido pede o modo, e o pedido cobre a pergunta', async () => {
    load(mapping());
    renderConversation(<Conversation />);
    await settle();

    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByRole('button', { name: HANDS_FREE })).toBeTruthy();
    expect(screen.getByRole('button', { name: TOUCH_BY_TOUCH })).toBeTruthy();
    // enquanto ninguém escolheu, a entrevista não está alcançável
    expect(screen.queryByRole('button', { name: 'Gravar a resposta' })).toBeNull();
  });

  it('escolher "Mãos livres" fecha o pedido e entrega a pergunta', async () => {
    load(mapping());
    renderConversation(<Conversation />);
    await settle();

    await choose(HANDS_FREE);

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(questionText()).not.toBe('');
  });
});

describe('Conversa — mãos livres: nada precisa ser tocado (ENG-649)', () => {
  it('o microfone abre sozinho quando a pergunta acaba de ser falada', async () => {
    const tts = new FixtureSpeechSynthesizer();
    const recorder = new FixtureVoiceRecorder();
    load(mapping());
    renderConversation(<Conversation speaker={tts} recorder={recorder} />);
    await settle();

    await choose(HANDS_FREE);
    // enquanto a pergunta está sendo falada o microfone ESPERA — gravar por cima
    // da voz do guia grava o guia
    expect(screen.queryByRole('button', { name: 'Parar' })).toBeNull();

    act(() => tts.stop()); // a fala terminou
    await settle();

    expect(screen.getByRole('button', { name: 'Parar' })).toBeTruthy();
  });

  it('sem voz disponível o microfone abre assim mesmo — não há fala para esperar', async () => {
    const recorder = new FixtureVoiceRecorder();
    load(mapping());
    renderConversation(<Conversation recorder={recorder} />);
    await settle();

    await choose(HANDS_FREE);

    expect(screen.getByRole('button', { name: 'Parar' })).toBeTruthy();
  });

  it('a próxima pergunta chega sozinha depois que a gravação para, e é vista chegando', async () => {
    const recorder = new FixtureVoiceRecorder();
    load(mapping());
    renderConversation(<Conversation recorder={recorder} />);
    await settle();
    await choose(HANDS_FREE);
    const primeira = questionText();

    await touch(screen.getByRole('button', { name: 'Parar' }));

    // a espera é VISÍVEL antes de acontecer
    expect(screen.getByText(ESPERA())).toBeTruthy();
    expect(questionText()).toBe(primeira);

    await passCountdown();

    expect(questionText()).not.toBe(primeira);
  });

  it('um toque durante a espera cancela a chegada da próxima', async () => {
    const recorder = new FixtureVoiceRecorder();
    load(mapping());
    renderConversation(<Conversation recorder={recorder} />);
    await settle();
    await choose(HANDS_FREE);
    const primeira = questionText();

    await touch(screen.getByRole('button', { name: 'Parar' }));
    // tocar o microfone de novo é um ato deliberado: a espera morre com ele
    await touch(screen.getByRole('button', { name: 'Gravar a resposta' }));

    await passCountdown();

    expect(questionText()).toBe(primeira);
    expect(screen.queryByText(ESPERA())).toBeNull();
  });
});

/**
 * O teste mais importante do conjunto. Ele não diz que o toque a toque é MUDO — a
 * pergunta é falada nos dois modos (decisão do dono, 2026-08-29), porque quem não lê
 * depende dessa voz igual nos dois. Ele diz o que o modo quieto garante de verdade,
 * que é o que o próprio cartão promete: toque para GRAVAR e toque para SEGUIR.
 * Nada grava sozinho, e nada empurra ninguém adiante.
 */
describe('Conversa — toque a toque: fala, e ainda assim não grava nem anda (ENG-649)', () => {
  it('a pergunta é falada ao chegar, e mesmo assim nada grava nem avança sem um toque', async () => {
    const tts = new FixtureSpeechSynthesizer();
    const recorder = new FixtureVoiceRecorder();
    load(mapping());
    renderConversation(<Conversation speaker={tts} recorder={recorder} />);
    await settle();

    await choose(TOUCH_BY_TOUCH);
    const primeira = questionText();

    // 1. chegar na pergunta A FALA — a voz não é do modo, é do app
    expect(tts.spoken).toEqual([{ text: primeira, lang: 'pt-BR' }]);

    // 2. e ainda assim o microfone não abre sozinho, nem quando a fala termina
    act(() => tts.stop());
    await settle();
    expect(screen.queryByRole('button', { name: 'Parar' })).toBeNull();

    // 3. nem depois de uma resposta gravada à mão nada avança sozinho
    await touch(screen.getByRole('button', { name: 'Gravar a resposta' }));
    await touch(screen.getByRole('button', { name: 'Parar' }));

    expect(screen.queryByText(ESPERA())).toBeNull();
    await passCountdown();

    expect(questionText()).toBe(primeira);
  });
});

describe('Conversa — a pílula troca o modo no meio da conversa (ENG-649)', () => {
  it('a pílula diz o modo em que se está e leva ao outro', async () => {
    load(mapping());
    renderConversation(<Conversation />);
    await settle();
    await choose(TOUCH_BY_TOUCH);

    const pill = screen.getByRole('button', { name: /trocar$/ });
    expect(pill.textContent).toContain('toque a toque');

    await touch(pill);

    expect(screen.getByRole('button', { name: /trocar$/ }).textContent).toContain('mãos livres');
  });

  it('voltar para "toque a toque" mata a espera já armada', async () => {
    const recorder = new FixtureVoiceRecorder();
    load(mapping());
    renderConversation(<Conversation recorder={recorder} />);
    await settle();
    await choose(HANDS_FREE);
    const primeira = questionText();

    await touch(screen.getByRole('button', { name: 'Parar' }));
    expect(screen.getByText(ESPERA())).toBeTruthy();

    await touch(screen.getByRole('button', { name: /trocar$/ }));

    await passCountdown();

    expect(questionText()).toBe(primeira);
  });
});

describe('Conversa — o microfone automático conhece os seus limites (ENG-649)', () => {
  it('não abre por cima de uma resposta que já existe', async () => {
    const store = new MemoryVoiceStore();
    const state = mapping();
    await store.put(pathAt(state, 0) as ResourcePath, Uint8Array.of(1, 2, 3));
    const recorder = new FixtureVoiceRecorder(store);
    const tts = new FixtureSpeechSynthesizer();
    load(state);
    renderConversation(<Conversation speaker={tts} recorder={recorder} />);
    await settle();

    await choose(HANDS_FREE);
    act(() => tts.stop());
    await settle();

    expect(screen.queryByRole('button', { name: 'Parar' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Ouvir a resposta' })).toBeTruthy();
  });

  it('não abre uma segunda vez por cima da gravação em curso', async () => {
    const recorder = new CountingRecorder();
    const tts = new FixtureSpeechSynthesizer();
    load(mapping());
    renderConversation(<Conversation speaker={tts} recorder={recorder} />);
    await settle();

    await choose(HANDS_FREE);
    // a pessoa não esperou a pergunta acabar e já começou a responder
    await touch(screen.getByRole('button', { name: 'Gravar a resposta' }));
    expect(recorder.opened).toBe(1);

    act(() => tts.stop()); // a fala termina COM a gravação correndo
    await settle();

    expect(recorder.opened).toBe(1);
    expect(screen.getByRole('button', { name: 'Parar' })).toBeTruthy();
  });

  it('a última pergunta não empurra ninguém para o relatório sozinha', async () => {
    const state = mapping();
    const last = totalQuestions(state) - 1;
    const recorder = new FixtureVoiceRecorder();
    load(state);
    // a entrevista foi retomada na ÚLTIMA pergunta (tudo antes dela já respondido)
    renderConversation(
      <Conversation
        recorder={recorder}
        voicePaths={() => Array.from({ length: last }, (_, i) => pathAt(state, i))}
      />,
    );
    await settle();
    await choose(HANDS_FREE);
    const ultima = questionText();

    await touch(screen.getByRole('button', { name: 'Parar' }));
    await passCountdown();

    expect(questionText()).toBe(ultima);
    expect(screen.queryByRole('region', { name: i18n.t('conversation.reportAria') })).toBeNull();
  });
});

/**
 * O microfone que abre sozinho tem de saber a diferença entre "a pergunta acabou de
 * ser dita" e "alguém mandou calar". As duas chegam pela porta como a mesma coisa —
 * a fala parou —, e tratá-las igual transforma o gesto de pedir silêncio no gesto
 * que abre o microfone. Estes são os casos em que ele NÃO pode abrir.
 */
describe('Conversa — mandar calar não é a pergunta ter terminado (ENG-649)', () => {
  it('pausar a pergunta não abre o microfone', async () => {
    const tts = new FixtureSpeechSynthesizer();
    const recorder = new FixtureVoiceRecorder();
    load(mapping());
    renderConversation(<Conversation speaker={tts} recorder={recorder} />);
    await settle();
    await choose(HANDS_FREE);

    await touch(screen.getByRole('button', { name: 'Pausar a pergunta' }));

    expect(screen.queryByRole('button', { name: 'Parar' })).toBeNull();
  });

  it('desligar o som no meio da pergunta não abre o microfone', async () => {
    const tts = new FixtureSpeechSynthesizer();
    const recorder = new FixtureVoiceRecorder();
    load(mapping());
    renderConversation(<Conversation speaker={tts} recorder={recorder} />);
    await settle();
    await choose(HANDS_FREE);

    await act(async () => appStore.getState().toggleMuted());
    await settle();

    expect(screen.queryByRole('button', { name: 'Parar' })).toBeNull();
  });

  it('a voz que nunca começa não deixa o mãos livres parado para sempre', async () => {
    // Uma porta que aceita falar e não emite nada — é o que o adapter real faz
    // quando o navegador recusa tocar o áudio sozinho (política de autoplay).
    const muda = {
      speak: () => {},
      stop: () => {},
      onSpeaking: () => () => {},
    };
    const recorder = new FixtureVoiceRecorder();
    load(mapping());
    renderConversation(<Conversation speaker={muda} recorder={recorder} />);
    await settle();
    await choose(HANDS_FREE);
    expect(screen.queryByRole('button', { name: 'Parar' })).toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(SPEECH_WATCHDOG_MS + 100);
      await Promise.resolve();
    });
    await settle();

    expect(screen.getByRole('button', { name: 'Parar' })).toBeTruthy();
  });

  /**
   * O caso que o e2e encontrou e um probe confirmou: no Chromium headless a porta
   * real emite `speak` e `start` e NUNCA `end`. Um piso sobre "começou?" não alcança
   * isso — a fala começou —, e o mãos livres ficava esperando para sempre.
   */
  it('a voz que começa e nunca termina também não deixa o mãos livres parado', async () => {
    let emit: ((speaking: boolean) => void) | undefined;
    const travada = {
      speak: () => emit?.(true), // começa…
      stop: () => {},
      onSpeaking: (cb: (speaking: boolean) => void) => {
        emit = cb;
        return () => {
          emit = undefined;
        };
      },
    };
    const recorder = new FixtureVoiceRecorder();
    load(mapping());
    renderConversation(<Conversation speaker={travada} recorder={recorder} />);
    await settle();
    await choose(HANDS_FREE);

    // …e não termina: o piso do "começou?" não vale mais, e nada acontece
    await act(async () => {
      vi.advanceTimersByTime(SPEECH_WATCHDOG_MS + 100);
      await Promise.resolve();
    });
    await settle();
    expect(screen.queryByRole('button', { name: 'Parar' })).toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(SPEECH_CEILING_MS + 100);
      await Promise.resolve();
    });
    await settle();

    expect(screen.getByRole('button', { name: 'Parar' })).toBeTruthy();
  });

  it('a resposta que não conseguiu ser guardada não reabre o microfone sozinha', async () => {
    const tts = new FixtureSpeechSynthesizer();
    const store = new MemoryVoiceStore();
    const recorder = new FixtureVoiceRecorder(store);
    // o stop embute o PUT no modo real: aqui ele falha, como uma rede caindo
    const quebrado: VoiceRecorder = {
      ...recorder,
      start: async () => ({
        onLevel: () => () => {},
        stop: () => Promise.reject(new Error('rede caiu')),
        cancel: () => {},
      }),
      has: (p: ResourcePath) => recorder.has(p),
      play: (p: ResourcePath) => recorder.play(p),
      duration: (p: ResourcePath) => recorder.duration(p),
      stopPlayback: () => recorder.stopPlayback(),
      onPlayback: (cb) => recorder.onPlayback(cb),
      delete: (p: ResourcePath) => recorder.delete(p),
    };
    load(mapping());
    renderConversation(<Conversation speaker={tts} recorder={quebrado} />);
    await settle();
    await choose(HANDS_FREE);
    // a pessoa não esperou a pergunta acabar e gravou; a pergunta termina de ser
    // dita durante a gravação, e então o salvamento falha
    await touch(screen.getByRole('button', { name: 'Gravar a resposta' }));
    act(() => tts.stop());
    await settle();
    await touch(screen.getByRole('button', { name: 'Parar' }));

    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Parar' })).toBeNull();
  });
});

/**
 * A espera pela próxima pergunta morre com QUALQUER ato deliberado. Estes são os
 * dois caminhos que não passam pelo mesmo lugar que os outros: o ▶ do trecho chega
 * ao palco como um nó pronto, e a confirmação de regravar nasce dentro do palco.
 */
describe('Conversa — a espera morre com o ato, venha ele por onde vier (ENG-649)', () => {
  it('ouvir o trecho durante a espera cancela a chegada da próxima', async () => {
    const recorder = new FixtureVoiceRecorder();
    const player = {
      toggle: vi.fn(),
      play: vi.fn(),
      playEdge: vi.fn(),
      stop: vi.fn(),
      state: { key: null, playing: false, paused: false },
      onHead: vi.fn(() => () => {}),
    };
    load(mapping());
    renderConversation(<Conversation recorder={recorder} player={player} />);
    await settle();
    await choose(HANDS_FREE);
    const primeira = questionText();

    await touch(screen.getByRole('button', { name: 'Parar' }));
    await touch(screen.getByRole('button', { name: '▶ Ouvir a história' }));

    await passCountdown();

    expect(questionText()).toBe(primeira);
  });

  it('pedir para regravar durante a espera cancela a chegada e a pergunta fica de pé', async () => {
    const recorder = new FixtureVoiceRecorder();
    load(mapping());
    renderConversation(<Conversation recorder={recorder} />);
    await settle();
    await choose(HANDS_FREE);
    const primeira = questionText();

    await touch(screen.getByRole('button', { name: 'Parar' }));
    await touch(screen.getByRole('button', { name: 'Gravar de novo' }));
    expect(screen.getByRole('alertdialog')).toBeTruthy();

    await passCountdown();

    // a conversa não andou por baixo de quem estava decidindo
    expect(questionText()).toBe(primeira);
    expect(screen.getByRole('alertdialog')).toBeTruthy();
  });
});

/**
 * O pedido do modo é a QUARTA tela de largura inteira que pode querer a chegada à
 * conversa: o fim de bloco (ENG-651), a meta do dia (ENG-653) e a sugestão de pausa
 * (ENG-650) já disputam esse instante pelo `busy` do shell. A ficha desta issue já
 * dizia — "nunca enquanto uma espera ou uma tela de fim de bloco estiver de pé" —,
 * e quando ela foi escrita nenhuma das três existia ainda.
 *
 * A precedência não é arbitrária: o fim de bloco fala do trabalho que ACABOU, e o
 * pedido do modo, do que vai começar. Perguntar como conversar por cima da tela que
 * comemora as frases troca a ordem dos dois momentos — e, pior, tapa a única ação
 * que sai dela.
 */
describe('Conversa — o pedido do modo espera as telas do shell (ENG-649)', () => {
  it('com uma sobreposição do shell de pé, o pedido não aparece', async () => {
    load(mapping());
    renderConversation(<Conversation overlayBusy />);
    await settle();

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('button', { name: HANDS_FREE })).toBeNull();
  });

  it('quando ela sai, o pedido chega — a espera é adiamento, não perda', async () => {
    load(mapping());
    const view = renderConversation(<Conversation overlayBusy />);
    await settle();
    expect(screen.queryByRole('button', { name: HANDS_FREE })).toBeNull();

    view.rerender(
      <NavFooterProvider>
        <Conversation />
        <NavFooterOutlet />
      </NavFooterProvider>,
    );
    await settle();

    expect(screen.getByRole('button', { name: HANDS_FREE })).toBeTruthy();
  });

  it('o shell fica sabendo que o pedido está de pé, para não subir por cima dele', async () => {
    const aberto: boolean[] = [];
    load(mapping());
    renderConversation(<Conversation onModePickerChange={(o) => aberto.push(o)} />);
    await settle();
    expect(aberto.at(-1)).toBe(true);

    await choose(TOUCH_BY_TOUCH);

    expect(aberto.at(-1)).toBe(false);
  });
});
