import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Player } from '../../../adapters/audio';
import {
  activeScene,
  buildBeads,
  createSession,
  modeLocks,
  type ScenePart,
  type SessionState,
  type Span,
  type TagState,
} from '../../../domain';
import { splitByGuard } from '../../atoms/testing/css';
import { sessionStore } from '../../state';
import triageCss from './triage.css?raw';
import Triage from './index';

/**
 * A estação Triage (PRD v2 §8.5, redesign §6.4): uma cena por vez com pontos de
 * progresso, o picker por cena, o estado atual sempre visível, a gaveta de
 * cobertura só-facilitadora, o gate duro "Já classifiquei todas as cenas →" e a
 * explicação de bloqueio quando NENHUMA cena se encaixa. Os testes afirmam
 * comportamento pelo domínio (tagScene/markNoneFit/triagemDone/setMode) e o
 * minimalismo do ouvinte (§9.2) — nada de dígitos na área de foco.
 */

const DURATION = 2.5;
const BEAD_SEC = 0.25; // 10 contas (0…9)

function lockedPart(id: string, span: Span, tag: TagState = 'pending'): ScenePart {
  return {
    part_id: id,
    span,
    locked: true,
    scene_kind: tag === 'tagged' ? 'APPEAL_SCENE' : null,
    scene_kind_confidence: tag === 'tagged' ? 'high' : null,
    tag_state: tag,
  };
}

/** Estado da Triage: cenas travadas e confirmadas, modo triage. */
function triaging(parts: ScenePart[]): SessionState {
  const beads = buildBeads(DURATION, BEAD_SEC);
  const base = createSession({
    durationSec: DURATION,
    beadSec: BEAD_SEC,
    beads,
    manifestId: 'fnv1a32:00000000',
    audioFilename: 'historia.wav',
    slug: 'historia',
  });
  return {
    ...base,
    whole: { ...base.whole, confirmed: true },
    partsConfirmed: true,
    mode: 'triagem',
    parts,
    current: { layer: 'parts', index: -1 },
  };
}

function load(state: SessionState): void {
  sessionStore.getState().load(state);
}

/** Player-espião: registra as chamadas de reprodução sem tocar áudio real. */
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

/** Classifica a cena em foco: escolhe um tipo comum e a confiança "Certeza". */
async function classifyFocused(): Promise<void> {
  await userEvent.click(screen.getByRole('radio', { name: 'Apelo' }));
  await userEvent.click(screen.getByRole('radio', { name: 'Certeza' }));
  await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
}

function dots(): HTMLElement[] {
  return screen.getAllByRole('button', { name: 'ir para a cena' });
}

beforeEach(() => {
  sessionStore.setState({ session: null, review: false, lock: null, online: true });
});
afterEach(() => {
  sessionStore.setState({ session: null, review: false, lock: null, online: true });
});

describe('Triage — classificar cada cena (PRD v2 §8.5)', () => {
  it('classificar um tipo grava tag_state/scene_kind/confiança exatos e avança para a próxima pendente', async () => {
    load(triaging([lockedPart('PT1', { s: 0, e: 4 }), lockedPart('PT2', { s: 5, e: 9 })]));
    render(<Triage />);

    await classifyFocused();

    const s = sessionStore.getState().session!;
    expect(s.parts[0]!.tag_state).toBe('tagged');
    expect(s.parts[0]!.scene_kind).toBe('APPEAL_SCENE');
    expect(s.parts[0]!.scene_kind_confidence).toBe('high');
    // o foco pula para a segunda cena (a próxima pendente)
    expect(dots()[1]!.getAttribute('aria-current')).toBe('step');
  });

  it('“Nenhum se encaixa” marca none_fit e mostra o enquadramento de achado', async () => {
    load(triaging([lockedPart('PT1', { s: 0, e: 4 }), lockedPart('PT2', { s: 5, e: 9 })]));
    render(<Triage />);

    await userEvent.click(screen.getByRole('radio', { name: 'Nenhum se encaixa' }));

    const s = sessionStore.getState().session!;
    expect(s.parts[0]!.tag_state).toBe('none_fit');
    expect(s.parts[0]!.scene_kind).toBeNull();
    expect(screen.getByText('⌀ Nenhum se encaixa')).toBeTruthy();
  });
});

describe('Triage — pontos de progresso (redesign §6.4)', () => {
  it('há um ponto por cena e clicar num ponto salta o foco para aquela cena', async () => {
    load(
      triaging([
        lockedPart('PT1', { s: 0, e: 2 }),
        lockedPart('PT2', { s: 3, e: 5 }),
        lockedPart('PT3', { s: 6, e: 9 }),
      ]),
    );
    render(<Triage />);

    expect(dots()).toHaveLength(3);

    // salta para a segunda cena e classifica: prova que o foco mirou a PT2
    await userEvent.click(dots()[1]!);
    expect(dots()[1]!.getAttribute('aria-current')).toBe('step');
    await classifyFocused();

    const s = sessionStore.getState().session!;
    expect(s.parts[1]!.tag_state).toBe('tagged');
    expect(s.parts[0]!.tag_state).toBe('pending');
  });
});

describe('Triage — o colar da cena em foco (protótipo tColarRows/tapTriageBead)', () => {
  it('tocar numa conta toca a CENA inteira — a estação não tem play, o som vem do colar', async () => {
    const player = spyPlayer();
    load(triaging([lockedPart('PT1', { s: 1, e: 6 }), lockedPart('PT2', { s: 7, e: 9 })]));
    render(<Triage player={player} />);

    document
      .querySelector('.cds-necklace')!
      .dispatchEvent(
        new MouseEvent('pointerdown', { bubbles: true, cancelable: true, clientX: 1, clientY: 1 }),
      );

    expect(player.toggle).toHaveBeenCalledWith('PT1', 1, 6);
  });

  it('o colar segue a cena em foco: saltar de ponto troca o span que o toque reproduz', async () => {
    const player = spyPlayer();
    load(triaging([lockedPart('PT1', { s: 1, e: 6 }), lockedPart('PT2', { s: 7, e: 9 })]));
    render(<Triage player={player} />);

    await userEvent.click(dots()[1]!);
    document
      .querySelector('.cds-necklace')!
      .dispatchEvent(
        new MouseEvent('pointerdown', { bubbles: true, cancelable: true, clientX: 1, clientY: 1 }),
      );

    expect(player.toggle).toHaveBeenCalledWith('PT2', 7, 9);
  });
});

describe('Triage — gate duro "Já classifiquei todas as cenas →" (PRD v2 §8.5)', () => {
  it('com cena pendente não há CTA nenhum — só a cópia de ajuda exata', () => {
    load(
      triaging([lockedPart('PT1', { s: 0, e: 4 }, 'tagged'), lockedPart('PT2', { s: 5, e: 9 })]),
    );
    render(<Triage />);

    // o CTA antigo virou o Continuar da revisão; pendente = nem um, nem outro
    expect(screen.queryByRole('button', { name: 'Já classifiquei todas as cenas →' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Continuar →' })).toBeNull();
    expect(
      screen.getByText('Classifique todas as cenas (ou marque “nenhum se encaixa”) para seguir.'),
    ).toBeTruthy();
  });

  it('habilita a revisão com todas não-pendentes e ≥1 produtiva; "Continuar →" avança para Segmentação', async () => {
    load(
      triaging([
        lockedPart('PT1', { s: 0, e: 4 }, 'tagged'),
        lockedPart('PT2', { s: 5, e: 9 }, 'tagged'),
      ]),
    );
    render(<Triage />);

    // com todas classificadas e ≥1 produtiva, o botão do PRD some — vira revisão
    expect(screen.queryByRole('button', { name: 'Já classifiquei todas as cenas →' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Continuar →' }));

    const s = sessionStore.getState().session!;
    expect(s.mode).toBe('segmentacao');
    expect(s.partsConfirmed).toBe(true);
    expect(modeLocks(s).segmentacao).toBe(true);
    // enterSegmentacao rodou: a cena produtiva está ativa (a estação não fica nula)
    expect(activeScene(s)?.part_id).toBe('PT1');
    expect(s.current.layer).toBe('frases');
  });
});

describe('Triage — momento de revisão quando todas as cenas estão classificadas (design parity)', () => {
  it('todas classificadas (≥1 produtiva) → revisão', () => {
    load(
      triaging([
        lockedPart('PT1', { s: 0, e: 4 }, 'tagged'),
        lockedPart('PT2', { s: 5, e: 9 }, 'tagged'),
      ]),
    );
    render(<Triage />);

    expect(screen.getByText('Todas as cenas classificadas.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Continuar →' })).toBeTruthy();
    expect(screen.queryByText('Essa cena é sobre o quê?')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Já classifiquei todas as cenas →' })).toBeNull();
  });

  it('“Continuar →” entra na Segmentação', async () => {
    load(
      triaging([
        lockedPart('PT1', { s: 0, e: 4 }, 'tagged'),
        lockedPart('PT2', { s: 5, e: 9 }, 'tagged'),
      ]),
    );
    render(<Triage />);

    await userEvent.click(screen.getByRole('button', { name: 'Continuar →' }));

    expect(sessionStore.getState().session!.mode).toBe('segmentacao');
  });

  it('os pontos continuam navegáveis na revisão', async () => {
    load(
      triaging([
        lockedPart('PT1', { s: 0, e: 4 }, 'tagged'),
        lockedPart('PT2', { s: 5, e: 9 }, 'tagged'),
      ]),
    );
    render(<Triage />);
    // na revisão, o picker por cena não aparece por padrão
    expect(screen.queryByText('Essa cena é sobre o quê?')).toBeNull();

    await userEvent.click(dots()[1]!);

    // clicar num ponto volta a mostrar o picker daquela cena
    expect(screen.getByText('Essa cena é sobre o quê?')).toBeTruthy();
  });
});

describe('Triage — todas "nenhum se encaixa" (PRD v2 §8.5)', () => {
  it('mostra a explicação de bloqueio e mantém Segmentação/Conversation travados', () => {
    load(
      triaging([
        lockedPart('PT1', { s: 0, e: 4 }, 'none_fit'),
        lockedPart('PT2', { s: 5, e: 9 }, 'none_fit'),
      ]),
    );
    render(<Triage />);

    expect(screen.getByText(/Segmentação e Mapeamento ficam travadas/)).toBeTruthy();
    // o CTA antigo não existe mais; o lockout NÃO é um momento de revisão — sem "Continuar →"
    expect(screen.queryByRole('button', { name: 'Já classifiquei todas as cenas →' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Continuar →' })).toBeNull();
    const s = sessionStore.getState().session!;
    expect(modeLocks(s).segmentacao).toBe(false);
    expect(modeLocks(s).mapeamento).toBe(false);
  });
});

describe('Triage — cobertura só-facilitadora (PRD v2 §8.5)', () => {
  it('a gaveta só abre por ação explícita; nada dela aparece enquanto fechada', async () => {
    load(
      triaging([lockedPart('PT1', { s: 0, e: 4 }, 'tagged'), lockedPart('PT2', { s: 5, e: 9 })]),
    );
    render(<Triage />);

    expect(screen.queryByText('Cobertura · só facilitadora')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Cobertura (facilitadora)' }));

    expect(screen.getByText('Cobertura · só facilitadora')).toBeTruthy();
  });
});

describe('Triage — minimalismo para o ouvinte (PRD v2 §9.2)', () => {
  it('a área de foco tem ≤1 linha de instrução e nenhum dígito (gaveta fechada)', () => {
    load(triaging([lockedPart('PT1', { s: 0, e: 4 }), lockedPart('PT2', { s: 5, e: 9 })]));
    const { container } = render(<Triage />);

    expect(container.textContent ?? '').not.toMatch(/\d/);
    for (const el of container.querySelectorAll('[aria-label]')) {
      expect(el.getAttribute('aria-label')).not.toMatch(/\d/);
    }
    expect(container.querySelectorAll('[data-role="instruction"]').length).toBeLessThanOrEqual(1);
  });
});

describe('Triage — tratamento creme (redesign §6.4, §4.5)', () => {
  it('o palco aplica o fundo creme via token', () => {
    load(triaging([lockedPart('PT1', { s: 0, e: 4 })]));
    const { container } = render(<Triage />);

    expect(container.querySelector('.cds-triage')).not.toBeNull();
    expect(triageCss).toMatch(/\.cds-triage\s*\{[^}]*var\(--cds-cream\)/);
  });

  it('todo movimento decorativo fica sob prefers-reduced-motion: no-preference', () => {
    const guard = /@media\s*\(prefers-reduced-motion:\s*no-preference\)/;
    const { outside } = splitByGuard(triageCss, guard);
    expect(outside).not.toMatch(/animation|@keyframes/);
  });
});

describe('Triage — reouvir na revisão não pode custar a saída', () => {
  it('tocar num ponto para reouvir uma cena mantém o "Continuar →" ao alcance', async () => {
    load(
      triaging([
        lockedPart('PT1', { s: 0, e: 4 }, 'tagged'),
        lockedPart('PT2', { s: 5, e: 9 }, 'tagged'),
      ]),
    );
    render(<Triage />);
    expect(screen.getByRole('button', { name: 'Continuar →' })).toBeTruthy();

    // a facilitadora toca um ponto só para reouvir a cena 2 (é para isso que o
    // colar está lá) — sem mudar classificação nenhuma
    await userEvent.click(dots()[1]!);

    // ela ainda consegue seguir: sem isto, o único jeito de avançar seria
    // RECLASSIFICAR uma cena que ela não queria mexer
    expect(screen.getByRole('button', { name: 'Continuar →' })).toBeTruthy();
  });
});
