import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  FixtureAudioEngine,
  type PcmSpec,
  pcmSpecBytes,
  type Player,
} from '../../../adapters/audio';
import { buildBeads, createSession, type SessionState } from '../../../domain';
import { splitByGuard } from '../../atoms/testing/css';
import { sessionStore } from '../../state';
import listenCss from './listen.css?raw';
import Listen from './index';

/**
 * A estação cerimonial de abertura (PRD v2 §8.3): decisão única, o colar como
 * transporte, e o tratamento full-bleed olive (redesign §6.2). Os testes afirmam
 * comportamento de fronteira: o estado da sessão avança/reverte pelo domínio, a
 * cópia de erro exata do domínio aparece, o áudio de fixture toca a partir do
 * começo, e as guardas de minimalismo/cerimonial do ouvinte (§9.2, §4.5).
 */

const DURATION = 2.5;
const BEAD_SEC = 0.25; // 10 contas (0…9)
const SPEC: PcmSpec = { seed: 42, sampleRate: 8000, samples: 20000, channels: 1 };

function makeSession(overrides?: Partial<SessionState>, durationSec = DURATION): SessionState {
  const beads = buildBeads(durationSec, BEAD_SEC);
  const base = createSession({
    durationSec,
    beadSec: BEAD_SEC,
    beads,
    manifestId: 'fnv1a32:00000000',
    audioFilename: 'historia.wav',
    slug: 'historia',
  });
  return { ...base, ...overrides };
}

async function makePlayer(): Promise<{ engine: FixtureAudioEngine; player: Player }> {
  const engine = new FixtureAudioEngine();
  const decoded = await engine.decode(pcmSpecBytes(SPEC));
  const player = engine.createPlayer(decoded, BEAD_SEC);
  return { engine, player };
}

beforeEach(() => {
  sessionStore.setState({ session: null, review: false, lock: null, online: true });
});
afterEach(() => {
  sessionStore.setState({ session: null, review: false, lock: null, online: true });
});

describe('Escuta 1 — decisão única ligada ao domínio (PRD v2 §8.3)', () => {
  it('confirmar avança o fluxo guiado (história confirmada, camada de cenas)', async () => {
    sessionStore.getState().load(makeSession());
    render(<Listen />);

    await userEvent.click(screen.getByRole('button', { name: 'Já ouvi a história completa' }));

    expect(sessionStore.getState().session?.whole.confirmed).toBe(true);
    expect(screen.queryByRole('button', { name: 'Já ouvi a história completa' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Reabrir' })).toBeTruthy();
  });

  it('"Reabrir" reverte a confirmação', async () => {
    sessionStore.getState().load(makeSession());
    render(<Listen />);

    await userEvent.click(screen.getByRole('button', { name: 'Já ouvi a história completa' }));
    await userEvent.click(screen.getByRole('button', { name: 'Reabrir' }));

    expect(sessionStore.getState().session?.whole.confirmed).toBe(false);
    expect(screen.getByRole('button', { name: 'Já ouvi a história completa' })).toBeTruthy();
  });

  it('confirmar com span incompleto mostra a cópia PT-BR exata e não avança', async () => {
    const incompleto = makeSession();
    sessionStore.getState().load({
      ...incompleto,
      whole: { ...incompleto.whole, span: { s: 0, e: incompleto.totalBeads - 2 } },
    });
    render(<Listen />);

    await userEvent.click(screen.getByRole('button', { name: 'Já ouvi a história completa' }));

    expect(
      screen.getByText('O áudio precisa cobrir a história inteira — da conta 0 à conta 9.'),
    ).toBeTruthy();
    expect(sessionStore.getState().session?.whole.confirmed).toBe(false);
  });

  it('o toque na conta toca a história dali (sem botão de play — som nas contas)', async () => {
    const { engine, player } = await makePlayer();
    const heads: (number | null)[] = [];
    player.onHead((h) => heads.push(h));
    sessionStore.getState().load(makeSession());
    render(<Listen player={player} />);

    document
      .querySelector('.cds-necklace')!
      .dispatchEvent(
        new MouseEvent('pointerdown', { bubbles: true, cancelable: true, clientX: 1, clientY: 1 }),
      );
    engine.transport.advance(0.05);

    expect(heads[0]).toBe(0);
  });

  // data-heard vive no wrapper [data-role="primary-action"] (index.tsx)
  const heardTarget = (): Element | null =>
    screen
      .getByRole('button', { name: 'Já ouvi a história completa' })
      .closest('[data-role="primary-action"]');

  /** Toca a partir da conta `from` e deixa a cabeça correr até o fim do áudio. */
  function playToEnd(engine: FixtureAudioEngine, from: number): void {
    act(() => {
      // sem botão de play: o toque na conta é o transporte (decisão do dono)
      document.querySelector('.cds-necklace')!.dispatchEvent(
        new MouseEvent('pointerdown', {
          bubbles: true,
          cancelable: true,
          // jsdom zera as medidas → todo toque cai na conta 0; a janela [from, fim]
          // é montada tocando direto a partir de `from` quando preciso
          clientX: 1,
          clientY: 1,
        }),
      );
      engine.transport.advance(0.05);
      for (let bead = from; bead < 10; bead++) engine.transport.advance(BEAD_SEC);
    });
  }

  it('o pill de confirmação acende quando a cabeça percorre a história inteira', async () => {
    const { engine, player } = await makePlayer();
    sessionStore.getState().load(makeSession());
    render(<Listen player={player} />);

    expect(heardTarget()?.getAttribute('data-heard')).not.toBe('true');
    playToEnd(engine, 0);
    expect(heardTarget()?.getAttribute('data-heard')).toBe('true');
  });

  it('amostrar só o fim da história NÃO acende o pill (cobertura cumulativa)', async () => {
    const { engine, player } = await makePlayer();
    sessionStore.getState().load(makeSession());
    render(<Listen player={player} />);

    // toca a partir da conta 5 até o fim: a cabeça alcança a última conta, mas
    // metade da história nunca foi ouvida
    act(() => {
      player.play(5, 9);
      engine.transport.advance(0.05);
      for (let bead = 5; bead < 10; bead++) engine.transport.advance(BEAD_SEC);
    });

    expect(heardTarget()?.getAttribute('data-heard')).not.toBe('true');
  });

  it('o primeiro tick de uma história curta não acende o pill', async () => {
    const engine = new FixtureAudioEngine();
    // 1.5 s a 0.25 s/conta → 6 contas: a margem absoluta de 6 do protótipo
    // deixava `h >= totalBeads - 6` verdadeiro já em h = 0
    const decoded = await engine.decode(pcmSpecBytes({ ...SPEC, samples: 12000 }));
    const player = engine.createPlayer(decoded, BEAD_SEC);
    sessionStore.getState().load(makeSession(undefined, 1.5));
    render(<Listen player={player} />);

    act(() => {
      player.play(0, 5);
      engine.transport.advance(0.05); // cabeça na conta 0
    });

    expect(heardTarget()?.getAttribute('data-heard')).not.toBe('true');
  });
});

describe('Escuta 1 — minimalismo para o ouvinte (PRD v2 §9.2)', () => {
  it('não mostra dígito, tem ≤1 linha de instrução e exatamente uma ação dominante', () => {
    sessionStore.getState().load(makeSession());
    const { container } = render(<Listen />);

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

describe('Escuta 1 — tratamento cerimonial (redesign §6.2, §4.5)', () => {
  it('a seção cerimonial aplica o fundo olive e a tagline Merriweather itálico', () => {
    sessionStore.getState().load(makeSession());
    const { container } = render(<Listen />);
    expect(container.querySelector('.cds-listen')).not.toBeNull();
    expect(container.querySelector('.cds-listen-tagline')?.textContent).toBe('Ouça a história.');

    // as regras que vestem essas classes carregam o olive e o Merriweather itálico
    expect(listenCss).toMatch(/\.cds-listen\s*\{[^}]*var\(--cds-olive\)/);
    expect(listenCss).toMatch(/\.cds-listen-tagline\s*\{[^}]*var\(--cds-font-quiet-voice\)/);
    expect(listenCss).toMatch(/\.cds-listen-tagline\s*\{[^}]*italic/);
  });

  it('todo movimento decorativo fica sob prefers-reduced-motion: no-preference', () => {
    const guard = /@media\s*\(prefers-reduced-motion:\s*no-preference\)/;
    const { outside } = splitByGuard(listenCss, guard);
    expect(outside).not.toMatch(/animation|@keyframes/);
  });
});
