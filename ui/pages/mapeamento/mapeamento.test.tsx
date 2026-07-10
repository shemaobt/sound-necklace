import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Player } from '../../../adapters/audio';
import { FixtureVoiceRecorder } from '../../../adapters/voice/fixture';
import {
  buildBeads,
  createSession,
  type Frase,
  L1_Q,
  L2_Q,
  L3_Q,
  questionSequence,
  type ScenePart,
  type SessionState,
  type Span,
} from '../../../domain';
import { sessionStore } from '../../state';
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

describe('Mapeamento — resposta por voz e canal digitado (PRD v2 §8.7, §10.4)', () => {
  it('gravar guarda no caminho exato da pergunta; "de novo" regrava; "ouvir" toca; digitar grava no texto — e ambos coexistem', async () => {
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

    // "ouvir" toca a gravação deste caminho
    await userEvent.click(screen.getByRole('button', { name: 'ouvir' }));
    expect(recorder.playing).toBe(path);

    // o canal digitado escreve na resposta de texto do domínio (coexiste com a voz)
    const textarea = screen.getByRole('textbox');
    await userEvent.type(textarea, 'era uma vez');
    const answer = sessionStore.getState().session!.mapping!.level1.recontar;
    expect(answer).toBe('era uma vez');
    expect(await recorder.has(path)).toBe(true);
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

    await userEvent.click(screen.getByRole('button', { name: 'Anterior' }));
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
  it('não mostra dígito e tem ≤1 linha de instrução', () => {
    load(mapping());
    const { container } = render(<Mapeamento />);

    expect(container.textContent ?? '').not.toMatch(/\d/);
    for (const el of container.querySelectorAll('[aria-label]')) {
      expect(el.getAttribute('aria-label')).not.toMatch(/\d/);
    }
    for (const el of container.querySelectorAll('[title]')) {
      expect(el.getAttribute('title')).not.toMatch(/\d/);
    }
    expect(container.querySelectorAll('[data-role="instruction"]').length).toBeLessThanOrEqual(1);
  });

  it('o palco aplica o fundo creme (redesign §6.6, §4.5)', () => {
    load(mapping());
    const { container } = render(<Mapeamento />);
    expect(container.querySelector('.cds-mapeamento')).not.toBeNull();
    expect(mapeamentoCss).toMatch(/\.cds-mapeamento\s*\{[^}]*var\(--cds-cream\)/);
  });
});
