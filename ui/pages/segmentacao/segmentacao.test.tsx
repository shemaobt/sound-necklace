import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Player } from '../../../adapters/audio';
import {
  buildBeads,
  createSession,
  type Frase,
  type ScenePart,
  type SessionState,
  type Span,
} from '../../../domain';
import { splitByGuard } from '../../atoms/testing/css';
import { sessionStore } from '../../state';
import segmentacaoCss from './segmentacao.css?raw';
import Segmentacao from './index';

/**
 * A estação Segmentação (PRD v2 §8.6, redesign §6.5): uma cena produtiva por vez,
 * o colar em janela na cena ativa, a frase ancorada pela fronteira do domínio (com
 * back-reach da 1ª frase) e o seam-modal na travessia de borda. Os testes afirmam
 * o COMPORTAMENTO delegado ao domínio — travar/validar/cruzar-borda/mover/reancorar/
 * escalar/sinalizar/remover/cena-vazia/avançar — mais o minimalismo do ouvinte (§9.2)
 * e o tratamento creme (redesign §6.5, §4.5).
 */

const DURATION = 7.5; // 30 contas (0…29)
const BEAD_SEC = 0.25; // margem da janela = max(3, round(2/0.25)=8) = 8

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

function productive(id: string, span: Span, kind = 'BIRTH_SCENE'): ScenePart {
  return part({
    part_id: id,
    span,
    locked: true,
    scene_kind: kind,
    scene_kind_confidence: 'alta',
    tag_state: 'tagged',
  });
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

/** Estado da Segmentação: história+cenas confirmadas, uma cena produtiva ativa. */
function segmenting(overrides: Partial<SessionState>): SessionState {
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
    mode: 'segmentacao',
    parts: [productive('PT1', { s: 12, e: 18 })],
    frases: [frase({ prop_id: 'P1' })],
    current: { layer: 'frases', index: 0 },
    activeSceneId: 'PT1',
    ...overrides,
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

beforeEach(() => {
  sessionStore.setState({ session: null, review: false, lock: null, online: true });
});
afterEach(() => {
  sessionStore.setState({ session: null, review: false, lock: null, online: true });
});

describe('Segmentação — janela na cena ativa (PRD v2 §8.6)', () => {
  it('mostra só a cena ativa ± margem: banda tracejada presente, contas de fora ausentes', () => {
    load(segmenting({}));
    const { container } = render(<Segmentacao />);
    // banda tracejada da cena desperta
    expect(container.querySelector('.cds-necklace-scene-band')).not.toBeNull();
    // a cena é {12,18}, margem 8 → janela 4..26; a conta 0 fica fora e não renderiza
    expect(container.querySelector('[data-idx="0"]')).toBeNull();
    // uma conta dentro da cena renderiza
    expect(container.querySelector('[data-idx="15"]')).not.toBeNull();
  });

  it('“▶ ouvir a cena” toca só o span da cena ativa', async () => {
    const player = spyPlayer();
    load(segmenting({}));
    render(<Segmentacao player={player} />);

    await userEvent.click(screen.getByRole('button', { name: '▶ ouvir a cena' }));

    expect(player.toggle).toHaveBeenCalledWith('PT1', 12, 18);
  });

  it('o título lê “Cena N · <tipo>” por extenso e o botão da última cena avança para o Mapeamento', () => {
    load(segmenting({}));
    render(<Segmentacao />);
    expect(screen.getByText('Cena um · Nascimento')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Já segmentei todas as cenas →' })).toBeTruthy();
  });

  it('numa cena não-final o botão primário lê “Pronto com esta cena →”', () => {
    load(
      segmenting({
        parts: [productive('PT1', { s: 12, e: 18 }), productive('PT2', { s: 19, e: 25 })],
        activeSceneId: 'PT1',
      }),
    );
    render(<Segmentacao />);
    expect(screen.getByRole('button', { name: 'Pronto com esta cena →' })).toBeTruthy();
  });
});

describe('Segmentação — ancorar a frase e validar (PRD v2 §8.6)', () => {
  it('confirmar uma frase dentro da cena trava o span e mostra o chip', async () => {
    load(segmenting({ selection: { s: 12, e: 15 }, pendingStart: null }));
    render(<Segmentacao />);

    await userEvent.click(screen.getByRole('button', { name: '✓ Confirmar esta frase' }));

    const s = sessionStore.getState().session!;
    const locked = s.frases.find((f) => f.prop_id === 'P1')!;
    expect(locked.locked).toBe(true);
    expect(locked.span).toEqual({ s: 12, e: 15 });
    expect(locked.part_link).toBe('PT1');
    expect(screen.getByRole('group', { name: 'Frase um' })).toBeTruthy();
  });

  it('sem seleção completa mostra a cópia exata e não trava', async () => {
    load(segmenting({ selection: null, pendingStart: null }));
    render(<Segmentacao />);

    await userEvent.click(screen.getByRole('button', { name: '✓ Confirmar esta frase' }));

    expect(screen.getByText('Clique o início e o fim da frase no colar.')).toBeTruthy();
    expect(sessionStore.getState().session!.frases[0]!.locked).toBe(false);
  });

  it('frase começando antes da fronteira mostra a cópia com a conta da emenda', async () => {
    load(segmenting({ selection: { s: 10, e: 14 }, pendingStart: null }));
    render(<Segmentacao />);

    await userEvent.click(screen.getByRole('button', { name: '✓ Confirmar esta frase' }));

    expect(screen.getByText('A frase não pode começar antes da conta 12.')).toBeTruthy();
    expect(sessionStore.getState().session!.frases[0]!.locked).toBe(false);
  });

  it('frase terminando fora do colar mostra a cópia exata', async () => {
    load(segmenting({ selection: { s: 14, e: 30 }, pendingStart: null }));
    render(<Segmentacao />);

    await userEvent.click(screen.getByRole('button', { name: '✓ Confirmar esta frase' }));

    expect(screen.getByText('A frase precisa terminar dentro do colar.')).toBeTruthy();
    expect(sessionStore.getState().session!.frases[0]!.locked).toBe(false);
  });
});

describe('Segmentação — travessia de borda (seam modal, PRD v2 §8.6)', () => {
  it('uma seleção que passa da borda abre o modal na variante simples', async () => {
    load(segmenting({ selection: { s: 14, e: 20 }, pendingStart: null }));
    render(<Segmentacao />);

    await userEvent.click(screen.getByRole('button', { name: '✓ Confirmar esta frase' }));

    expect(screen.getByText('A frase passou da borda da cena.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Mover a borda até aqui' })).toBeTruthy();
  });

  it('“Mover a borda até aqui” desliza a costura e trava a frase', async () => {
    load(segmenting({ selection: { s: 14, e: 20 }, pendingStart: null }));
    render(<Segmentacao />);

    await userEvent.click(screen.getByRole('button', { name: '✓ Confirmar esta frase' }));
    await userEvent.click(screen.getByRole('button', { name: 'Mover a borda até aqui' }));

    const s = sessionStore.getState().session!;
    expect(s.parts.find((p) => p.part_id === 'PT1')!.span).toEqual({ s: 12, e: 20 });
    const locked = s.frases.find((f) => f.prop_id === 'P1')!;
    expect(locked.locked).toBe(true);
    expect(locked.span).toEqual({ s: 14, e: 20 });
  });

  it('“Reancorar dentro da cena” limpa a seleção e não trava', async () => {
    load(segmenting({ selection: { s: 14, e: 20 }, pendingStart: null }));
    render(<Segmentacao />);

    await userEvent.click(screen.getByRole('button', { name: '✓ Confirmar esta frase' }));
    await userEvent.click(screen.getByRole('button', { name: 'Reancorar dentro da cena' }));

    const s = sessionStore.getState().session!;
    expect(s.selection).toBeNull();
    expect(s.frases[0]!.locked).toBe(false);
    expect(screen.queryByText('A frase passou da borda da cena.')).toBeNull();
  });

  it('vizinha produtiva com frases escala para a Triagem', async () => {
    load(
      segmenting({
        parts: [productive('PT1', { s: 12, e: 18 }), productive('PT2', { s: 19, e: 25 })],
        activeSceneId: 'PT1',
        // PT2 já tem uma frase travada → twoProd → só "Voltar à Triagem"/"Reancorar"
        frases: [
          frase({ prop_id: 'P2', span: { s: 19, e: 22 }, part_link: 'PT2', locked: true }),
          frase({ prop_id: 'P1' }),
        ],
        current: { layer: 'frases', index: 1 },
        selection: { s: 14, e: 22 },
        pendingStart: null,
      }),
    );
    render(<Segmentacao />);

    await userEvent.click(screen.getByRole('button', { name: '✓ Confirmar esta frase' }));
    expect(screen.queryByRole('button', { name: 'Mover a borda até aqui' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Voltar à Triagem' }));

    expect(sessionStore.getState().session!.mode).toBe('triagem');
  });
});

describe('Segmentação — chips das frases travadas (redesign §6.5)', () => {
  function withLockedPhrase(): void {
    load(
      segmenting({
        frases: [
          frase({ prop_id: 'P1', span: { s: 12, e: 15 }, part_link: 'PT1', locked: true }),
          frase({ prop_id: 'P2' }),
        ],
        current: { layer: 'frases', index: 1 },
      }),
    );
  }

  it('“⚑ revisar” alterna a marca de revisão', async () => {
    withLockedPhrase();
    render(<Segmentacao />);

    const chip = screen.getByRole('group', { name: 'Frase um' });
    await userEvent.click(within(chip).getByRole('button', { name: '⚑ revisar' }));

    expect(sessionStore.getState().session!.frases[0]!.flagged).toBe(true);
    expect(screen.getByRole('button', { name: '⚑ marcada' })).toBeTruthy();
  });

  it('“Remover” apaga a frase travada', async () => {
    withLockedPhrase();
    render(<Segmentacao />);

    const chip = screen.getByRole('group', { name: 'Frase um' });
    await userEvent.click(within(chip).getByRole('button', { name: 'Remover' }));

    expect(sessionStore.getState().session!.frases.some((f) => f.prop_id === 'P1')).toBe(false);
  });

  it('“▶ ouvir” de um chip toca o span da frase travada', async () => {
    const player = spyPlayer();
    withLockedPhrase();
    render(<Segmentacao player={player} />);

    const chip = screen.getByRole('group', { name: 'Frase um' });
    await userEvent.click(within(chip).getByRole('button', { name: 'Tocar' }));

    expect(player.toggle).toHaveBeenCalledWith('P1', 12, 15);
  });
});

describe('Segmentação — cena vazia e navegação (PRD v2 §8.6)', () => {
  it('sair de uma cena sem frases avisa uma vez; o segundo clique segue', async () => {
    load(segmenting({}));
    render(<Segmentacao />);

    const done = () => screen.getByRole('button', { name: 'Já segmentei todas as cenas →' });
    await userEvent.click(done());
    expect(
      screen.getByText('Esta cena ficou sem frases. Clique de novo para seguir mesmo assim.'),
    ).toBeTruthy();
    expect(sessionStore.getState().session!.mode).toBe('segmentacao');

    await userEvent.click(done());
    expect(sessionStore.getState().session!.mode).toBe('mapeamento');
  });

  it('concluir a última cena (com frase) leva ao Mapeamento', async () => {
    load(
      segmenting({
        frases: [
          frase({ prop_id: 'P1', span: { s: 12, e: 15 }, part_link: 'PT1', locked: true }),
          frase({ prop_id: 'P2' }),
        ],
        current: { layer: 'frases', index: 1 },
      }),
    );
    render(<Segmentacao />);

    await userEvent.click(screen.getByRole('button', { name: 'Já segmentei todas as cenas →' }));

    expect(sessionStore.getState().session!.mode).toBe('mapeamento');
  });

  it('“← Voltar” na primeira cena volta à Triagem', async () => {
    load(segmenting({}));
    render(<Segmentacao />);

    await userEvent.click(screen.getByRole('button', { name: '← Voltar' }));

    expect(sessionStore.getState().session!.mode).toBe('triagem');
  });

  it('“← Voltar” fora da primeira cena vai à cena produtiva anterior', async () => {
    load(
      segmenting({
        parts: [productive('PT1', { s: 12, e: 18 }), productive('PT2', { s: 19, e: 25 })],
        activeSceneId: 'PT2',
      }),
    );
    render(<Segmentacao />);

    await userEvent.click(screen.getByRole('button', { name: '← Voltar' }));

    const s = sessionStore.getState().session!;
    expect(s.mode).toBe('segmentacao');
    expect(s.activeSceneId).toBe('PT1');
  });
});

describe('Segmentação — momento de revisão quando as frases cobrem a cena (design parity)', () => {
  it('frases cobrindo a cena → revisão', () => {
    load(
      segmenting({
        frases: [frase({ prop_id: 'P1', span: { s: 12, e: 18 }, part_link: 'PT1', locked: true })],
        current: { layer: 'frases', index: -1 },
        selection: null,
        pendingStart: null,
      }),
    );
    render(<Segmentacao />);

    expect(screen.getByText('As frases desta cena estão prontas.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Continuar →' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '✓ Confirmar esta frase' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Pronto com esta cena →' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Já segmentei todas as cenas →' })).toBeNull();
  });

  it('“Continuar →” vai à próxima cena (ou ao Mapeamento na última)', async () => {
    load(
      segmenting({
        parts: [productive('PT1', { s: 12, e: 18 }), productive('PT2', { s: 19, e: 25 })],
        frases: [
          frase({ prop_id: 'P1', span: { s: 12, e: 18 }, part_link: 'PT1', locked: true }),
          frase({ prop_id: 'P2', span: { s: 19, e: 25 }, part_link: 'PT2', locked: true }),
        ],
        activeSceneId: 'PT1',
        current: { layer: 'frases', index: -1 },
        selection: null,
        pendingStart: null,
      }),
    );
    render(<Segmentacao />);
    expect(screen.getByText('Cena um · Nascimento')).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: 'Continuar →' }));
    expect(screen.getByText('Cena dois · Nascimento')).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: 'Continuar →' }));
    expect(sessionStore.getState().session!.mode).toBe('mapeamento');
  });

  it('frases esparsas mantêm o botão do PRD', () => {
    load(
      segmenting({
        frases: [
          frase({ prop_id: 'P1', span: { s: 12, e: 14 }, part_link: 'PT1', locked: true }),
          frase({ prop_id: 'P2' }),
        ],
        current: { layer: 'frases', index: 1 },
      }),
    );
    render(<Segmentacao />);

    expect(screen.getByRole('button', { name: 'Já segmentei todas as cenas →' })).toBeTruthy();
    expect(screen.queryByText('As frases desta cena estão prontas.')).toBeNull();
  });
});

describe('Segmentação — minimalismo para o ouvinte (PRD v2 §9.2)', () => {
  it('não mostra dígito, tem ≤1 linha de instrução e exatamente uma ação dominante', () => {
    load(segmenting({ selection: null, pendingStart: null }));
    const { container } = render(<Segmentacao />);

    expect(container.textContent ?? '').not.toMatch(/\d/);
    for (const el of container.querySelectorAll('[aria-label]')) {
      expect(el.getAttribute('aria-label')).not.toMatch(/\d/);
    }
    for (const el of container.querySelectorAll('[title]')) {
      expect(el.getAttribute('title')).not.toMatch(/\d/);
    }
    expect(container.querySelectorAll('[data-role="instruction"]').length).toBeLessThanOrEqual(1);
    expect(container.querySelectorAll('[data-role="primary-action"]')).toHaveLength(1);
  });
});

describe('Segmentação — tratamento creme (redesign §6.5, §4.5)', () => {
  it('o palco aplica o fundo creme', () => {
    load(segmenting({}));
    const { container } = render(<Segmentacao />);

    expect(container.querySelector('.cds-segmentacao')).not.toBeNull();
    expect(segmentacaoCss).toMatch(/\.cds-segmentacao\s*\{[^}]*var\(--cds-cream\)/);
  });

  it('todo movimento decorativo fica sob prefers-reduced-motion: no-preference', () => {
    const guard = /@media\s*\(prefers-reduced-motion:\s*no-preference\)/;
    const { outside } = splitByGuard(segmentacaoCss, guard);
    expect(outside).not.toMatch(/animation|@keyframes/);
  });
});
