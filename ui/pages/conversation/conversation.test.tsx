import { act, render, screen } from '@testing-library/react';
import { renderStation } from '../../organisms/nav-footer/testing';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Player } from '../../../adapters/audio';
import type { Transcriber } from '../../../adapters/stt/types';
import { FixtureSpeechSynthesizer } from '../../../adapters/tts/fixture';
import { FixtureVoiceRecorder } from '../../../adapters/voice/fixture';
import { MemoryVoiceStore } from '../../../adapters/voice/memory-store';
import type { VoiceRecorder } from '../../../adapters/voice/types';
import {
  buildBeads,
  createSession,
  ensureMapping,
  type Frase,
  L1_Q,
  L2_Q,
  L3_Q,
  questionSequence,
  type ScenePart,
  type SessionState,
  setAnswer,
  type Span,
  voiceAnswerPath,
} from '../../../domain';
import i18n from '../../i18n';
import { appStore, sessionStore } from '../../state';
import { markSkipped } from './answered';
import conversationCss from './conversation.css?raw';
import Conversation from './index';

/**
 * A estação Conversa (Conversation, PRD v2 §8.7, redesign §6.6): uma pergunta por
 * tela, na ordem exata do domínio (11 L1 → 5 L2 por cena travada incl. none_fit →
 * 5 L3 por frase de cena produtiva), com o ▶ do span relevante, a resposta por
 * voz pela porta VoiceRecorder, o canal digitado da facilitadora, os marcadores de
 * papel das perguntas conduzidas e a navegação que cruza os níveis (primeira L1 →
 * Segmentação; última pergunta → relatório). Os testes afirmam o COMPORTAMENTO
 * delegado ao domínio (`questionSequence`, `setAnswer`, `voiceAnswerPath`) e o
 * minimalismo do ouvinte (§9.2).
 */

const DURATION = 7.5; // 30 contas (0…29)
const BEAD_SEC = 0.25;

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

function tagged(id: string, span: Span, kind = 'BIRTH_SCENE'): ScenePart {
  return part({
    part_id: id,
    span,
    locked: true,
    scene_kind: kind,
    scene_kind_confidence: 'high',
    tag_state: 'tagged',
  });
}

function noneFit(id: string, span: Span): ScenePart {
  return part({ part_id: id, span, locked: true, scene_kind: null, tag_state: 'none_fit' });
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

/** Sessão em Conversation: história+cenas confirmadas, 1 cena tagged + 1 none_fit, 2 frases. */
function mapping(overrides: Partial<SessionState> = {}): SessionState {
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
    parts: [tagged('PT1', { s: 2, e: 8 }), noneFit('PT2', { s: 9, e: 15 })],
    frases: [
      frase({ prop_id: 'P1', span: { s: 2, e: 4 }, part_link: 'PT1', locked: true }),
      frase({ prop_id: 'P2', span: { s: 5, e: 8 }, part_link: 'PT1', locked: true }),
    ],
    ...overrides,
  };
}

function load(state: SessionState): void {
  sessionStore.getState().load(state);
}

function spyPlayer(): Player {
  return {
    toggle: vi.fn(),
    play: vi.fn(),
    playEdge: vi.fn(),
    stop: vi.fn(),
    state: { key: null, playing: false, paused: false },
    onHead: vi.fn(() => () => {}),
  };
}

function questionText(): string {
  return document.querySelector('.cds-question-card-text')?.textContent ?? '';
}

async function next(): Promise<void> {
  await userEvent.click(screen.getByRole('button', { name: 'Próxima pergunta' }));
}

beforeEach(() => {
  sessionStore.setState({ session: null, review: false, lock: null, online: true });
});
afterEach(() => {
  sessionStore.setState({ session: null, review: false, lock: null, online: true });
});

describe('Conversation — resume where the interview stopped (ENG-321)', () => {
  it('reopens on the first unanswered question when saved text answers exist', () => {
    let state = ensureMapping(mapping());
    const seq = questionSequence(state);
    for (const slot of seq.slice(0, 3)) state = setAnswer(state, slot, 'answered');

    load(state);
    renderStation(<Conversation />);
    expect(questionText()).toBe(seq[3]!.question.q);
  });

  it('a persisted voice answer counts too (voice-only interview)', () => {
    const state = ensureMapping(mapping());
    const seq = questionSequence(state);
    const voice = seq.slice(0, 5).map((s) => voiceAnswerPath(s));

    load(state);
    renderStation(<Conversation voicePaths={() => voice} />);
    expect(questionText()).toBe(seq[5]!.question.q);
  });

  /**
   * ENG-367 (decisão do dono): com tudo respondido não há o que perguntar, e reabrir na
   * última pergunta convidava a regravar uma resposta que já existia. A retomada vai
   * para a revisão — ou para a espera dela, se a transcrição ainda estiver rodando.
   */
  it('with everything answered, reopens on the review — never back on the interview', () => {
    const state = ensureMapping(mapping());
    const seq = questionSequence(state);
    const voice = seq.map((s) => voiceAnswerPath(s));

    load(state);
    const view = renderStation(<Conversation voicePaths={() => voice} />);

    expect(view.container.querySelector('.cds-conversation-question')).toBeNull();
    expect(screen.queryByRole('button', { name: /Próxima pergunta/i })).toBeNull();
  });

  it('with no answer at all, starts on the first question', () => {
    load(mapping());
    renderStation(<Conversation />);
    expect(questionText()).toBe(questionSequence(ensureMapping(mapping()))[0]!.question.q);
  });
});

/**
 * A SKIPPED question is an empty answer, not a pending one: not recording is itself
 * the decision. Resuming on the FIRST hole pinned the session to the beginning — with
 * audio recorded up to the 40th, reopening landed on the 2nd, every time, with dozens
 * of clicks between the facilitator and where they had stopped. The cursor now follows
 * the LAST answer, which is where the conversation actually stopped; skipped questions
 * stay reachable through "← Anterior" and the bead thread.
 */
describe('Conversation — resume follows the last answer, not the first hole', () => {
  it('with questions skipped in the middle, reopens AFTER the last answered one', () => {
    const state = ensureMapping(mapping());
    const seq = questionSequence(state);
    const voice = [seq[0]!, seq[2]!, seq[5]!].map((s) => voiceAnswerPath(s));

    load(state);
    render(<Conversation voicePaths={() => voice} />);

    expect(questionText()).toBe(seq[6]!.question.q);
  });

  it('with the LAST question answered, reopens the review even with holes behind', () => {
    const state = ensureMapping(mapping());
    const seq = questionSequence(state);
    const voice = [seq[1]!, seq[seq.length - 1]!].map((s) => voiceAnswerPath(s));

    load(state);
    const view = render(<Conversation voicePaths={() => voice} />);

    expect(view.container.querySelector('.cds-conversation-question')).toBeNull();
    expect(screen.queryByRole('button', { name: /Próxima pergunta/i })).toBeNull();
  });

  /**
   * The pre-review preparation (ENG-337) was only ever triggered by `goNext`. A session
   * REOPENED straight into the review never triggered it, and the screen sat on
   * "bringing the audio back" forever — a dead end. With the rule above sending more
   * sessions there, mount has to prepare on its own.
   */
  it('reopening straight into the review, preparation runs — the wait is not a dead end', async () => {
    const state = ensureMapping(mapping());
    const seq = questionSequence(state);
    const voice = seq.map((s) => voiceAnswerPath(s));

    load(state);
    // renderStation: a saída da prévia é o Avançar do RODAPÉ desde o v3 §1
    renderStation(
      <Conversation
        recorder={new FixtureVoiceRecorder()}
        voicePaths={() => voice}
        onGoToExport={vi.fn()}
      />,
    );

    expect(await screen.findByRole('button', { name: 'Guardar os documentos →' })).toBeTruthy();
  });
});

/**
 * ENG-367 turned the transcription wait into the screen, but the footer lives in the
 * PARENT and never found out: "← Anterior" and "Guardar os documentos →" stayed under
 * the wait, offering the way out to the Export with the drafts still in flight.
 */
describe('Conversation — the footer does not survive the transcription wait', () => {
  it('while transcription runs, neither the back link nor the CTA stay on screen', async () => {
    const state = ensureMapping(mapping());
    const seq = questionSequence(state);
    const voice = seq.map((s) => voiceAnswerPath(s));
    // a job that never finishes: the screen stays on the wait for the whole test
    const stt = {
      start: () => Promise.resolve(),
      progress: () => Promise.resolve({ done: false, drafts: {} }),
      confirm: () => Promise.reject(new Error('não usado neste teste')),
    };
    // the report discovers recordings through the recorder, not through `meta.voice`:
    // without one that answers "it exists", nothing is transcribed and the wait never starts
    const recorder: VoiceRecorder = {
      start: () => Promise.reject(new Error('unused in this test')),
      play: () => Promise.resolve(),
      duration: () => Promise.resolve(9),
      stopPlayback: () => {},
      has: () => Promise.resolve(true),
      delete: () => Promise.resolve(),
      onPlayback: () => () => {},
    };

    load(state);
    render(
      <Conversation
        recorder={recorder}
        voicePaths={() => voice}
        onGoToExport={vi.fn()}
        stt={stt}
        sessionId="s-1"
      />,
    );

    await screen.findByText(/transcrevendo/i);
    expect(screen.queryByRole('button', { name: 'Guardar os documentos →' })).toBeNull();
    expect(screen.queryByRole('button', { name: '← Anterior' })).toBeNull();
  });
});

describe('Conversation — a sequência completa da conversa (PRD v2 §8.7)', () => {
  it('percorre 11 + 5×2 + 5×2 perguntas na ordem do domínio, com a cena none_fit incluída no nível 2', async () => {
    const state = mapping();
    const expected = questionSequence(state).map((s) => s.question.q);
    expect(expected).toHaveLength(11 + 5 * 2 + 5 * 2);
    // a cena none_fit (PT2) contribui suas 5 perguntas de nível 2
    expect(expected.filter((q) => q === L2_Q[0]!.q)).toHaveLength(2);
    // nível 3 só das frases da cena produtiva (2 frases × 5)
    expect(expected.filter((q) => q === L3_Q[0]!.q)).toHaveLength(2);

    load(state);
    renderStation(<Conversation />);

    const seen: string[] = [];
    for (let i = 0; i < expected.length; i += 1) {
      seen.push(questionText());
      if (i < expected.length - 1) await next();
    }
    expect(seen).toEqual(expected);
  });

  it('a última pergunta leva ao relatório', async () => {
    const state = mapping();
    const total = questionSequence(state).length;
    load(state);
    renderStation(<Conversation />);

    for (let i = 0; i < total - 1; i += 1) await next();
    // ainda numa pergunta
    expect(questionText()).toBe(L3_Q[L3_Q.length - 1]!.q);
    await next();
    expect(screen.getByRole('region', { name: 'relatório' })).toBeTruthy();
  });

  /**
   * A ENG-339 aquecia cada resposta existente aqui, para a revisão abrir com o áudio
   * pronto de tocar. Numa entrevista de 14 cenas — ~396 perguntas — isso vira dezenas
   * de MB baixados de uma vez, e a facilitadora toca um punhado deles.
   *
   * O preparo agora só DESCOBRE. O áudio desce ao tocar, e o cache persistente
   * (@/adapters/voice/cached-store) faz a segunda vez, e toda reabertura da sessão,
   * sair do disco. A troca é uma pequena espera no primeiro play de cada resposta.
   */
  it('o preparo descobre as respostas sem baixá-las', async () => {
    const recorder = new FixtureVoiceRecorder();
    const state = mapping();
    const seq = questionSequence(state);
    const answered = voiceAnswerPath(seq[0]!);
    vi.spyOn(recorder, 'has').mockImplementation((p) => Promise.resolve(p === answered));
    const prefetch = vi.fn(() => Promise.resolve());
    (recorder as VoiceRecorder).prefetch = prefetch;

    load(state);
    renderStation(<Conversation recorder={recorder} />);
    for (let i = 0; i < seq.length; i += 1) await next();

    expect(await screen.findByRole('region', { name: 'relatório' })).toBeTruthy();
    expect(prefetch).not.toHaveBeenCalled();
  });

  it('com gravador, o preparo segura a revisão até as respostas serem descobertas (ENG-337)', async () => {
    // has() pendurado: a descoberta em voo é a janela real do modo real
    const recorder = new FixtureVoiceRecorder();
    let releaseHas: (() => void) | null = null;
    const pending = new Promise<boolean>((res) => {
      releaseHas = () => res(false);
    });
    vi.spyOn(recorder, 'has').mockImplementation(() => pending);

    const state = mapping();
    const total = questionSequence(state).length;
    load(state);
    renderStation(<Conversation recorder={recorder} />);

    for (let i = 0; i < total - 1; i += 1) await next();
    await next();

    // preparo no lugar da revisão: o palco de contas + nenhuma region de relatório
    expect(document.querySelector('.cds-preparing')).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'relatório' })).toBeNull();

    await act(async () => releaseHas?.());
    expect(await screen.findByRole('region', { name: 'relatório' })).toBeTruthy();
    expect(document.querySelector('.cds-preparing')).toBeNull();
  });
});

describe('Conversation — o ▶ do span de cada nível (PRD v2 §8.7)', () => {
  it('nível 1 toca a história inteira, nível 2 a cena e nível 3 a frase', async () => {
    const player = spyPlayer();
    load(mapping());
    renderStation(<Conversation player={player} />);

    await userEvent.click(screen.getByRole('button', { name: '▶ Ouvir a história' }));
    expect(player.toggle).toHaveBeenLastCalledWith('historia', 0, 29);

    // avança até a primeira pergunta de nível 2 (índice 11)
    for (let i = 0; i < 11; i += 1) await next();
    await userEvent.click(screen.getByRole('button', { name: '▶ Ouvir a cena' }));
    expect(player.toggle).toHaveBeenLastCalledWith('PT1', 2, 8);

    // avança até a primeira pergunta de nível 3 (índice 21)
    for (let i = 0; i < 10; i += 1) await next();
    await userEvent.click(screen.getByRole('button', { name: '▶ Ouvir a frase' }));
    expect(player.toggle).toHaveBeenLastCalledWith('P1', 2, 4);
  });
});

describe('Conversation — resposta por voz, entrevista só-voz (PRD v2 §8.7, §10.4, design parity)', () => {
  it('ouvir a resposta gravada mostra pausar enquanto toca; pausar volta a ouvir (ENG-322)', async () => {
    const recorder = new FixtureVoiceRecorder();
    load(mapping());
    renderStation(<Conversation recorder={recorder} />);

    await userEvent.click(screen.getByRole('button', { name: 'Gravar a resposta' }));
    await userEvent.click(screen.getByRole('button', { name: 'Parar' }));

    await userEvent.click(await screen.findByRole('button', { name: /^Ouvir a resposta$/ }));
    expect(recorder.playing).not.toBeNull();
    // tocando: o botão oferece pausar
    await userEvent.click(screen.getByRole('button', { name: 'Pausar' }));
    expect(recorder.playing).toBeNull();
    expect(screen.getByRole('button', { name: /^Ouvir a resposta$/ })).toBeTruthy();
  });

  it('ouvir mostra "abrindo…" até a porta confirmar o início da reprodução (ENG-336)', async () => {
    // play() pendurado: a janela real de fetch+decode do modo real. O botão precisa
    // dizer que está abrindo — e só virar "Pausar" quando o som de fato começa.
    const recorder = new FixtureVoiceRecorder();
    const playbackCbs: ((p: string | null) => void)[] = [];
    vi.spyOn(recorder, 'onPlayback').mockImplementation((cb) => {
      playbackCbs.push(cb);
      return () => {};
    });
    let releasePlay: (() => void) | null = null;
    vi.spyOn(recorder, 'play').mockImplementation(
      () =>
        new Promise((res) => {
          releasePlay = () => res();
        }),
    );
    load(mapping());
    renderStation(<Conversation recorder={recorder} />);

    await userEvent.click(screen.getByRole('button', { name: 'Gravar a resposta' }));
    await userEvent.click(screen.getByRole('button', { name: 'Parar' }));
    await userEvent.click(await screen.findByRole('button', { name: /^Ouvir a resposta$/ }));

    // em voo: abrindo, e sem segundo clique acumulando outra reprodução
    const opening = screen.getByRole('button', { name: 'Abrindo a resposta…' });
    expect(opening.hasAttribute('disabled')).toBe(true);

    // a porta confirma o início (emite o path DEPOIS do play resolver)
    await act(async () => {
      releasePlay?.();
      playbackCbs.forEach((cb) => cb('respostas/level1/recontar.webm'));
    });
    expect(screen.getByRole('button', { name: 'Pausar' })).toBeTruthy();

    // o fim da reprodução volta a oferecer ouvir
    await act(async () => {
      playbackCbs.forEach((cb) => cb(null));
    });
    expect(screen.getByRole('button', { name: /^Ouvir a resposta$/ })).toBeTruthy();
  });

  it('parar entra em "guardando" até a persistência confirmar (ENG-318)', async () => {
    // recorder com stop() controlável: o PUT embutido fica pendurado até liberarmos
    let release: (() => void) | null = null;
    const recorder: VoiceRecorder = {
      start: () =>
        Promise.resolve({
          onLevel: () => () => {},
          stop: () =>
            new Promise((res) => {
              release = () => res({ blob: new Blob(), durationSec: 1 });
            }),
          cancel: () => {},
        }),
      play: () => Promise.resolve(),
      duration: () => Promise.resolve(1),
      stopPlayback: () => {},
      has: () => Promise.resolve(false),
      delete: () => Promise.resolve(),
      onPlayback: () => () => {},
    };
    load(mapping());
    renderStation(<Conversation recorder={recorder} />);

    await userEvent.click(screen.getByRole('button', { name: 'Gravar a resposta' }));
    await userEvent.click(screen.getByRole('button', { name: 'Parar' }));

    // enquanto a resposta persiste: estado no botão — guardando, sem aceitar clique
    const saving = screen.getByRole('button', { name: 'Guardando a resposta' });
    expect((saving as HTMLButtonElement).disabled).toBe(true);

    await act(async () => release?.());
    expect(await screen.findByRole('button', { name: /^Ouvir a resposta$/ })).toBeTruthy();
  });

  it('gravar guarda no caminho exato da pergunta; "Gravar de novo" regrava; "listen" toca; NÃO há canal digitado na entrevista', async () => {
    const recorder = new FixtureVoiceRecorder();
    load(mapping());
    renderStation(<Conversation recorder={recorder} />);

    const path = 'respostas/level1/recontar.webm';
    expect(await recorder.has(path)).toBe(false);

    await userEvent.click(screen.getByRole('button', { name: 'Gravar a resposta' }));
    await userEvent.click(screen.getByRole('button', { name: 'Parar' }));
    expect(await recorder.has(path)).toBe(true);

    // "Gravar de novo" pergunta antes (ENG-392) e, confirmado, já está gravando de
    // volta no MESMO caminho — uma intenção, um toque
    await userEvent.click(screen.getByRole('button', { name: 'Gravar de novo' }));
    await userEvent.click(screen.getByRole('button', { name: 'Apagar e gravar de novo' }));
    await userEvent.click(screen.getByRole('button', { name: 'Parar' }));
    expect(await recorder.has(path)).toBe(true);

    // "listen" toca a gravação deste caminho
    await userEvent.click(screen.getByRole('button', { name: 'Ouvir a resposta' }));
    expect(recorder.playing).toBe(path);

    // a digitação saiu do palco da entrevista — vive só no relatório (ui/pages/report)
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('parar avisa o shell (onVoiceSaved) com o caminho canônico da pergunta', async () => {
    const recorder = new FixtureVoiceRecorder();
    const onVoiceSaved = vi.fn();
    load(mapping());
    renderStation(<Conversation recorder={recorder} onVoiceSaved={onVoiceSaved} />);

    await userEvent.click(screen.getByRole('button', { name: 'Gravar a resposta' }));
    await userEvent.click(screen.getByRole('button', { name: 'Parar' }));
    expect(onVoiceSaved).toHaveBeenCalledWith('respostas/level1/recontar.webm');
  });

  it('parar após desmontar (navegar no meio do await) NÃO avisa o shell — sem contaminar outra sessão', async () => {
    const recorder = new FixtureVoiceRecorder();
    const startSpy = vi.spyOn(recorder, 'start');
    const onVoiceSaved = vi.fn();
    load(mapping());
    const { unmount } = renderStation(
      <Conversation recorder={recorder} onVoiceSaved={onVoiceSaved} />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Gravar a resposta' }));
    const rec = await startSpy.mock.results[0]!.value;
    // segura o stop() pendente: o await de onStop fica suspenso até resolvermos
    let resolveStop!: (v: { blob: Blob; durationSec: number }) => void;
    vi.spyOn(rec, 'stop').mockImplementation(
      () => new Promise((r) => (resolveStop = r as typeof resolveStop)),
    );

    await userEvent.click(screen.getByRole('button', { name: 'Parar' }));
    // navega/desmonta ANTES de o stop resolver (troca de sessão no app real)
    unmount();
    await act(async () => resolveStop({ blob: new Blob(), durationSec: 0 }));

    expect(onVoiceSaved).not.toHaveBeenCalled();
  });

  /**
   * ENG-393 mudou o gatilho: com o microfone aberto, "Próxima pergunta" não anda
   * mais — era exatamente por aí que uma resposta se perdia no meio de uma frase.
   * O contrato de limpeza continua valendo para quem SAI da estação (o voltar do
   * cabeçalho, uma troca de sessão): desmontar cancela a gravação órfã e devolve
   * o microfone.
   */
  it('gravando, a próxima pergunta espera; sair da estação cancela a gravação em curso', async () => {
    const recorder = new FixtureVoiceRecorder();
    const startSpy = vi.spyOn(recorder, 'start');
    load(mapping());
    const state = ensureMapping(mapping());
    const { unmount } = renderStation(<Conversation recorder={recorder} />);

    await userEvent.click(screen.getByRole('button', { name: 'Gravar a resposta' }));
    const rec = await startSpy.mock.results[0]!.value;
    const cancelSpy = vi.spyOn(rec, 'cancel');

    await next();
    expect(questionText()).toBe(questionSequence(state)[0]!.question.q);
    expect(cancelSpy).not.toHaveBeenCalled();

    unmount();
    expect(cancelSpy).toHaveBeenCalled();
  });
});

describe('Conversation — perguntas conduzidas pela facilitadora (PRD v2 §8.7)', () => {
  it('a pergunta de ausência (nível 1) mostra o marcador de papel', async () => {
    load(mapping());
    renderStation(<Conversation />);

    // a 11ª pergunta de L1 é "ausencia" (índice 10)
    for (let i = 0; i < 10; i += 1) await next();
    expect(questionText()).toBe(L1_Q[10]!.q);
    expect(screen.getByRole('img', { name: 'conduzida pela facilitadora' })).toBeTruthy();
  });
});

describe('Conversation — navegação entre níveis (referência mapNav L1099–1133)', () => {
  it('“Anterior” na primeira pergunta volta à Segmentação', async () => {
    load(mapping());
    renderStation(<Conversation />);

    await userEvent.click(screen.getByRole('button', { name: '← Anterior' }));
    expect(sessionStore.getState().session!.mode).toBe('segmentacao');
  });

  it('do relatório o “← anterior” volta à última pergunta', async () => {
    const state = mapping();
    const total = questionSequence(state).length;
    load(state);
    renderStation(<Conversation />);

    for (let i = 0; i < total; i += 1) await next();
    expect(screen.getByRole('region', { name: 'relatório' })).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: '← Anterior' }));
    expect(questionText()).toBe(L3_Q[L3_Q.length - 1]!.q);
  });
});

describe('Conversation — minimalismo para o ouvinte (PRD v2 §9.2)', () => {
  it('não mostra dígito e tem ≤1 linha de instrução — incluindo as telas de cena e de frase', async () => {
    load(mapping());
    const { container } = renderStation(<Conversation />);

    const assertNoDigits = (): void => {
      expect(container.textContent ?? '').not.toMatch(/\d/);
      for (const el of container.querySelectorAll('[aria-label]')) {
        expect(el.getAttribute('aria-label')).not.toMatch(/\d/);
      }
      for (const el of container.querySelectorAll('[title]')) {
        expect(el.getAttribute('title')).not.toMatch(/\d/);
      }
      expect(container.querySelectorAll('[data-role="instruction"]').length).toBeLessThanOrEqual(1);
    };

    // tela de nível 1
    assertNoDigits();
    // tela de nível 2 (a cena, cujo part_id "PT1" tem dígito — não pode vazar)
    for (let i = 0; i < 11; i += 1) await next();
    assertNoDigits();
    // tela de nível 3 (a frase, cujo prop_id "P1" tem dígito — não pode vazar)
    for (let i = 0; i < 10; i += 1) await next();
    assertNoDigits();
  });

  it('o palco é full-bleed: a página não pinta fundo próprio (o oliva vem do shell)', () => {
    load(mapping());
    const { container } = renderStation(<Conversation />);
    expect(container.querySelector('.cds-conversation')).not.toBeNull();
    // Protótipo: a tela INTEIRA é oliva — pintado pelo shell via :has(); um fundo
    // aqui criaria a "faixa escura dentro de moldura clara" que não existe lá.
    expect(conversationCss).not.toMatch(/\.cds-conversation\s*\{[^}]*background/);
  });
});

describe('Conversation — a voz do guia (ENG-280)', () => {
  beforeEach(() => {
    if (appStore.getState().muted) appStore.getState().toggleMuted(); // som LIGADO por padrão
  });
  afterEach(() => {
    if (appStore.getState().muted) appStore.getState().toggleMuted();
  });

  it('com o som ligado, o guia fala a pergunta ao chegar nela, em pt-BR', () => {
    const tts = new FixtureSpeechSynthesizer();
    load(mapping());
    renderStation(<Conversation speaker={tts} />);

    expect(tts.spoken).toEqual([{ text: questionText(), lang: 'pt-BR' }]);
  });

  it('falando, o botão pausa; pausado, "Ouvir a pergunta" repete (ENG-317)', async () => {
    const tts = new FixtureSpeechSynthesizer();
    load(mapping());
    renderStation(<Conversation speaker={tts} />);

    // chegar na pergunta já fala → o botão oferece pausar, e pausar NÃO fala de novo
    await userEvent.click(screen.getByRole('button', { name: 'Pausar a pergunta' }));
    expect(tts.spoken).toHaveLength(1);

    // pausado, o botão volta a oferecer ouvir — e repete a pergunta em foco
    await userEvent.click(screen.getByRole('button', { name: 'Ouvir a pergunta' }));
    expect(tts.spoken).toHaveLength(2);
    expect(tts.spoken.at(-1)!.text).toBe(questionText());
  });

  it('avançar fala a pergunta NOVA', async () => {
    const tts = new FixtureSpeechSynthesizer();
    load(mapping());
    renderStation(<Conversation speaker={tts} />);
    const primeira = questionText();

    await next();

    expect(questionText()).not.toBe(primeira);
    expect(tts.spoken.at(-1)).toEqual({ text: questionText(), lang: 'pt-BR' });
  });

  it('com a UI em inglês fala a pergunta EM INGLÊS — texto e voz nunca divergem', async () => {
    const tts = new FixtureSpeechSynthesizer();
    await act(() => i18n.changeLanguage('en'));
    load(mapping());
    renderStation(<Conversation speaker={tts} />);

    expect(tts.spoken).toEqual([
      {
        text: 'Tell this story in your own words, as if to someone who has never heard it.',
        lang: 'en-US',
      },
    ]);
    expect(tts.spoken[0]!.text).toBe(questionText());
  });

  it('o guia anima enquanto a VOZ fala (não enquanto o gravador está ocioso)', async () => {
    const tts = new FixtureSpeechSynthesizer();
    load(mapping());
    renderStation(<Conversation speaker={tts} />);
    const speaking = () => document.querySelector('[data-speaking]')?.getAttribute('data-speaking');

    // a fala de chegada já acendeu o lip-sync
    expect(speaking()).toBe('true');

    act(() => tts.stop());

    expect(speaking()).toBe('false');
  });

  it('som DESLIGADO silencia a voz e some com o botão — nunca fala sem consentimento', () => {
    const tts = new FixtureSpeechSynthesizer();
    appStore.getState().toggleMuted(); // som desligado
    load(mapping());
    renderStation(<Conversation speaker={tts} />);

    expect(tts.spoken).toEqual([]);
    expect(screen.queryByRole('button', { name: 'Ouvir a pergunta' })).toBeNull();
    expect(document.querySelector('[data-speaking]')?.getAttribute('data-speaking')).toBe('false');
  });
});

describe('Conversation — a passagem para o relatório (ENG-250)', () => {
  it('a resposta em VOZ chega tocável ao relatório: o card promete voz, não um campo vazio', async () => {
    const recorder = new FixtureVoiceRecorder();
    load(mapping());
    renderStation(<Conversation recorder={recorder} />);

    await userEvent.click(screen.getByRole('button', { name: 'Gravar a resposta' }));
    await userEvent.click(screen.getByRole('button', { name: 'Parar' }));

    // anda até o relatório (a última "Próxima pergunta" abre a prévia)
    const total = questionSequence(sessionStore.getState().session!).length;
    for (let i = 0; i < total; i++) {
      await userEvent.click(screen.getByRole('button', { name: 'Próxima pergunta' }));
    }

    // a gravação da 1ª pergunta é ouvível LÁ — sem o recorder o card cairia no
    // "ainda sem resposta gravada" e a voz ficaria inalcançável
    const play = await screen.findByRole('button', { name: '▶ Ouvir a resposta' });
    await userEvent.click(play);
    expect(recorder.playing).toBe('respostas/level1/recontar.webm');
  });
});

describe('Conversation — o relatório não é o fim do fluxo (protótipo toExport)', () => {
  it('a prévia oferece "Guardar os documentos →": a última tela do protótipo não fica só no fio de contas', async () => {
    const onGoToExport = vi.fn();
    load(mapping());
    renderStation(<Conversation onGoToExport={onGoToExport} />);

    const total = questionSequence(sessionStore.getState().session!).length;
    for (let i = 0; i < total; i++) {
      await userEvent.click(screen.getByRole('button', { name: 'Próxima pergunta' }));
    }

    await userEvent.click(screen.getByRole('button', { name: 'Guardar os documentos →' }));

    expect(onGoToExport).toHaveBeenCalled();
  });
});

describe('Conversation — fronteira de IO real da resposta (ENG-247)', () => {
  it('falha ao guardar a resposta: orienta a regravar e volta ao microfone', async () => {
    // tipada pela PORTA: o spy devolve um Recording estrutural, não a classe fixture
    const recorder: VoiceRecorder = new FixtureVoiceRecorder();
    const origStart = recorder.start.bind(recorder);
    vi.spyOn(recorder, 'start').mockImplementation(async (p) => {
      const rec = await origStart(p);
      return {
        onLevel: rec.onLevel.bind(rec),
        cancel: rec.cancel.bind(rec),
        // no modo real o stop embute o PUT da resposta — é ele que pode falhar
        stop: () => Promise.reject(new Error('413 payload too large')),
      };
    });
    const onVoiceSaved = vi.fn();
    load(mapping());
    renderStation(<Conversation recorder={recorder} onVoiceSaved={onVoiceSaved} />);

    await userEvent.click(screen.getByRole('button', { name: 'Gravar a resposta' }));
    await userEvent.click(screen.getByRole('button', { name: 'Parar' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('A resposta não foi guardada.');
    // volta ao microfone (nada preso em "gravando"), e o shell NÃO registrou o caminho
    expect(screen.getByRole('button', { name: 'Gravar a resposta' })).toBeTruthy();
    expect(onVoiceSaved).not.toHaveBeenCalled();
  });
});

/**
 * Uma pergunta que a pessoa preferiu não responder ficava para sempre "em aberto":
 * a retomada procura a primeira sem resposta, e sem resposta ela sempre estava. A
 * sessão voltava à mesma pergunta em toda reabertura, e a revisão — que só abre
 * sozinha quando não há mais nada a perguntar — ficava inalcançável.
 */
describe('Conversation — a pergunta que ficou sem resposta', () => {
  async function skip(): Promise<void> {
    await userEvent.click(screen.getByRole('button', { name: 'Sem resposta' }));
  }

  it('marcar sem resposta segue para a próxima pergunta', async () => {
    const seq = questionSequence(ensureMapping(mapping()));
    load(mapping());
    render(<Conversation />);

    await skip();

    expect(questionText()).toBe(seq[1]!.question.q);
  });

  it('reabrir não devolve à pergunta marcada — a retomada segue adiante', async () => {
    const seq = questionSequence(ensureMapping(mapping()));
    load(mapping());
    const view = render(<Conversation />);
    await skip();
    view.unmount();

    render(<Conversation />);

    expect(questionText()).toBe(seq[1]!.question.q);
  });

  it('com a última marcada e o resto gravado, reabrir cai na revisão', async () => {
    const state = ensureMapping(mapping());
    const seq = questionSequence(state);
    const voice = seq.slice(0, -1).map((s) => voiceAnswerPath(s));
    load(state);
    const view = render(<Conversation voicePaths={() => voice} />);
    expect(questionText()).toBe(seq.at(-1)!.question.q);
    await skip();
    view.unmount();

    render(<Conversation voicePaths={() => voice} />);

    expect(screen.queryByRole('button', { name: 'Próxima pergunta' })).toBeNull();
  });

  it('voltar a perguntar desfaz a marca e a retomada para nela de novo', async () => {
    const seq = questionSequence(ensureMapping(mapping()));
    load(mapping());
    const view = render(<Conversation />);
    await skip();
    await userEvent.click(screen.getByRole('button', { name: '← Anterior' }));
    await userEvent.click(screen.getByRole('button', { name: 'Voltar a perguntar' }));
    view.unmount();

    render(<Conversation />);

    expect(questionText()).toBe(seq[0]!.question.q);
  });

  it('gravar a resposta desfaz a marca — a pergunta foi respondida, afinal', async () => {
    const recorder = new FixtureVoiceRecorder();
    load(mapping());
    render(<Conversation recorder={recorder} />);
    await skip();
    await userEvent.click(screen.getByRole('button', { name: '← Anterior' }));
    expect(screen.getByRole('button', { name: 'Voltar a perguntar' })).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: 'Gravar a resposta' }));
    await userEvent.click(screen.getByRole('button', { name: 'Parar' }));

    expect(screen.getByRole('button', { name: 'Sem resposta' })).toBeTruthy();
  });
});

/**
 * ENG-393, o elo que faltava. O "← Histórias" mora em `ui/app`, fora desta
 * estação, e é a única saída que o palco da conversa não desenha. O cabeçalho já
 * sabe recusar (header.test.tsx) e a estação já sabe travar o que é dela — o que
 * ninguém provava é que uma coisa avisa a outra. Sem isto, os dois lados podem
 * estar certos e a pessoa ainda sair da sessão no meio de uma resposta.
 */
describe('Conversation — o cabeçalho fica sabendo da gravação (ENG-393)', () => {
  it('gravando, a bandeira global sobe; parando, desce', async () => {
    const recorder = new FixtureVoiceRecorder();
    load(mapping());
    render(<Conversation recorder={recorder} />);

    expect(appStore.getState().recording).toBe(false);

    await userEvent.click(screen.getByRole('button', { name: 'Gravar a resposta' }));
    expect(appStore.getState().recording).toBe(true);

    await userEvent.click(screen.getByRole('button', { name: 'Parar' }));
    expect(appStore.getState().recording).toBe(false);
  });

  it('sair da estação no meio da gravação não deixa a bandeira presa', async () => {
    /* Uma bandeira presa em true travaria o voltar da pessoa PARA SEMPRE, numa
       tela onde nem existe gravação — o modo mais cruel de falhar desta feature. */
    const recorder = new FixtureVoiceRecorder();
    load(mapping());
    const { unmount } = render(<Conversation recorder={recorder} />);

    await userEvent.click(screen.getByRole('button', { name: 'Gravar a resposta' }));
    expect(appStore.getState().recording).toBe(true);

    unmount();

    expect(appStore.getState().recording).toBe(false);
  });
});

/**
 * ENG-392 — o tamanho da resposta em risco chega por extenso.
 *
 * O organismo só sabe interpolar a frase que recebe; quem converte segundos em
 * palavras é esta página. Sem um teste aqui, ela poderia voltar a mandar "1:12"
 * e o §9.2 cairia sem nada reclamar — o diálogo abre num portal, fora da raiz
 * que o scanner de minimalismo varre.
 */
describe('Conversation — a duração no diálogo de regravar não traz dígito (ENG-392)', () => {
  it('grava, para, e a confirmação descreve o tamanho por palavras', async () => {
    const recorder = new FixtureVoiceRecorder();
    load(mapping());
    render(<Conversation recorder={recorder} />);

    await userEvent.click(screen.getByRole('button', { name: 'Gravar a resposta' }));
    await userEvent.click(screen.getByRole('button', { name: 'Parar' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Gravar de novo' }));

    const dialogo = screen.getByRole('alertdialog');
    expect(dialogo.textContent ?? '').toMatch(/minuto/);
    expect(dialogo.textContent ?? '').not.toMatch(/\d/);
  });
});

/**
 * Transcribing only at the end meant the facilitator finished the interview and then
 * waited on all 41 answers at once. Advancing past a recorded answer is the signal that
 * the take is the one they meant to keep — they had the chance to redo it and moved on —
 * so the work starts there and the report finds it mostly done.
 *
 * A take redone AFTER advancing is not re-asked here: the draft is already `ready`, and
 * the idempotent POST leaves it alone. The report catches it, because that is where the
 * durable record of which version was transcribed lives.
 */
describe('Conversation — a transcrição começa ao avançar, não no fim', () => {
  function spyTranscriber(): { stt: Transcriber; started: string[] } {
    const started: string[] = [];
    return {
      started,
      stt: {
        start: (id) => {
          started.push(id);
          return Promise.resolve();
        },
        progress: () => Promise.resolve({ done: true, drafts: {} }),
        confirm: () => Promise.reject(new Error('não usado neste teste')),
      },
    };
  }

  it('avançar depois de gravar pede a transcrição daquela resposta', async () => {
    const { stt, started } = spyTranscriber();
    const voice: string[] = [];
    load(mapping());
    render(
      <Conversation
        recorder={new FixtureVoiceRecorder()}
        voicePaths={() => voice}
        onVoiceSaved={(p) => voice.push(p)}
        stt={stt}
        sessionId="s-1"
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Gravar a resposta' }));
    await userEvent.click(screen.getByRole('button', { name: 'Parar' }));
    await next();

    expect(started).toEqual(['s-1']);
  });

  /**
   * O sinal é "gravou AGORA", não "existe gravação". `meta.voice` acumula tudo que já
   * foi gravado alguma vez, então reatravessar uma entrevista disparava um pedido por
   * pergunta — numa sessão de 14 cenas passa de trezentos POSTs, cada um publicando
   * um evento, para não pedir nada que o servidor já não tivesse.
   */
  it('atravessar respostas gravadas numa visita anterior não pede nada', async () => {
    const { stt, started } = spyTranscriber();
    const state = ensureMapping(mapping());
    const seq = questionSequence(state);
    // retomada: as duas primeiras vêm gravadas de antes, e o cursor abre na terceira
    const voice = [seq[0]!, seq[1]!].map((s) => voiceAnswerPath(s));

    load(state);
    render(
      <Conversation
        recorder={new FixtureVoiceRecorder()}
        voicePaths={() => voice}
        stt={stt}
        sessionId="s-1"
      />,
    );

    // volta para uma resposta já gravada e avança por cima dela de novo
    await userEvent.click(screen.getByRole('button', { name: '← Anterior' }));
    await next();

    expect(started).toEqual([]);
  });

  it('avançar sem gravar não pede nada — não há o que transcrever', async () => {
    const { stt, started } = spyTranscriber();
    load(mapping());
    render(
      <Conversation
        recorder={new FixtureVoiceRecorder()}
        voicePaths={() => []}
        stt={stt}
        sessionId="s-1"
      />,
    );

    await next();

    expect(started).toEqual([]);
  });

  it('o pedido que falha não segura a navegação — a entrevista é o que não pode parar', async () => {
    const voice: string[] = [];
    const stt: Transcriber = {
      start: () => Promise.reject(new Error('rede fora')),
      progress: () => Promise.resolve({ done: true, drafts: {} }),
      confirm: () => Promise.reject(new Error('não usado neste teste')),
    };
    load(mapping());
    const seq = questionSequence(sessionStore.getState().session!);
    render(
      <Conversation
        recorder={new FixtureVoiceRecorder()}
        voicePaths={() => voice}
        onVoiceSaved={(p) => voice.push(p)}
        stt={stt}
        sessionId="s-1"
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Gravar a resposta' }));
    await userEvent.click(screen.getByRole('button', { name: 'Parar' }));
    await next();

    expect(questionText()).toBe(seq[1]!.question.q);
  });
});

/**
 * "Já existe resposta gravada aqui?" é uma pergunta ao servidor (`recorder.has`),
 * e no modo real ela custa uma ida à rede. Até responder, a estação montava a tela
 * em `idle` — o convite a falar, a promessa do fio de som, nenhum "ouvir a
 * resposta". Ou seja: numa pergunta que JÁ tinha resposta, a tela afirmava, por
 * alguns segundos, que não havia. Quem conduz lê isso como perda.
 */
describe('Conversation — a procura pela resposta já gravada', () => {
  const silent = (has: () => Promise<boolean>): VoiceRecorder => ({
    start: () => Promise.reject(new Error('unused in this test')),
    play: () => Promise.resolve(),
    duration: () => Promise.resolve(9),
    stopPlayback: () => {},
    has,
    delete: () => Promise.resolve(),
    onPlayback: () => () => {},
  });

  it('enquanto a consulta não responde, a tela diz que procura — não que não há resposta', async () => {
    load(mapping());
    renderStation(<Conversation recorder={silent(() => new Promise(() => {}))} />);

    expect(await screen.findByText('Procurando a resposta já gravada')).toBeTruthy();
    expect(screen.queryByText('Toque e fale a sua resposta')).toBeNull();
  });

  it('respondido que existe, a resposta gravada aparece para ouvir', async () => {
    load(mapping());
    renderStation(<Conversation recorder={silent(() => Promise.resolve(true))} />);

    expect(await screen.findByRole('button', { name: /^Ouvir a resposta$/ })).toBeTruthy();
    expect(screen.queryByText('Procurando a resposta já gravada')).toBeNull();
  });

  it('respondido que não existe, a tela volta a convidar a falar', async () => {
    load(mapping());
    renderStation(<Conversation recorder={silent(() => Promise.resolve(false))} />);

    expect(await screen.findByText('Toque e fale a sua resposta')).toBeTruthy();
  });

  it('sem porta de voz não há o que procurar — nem um piscar de espera', () => {
    load(mapping());
    renderStation(<Conversation />);

    expect(screen.getByText('Toque e fale a sua resposta')).toBeTruthy();
    expect(screen.queryByText('Procurando a resposta já gravada')).toBeNull();
  });

  /**
   * A consulta é assíncrona e o microfone segue aberto durante ela: um veredito que
   * chega DEPOIS do primeiro toque encontrava a tela gravando e a empurrava para
   * "recorded" — a forma de onda ao vivo morria no meio da resposta, com o
   * microfone ainda captando.
   */
  it('o veredito atrasado não atropela quem já começou a gravar', async () => {
    let answer: ((exists: boolean) => void) | undefined;
    const recorder = new FixtureVoiceRecorder();
    const racing: VoiceRecorder = {
      ...silent(() => new Promise<boolean>((res) => (answer = res))),
      start: (p) => recorder.start(p),
    };

    load(mapping());
    renderStation(<Conversation recorder={racing} />);
    await userEvent.click(screen.getByRole('button', { name: 'Gravar a resposta' }));

    await act(async () => answer?.(true));

    expect(screen.getByRole('button', { name: 'Parar' })).toBeTruthy();
  });
});

/**
 * "Guardar os documentos →" leva a uma tela que RECUSA guardar enquanto houver
 * resposta gravada sem texto confirmado (`reportExportStatus`, ENG-327). Sair da
 * revisão sem confirmar era, portanto, andar para um botão morto: a explicação
 * chegava uma tela tarde. O diálogo diz isso ANTES, com o mesmo número do gate, e
 * — §9.5, nunca punir — deixa passar mesmo assim quem quiser passar.
 */
describe('Conversation — sair da revisão com transcrição por confirmar', () => {
  async function walkToReport(): Promise<void> {
    const total = questionSequence(sessionStore.getState().session!).length;
    for (let i = 0; i < total; i++) {
      await userEvent.click(screen.getByRole('button', { name: 'Próxima pergunta' }));
    }
  }

  /** Grava a resposta da 1ª pergunta e chega à revisão sem confirmar texto nenhum. */
  async function recordedButUnconfirmed(onGoToExport: () => void): Promise<void> {
    load(mapping());
    renderStation(
      <Conversation recorder={new FixtureVoiceRecorder()} onGoToExport={onGoToExport} />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Gravar a resposta' }));
    await userEvent.click(screen.getByRole('button', { name: 'Parar' }));
    await walkToReport();
  }

  /**
   * Estes casos gravam uma resposta e depois ANDAM pelas 21 perguntas com cliques
   * reais, e cada pergunta agora espera a consulta "já existe resposta gravada aqui?"
   * (o estado `checking` do #175). Só o caminhar já custa ~3 s numa máquina de CI, e o
   * padrão de 5 s do Vitest passou a estourar quando os dois PRs se encontraram na
   * main. O trabalho é legítimo: o teto sobe para caber nele, em vez de o teste ser
   * afinado até caber no teto.
   */
  const ANDAR = 20_000;

  it(
    'o clique abre o diálogo em vez de guardar, e conta quantas faltam',
    async () => {
      const onGoToExport = vi.fn();
      await recordedButUnconfirmed(onGoToExport);

      await userEvent.click(await screen.findByRole('button', { name: 'Guardar os documentos →' }));

      expect(await screen.findByRole('dialog')).toBeTruthy();
      expect(screen.getByText(/falta confirmar a transcrição de 1 resposta/i)).toBeTruthy();
      expect(onGoToExport).not.toHaveBeenCalled();
    },
    ANDAR,
  );

  it(
    '"Revisar as respostas" fecha e deixa quem revisa onde ele revisa',
    async () => {
      const onGoToExport = vi.fn();
      await recordedButUnconfirmed(onGoToExport);
      await userEvent.click(await screen.findByRole('button', { name: 'Guardar os documentos →' }));

      await userEvent.click(screen.getByRole('button', { name: 'Revisar as respostas' }));

      expect(screen.queryByRole('dialog')).toBeNull();
      expect(onGoToExport).not.toHaveBeenCalled();
    },
    ANDAR,
  );

  it(
    '"Ir mesmo assim" passa: o aviso guia, não tranca',
    async () => {
      const onGoToExport = vi.fn();
      await recordedButUnconfirmed(onGoToExport);
      await userEvent.click(await screen.findByRole('button', { name: 'Guardar os documentos →' }));

      await userEvent.click(screen.getByRole('button', { name: 'Ir mesmo assim' }));

      expect(onGoToExport).toHaveBeenCalled();
      expect(screen.queryByRole('dialog')).toBeNull();
    },
    ANDAR,
  );

  it(
    'confirmada a transcrição, o diálogo não aparece — ele espelha o gate, não duplica regra',
    async () => {
      const onGoToExport = vi.fn();
      load(mapping());
      const recorder = new FixtureVoiceRecorder();
      renderStation(<Conversation recorder={recorder} onGoToExport={onGoToExport} />);
      await userEvent.click(screen.getByRole('button', { name: 'Gravar a resposta' }));
      await userEvent.click(screen.getByRole('button', { name: 'Parar' }));
      // o texto confirmado é exatamente o que `reportExportStatus` procura
      act(() => {
        sessionStore
          .getState()
          .apply((s) =>
            setAnswer(ensureMapping(s), { level: 1, k: L1_Q[0]!.k }, 'He told of the dolphin.'),
          );
      });
      await walkToReport();

      await userEvent.click(await screen.findByRole('button', { name: 'Guardar os documentos →' }));

      expect(screen.queryByRole('dialog')).toBeNull();
      expect(onGoToExport).toHaveBeenCalled();
    },
    ANDAR,
  );
});

/**
 * ENG-512 — aceitar todas as transcrições SEM sair do aviso.
 *
 * A ação em lote já existia, correta e testada, no topo da revisão; o aviso de saída
 * já existia aqui. Quem clicava em "Guardar os documentos →" com rascunhos por
 * confirmar era mandado de volta a procurá-la. O aviso passa a oferecer a MESMA ação —
 * a do relatório, não uma segunda —, e os testes afirmam o que ficou gravado na
 * resposta e em que tela a pessoa parou.
 *
 * Os dois números que se encontram aqui não são o mesmo: o aviso conta as respostas
 * GRAVADAS sem texto confirmado (o número do gate), o lote conta as que têm
 * transcrição guardada. Uma gravação sem transcrição está no primeiro e não no
 * segundo — daí o terceiro caso.
 */
describe('Conversation — aceitar todas as transcrições a partir do aviso de saída (ENG-512)', () => {
  const DRAFT_A = 'Ele contou do golfinho que trouxe o menino de volta.';
  const DRAFT_B = 'A avó guardou a canção até o fim da viagem.';
  const TYPED = 'A facilitadora escreveu esta resposta à mão.';

  /** Os bytes que o fixture do gravador guarda — o conteúdo não importa, a existência sim. */
  const RECORDED = Uint8Array.of(0x1a, 0x45, 0xdf, 0xa3);

  interface Seed {
    /** Índice na sequência de perguntas. Só de nível 1: a chave reservada mora no mesmo balde. */
    at: number;
    /** Transcrição guardada à espera de confirmação (`src__<k>`). */
    draft?: string;
    /** Resposta escrita à mão. */
    typed?: string;
  }

  /** O texto que ficou GRAVADO na resposta — o que o documento vai emitir. */
  function answerAt(at: number): string {
    const state = sessionStore.getState().session!;
    return state.mapping!.level1[questionSequence(state)[at]!.k] ?? '';
  }

  /**
   * Abre a revisão já com as gravações persistidas e o estado semeado. A última
   * pergunta é marcada como sem resposta para a sessão RETOMAR no fim (ENG-367): o
   * caso é sobre o aviso de saída, não sobre trinta cliques de caminhada.
   */
  async function reviewWithVoice(seeds: readonly Seed[], onGoToExport: () => void): Promise<void> {
    let state = ensureMapping(mapping());
    const sequence = questionSequence(state);
    const paths = seeds.map((s) => voiceAnswerPath(sequence[s.at]!));
    for (const s of seeds) {
      const slot = sequence[s.at]!;
      if (slot.level !== 1) throw new Error(`a pergunta ${s.at} não é de nível 1`);
      if (s.draft !== undefined) {
        state = setAnswer(state, { level: 1, k: `src__${slot.k}` }, s.draft);
      }
      if (s.typed !== undefined) state = setAnswer(state, slot, s.typed);
    }
    state = markSkipped(state, sequence[sequence.length - 1]!);
    const store = new MemoryVoiceStore();
    for (const p of paths) await store.put(p, RECORDED);
    load(state);
    renderStation(
      <Conversation
        recorder={new FixtureVoiceRecorder(store)}
        voicePaths={() => paths}
        onGoToExport={onGoToExport}
      />,
    );
    await screen.findByRole('button', { name: 'Guardar os documentos →' });
  }

  it('aceitando todas ali mesmo, os elegíveis viram resposta e o fluxo segue para Guardar', async () => {
    const onGoToExport = vi.fn();
    await reviewWithVoice(
      [
        { at: 0, draft: DRAFT_A },
        { at: 1, draft: DRAFT_B },
      ],
      onGoToExport,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Guardar os documentos →' }));
    await userEvent.click(screen.getByRole('button', { name: 'Aceitar as 2 transcrições' }));

    expect(answerAt(0)).toBe(DRAFT_A);
    expect(answerAt(1)).toBe(DRAFT_B);
    expect(onGoToExport).toHaveBeenCalled();
  });

  it('o texto escrito à mão sai intacto: o lote só preenche célula vazia', async () => {
    const onGoToExport = vi.fn();
    await reviewWithVoice(
      [
        { at: 0, draft: DRAFT_A, typed: TYPED },
        { at: 1, draft: DRAFT_B },
      ],
      onGoToExport,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Guardar os documentos →' }));
    await userEvent.click(screen.getByRole('button', { name: 'Aceitar a transcrição' }));

    expect(answerAt(0)).toBe(TYPED);
    expect(answerAt(1)).toBe(DRAFT_B);
  });

  it('a gravação SEM transcrição continua pendente, e a tela não afirma o contrário', async () => {
    const onGoToExport = vi.fn();
    await reviewWithVoice([{ at: 0, draft: DRAFT_A }, { at: 1 }], onGoToExport);

    await userEvent.click(screen.getByRole('button', { name: 'Guardar os documentos →' }));
    await userEvent.click(screen.getByRole('button', { name: 'Aceitar a transcrição' }));

    expect(answerAt(0)).toBe(DRAFT_A);
    expect(answerAt(1)).toBe('');
    // não passou para a Export, e o aviso continua de pé dizendo o que sobrou
    expect(onGoToExport).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog').textContent).toMatch(/ainda falta 1 resposta/i);
  });

  /**
   * A ação nova aceita centenas de textos de máquina de uma vez. O foco continua
   * nascendo na saída que não escreve nada — um Enter distraído no aviso não pode ser
   * o que confirma —, e ela entra na tabulação logo depois, ao alcance de quem só usa
   * o teclado.
   */
  it('a ação nova entra na tabulação sem roubar o foco inicial', async () => {
    await reviewWithVoice(
      [
        { at: 0, draft: DRAFT_A },
        { at: 1, draft: DRAFT_B },
      ],
      vi.fn(),
    );

    await userEvent.click(screen.getByRole('button', { name: 'Guardar os documentos →' }));

    expect(document.activeElement?.textContent).toBe('Revisar as respostas');
    await userEvent.tab();
    expect(document.activeElement?.textContent).toBe('Aceitar as 2 transcrições');
  });
});
