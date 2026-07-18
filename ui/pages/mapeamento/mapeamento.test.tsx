import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Player } from '../../../adapters/audio';
import { FixtureSpeechSynthesizer } from '../../../adapters/tts/fixture';
import { FixtureVoiceRecorder } from '../../../adapters/voice/fixture';
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
import mapeamentoCss from './mapeamento.css?raw';
import Mapeamento from './index';

/**
 * A estação Conversa (Mapeamento, PRD v2 §8.7, redesign §6.6): uma pergunta por
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
    scene_kind_confidence: 'alta',
    tag_state: 'tagged',
  });
}

function noneFit(id: string, span: Span): ScenePart {
  return part({ part_id: id, span, locked: true, scene_kind: null, tag_state: 'none_fit' });
}

function frase(overrides: Partial<Frase>): Frase {
  return {
    prop_id: 'P1',
    statement_pt: '',
    qa: [],
    span: null,
    part_link: null,
    locked: false,
    flagged: false,
    ...overrides,
  };
}

/** Sessão em Mapeamento: história+cenas confirmadas, 1 cena tagged + 1 none_fit, 2 frases. */
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

describe('Mapeamento — retomada no ponto onde parou (ENG-321)', () => {
  it('reabre na primeira pergunta sem resposta quando há respostas de texto salvas', () => {
    let state = ensureMapping(mapping());
    const seq = questionSequence(state);
    for (const slot of seq.slice(0, 3)) state = setAnswer(state, slot, 'respondida');

    load(state);
    render(<Mapeamento />);
    expect(questionText()).toBe(seq[3]!.question.q);
  });

  it('resposta por voz persistida também conta (entrevista só-voz)', () => {
    const state = ensureMapping(mapping());
    const seq = questionSequence(state);
    const voice = seq.slice(0, 5).map((s) => voiceAnswerPath(s));

    load(state);
    render(<Mapeamento voicePaths={() => voice} />);
    expect(questionText()).toBe(seq[5]!.question.q);
  });

  it('com tudo respondido, reabre na última pergunta (o relatório fica a um passo)', () => {
    const state = ensureMapping(mapping());
    const seq = questionSequence(state);
    const voice = seq.map((s) => voiceAnswerPath(s));

    load(state);
    render(<Mapeamento voicePaths={() => voice} />);
    expect(questionText()).toBe(seq[seq.length - 1]!.question.q);
  });

  it('sem resposta nenhuma, começa na primeira pergunta', () => {
    load(mapping());
    render(<Mapeamento />);
    expect(questionText()).toBe(questionSequence(ensureMapping(mapping()))[0]!.question.q);
  });
});

describe('Mapeamento — a sequência completa da conversa (PRD v2 §8.7)', () => {
  it('percorre 11 + 5×2 + 5×2 perguntas na ordem do domínio, com a cena none_fit incluída no nível 2', async () => {
    const state = mapping();
    const expected = questionSequence(state).map((s) => s.question.q);
    expect(expected).toHaveLength(11 + 5 * 2 + 5 * 2);
    // a cena none_fit (PT2) contribui suas 5 perguntas de nível 2
    expect(expected.filter((q) => q === L2_Q[0]!.q)).toHaveLength(2);
    // nível 3 só das frases da cena produtiva (2 frases × 5)
    expect(expected.filter((q) => q === L3_Q[0]!.q)).toHaveLength(2);

    load(state);
    render(<Mapeamento />);

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
    render(<Mapeamento />);

    for (let i = 0; i < total - 1; i += 1) await next();
    // ainda numa pergunta
    expect(questionText()).toBe(L3_Q[L3_Q.length - 1]!.q);
    await next();
    expect(screen.getByRole('region', { name: 'relatório' })).toBeTruthy();
  });
});

describe('Mapeamento — o ▶ do span de cada nível (PRD v2 §8.7)', () => {
  it('nível 1 toca a história inteira, nível 2 a cena e nível 3 a frase', async () => {
    const player = spyPlayer();
    load(mapping());
    render(<Mapeamento player={player} />);

    await userEvent.click(screen.getByRole('button', { name: '▶ ouvir a história' }));
    expect(player.toggle).toHaveBeenLastCalledWith('historia', 0, 29);

    // avança até a primeira pergunta de nível 2 (índice 11)
    for (let i = 0; i < 11; i += 1) await next();
    await userEvent.click(screen.getByRole('button', { name: '▶ ouvir a cena' }));
    expect(player.toggle).toHaveBeenLastCalledWith('PT1', 2, 8);

    // avança até a primeira pergunta de nível 3 (índice 21)
    for (let i = 0; i < 10; i += 1) await next();
    await userEvent.click(screen.getByRole('button', { name: '▶ ouvir a frase' }));
    expect(player.toggle).toHaveBeenLastCalledWith('P1', 2, 4);
  });
});

describe('Mapeamento — resposta por voz, entrevista só-voz (PRD v2 §8.7, §10.4, design parity)', () => {
  it('gravar guarda no caminho exato da pergunta; "de novo" regrava; "listen" toca; NÃO há canal digitado na entrevista', async () => {
    const recorder = new FixtureVoiceRecorder();
    load(mapping());
    render(<Mapeamento recorder={recorder} />);

    const path = 'respostas/level1/recontar.webm';
    expect(await recorder.has(path)).toBe(false);

    await userEvent.click(screen.getByRole('button', { name: 'gravar a resposta' }));
    await userEvent.click(screen.getByRole('button', { name: 'Parar' }));
    expect(await recorder.has(path)).toBe(true);

    // "de novo" volta ao microfone e regrava no MESMO caminho
    await userEvent.click(screen.getByRole('button', { name: 'de novo' }));
    await userEvent.click(screen.getByRole('button', { name: 'gravar a resposta' }));
    await userEvent.click(screen.getByRole('button', { name: 'Parar' }));
    expect(await recorder.has(path)).toBe(true);

    // "listen" toca a gravação deste caminho
    await userEvent.click(screen.getByRole('button', { name: 'ouvir' }));
    expect(recorder.playing).toBe(path);

    // a digitação saiu do palco da entrevista — vive só no relatório (ui/pages/relatorio)
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('parar avisa o shell (onVoiceSaved) com o caminho canônico da pergunta', async () => {
    const recorder = new FixtureVoiceRecorder();
    const onVoiceSaved = vi.fn();
    load(mapping());
    render(<Mapeamento recorder={recorder} onVoiceSaved={onVoiceSaved} />);

    await userEvent.click(screen.getByRole('button', { name: 'gravar a resposta' }));
    await userEvent.click(screen.getByRole('button', { name: 'Parar' }));
    expect(onVoiceSaved).toHaveBeenCalledWith('respostas/level1/recontar.webm');
  });

  it('parar após desmontar (navegar no meio do await) NÃO avisa o shell — sem contaminar outra sessão', async () => {
    const recorder = new FixtureVoiceRecorder();
    const startSpy = vi.spyOn(recorder, 'start');
    const onVoiceSaved = vi.fn();
    load(mapping());
    const { unmount } = render(<Mapeamento recorder={recorder} onVoiceSaved={onVoiceSaved} />);

    await userEvent.click(screen.getByRole('button', { name: 'gravar a resposta' }));
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

  it('navegar durante a gravação cancela a gravação em curso (libera o microfone)', async () => {
    const recorder = new FixtureVoiceRecorder();
    const startSpy = vi.spyOn(recorder, 'start');
    load(mapping());
    render(<Mapeamento recorder={recorder} />);

    await userEvent.click(screen.getByRole('button', { name: 'gravar a resposta' }));
    const rec = await startSpy.mock.results[0]!.value;
    const cancelSpy = vi.spyOn(rec, 'cancel');

    // trocar de pergunta remonta a tela; a gravação órfã tem de ser cancelada
    await next();
    expect(cancelSpy).toHaveBeenCalled();
  });
});

describe('Mapeamento — perguntas conduzidas pela facilitadora (PRD v2 §8.7)', () => {
  it('a pergunta de ausência (nível 1) mostra o marcador de papel e a nota da facilitadora', async () => {
    load(mapping());
    render(<Mapeamento />);

    // a 11ª pergunta de L1 é "ausencia" (índice 10)
    for (let i = 0; i < 10; i += 1) await next();
    expect(questionText()).toBe(L1_Q[10]!.q);
    expect(screen.getByRole('img', { name: 'conduzida pela facilitadora' })).toBeTruthy();
    expect(screen.getByText(new RegExp(L1_Q[10]!.note!.slice(0, 12)))).toBeTruthy();
  });
});

describe('Mapeamento — navegação entre níveis (referência mapNav L1099–1133)', () => {
  it('“Anterior” na primeira pergunta volta à Segmentação', async () => {
    load(mapping());
    render(<Mapeamento />);

    await userEvent.click(screen.getByRole('button', { name: '← anterior' }));
    expect(sessionStore.getState().session!.mode).toBe('segmentacao');
  });

  it('do relatório o “← anterior” volta à última pergunta', async () => {
    const state = mapping();
    const total = questionSequence(state).length;
    load(state);
    render(<Mapeamento />);

    for (let i = 0; i < total; i += 1) await next();
    expect(screen.getByRole('region', { name: 'relatório' })).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: '← anterior' }));
    expect(questionText()).toBe(L3_Q[L3_Q.length - 1]!.q);
  });
});

describe('Mapeamento — minimalismo para o ouvinte (PRD v2 §9.2)', () => {
  it('não mostra dígito e tem ≤1 linha de instrução — incluindo as telas de cena e de frase', async () => {
    load(mapping());
    const { container } = render(<Mapeamento />);

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
    const { container } = render(<Mapeamento />);
    expect(container.querySelector('.cds-mapeamento')).not.toBeNull();
    // Protótipo: a tela INTEIRA é oliva — pintado pelo shell via :has(); um fundo
    // aqui criaria a "faixa escura dentro de moldura clara" que não existe lá.
    expect(mapeamentoCss).not.toMatch(/\.cds-mapeamento\s*\{[^}]*background/);
  });
});

describe('Mapeamento — a voz do guia (ENG-280)', () => {
  beforeEach(() => {
    if (appStore.getState().muted) appStore.getState().toggleMuted(); // som LIGADO por padrão
  });
  afterEach(() => {
    if (appStore.getState().muted) appStore.getState().toggleMuted();
  });

  it('com o som ligado, o guia fala a pergunta ao chegar nela, em pt-BR', () => {
    const tts = new FixtureSpeechSynthesizer();
    load(mapping());
    render(<Mapeamento speaker={tts} />);

    expect(tts.spoken).toEqual([{ text: questionText(), lang: 'pt-BR' }]);
  });

  it('"Ouvir a pergunta" repete a pergunta em foco', async () => {
    const tts = new FixtureSpeechSynthesizer();
    load(mapping());
    render(<Mapeamento speaker={tts} />);

    await userEvent.click(screen.getByRole('button', { name: 'Ouvir a pergunta' }));

    expect(tts.spoken).toHaveLength(2);
    expect(tts.spoken.at(-1)!.text).toBe(questionText());
  });

  it('avançar fala a pergunta NOVA', async () => {
    const tts = new FixtureSpeechSynthesizer();
    load(mapping());
    render(<Mapeamento speaker={tts} />);
    const primeira = questionText();

    await next();

    expect(questionText()).not.toBe(primeira);
    expect(tts.spoken.at(-1)).toEqual({ text: questionText(), lang: 'pt-BR' });
  });

  it('com a UI em inglês fala a pergunta EM INGLÊS — texto e voz nunca divergem', async () => {
    const tts = new FixtureSpeechSynthesizer();
    await act(() => i18n.changeLanguage('en'));
    load(mapping());
    render(<Mapeamento speaker={tts} />);

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
    render(<Mapeamento speaker={tts} />);
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
    render(<Mapeamento speaker={tts} />);

    expect(tts.spoken).toEqual([]);
    expect(screen.queryByRole('button', { name: 'Ouvir a pergunta' })).toBeNull();
    expect(document.querySelector('[data-speaking]')?.getAttribute('data-speaking')).toBe('false');
  });
});

describe('Mapeamento — a passagem para o relatório (ENG-250)', () => {
  it('a resposta em VOZ chega tocável ao relatório: o card promete voz, não um campo vazio', async () => {
    const recorder = new FixtureVoiceRecorder();
    load(mapping());
    render(<Mapeamento recorder={recorder} />);

    await userEvent.click(screen.getByRole('button', { name: 'gravar a resposta' }));
    await userEvent.click(screen.getByRole('button', { name: 'Parar' }));

    // anda até o relatório (a última "Próxima pergunta" abre a prévia)
    const total = questionSequence(sessionStore.getState().session!).length;
    for (let i = 0; i < total; i++) {
      await userEvent.click(screen.getByRole('button', { name: 'Próxima pergunta' }));
    }

    // a gravação da 1ª pergunta é ouvível LÁ — sem o recorder o card cairia no
    // "ainda sem resposta gravada" e a voz ficaria inalcançável
    const play = await screen.findByRole('button', { name: '▶ ouvir a resposta' });
    await userEvent.click(play);
    expect(recorder.playing).toBe('respostas/level1/recontar.webm');
  });
});

describe('Mapeamento — o relatório não é o fim do fluxo (protótipo toExport)', () => {
  it('a prévia oferece "Guardar os documentos →": a última tela do protótipo não fica só no fio de contas', async () => {
    const onGoToExport = vi.fn();
    load(mapping());
    render(<Mapeamento onGoToExport={onGoToExport} />);

    const total = questionSequence(sessionStore.getState().session!).length;
    for (let i = 0; i < total; i++) {
      await userEvent.click(screen.getByRole('button', { name: 'Próxima pergunta' }));
    }

    await userEvent.click(screen.getByRole('button', { name: 'Guardar os documentos →' }));

    expect(onGoToExport).toHaveBeenCalled();
  });
});

describe('Mapeamento — fronteira de IO real da resposta (ENG-247)', () => {
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
    render(<Mapeamento recorder={recorder} onVoiceSaved={onVoiceSaved} />);

    await userEvent.click(screen.getByRole('button', { name: 'gravar a resposta' }));
    await userEvent.click(screen.getByRole('button', { name: 'Parar' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('A resposta não foi guardada.');
    // volta ao microfone (nada preso em "gravando"), e o shell NÃO registrou o caminho
    expect(screen.getByRole('button', { name: 'gravar a resposta' })).toBeTruthy();
    expect(onVoiceSaved).not.toHaveBeenCalled();
  });
});
