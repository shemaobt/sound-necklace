import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

import { AudioDecodeError, FixtureAudioEngine, type AudioEngine } from '../../../adapters/audio';
import { FixtureBucketSource, type BucketSource } from '../../../adapters/bucket';
import { AcoustemeGranularityResolver } from '../../../adapters/granularity';
import { FixtureProjectSettings } from '../../../adapters/project-settings';
import { FixtureSessionStore } from '../../../adapters/sessions';
import { goalStore, sessionStore } from '../../state';
import { pt } from '../../i18n/pt';
import headerCss from '../../app/header.css?raw';
import lockCss from './granularity-lock.css?raw';
import setupCss from './setup.css?raw';
import Setup from './index';

/**
 * Estação Setup (PRD v2 §8.1): escolha de áudio do bucket + nível de granularidade +
 * consentimento → decode → grade + manifest_id → sessão criada → Escuta 1. Portas
 * fixture por prop; o hash conhecido bate com o PCM determinístico das fixtures.
 */

// Hash FNV-1a esperado do PCM da fixture `conto-do-boto` (seed 101, 24000 amostras,
// 8000 Hz) com beadSec 0.5 (Média: 25 frames × 20 ms, regra O8) — valor de referência
// independente, computado da fórmula do domínio.
const BOTO_MEDIA_HASH = 'fnv1a32:9943a4ff';

interface Ports {
  bucket: BucketSource;
  resolver: AcoustemeGranularityResolver;
  audioEngine: AudioEngine;
  store: FixtureSessionStore;
  projectSettings: FixtureProjectSettings;
  /** Quem pode decidir a granularidade (ENG-363) — decide a variante da trava. */
  canEdit: (projectId: string) => Promise<boolean>;
  navigate: Mock<(to: string) => void>;
}

function ports(over: Partial<Ports> = {}): Ports {
  return {
    bucket: new FixtureBucketSource(),
    resolver: new AcoustemeGranularityResolver(),
    audioEngine: new FixtureAudioEngine(),
    store: new FixtureSessionStore(),
    // A granularidade é do PROJETO (ENG-352). Instância POR TESTE: o singleton do app
    // guarda a grade carimbada, e um caso vazaria a guarda de divergência no seguinte.
    projectSettings: new FixtureProjectSettings({ seed: { projeto: { level: 'medium' } } }),
    canEdit: async () => true,
    navigate: vi.fn<(to: string) => void>(),
    ...over,
  };
}

function renderSetup(p: Ports) {
  return render(
    <Setup
      bucket={p.bucket}
      resolver={p.resolver}
      audioEngine={p.audioEngine}
      store={p.store}
      projectSettings={p.projectSettings}
      canEdit={p.canEdit}
      navigate={p.navigate}
    />,
  );
}

/** Escolhe um áudio do bucket pelo nome de arquivo (aguarda a listagem). */
async function pickAudio(filename: string): Promise<void> {
  const radio = await screen.findByRole('radio', { name: new RegExp(escapeRe(filename)) });
  await userEvent.click(radio);
}

async function confirmConsent(): Promise<void> {
  await userEvent.click(screen.getByRole('checkbox'));
}

beforeEach(() => {
  window.history.replaceState({}, '', '/setup');
  sessionStore.setState({ session: null, review: false, lock: null, online: true });
});
afterEach(() => window.history.replaceState({}, '', '/'));

describe('Setup — eyebrow cerimonial (redesign design parity Fase 3)', () => {
  it('mostra o eyebrow cerimonial "Preparação"', async () => {
    renderSetup(ports());
    await screen.findByRole('radio', { name: /conto-do-boto/ });
    expect(screen.getByText('Preparação')).toBeTruthy();
  });
});

describe('Setup — criação de sessão (§8.1)', () => {
  it('áudio + nível + consentimento cria a sessão com grade + manifest_id e vai para Escuta 1', async () => {
    const p = ports();
    const createSpy = vi.spyOn(p.store, 'create');
    renderSetup(p);

    await pickAudio('conto-do-boto.wav'); // média é o nível default
    await confirmConsent();
    await userEvent.click(screen.getByRole('button', { name: /criar a sessão/i }));

    await waitFor(() => expect(p.navigate).toHaveBeenCalled());

    // SessionStore.create recebeu o manifest_id calculado pelo domínio + o fallback
    // do título a partir do nome do arquivo.
    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        manifestId: BOTO_MEDIA_HASH,
        beadSec: 0.5,
        granularityLevel: 'medium',
        audioId: 'aud_conto_do_boto',
        storyName: 'conto-do-boto',
        storySlug: 'conto-do-boto',
        pipelineConsent: true,
      }),
    );

    // A sessão viva do domínio existe com grade e cai em Escuta 1 (modo escuta +
    // colar não confirmado é o discriminador listen vs cut no shell).
    const s = sessionStore.getState().session;
    expect(s?.beads.length).toBeGreaterThan(0);
    expect(s?.mode).toBe('escuta');
    expect(s?.whole.confirmed).toBe(false);

    // Navegou para a rota da sessão e o estado inicial ficou persistido (retomável),
    // com o manifest_id calculado pelo domínio.
    const to = p.navigate.mock.calls[0]![0] as string;
    expect(to).toMatch(/^\/session\/.+/);
    const id = to.split('/').pop()!;
    const dto = await p.store.load(id);
    expect(dto.manifestId).toBe(BOTO_MEDIA_HASH);
  });

  it('enquanto a criação voa, o palco vira "preparando a sessão" (ENG-334)', async () => {
    const p = ports();
    // pendura a criação: é a janela real (fetch+decode+create) que o dono vê
    let release: (() => void) | null = null;
    vi.spyOn(p.store, 'create').mockImplementation(
      (input) =>
        new Promise((res) => {
          release = () => res(FixtureSessionStore.prototype.create.call(p.store, input));
        }),
    );
    renderSetup(p);

    await pickAudio('conto-do-boto.wav');
    await confirmConsent();
    await userEvent.click(screen.getByRole('button', { name: /criar a sessão/i }));

    // a espera é palco, não um botão desabilitado: o fio de contas + uma linha
    expect(document.querySelector('.cds-preparing')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /criar a sessão/i })).toBeNull();

    await act(async () => release?.());
    await waitFor(() => expect(p.navigate).toHaveBeenCalled());
  });

  it('um título digitado vence o fallback do nome do arquivo', async () => {
    const p = ports();
    const createSpy = vi.spyOn(p.store, 'create');
    renderSetup(p);

    await pickAudio('conto-do-boto.wav');
    await userEvent.type(screen.getByRole('textbox'), 'jesus-mienoi');
    await confirmConsent();
    await userEvent.click(screen.getByRole('button', { name: /criar a sessão/i }));

    await waitFor(() => expect(createSpy).toHaveBeenCalled());
    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({ storyName: 'jesus-mienoi', storySlug: 'jesus-mienoi' }),
    );
  });
});

describe('Setup — validação (§8.1)', () => {
  it('listagem do bucket que FALHA mostra o aviso em vez de prender a tela (ENG-247)', async () => {
    const quebrado: BucketSource = {
      list: () => Promise.reject(new Error('HTTP 401 na listagem do bucket')),
      fetchBytes: () => Promise.reject(new Error('sem áudio')),
    };
    renderSetup(ports({ bucket: quebrado }));

    expect(await screen.findByText(pt.setup.bucketError)).toBeTruthy();
  });

  it('sem áudio, orienta a escolher primeiro e não cria', async () => {
    const p = ports();
    const createSpy = vi.spyOn(p.store, 'create');
    renderSetup(p);
    await screen.findByRole('radio', { name: /conto-do-boto/ }); // listagem pronta

    await confirmConsent();
    await userEvent.click(screen.getByRole('button', { name: /criar a sessão/i }));

    expect(await screen.findByText('Escolha um arquivo de áudio primeiro.')).toBeTruthy();
    expect(createSpy).not.toHaveBeenCalled();
  });

  it('sem confirmar o consentimento de pipeline, bloqueia a criação', async () => {
    const p = ports();
    const createSpy = vi.spyOn(p.store, 'create');
    renderSetup(p);

    await pickAudio('conto-do-boto.wav');
    await userEvent.click(screen.getByRole('button', { name: /criar a sessão/i }));

    expect(
      await screen.findByText('Confirme o consentimento de uso no pipeline para continuar.'),
    ).toBeTruthy();
    expect(createSpy).not.toHaveBeenCalled();
  });

  it('falha de decodificação mostra a cópia PT-BR e não cria', async () => {
    const audioEngine: AudioEngine = {
      decode: () => Promise.reject(new AudioDecodeError('formato ruim')),
      createPlayer: () => {
        throw new Error('não deve criar player');
      },
      setGain: () => {},
    };
    const p = ports({ audioEngine });
    const createSpy = vi.spyOn(p.store, 'create');
    renderSetup(p);

    await pickAudio('conto-do-boto.wav');
    await confirmConsent();
    await userEvent.click(screen.getByRole('button', { name: /criar a sessão/i }));

    expect(
      await screen.findByText(
        'Não consegui decodificar este áudio (formato ruim). Tente um WAV PCM.',
      ),
    ).toBeTruthy();
    expect(createSpy).not.toHaveBeenCalled();
  });

  it('uma falha de sistema ao criar mostra orientação e reabilita o botão (não trava)', async () => {
    const fixtureList = new FixtureBucketSource();
    const bucket = {
      list: () => fixtureList.list(),
      fetchBytes: () => Promise.reject(new Error('rede caiu')),
    } as unknown as FixtureBucketSource;
    const p = ports({ bucket });
    const createSpy = vi.spyOn(p.store, 'create');
    renderSetup(p);

    await pickAudio('conto-do-boto.wav');
    await confirmConsent();
    const btn = screen.getByRole('button', { name: /criar a sessão/i });
    await userEvent.click(btn);

    expect(await screen.findByText('Não foi possível criar a sessão. Tente de novo.')).toBeTruthy();
    expect((btn as HTMLButtonElement).disabled).toBe(false); // não latcheou em "Criando…"
    expect(createSpy).not.toHaveBeenCalled();
  });

  it('um resolver que não devolve tamanho de conta positivo bloqueia a criação', async () => {
    const resolver = { resolve: () => ({ beadSec: 0 }) };
    const p = ports({ resolver: resolver as unknown as AcoustemeGranularityResolver });
    const createSpy = vi.spyOn(p.store, 'create');
    renderSetup(p);

    await pickAudio('conto-do-boto.wav');
    await confirmConsent();
    await userEvent.click(screen.getByRole('button', { name: /criar a sessão/i }));

    expect(
      await screen.findByText('Não consegui definir o tamanho da conta para este áudio.'),
    ).toBeTruthy();
    expect(createSpy).not.toHaveBeenCalled();
  });
});

describe('Setup — consentimento de coleta (§12/O6)', () => {
  it('indica consentimento presente e avisa quando ausente', async () => {
    renderSetup(ports());
    await screen.findByRole('radio', { name: /conto-do-boto/ });

    const present = screen.getByRole('radio', { name: /conto-do-boto/ });
    // badge curto (ENG-310): a frase contratual completa segue no title/aria
    expect(within(present).getByTitle('Consentimento de coleta registrado')).toBeTruthy();

    const absent = screen.getByRole('radio', { name: /gravacao-antiga/ });
    expect(within(absent).getByTitle('Sem registro de consentimento de coleta.')).toBeTruthy();
  });
});

describe('Setup — granularidade por nível, sem campo numérico (§8.1)', () => {
  it('não existe campo numérico de segundos por conta', async () => {
    const { container } = renderSetup(ports());
    await screen.findByRole('radio', { name: /conto-do-boto/ });
    expect(container.querySelector('input[type="number"]')).toBeNull();
  });

  /**
   * A granularidade deixou de ser escolha do Setup (ENG-352): é do PROJETO. A tela a
   * EXIBE — oferecer os três níveis aqui deixaria dois áudios do mesmo projeto caírem
   * em grades incompatíveis, que é o que a mudança existe para impedir.
   */
  it('exibe o nível do projeto e NÃO oferece escolha de granularidade', async () => {
    renderSetup(ports());
    await screen.findByRole('radio', { name: /conto-do-boto/ });

    expect(screen.queryByRole('radiogroup', { name: /tamanho da conta/i })).toBeNull();
    expect(screen.getByText(pt.setup.levelMediaTitle)).toBeTruthy();
    expect(screen.getByText(pt.setup.granFromProject)).toBeTruthy();
  });

  /**
   * A trava (ENG-363). Enquanto o projeto não tem tamanho de conta, o Setup inteiro
   * fica atrás do modal: escolher áudio ou marcar consentimento por trás dele seria
   * trabalho jogado fora, e a linha discreta de antes era fácil demais de ignorar.
   */
  it('projeto sem nível bloqueia o formulário atrás da trava', async () => {
    const p = ports({ projectSettings: new FixtureProjectSettings() });
    renderSetup(p);

    await screen.findByRole('dialog');
    expect(screen.getByText(pt.setup.lock.title)).toBeTruthy();
    // o formulário existe no DOM, mas o modal o esconde da árvore acessível
    expect(screen.queryByRole('radio', { name: /conto-do-boto/ })).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByRole('button', { name: /criar a sessão/i })).toBeNull();
  });

  it('a trava não se descarta: Esc não fecha', async () => {
    const p = ports({ projectSettings: new FixtureProjectSettings() });
    renderSetup(p);
    await screen.findByRole('dialog');

    await userEvent.keyboard('{Escape}');

    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  /**
   * A saída passa pelo router. Um `href` recarregaria a página e levaria junto o
   * formulário — e quem sai para decidir o nível voltaria para o zero por causa de
   * uma tag.
   */
  it('quem administra é levado à tela de configurações, sem recarregar a página', async () => {
    const p = ports({ projectSettings: new FixtureProjectSettings() });
    renderSetup(p);

    await userEvent.click(await screen.findByRole('button', { name: pt.setup.lock.primary }));

    expect(p.navigate).toHaveBeenCalledWith('/settings');
  });

  /**
   * Quem não administra não vê controle morto (§9.5): nada de botão desabilitado de
   * confirmar. Vê a quem pedir — e uma saída, porque a trava nunca é beco sem saída.
   */
  it('quem não administra vê a quem pedir e a saída para o painel', async () => {
    const p = ports({ projectSettings: new FixtureProjectSettings(), canEdit: async () => false });
    renderSetup(p);

    await screen.findByRole('dialog');
    expect(screen.getByText(pt.setup.lock.titleMember)).toBeTruthy();
    expect(screen.queryByRole('button', { name: pt.setup.lock.primary })).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: pt.setup.lock.primaryMember }));
    expect(p.navigate).toHaveBeenCalledWith('/dashboard');
  });

  it('projeto COM nível não mostra trava nenhuma', async () => {
    renderSetup(ports());
    await screen.findByRole('radio', { name: /conto-do-boto/ });

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  /**
   * A guarda de divergência. O nível é do projeto, mas a DURAÇÃO sai do acousteme de
   * cada áudio — um áudio que resolva para outra grade partiria o corpus do projeto em
   * dois sistemas de coordenadas. Recusa: normalizar quebraria a regra O8.
   */
  it('recusa um áudio cujo acousteme cairia noutra grade', async () => {
    const settings = new FixtureProjectSettings({ seed: { projeto: { level: 'medium' } } });
    // o projeto já cortou a 0,25 s; este áudio resolve a 0,5 s (Média = 25 × 20 ms)
    settings.noteSessionCreated('projeto', 'medium', 0.25);
    const p = ports({ projectSettings: settings });
    const createSpy = vi.spyOn(p.store, 'create');
    renderSetup(p);
    await pickAudio('conto-do-boto.wav');
    await confirmConsent();

    await userEvent.click(screen.getByRole('button', { name: /criar a sessão/i }));

    await screen.findByText(pt.setup.granMismatch);
    expect(createSpy).not.toHaveBeenCalled();
    expect(p.navigate).not.toHaveBeenCalled();
  });

  it('a mesma grade em milissegundos não é divergência (ruído de float não reprova)', async () => {
    const settings = new FixtureProjectSettings({ seed: { projeto: { level: 'medium' } } });
    settings.noteSessionCreated('projeto', 'medium', 0.1 + 0.2 + 0.2); // 0.5000000000000001
    const p = ports({ projectSettings: settings });
    renderSetup(p);
    await pickAudio('conto-do-boto.wav');
    await confirmConsent();

    await userEvent.click(screen.getByRole('button', { name: /criar a sessão/i }));

    await waitFor(() => expect(p.navigate).toHaveBeenCalled());
    expect(screen.queryByText(pt.setup.granMismatch)).toBeNull();
  });
});

describe('Setup — cópias fixadas (§8.1/O7)', () => {
  it('mostra a divulgação e a nota de trava da conta', async () => {
    renderSetup(ports());
    await screen.findByRole('radio', { name: /conto-do-boto/ });
    expect(screen.getByText(pt.setup.disclosure)).toBeTruthy();
    // A trava da conta deixou de ser aviso do Setup: a granularidade é do projeto e
    // esta tela diz de onde ela vem (ENG-352).
    expect(screen.getByText(pt.setup.granFromProject)).toBeTruthy();
  });

  /**
   * Dois parágrafos viraram um a pedido do dono — a tela tinha texto demais. O que
   * NÃO pode encolher junto é a divulgação: o PRD §4 conta "disclosed on the setup
   * screen" entre as condições que tornam a voz sintética aceitável, e a policy da
   * ElevenLabs exige o mesmo. Uma frase curta ainda divulga; nenhuma frase, não.
   */
  it('divulga que a voz do guia é sintética (§12; exigência da policy da ElevenLabs)', async () => {
    renderSetup(ports());
    await screen.findByRole('radio', { name: /conto-do-boto/ });
    expect(screen.getByText(/sintética/i)).toBeTruthy();
    expect(screen.getByText(/escritas por pessoas/i)).toBeTruthy();
  });

  /**
   * As três portas anunciavam caminhos que não andam: só "começar do zero" abre, e as
   * outras duas ficavam ali desabilitadas ocupando o topo da tela (a ENG-311 as quis
   * visíveis; o dono reverteu). Um seletor com uma opção só não escolhe nada.
   */
  it('não oferece mais o seletor de portas', async () => {
    renderSetup(ports());
    await screen.findByRole('radio', { name: /conto-do-boto/ });
    expect(screen.queryByRole('radiogroup', { name: 'Como começar' })).toBeNull();
    expect(screen.queryByText('Começar do zero')).toBeNull();
    expect(screen.queryByText('Confirmar uma entrega')).toBeNull();
    expect(screen.queryByText('Retomar um retorno')).toBeNull();
  });
});

describe('Setup — grid compacto de áudios (ENG-310)', () => {
  it('a lista é um grid responsivo, não uma coluna única', () => {
    const rule = /\.cds-setup-audios\s*{[^}]*}/.exec(setupCss)?.[0] ?? '';
    expect(rule).toContain('display: grid');
    expect(rule).toContain('auto-fill');
  });
});

/**
 * Um cartão centrado por `transform` numa janela baixa (celular deitado) empurra a
 * saída para fora da tela, e o diálogo trava o scroll do documento — a trava viraria
 * o beco sem saída que ela existe para não ser. Quem rola tem de ser o véu, com o
 * cartão em `margin:auto`. jsdom não tem layout: a regra se fixa no CSS.
 */
describe('Setup — a trava cabe em janela baixa (ENG-363)', () => {
  it('quem rola é o véu, e o cartão não se centra por posicionamento fixo', () => {
    const veil = /\.cds-gran-lock-overlay\s*{[^}]*}/.exec(lockCss)?.[0] ?? '';
    const card = /\.cds-gran-lock\s*{[^}]*}/.exec(lockCss)?.[0] ?? '';
    expect(veil).toContain('overflow: auto');
    expect(card).toContain('margin: auto');
    expect(card).not.toContain('position: fixed');
  });
});

describe('Setup — portas de entrada (§8.9, ENG-311)', () => {
  it('a lista de áudios mostra esqueleto enquanto o bucket responde (ENG-311)', async () => {
    const bucket = new FixtureBucketSource();
    const real = bucket.list.bind(bucket);
    let release: (() => void) | null = null;
    vi.spyOn(bucket, 'list').mockImplementation(
      () =>
        new Promise((res) => {
          release = () => void real().then(res);
        }),
    );
    renderSetup(ports({ bucket }));

    expect(document.querySelectorAll('.cds-skeleton').length).toBeGreaterThan(0);
    expect(screen.getByRole('status')).toBeTruthy();

    await act(async () => release?.());
    expect(await screen.findByRole('radio', { name: /conto-do-boto/ })).toBeTruthy();
    expect(document.querySelectorAll('.cds-skeleton')).toHaveLength(0);
  });
});

/**
 * ENG-386 — escolher o áudio sem perder o Continuar de vista.
 *
 * Com uma entrega grande, a lista empurrava o botão de criar a sessão para longe
 * abaixo da dobra: a facilitadora escolhia um áudio e não sabia o que fazer em
 * seguida, porque a única ação que move a sessão adiante estava fora da tela.
 *
 * O defeito é o layout, não a validação. O botão segue sempre clicável e
 * explicando no clique ("guiar, nunca punir", §9.5) — trocá-lo por um
 * desabilitado seria mudar comportamento em vez de consertar a dobra.
 */
describe('Setup — a ação de seguir não depende do tamanho da lista (ENG-386)', () => {
  /** A janela que rola com a lista; a ação NÃO pode viver dentro dela. */
  function scrollBox(container: HTMLElement): HTMLElement {
    const box = container.querySelector<HTMLElement>('.cds-setup-audios-scroll');
    expect(box, 'a lista de áudios não tem janela de rolagem própria').not.toBeNull();
    return box!;
  }

  it('o botão de criar a sessão vive fora da janela que rola', async () => {
    const { container } = renderSetup(ports());
    await screen.findByRole('radio', { name: /conto-do-boto/ });

    const criar = screen.getByRole('button', { name: pt.setup.create });

    expect(scrollBox(container).contains(criar)).toBe(false);
  });

  it('a lista de áudios rola dentro da própria janela', async () => {
    const { container } = renderSetup(ports());
    await screen.findByRole('radio', { name: /conto-do-boto/ });

    expect(scrollBox(container).querySelector('.cds-setup-audios')).not.toBeNull();
  });

  it('a ação mora na coluna estreita, não embaixo da lista', async () => {
    /* É o arranjo do item 1 da entrega que resolve o defeito: a ação e a lista são
       colunas IRMÃS. Enquanto o botão for descendente da coluna da lista, crescer a
       entrega volta a empurrá-lo — não importa o que a folha de estilo diga. */
    const { container } = renderSetup(ports());
    await screen.findByRole('radio', { name: /conto-do-boto/ });

    const criar = screen.getByRole('button', { name: pt.setup.create });
    const lista = container.querySelector<HTMLElement>('.cds-setup-col-list');
    const lado = container.querySelector<HTMLElement>('.cds-setup-col-side');

    expect(lista, 'não há coluna da lista').not.toBeNull();
    expect(lado, 'não há coluna da ação').not.toBeNull();
    expect(lista!.contains(criar)).toBe(false);
    expect(lado!.contains(criar)).toBe(true);
  });

  it('a altura da estação sai do cabeçalho real do shell, não de um chute', () => {
    /* Duas coisas que jsdom não mede e que, quebradas, devolvem o defeito inteiro
       sem derrubar nenhum outro teste.

       (a) A estação precisa de altura DEFINIDA — é dela que `flex: 1` tira a sobra
       que a lista cede. Trocar por `min-height` deixa a corrente frouxa e a lista
       volta a crescer sem fim.
       (b) O quanto se desconta é o cabeçalho do shell, que é o único cromo acima da
       Setup (não há fio de contas fora de uma sessão). Se alguém mudar a altura do
       cabeçalho, é AQUI que se descobre — em vez de na tela da facilitadora. */
    const alturaEstacao = /\.cds-setup\s*\{[^}]*height:\s*calc\(100dvh\s*-\s*(\d+)px\)/.exec(
      setupCss,
    );
    expect(alturaEstacao, 'a estação não tem altura definida derivada da janela').not.toBeNull();

    const alturaCabecalho = /\.cds-header\s*\{[^}]*height:\s*(\d+)px/.exec(headerCss);
    expect(alturaCabecalho, 'não achei a altura do cabeçalho do shell').not.toBeNull();

    expect(
      alturaEstacao![1],
      'o desconto da Setup e a altura do cabeçalho do shell divergiram',
    ).toBe(alturaCabecalho![1]);
  });

  it('a janela da lista toma a sobra em vez de carregar um teto em pixels', () => {
    const inicio = setupCss.indexOf('.cds-setup-audios-scroll {');
    expect(inicio, 'a regra .cds-setup-audios-scroll não existe').toBeGreaterThanOrEqual(0);
    const regra = setupCss.slice(inicio, setupCss.indexOf('}', inicio));

    expect(regra).toMatch(/overflow-y:\s*auto/);
    expect(regra, 'a janela precisa crescer/encolher com a coluna').toMatch(/flex:\s*1\s+1\s+0/);
    /* um teto em pixels só garantiria o botão em janelas altas — foi por isso que a
       primeira tentativa desta issue não fechou o defeito */
    expect(regra).not.toMatch(/max-height:/);
  });
});

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * A meta de hoje (ENG-653): antes de começar, a facilitadora diz até onde os dois
 * pretendem chegar. Seis escolhas fixas, nenhuma delas obrigatória — e escolher a
 * mesma de novo desfaz a escolha. As contagens nos rótulos são permitidas: este é
 * um cartão de FACILITADORA (§7.2), não uma tela de quem ouve.
 */
describe('Setup — até onde vamos hoje (ENG-653)', () => {
  const CHIPS = [
    '2 cenas',
    '4 cenas',
    '12 conversas',
    'fechar a Triagem',
    'fechar as Frases',
    'a história toda',
  ];

  beforeEach(() => {
    goalStore.setState(goalStore.getInitialState(), true);
  });

  it('oferece as seis metas, e nenhuma vem escolhida', async () => {
    renderSetup(ports());
    await screen.findByRole('radio', { name: /conto-do-boto/ });

    expect(screen.getByText('Até onde vamos hoje?')).toBeTruthy();
    expect(screen.getByText('Dá para mudar no meio. A meta é conforto, não regra.')).toBeTruthy();
    for (const rotulo of CHIPS) {
      expect(screen.getByRole('button', { name: rotulo, pressed: false })).toBeTruthy();
    }
  });

  it('escolher uma meta a marca; escolher a mesma de novo a desmarca', async () => {
    renderSetup(ports());
    await screen.findByRole('radio', { name: /conto-do-boto/ });

    await userEvent.click(screen.getByRole('button', { name: 'fechar a Triagem' }));
    expect(screen.getByRole('button', { name: 'fechar a Triagem', pressed: true })).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: 'fechar a Triagem' }));
    expect(screen.getByRole('button', { name: 'fechar a Triagem', pressed: false })).toBeTruthy();
  });

  it('escolher outra meta troca a anterior — a meta é uma só', async () => {
    renderSetup(ports());
    await screen.findByRole('radio', { name: /conto-do-boto/ });

    await userEvent.click(screen.getByRole('button', { name: '2 cenas' }));
    await userEvent.click(screen.getByRole('button', { name: 'a história toda' }));

    expect(screen.getByRole('button', { name: '2 cenas', pressed: false })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'a história toda', pressed: true })).toBeTruthy();
  });
});
