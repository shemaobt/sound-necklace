import { act, fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  FixtureAudioEngine,
  type PcmSpec,
  pcmSpecBytes,
  type Player,
} from '../../../adapters/audio';
import {
  buildBeads,
  createSession,
  type Frase,
  type ScenePart,
  type SessionState,
  type Span,
} from '../../../domain';
import { en } from '../../i18n/en';
import { pt } from '../../i18n/pt';
import { SIZE_EXPORT } from '../../organisms';
import { renderStation } from '../../organisms/nav-footer/testing';
import { sessionStore } from '../../state';
import Review from './index';

/**
 * A Rever (ENG-725; desenho docs/design/revisao-tela-nova.html): a quinta e última estação. A
 * dupla vê a história inteira — o colar todo, uma pérola por cena com a
 * confiança embutida — e ouve tocando; nada se edita. Os testes afirmam o que se
 * vê e o que se ouve (o `Player` de fixture), e guardam a decisão do dono: o
 * estado da sessão sai igual ao que entrou.
 */

const DURATION = 7.5; // 30 contas (0…29)
const BEAD_SEC = 0.25;
const SPEC: PcmSpec = { seed: 7, sampleRate: 8000, samples: 60000, channels: 1 };

const NASCIMENTO = 'Nascimento';
const RESPIGA = 'Respiga';
const SEM_TIPO = 'sem nome nos tipos';
const TITLE = 'Olhem a história inteira';
const CONCLUDE = 'Concluir a história';
const WARN =
  'Algumas cenas ficaram na dúvida ou sem nome — dá para seguir assim mesmo. Toque de novo para concluir.';

function scene(id: string, span: Span, over: Partial<ScenePart> = {}): ScenePart {
  return {
    part_id: id,
    span,
    locked: true,
    scene_kind: 'BIRTH_SCENE',
    scene_kind_confidence: 'high',
    tag_state: 'tagged',
    ...over,
  };
}

function phrase(id: string, span: Span, part: string): Frase {
  return { prop_id: id, statement: '', qa: [], span, part_link: part, locked: true };
}

function concluded(
  parts: ScenePart[],
  frases: Frase[],
  durationSec: number = DURATION,
): SessionState {
  const base = createSession({
    durationSec,
    beadSec: BEAD_SEC,
    beads: buildBeads(durationSec, BEAD_SEC),
    manifestId: 'fnv1a32:00000000',
    audioFilename: 'historia.wav',
    slug: 'historia',
  });
  return {
    ...base,
    whole: { ...base.whole, confirmed: true },
    partsConfirmed: true,
    mode: 'concluida',
    parts,
    frases,
    current: { layer: 'frases', index: -1 },
  };
}

/**
 * A história COM dúvidas: a primeira cena com certeza e duas frases (0…3 e
 * 4…7, sobrando 8…9 sem frase); a segunda na dúvida e sem frase nenhuma; a
 * terceira fora dos tipos.
 */
function doubtful(): SessionState {
  return concluded(
    [
      scene('PT1', { s: 0, e: 9 }),
      scene(
        'PT2',
        { s: 10, e: 19 },
        { scene_kind: 'GLEANING_SCENE', scene_kind_confidence: 'low' },
      ),
      scene(
        'PT3',
        { s: 20, e: 29 },
        { scene_kind: null, scene_kind_confidence: null, tag_state: 'none_fit' },
      ),
    ],
    [phrase('P1', { s: 0, e: 3 }, 'PT1'), phrase('P2', { s: 4, e: 7 }, 'PT1')],
  );
}

/** A história LIMPA: todas com tipo, nenhuma na dúvida, todas com frase. */
function clean(): SessionState {
  return concluded(
    [
      scene('PT1', { s: 0, e: 9 }),
      scene(
        'PT2',
        { s: 10, e: 19 },
        { scene_kind: 'GLEANING_SCENE', scene_kind_confidence: 'medium' },
      ),
    ],
    [
      phrase('P1', { s: 0, e: 3 }, 'PT1'),
      phrase('P2', { s: 4, e: 9 }, 'PT1'),
      phrase('P3', { s: 10, e: 19 }, 'PT2'),
    ],
  );
}

const NONE_FIT: Partial<ScenePart> = {
  scene_kind: null,
  scene_kind_confidence: null,
  tag_state: 'none_fit',
};

/** DUAS cenas fora dos tipos e DUAS sem frase: a linha de contexto vai ao plural. */
function manyDoubts(): SessionState {
  return concluded(
    [
      scene('PT1', { s: 0, e: 5 }),
      scene('PT2', { s: 6, e: 11 }, { scene_kind: 'GLEANING_SCENE' }),
      scene('PT3', { s: 12, e: 17 }, NONE_FIT),
      scene('PT4', { s: 18, e: 23 }, { scene_kind: 'ARRIVAL_SCENE' }),
      scene('PT5', { s: 24, e: 29 }, NONE_FIT),
    ],
    [phrase('P1', { s: 0, e: 5 }, 'PT1')],
  );
}

/** Cobertura ESPARSA: só a primeira cena existe; as contas de 10 em diante não são de ninguém. */
function sparse(): SessionState {
  return concluded([scene('PT1', { s: 0, e: 9 })], [phrase('P1', { s: 0, e: 3 }, 'PT1')]);
}

/** História LONGA (ENG-730): 400 contas — mais do que cabe em qualquer teto de fileiras,
 * para provar que é o colar que ganha barra de rolagem própria, não a página que cresce. */
const LONG_DURATION = 100; // 400 contas a 0.25s/conta
function longStory(): SessionState {
  return concluded(
    [scene('PT1', { s: 0, e: 399 })],
    [phrase('P1', { s: 0, e: 399 }, 'PT1')],
    LONG_DURATION,
  );
}

async function makePlayer(): Promise<{ engine: FixtureAudioEngine; player: Player }> {
  const engine = new FixtureAudioEngine();
  const decoded = await engine.decode(pcmSpecBytes(SPEC));
  const player = engine.createPlayer(decoded, BEAD_SEC);
  return { engine, player };
}

function load(state: SessionState): void {
  sessionStore.getState().load(state);
}

/** Toca a conta `i` do colar: pointerdown delegado no centro exato da conta. */
function tapBead(i: number): void {
  const bead = document.querySelector<HTMLElement>(`.cds-necklace-bead[data-idx="${i}"]`);
  if (!bead) throw new Error(`conta ${i} não está no colar`);
  act(() => {
    document.querySelector('.cds-necklace')!.dispatchEvent(
      new MouseEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        clientX: Number.parseFloat(bead.style.left),
        clientY: Number.parseFloat(bead.style.top),
      }),
    );
  });
}

/** Deixa o áudio correr até acabar, e devolve as contas por onde a cabeça passou. */
function runOut(engine: FixtureAudioEngine, heads: (number | null)[]): number[] {
  act(() => {
    engine.transport.advance(0.05);
    for (let i = 0; i < 40; i++) engine.transport.advance(BEAD_SEC);
  });
  return heads.filter((h): h is number => h !== null);
}

function pearlBase(i: number): string {
  const pearl = document.querySelector<HTMLElement>(
    `.cds-necklace-bead[data-idx="${i}"] .cds-pearl`,
  );
  return pearl?.style.getPropertyValue('--cds-pearl-base') ?? '';
}

function pearlOf(name: string): HTMLElement {
  return screen.getByRole('button', { name });
}

beforeEach(() => {
  sessionStore.setState({ session: null, review: false, lock: null, online: true });
});
afterEach(() => {
  sessionStore.setState({ session: null, review: false, lock: null, online: true });
});

describe('Rever — o panorama mostra a história inteira', () => {
  it('desenha uma conta para cada conta de áudio da história', () => {
    load(doubtful());
    renderStation(<Review />);
    expect(screen.getByRole('heading', { name: TITLE })).toBeDefined();
    expect(document.querySelectorAll('.cds-necklace-bead')).toHaveLength(30);
  });

  it('as contas de uma cena carregam a cor daquela cena; a vizinha, outra cor', () => {
    load(doubtful());
    renderStation(<Review />);
    expect(pearlBase(2)).not.toBe('');
    expect(pearlBase(5)).toBe(pearlBase(2));
    expect(pearlBase(12)).not.toBe('');
    expect(pearlBase(12)).not.toBe(pearlBase(2));
  });

  it('a última conta de cada frase leva a marca de fim de frase; a de cada cena, a de fim de cena', () => {
    load(doubtful());
    renderStation(<Review />);
    const at = (i: number) =>
      document.querySelector(`.cds-necklace-bead[data-idx="${i}"] .cds-pearl`);
    expect(at(3)?.getAttribute('data-phrase-end')).toBe('true');
    expect(at(3)?.getAttribute('data-scene-end')).toBeNull();
    expect(at(7)?.getAttribute('data-phrase-end')).toBe('true');
    expect(at(9)?.getAttribute('data-scene-end')).toBe('true');
    expect(at(9)?.getAttribute('data-phrase-end')).toBeNull();
    expect(at(5)?.getAttribute('data-phrase-end')).toBeNull();
    expect(at(5)?.getAttribute('data-scene-end')).toBeNull();
  });

  it('a cena fora dos tipos fica creme tracejada até a última conta, que ainda é fim de cena', () => {
    load(doubtful());
    renderStation(<Review />);
    const at = (i: number) =>
      document.querySelector<HTMLElement>(`.cds-necklace-bead[data-idx="${i}"] .cds-pearl`);
    expect(at(25)?.getAttribute('data-none-fit')).toBe('true');
    expect(at(25)?.style.getPropertyValue('--cds-pearl-base')).toBe('');
    expect(at(29)?.getAttribute('data-none-fit')).toBe('true');
    expect(at(29)?.getAttribute('data-scene-end')).toBe('true');
    expect(at(12)?.getAttribute('data-none-fit')).toBeNull();
  });

  it('as cenas aparecem como uma fila de pérolas com o tipo e a confiança embutida', () => {
    load(doubtful());
    renderStation(<Review />);
    expect(pearlOf(NASCIMENTO).getAttribute('data-fill')).toBe('high');
    expect(pearlOf(RESPIGA).getAttribute('data-fill')).toBe('low');
  });

  it('uma cena "nenhum se encaixa" entra na fila com rótulo por extenso e sem marca de erro', () => {
    load(doubtful());
    const { container } = renderStation(<Review />);
    const pearl = pearlOf(SEM_TIPO);
    expect(pearl.getAttribute('data-fill')).toBe('none');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(container.textContent).not.toMatch(/[⚠⌀]/);
  });

  it('uma cena sem frase nenhuma aparece normalmente, com as contas na sua cor', () => {
    load(doubtful());
    renderStation(<Review />);
    expect(pearlOf(RESPIGA)).toBeDefined();
    expect(pearlBase(15)).toBe(pearlBase(12));
    expect(pearlBase(15)).not.toBe('');
  });

  it('a legenda das marcas não aparece em lugar nenhum da tela (decisão do dono, ENG-730)', () => {
    load(doubtful());
    const { container } = renderStation(<Review />);
    expect(container.querySelector('.cds-review-legend')).toBeNull();
    expect(screen.queryByText('fim de frase')).toBeNull();
    expect(screen.queryByText('fim de cena')).toBeNull();
    expect(screen.queryByText('Fora dos tipos')).toBeNull();
  });

  it('o rodapé continua só com o Concluir; nenhum slot próprio da estação sobra ali (ENG-730)', () => {
    load(doubtful());
    renderStation(<Review />);
    const footer = screen.getByRole('button', { name: CONCLUDE }).closest('footer')!;
    expect(footer.querySelector('.cds-nav-footer-aside')).toBeNull();
    expect(footer.querySelector('.cds-nav-footer-back')).toBeNull();
    expect(within(footer).getByRole('button', { name: CONCLUDE })).toBeDefined();
  });

  it('a linha de contexto concorda em número com as cenas que descreve', () => {
    load(manyDoubts());
    const first = renderStation(<Review />);
    expect(
      screen.getByText(
        'Algumas cenas ficaram fora dos tipos e outras ficaram sem frases — todas são respostas válidas, e ficam guardadas assim.',
      ),
    ).toBeDefined();
    first.unmount();

    load(
      concluded(
        [
          scene('PT1', { s: 0, e: 9 }),
          scene('PT2', { s: 10, e: 19 }, NONE_FIT),
          scene('PT3', { s: 20, e: 29 }, NONE_FIT),
        ],
        [phrase('P1', { s: 0, e: 9 }, 'PT1')],
      ),
    );
    renderStation(<Review />);
    expect(
      screen.getByText(
        'Algumas cenas ficaram fora dos tipos — são respostas válidas, e ficam guardadas assim.',
      ),
    ).toBeDefined();
  });

  it('a linha de contexto só aparece quando há cena fora dos tipos ou sem frase', () => {
    load(clean());
    const first = renderStation(<Review />);
    expect(screen.queryByText(/ficou/)).toBeNull();
    first.unmount();

    load(doubtful());
    renderStation(<Review />);
    expect(
      screen.getByText(
        'Uma cena ficou fora dos tipos e outra ficou sem frases — as duas são respostas válidas, e ficam guardadas assim.',
      ),
    ).toBeDefined();
  });
});

describe('Rever — o áudio responde antes do texto', () => {
  it('tocar numa conta dentro de uma frase toca aquela frase inteira', async () => {
    const { engine, player } = await makePlayer();
    const heads: (number | null)[] = [];
    player.onHead((h) => heads.push(h));
    load(doubtful());
    renderStation(<Review player={player} />);

    tapBead(5);
    const played = runOut(engine, heads);

    expect(played[0]).toBe(4);
    expect(new Set(played)).toEqual(new Set([4, 5, 6, 7]));
  });

  it('tocar numa conta fora de qualquer frase toca dali até o fim da cena', async () => {
    const { engine, player } = await makePlayer();
    const heads: (number | null)[] = [];
    player.onHead((h) => heads.push(h));
    load(doubtful());
    renderStation(<Review player={player} />);

    tapBead(8);
    const played = runOut(engine, heads);

    expect(new Set(played)).toEqual(new Set([8, 9]));
  });

  it('tocar numa pérola da fila toca a cena inteira', async () => {
    const { engine, player } = await makePlayer();
    const heads: (number | null)[] = [];
    player.onHead((h) => heads.push(h));
    load(doubtful());
    renderStation(<Review player={player} />);

    await userEvent.click(pearlOf(NASCIMENTO));
    const played = runOut(engine, heads);

    expect(new Set(played)).toEqual(new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]));
  });

  it('tocar de novo na mesma conta para o áudio', async () => {
    const { engine, player } = await makePlayer();
    load(doubtful());
    renderStation(<Review player={player} />);

    tapBead(5);
    act(() => engine.transport.advance(0.05));
    expect(player.state.playing).toBe(true);

    tapBead(5);
    act(() => engine.transport.advance(0.05));
    expect(player.state.playing).toBe(false);
  });

  it('tocar numa conta que não é de cena nenhuma não toca nada', async () => {
    const { engine, player } = await makePlayer();
    load(sparse());
    renderStation(<Review player={player} />);

    tapBead(15);
    act(() => engine.transport.advance(0.05));

    expect(player.state.playing).toBe(false);
  });

  it('tocar na conta que brilha para o áudio', async () => {
    const { engine, player } = await makePlayer();
    load(doubtful());
    renderStation(<Review player={player} />);

    tapBead(5);
    act(() => engine.transport.advance(0.05));
    // a cabeça está na primeira conta da frase (4), não na conta tocada (5)
    tapBead(4);
    act(() => engine.transport.advance(0.05));

    expect(player.state.playing).toBe(false);
  });

  it('tocar de novo na mesma pérola para o áudio', async () => {
    const { engine, player } = await makePlayer();
    load(doubtful());
    renderStation(<Review player={player} />);

    await userEvent.click(pearlOf(RESPIGA));
    act(() => engine.transport.advance(0.05));
    expect(player.state.playing).toBe(true);

    await userEvent.click(pearlOf(RESPIGA));
    act(() => engine.transport.advance(0.05));
    expect(player.state.playing).toBe(false);
  });
});

describe('Rever — concluir é um ato consciente', () => {
  it('com cena na dúvida ou sem tipo, o primeiro toque avisa e não conclui; o segundo conclui', async () => {
    const onBlockClosed = vi.fn();
    load(doubtful());
    renderStation(<Review onBlockClosed={onBlockClosed} />);

    await userEvent.click(screen.getByRole('button', { name: CONCLUDE }));

    expect(screen.getByText(WARN)).toBeDefined();
    expect(onBlockClosed).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: CONCLUDE }));

    expect(onBlockClosed).toHaveBeenCalledWith('historia');
  });

  it('o aviso some sozinho depois de um tempo, sem concluir', () => {
    vi.useFakeTimers();
    try {
      const onBlockClosed = vi.fn();
      load(doubtful());
      renderStation(<Review onBlockClosed={onBlockClosed} />);

      fireEvent.click(screen.getByRole('button', { name: CONCLUDE }));
      expect(screen.getByText(WARN)).toBeDefined();

      act(() => {
        vi.advanceTimersByTime(9000);
      });

      expect(screen.queryByText(WARN)).toBeNull();
      expect(onBlockClosed).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('com nenhuma cena na dúvida e todas com tipo, o primeiro toque conclui direto, sem aviso', async () => {
    const onBlockClosed = vi.fn();
    load(clean());
    renderStation(<Review onBlockClosed={onBlockClosed} />);

    await userEvent.click(screen.getByRole('button', { name: CONCLUDE }));

    expect(screen.queryByText(WARN)).toBeNull();
    expect(onBlockClosed).toHaveBeenCalledWith('historia');
  });
});

describe('Rever — o que ela não faz', () => {
  it('nada que se faça na Rever altera o estado da sessão', async () => {
    const { engine, player } = await makePlayer();
    load(doubtful());
    const before = sessionStore.getState().session;
    renderStation(<Review player={player} />);

    tapBead(5);
    act(() => engine.transport.advance(0.05));
    tapBead(12);
    tapBead(25);
    await userEvent.click(pearlOf(NASCIMENTO));
    await userEvent.click(pearlOf(SEM_TIPO));
    // abre o aviso, fecha-o tocando noutra coisa, abre de novo e conclui
    await userEvent.click(screen.getByRole('button', { name: CONCLUDE }));
    expect(screen.getByText(WARN)).toBeDefined();
    await userEvent.click(pearlOf(RESPIGA));
    expect(screen.queryByText(WARN)).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: CONCLUDE }));
    await userEvent.click(screen.getByRole('button', { name: CONCLUDE }));

    expect(sessionStore.getState().session).toBe(before);
  });

  it('a tela não mostra dígito nenhum — nem com o aviso aberto (§9.2)', async () => {
    load(doubtful());
    const { container } = renderStation(<Review />);
    await userEvent.click(screen.getByRole('button', { name: CONCLUDE }));

    const noDigits = (root: HTMLElement) => {
      expect(root.textContent ?? '').not.toMatch(/\d/);
      for (const el of root.querySelectorAll('[aria-label]')) {
        expect(el.getAttribute('aria-label')).not.toMatch(/\d/);
      }
      for (const el of root.querySelectorAll('[title]')) {
        expect(el.getAttribute('title')).not.toMatch(/\d/);
      }
    };
    noDigits(container);
    noDigits(within(document.body).getByText(CONCLUDE).closest('footer')!);
  });
});

/**
 * ENG-726 — a gaveta de cobertura cresce na Rever. É a ÚNICA parte da tela onde
 * dígito é permitido (§9.2 é regra do ouvinte; a gaveta é só da facilitadora,
 * nasce fechada e o próprio cabeçalho dela estampa isso). O teste mais
 * importante do arquivo inteiro é o primeiro: fechada, a gaveta não pode vazar
 * NENHUM dígito para a tela do ouvinte — se vazar, a fatia está errada mesmo
 * com tudo verde.
 */
describe('Rever — a gaveta de cobertura (ENG-726, só facilitadora)', () => {
  const DRAWER_TRIGGER = 'Cobertura (facilitadora)';

  function openDrawer(): HTMLElement {
    fireEvent.click(screen.getByRole('button', { name: DRAWER_TRIGGER }));
    return screen.getByRole('dialog');
  }

  function drawerRow(dialog: HTMLElement, name: string): HTMLElement {
    const row = Array.from(
      dialog.querySelectorAll<HTMLElement>('.cds-coverage-drawer-scene-row'),
    ).find((r) => r.textContent?.includes(name));
    if (!row) throw new Error(`linha "${name}" não está na gaveta`);
    return row;
  }

  it('a gaveta nasce fechada, e fechada a Rever continua sem nenhum dígito', () => {
    load(doubtful());
    renderStation(<Review />);

    expect(screen.queryByRole('dialog')).toBeNull();
    // document.body, não o `container` do render: o painel da gaveta é um
    // portal do Radix Dialog e monta FORA do container quando aberto — checar
    // só o container não provaria nada sobre um vazamento ali. Fechado (o
    // caso deste teste), o Radix não monta o portal nenhum, e é isso que a
    // asserção prova de verdade: procurar no documento inteiro e achar nada.
    expect(document.body.textContent ?? '').not.toMatch(/\d/);
    for (const el of document.body.querySelectorAll('[aria-label]')) {
      expect(el.getAttribute('aria-label')).not.toMatch(/\d/);
    }
  });

  it('o cabeçalho da gaveta aberta diz que ela é só da facilitadora', () => {
    load(doubtful());
    renderStation(<Review />);

    const dialog = openDrawer();

    expect(dialog.textContent).toContain('Cobertura · só facilitadora');
  });

  it('tocar numa linha da lista cena a cena seleciona e toca aquela cena no panorama', async () => {
    const { engine, player } = await makePlayer();
    const heads: (number | null)[] = [];
    player.onHead((h) => heads.push(h));
    load(doubtful());
    renderStation(<Review player={player} />);

    const dialog = openDrawer();
    fireEvent.click(drawerRow(dialog, 'Respiga'));
    const played = runOut(engine, heads);

    // PT2 (Respiga) cobre 10…19 inteiro — clicar a linha toca a cena toda,
    // como o clique na pérola, e não só a primeira frase
    expect(new Set(played)).toEqual(new Set([10, 11, 12, 13, 14, 15, 16, 17, 18, 19]));
  });

  it('a linha da cena selecionada se distingue das outras', () => {
    load(doubtful());
    renderStation(<Review />);
    const dialog = openDrawer();

    fireEvent.click(drawerRow(dialog, 'Respiga'));

    expect(drawerRow(dialog, 'Respiga').getAttribute('data-selected')).toBe('true');
    expect(drawerRow(dialog, 'Nascimento').getAttribute('data-selected')).toBeNull();
  });

  it('nada na gaveta altera o estado da sessão: abrir, tocar uma linha e fechar', () => {
    load(doubtful());
    const before = sessionStore.getState().session;
    renderStation(<Review />);

    const dialog = openDrawer();
    fireEvent.click(drawerRow(dialog, 'Respiga'));
    fireEvent.click(dialog.querySelector('[aria-label="Fechar"]')!);

    expect(sessionStore.getState().session).toBe(before);
  });
});

/**
 * ENG-730 — a Rever ganha viewport fixo: retorno do dono depois de andar na tela
 * já mergeada. O colar passa a rolar dentro da própria janela como o de Escuta e
 * Frases, em vez de esticar a página inteira numa história longa.
 */
describe('Rever — o colar rola dentro da própria janela (ENG-730)', () => {
  it('uma história longa não cresce sem teto: a janela do colar ganha um max-height', () => {
    load(longStory());
    renderStation(<Review />);

    const win = document.querySelector<HTMLElement>('.cds-necklace-window');
    expect(win).not.toBeNull();
    expect(win!.style.maxHeight).not.toBe('');
  });

  it('o teto vem da mesma medida de conta (SIZE.row) que Escuta e Frases usam para a delas', () => {
    load(longStory());
    renderStation(<Review />);

    const win = document.querySelector<HTMLElement>('.cds-necklace-window')!;
    const px = Number.parseFloat(win.style.maxHeight);
    // mesma convenção das outras estações: N fileiras de SIZE.row + o respiro de 12px —
    // não afirma QUAL N, só que a peça vem da mesma fonte de medida
    expect(Number.isFinite(px)).toBe(true);
    expect((px - 12) % SIZE_EXPORT.row).toBe(0);
  });
});

describe('Rever — nenhuma chave i18n órfã da legenda removida (ENG-730)', () => {
  it('rever.legend não sobrevive nem em pt nem em en', () => {
    expect('legend' in pt.rever).toBe(false);
    expect('legend' in en.rever).toBe(false);
  });
});
