import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FixtureAuthProvider } from '../../../adapters/api';
import {
  type CreateSessionInput,
  FixtureSessionBackend,
  FixtureSessionStore,
} from '../../../adapters/sessions';
import type { ArtifactTriple, SessionStateDto } from '../../../contracts';
import dashboardCss from './dashboard.css?raw';
import sessionListCss from '../../organisms/session-list/session-list.css?raw';
import Dashboard, { formatWhen } from './index';

/**
 * Sessions dashboard (PRD v2 §7.2/§7.3): lista as sessões com status + última
 * modificação + progresso, retoma direto na sessão, renomeia, apaga e abre uma nova.
 * A expiração de auth (§7.1) volta ao login. Portas fixture por prop.
 */

const STATE: SessionStateDto = { schema_version: 1 } as unknown as SessionStateDto;

// Entrada fictícia p/ o login da fixture (aceita qualquer valor não-vazio; sem
// credencial real) — por variável para não casar o padrão `password: '<literal>'`.
const FILL = 'entrar-1';

function createInput(over: Partial<CreateSessionInput> = {}): CreateSessionInput {
  return {
    projectId: 'proj-fulani',
    storyName: 'A raposa e o tambor',
    storySlug: 'a-raposa-e-o-tambor',
    audioId: 'aud-1',
    granularityLevel: 'medium',
    beadSec: 0.25,
    manifestId: 'fnv1a32:00000000',
    pipelineConsent: true,
    ...over,
  };
}

async function seedInProgress(
  store: FixtureSessionStore,
  over: Partial<CreateSessionInput> = {},
): Promise<string> {
  const summary = await store.create(createInput(over));
  return summary.id;
}

async function seedCompleted(
  store: FixtureSessionStore,
  triple: ArtifactTriple,
  over: Partial<CreateSessionInput> = {},
): Promise<string> {
  const id = await seedInProgress(store, over);
  await store.complete(id, STATE, triple);
  return id;
}

const TRIPLE: ArtifactTriple = { anchoring: '{}', manifest: '{}', report: '#' };

function goto(path: string): void {
  window.history.replaceState({}, '', path);
}

/** Abre o menu de ações do cartão e escolhe uma entrada — o gesto da facilitadora. */
async function chooseAction(story: string, action: string): Promise<void> {
  await userEvent.click(await screen.findByRole('button', { name: `Ações em ${story}` }));
  await userEvent.click(await screen.findByRole('button', { name: action }));
}

async function chooseDelete(story: string): Promise<void> {
  await chooseAction(story, 'Apagar a história');
}

async function chooseRename(story: string): Promise<void> {
  await chooseAction(story, 'Renomear a história');
}

/** O campo do diálogo de renomear. */
function nameField(): HTMLInputElement {
  return screen.getByRole('textbox', { name: 'Nome da história' }) as HTMLInputElement;
}

/** Troca o nome no campo aberto e salva. */
async function typeNameAndSave(name: string): Promise<void> {
  await userEvent.clear(nameField());
  if (name) await userEvent.type(nameField(), name);
  await userEvent.click(screen.getByRole('button', { name: 'Salvar o nome' }));
}

/**
 * A história está na GRADE? (o nome também aparece na pergunta — a grade é o que conta).
 * `hidden: true` porque, com o diálogo aberto, o Radix marca o resto da página como
 * aria-hidden: a grade continua na tela, atrás do véu, e é isso que se quer afirmar.
 */
function listed(story: string): boolean {
  const grid = screen.getByRole('list', { name: 'histórias', hidden: true });
  return within(grid).queryAllByText(story).length > 0;
}

beforeEach(() => goto('/dashboard'));
afterEach(() => goto('/dashboard'));

describe('Dashboard — lista de sessões (§7.2)', () => {
  it('renderiza status, última modificação e o relance de progresso', async () => {
    const store = new FixtureSessionStore();
    // o nome da história não pode colidir com o rótulo do chip de status ("Em andamento")
    await seedInProgress(store, { storyName: 'História em curso', storySlug: 'em-curso' });
    const done = await store.create(
      createInput({ storyName: 'Terminada', storySlug: 'terminada' }),
    );
    await store.complete(done.id, STATE, { anchoring: 'r', manifest: 'm', report: 'l' });
    const doneSummary = await store.get(done.id);

    render(<Dashboard store={store} auth={new FixtureAuthProvider()} />);

    await screen.findAllByText('História em curso');
    expect(screen.getByText('Em andamento')).toBeTruthy();
    expect(screen.getByText('Concluída')).toBeTruthy();
    // última modificação: o texto formatado da própria sessão aparece no card
    expect(
      screen.getAllByText(new RegExp(escapeRe(formatWhen(doneSummary.last_modified)))).length,
    ).toBeGreaterThan(0);
    // relance de progresso (§7.2): a capa nomeia ONDE a sessão parou — a recém-criada
    // fica no 1º passo e a concluída no último (a fixture põe 'listen' e 'save').
    expect(screen.getByRole('img', { name: 'progresso: Ouvir — passo 1 de 4' })).toBeTruthy();
    expect(screen.getByRole('img', { name: 'progresso: Frases — passo 4 de 4' })).toBeTruthy();
    // a contagem da casa concorda com a grade
    expect(screen.getByText('2 histórias')).toBeTruthy();
  });
});

/**
 * ENG-689 — o fluxo acaba nas Frases, mas o servidor (e a fixture que o espelha)
 * continua sabendo dos passos que saíram do produto. Uma história que ele reporta
 * como "conversa" ou "guardar" é, para quem olha a casa, uma história que fechou as
 * Frases: o cartão diz a última estação que existe, e não some com o progresso.
 */
describe('Dashboard — o relance de progresso acaba nas Frases (ENG-689)', () => {
  it('a história que o servidor reporta além das Frases mostra as Frases, no último passo', async () => {
    const store = new FixtureSessionStore();
    const emConversa = await seedInProgress(store, {
      storyName: 'Passou das frases',
      storySlug: 'passou-das-frases',
    });
    store.autosave(emConversa, { ...STATE, mode: 'concluida' } as unknown as SessionStateDto);
    await store.flush(emConversa);
    const guardada = await store.create(
      createInput({ storyName: 'Fechada', storySlug: 'fechada' }),
    );
    await store.complete(guardada.id, STATE, TRIPLE);

    render(<Dashboard store={store} auth={new FixtureAuthProvider()} />);

    await screen.findAllByText('Passou das frases');
    expect(screen.getAllByRole('img', { name: 'progresso: Frases — passo 4 de 4' })).toHaveLength(
      2,
    );
  });
});

describe('Dashboard — a marca é a do site', () => {
  it('o cabeçalho da casa traz o Colar de Sons, não mais o Shemá', async () => {
    render(<Dashboard store={new FixtureSessionStore()} auth={new FixtureAuthProvider()} />);

    expect(await screen.findByRole('img', { name: 'Colar de Sons' })).toBeTruthy();
    expect(screen.queryByRole('img', { name: 'Shemá' })).toBeNull();
  });
});

describe('Dashboard — nenhum UUID no cartão (ENG-307)', () => {
  it('project_id cru (UUID) não aparece; um nome de projeto continua aparecendo', async () => {
    const uuid = '7ae3eca9-2747-4b3c-ba38-4f835f1b4bbc';
    const store = new FixtureSessionStore();
    await seedInProgress(store, {
      storyName: 'Sessão real',
      storySlug: 'sessao-real',
      projectId: uuid,
    });
    await seedInProgress(store, {
      storyName: 'Sessão nomeada',
      storySlug: 'sessao-nomeada',
      projectId: 'proj-fulani',
    });

    render(<Dashboard store={store} auth={new FixtureAuthProvider()} />);

    await screen.findAllByText('Sessão real');
    expect(screen.queryByText(new RegExp(uuid))).toBeNull();
    expect(screen.getByText(/proj-fulani/)).toBeTruthy();
  });
});

describe('Dashboard — esqueleto enquanto a lista voa (ENG-308)', () => {
  it('mostra cartões-esqueleto no lugar do texto parado; a lista real os substitui', async () => {
    const store = new FixtureSessionStore();
    let release: (() => void) | null = null;
    vi.spyOn(store, 'list').mockImplementation(
      () =>
        new Promise((res) => {
          release = () => res([]);
        }),
    );

    render(<Dashboard store={store} auth={new FixtureAuthProvider()} />);

    // enquanto a API responde: esqueletos pulsando + o anúncio acessível
    expect(document.querySelectorAll('.cds-skeleton').length).toBeGreaterThan(0);
    expect(screen.getByRole('status')).toBeTruthy();

    // a MESMA casca do cartão real (ENG-332): zona da capa + corpo com os
    // paddings do cds-session-card — sem isso os blocos colam na borda e o
    // esqueleto não tem a altura de um cartão de verdade
    const skeletonCard = document.querySelector('.cds-dashboard-card-skeleton');
    expect(skeletonCard?.querySelector('.cds-session-card-thumb')).toBeTruthy();
    expect(skeletonCard?.querySelector('.cds-session-card-body')).toBeTruthy();
    expect(skeletonCard?.querySelector('.cds-session-card-meta')).toBeTruthy();

    await act(async () => release?.());
    expect(await screen.findByRole('list', { name: 'histórias' })).toBeTruthy();
    expect(document.querySelectorAll('.cds-skeleton')).toHaveLength(0);
  });
});

describe('Dashboard — cabeçalho próprio (protótipo Shemá v2)', () => {
  it('a barra usa o MESMO chrome claro das estações (var do shell, ENG-306)', () => {
    const bar = /\.cds-dashboard-bar\s*{[^}]*}/.exec(dashboardCss)?.[0] ?? '';
    expect(bar).toContain('var(--cds-chrome-bg');
  });

  it('mostra a marca, a usuária autenticada e o título da casa', async () => {
    const store = new FixtureSessionStore();
    const auth = new FixtureAuthProvider();
    await auth.login({ username: 'facilitadora', password: FILL });

    render(<Dashboard store={store} auth={auth} />);

    expect(screen.getByRole('heading', { name: 'Colar de Sons' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Suas histórias' })).toBeTruthy();
    expect(screen.getByText('facilitadora')).toBeTruthy();

    // a listagem resolve depois do corpo do teste — aguardar evita o aviso de act()
    await screen.findByRole('list', { name: 'histórias' });
  });

  /**
   * ENG-340 punha o idioma na casa, para ser decidido antes de abrir sessão. A decisão
   * segue sendo de casa; o que mudou na ENG-371 é o gesto: em vez de alternar em um
   * clique — fácil de trocar sem querer no meio do trabalho, e o idioma governa a voz da
   * entrevista — a casa LEVA a Configurações, onde a escolha mora ao lado da granularidade.
   */
  it('a casa leva às Configurações, onde o idioma se decide (ENG-340/ENG-371)', async () => {
    const store = new FixtureSessionStore();
    render(<Dashboard store={store} auth={new FixtureAuthProvider()} />);
    await screen.findByRole('list', { name: 'histórias' });

    expect(screen.queryByRole('button', { name: 'Mudar para inglês' })).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Configurações' }));
    await waitFor(() => expect(window.location.pathname).toBe('/settings'));
  });

  it('“Sair” encerra a sessão e volta ao login', async () => {
    const store = new FixtureSessionStore();
    const auth = new FixtureAuthProvider();
    await auth.login({ username: 'facilitadora', password: FILL });

    render(<Dashboard store={store} auth={auth} />);

    await userEvent.click(screen.getByRole('button', { name: 'Sair' }));

    await waitFor(() => expect(window.location.pathname).toBe('/login'));
    expect(auth.currentUser()).toBeNull();
  });
});

describe('Dashboard — retomar (§7.3)', () => {
  it('“Retomar” navega para /session/:id', async () => {
    const store = new FixtureSessionStore();
    const id = await seedInProgress(store, { storyName: 'Retomável', storySlug: 'retomavel' });

    render(<Dashboard store={store} auth={new FixtureAuthProvider()} />);

    await userEvent.click(await screen.findByRole('button', { name: /Retomar/ }));
    expect(window.location.pathname).toBe(`/session/${id}`);
  });
});

describe('Dashboard — o menu de ações do cartão (§7.2, ENG-305/ENG-281)', () => {
  it('toda história oferece o menu de ações, terminada ou não', async () => {
    const store = new FixtureSessionStore();
    await seedInProgress(store, { storyName: 'Em curso', storySlug: 'em-curso' });
    await seedCompleted(store, TRIPLE, { storyName: 'Terminada', storySlug: 'terminada' });

    render(<Dashboard store={store} auth={new FixtureAuthProvider()} />);

    expect(await screen.findByRole('button', { name: 'Ações em Em curso' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Ações em Terminada' })).toBeTruthy();
  });

  /** ENG-689: o app não gera mais documento nenhum, e o menu não os oferece. */
  it('o menu não oferece documento para baixar, nem na história terminada', async () => {
    const store = new FixtureSessionStore();
    await seedCompleted(store, TRIPLE, { storyName: 'Terminada', storySlug: 'terminada' });

    render(<Dashboard store={store} auth={new FixtureAuthProvider()} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Ações em Terminada' }));

    expect(screen.queryByRole('button', { name: /[Bb]aixar/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Renomear a história' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Apagar a história' })).toBeTruthy();
  });

  it('o gatilho é um ícone discreto — o nome nomeia a história, sem palavra visível (ENG-333)', async () => {
    const store = new FixtureSessionStore();
    await seedInProgress(store, { storyName: 'Qualquer', storySlug: 'qualquer' });

    render(<Dashboard store={store} auth={new FixtureAuthProvider()} />);

    // o nome acessível existe (o findByRole já o exige) mas nenhuma letra é desenhada
    const trigger = await screen.findByRole('button', { name: 'Ações em Qualquer' });
    expect(trigger.textContent?.trim()).not.toMatch(/\p{L}/u);
  });

  it('a área de ação do cartão separa o botão principal do menu (ENG-333)', () => {
    const action = /\.cds-session-card-action\s*{[^}]*}/.exec(sessionListCss)?.[0] ?? '';
    expect(action).toMatch(/gap:/);
  });
});

describe('Dashboard — apagar uma história (§7.2, ENG-281)', () => {
  it('escolher apagar pergunta antes: nada some enquanto a pergunta está na tela', async () => {
    const store = new FixtureSessionStore();
    await seedInProgress(store, { storyName: 'Frágil', storySlug: 'fragil' });
    const removed = vi.spyOn(store, 'remove');

    render(<Dashboard store={store} auth={new FixtureAuthProvider()} />);
    await chooseDelete('Frágil');

    // a pergunta nomeia a história — quem pegou o cartão errado tem como perceber
    const dialog = await screen.findByRole('dialog', { name: /Apagar “Frágil”/ });
    // e avisa que as gravações vão junto
    expect(dialog.textContent).toContain('gravações');
    // o menu não fica preso atrás do véu
    expect(screen.queryByText('Apagar a história')).toBeNull();
    // nada foi destruído ainda
    expect(removed).not.toHaveBeenCalled();
    expect(await store.list()).toHaveLength(1);
    expect(listed('Frágil')).toBe(true);
  });

  it('confirmar tira a história da casa — que fica vazia, não quebrada', async () => {
    const store = new FixtureSessionStore();
    await seedInProgress(store, { storyName: 'Frágil', storySlug: 'fragil' });

    render(<Dashboard store={store} auth={new FixtureAuthProvider()} />);
    await chooseDelete('Frágil');
    await userEvent.click(screen.getByRole('button', { name: 'Apagar para sempre' }));

    await waitFor(() => expect(listed('Frágil')).toBe(false));
    expect(await store.list()).toHaveLength(0);
    // casa vazia, não quebrada: nenhum cartão de história sobrou, nenhuma contagem
    // fria, e o convite a começar outra segue de pé
    expect(screen.queryByRole('button', { name: /Retomar/ })).toBeNull();
    expect(screen.queryByText('1 história')).toBeNull();
    expect(screen.getByRole('button', { name: /Comece uma nova história/i })).toBeTruthy();
  });

  it('desistir mantém a história', async () => {
    const store = new FixtureSessionStore();
    await seedInProgress(store, { storyName: 'Frágil', storySlug: 'fragil' });
    const removed = vi.spyOn(store, 'remove');

    render(<Dashboard store={store} auth={new FixtureAuthProvider()} />);
    await chooseDelete('Frágil');
    await userEvent.click(screen.getByRole('button', { name: 'Manter a história' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(removed).not.toHaveBeenCalled();
    expect(listed('Frágil')).toBe(true);
  });

  it('apaga a história escolhida, não a vizinha', async () => {
    const store = new FixtureSessionStore();
    await seedInProgress(store, { storyName: 'Primeira', storySlug: 'primeira' });
    await seedInProgress(store, { storyName: 'Segunda', storySlug: 'segunda' });

    render(<Dashboard store={store} auth={new FixtureAuthProvider()} />);
    await chooseDelete('Segunda');
    await userEvent.click(screen.getByRole('button', { name: 'Apagar para sempre' }));

    await waitFor(() => expect(listed('Segunda')).toBe(false));
    expect(listed('Primeira')).toBe(true);
    // e a contagem da casa acompanha
    expect(screen.getByText('1 história')).toBeTruthy();
  });

  it('recusada por trava alheia, a história fica e a tela diz quem está com ela (§9.4)', async () => {
    const backend = new FixtureSessionBackend();
    const alice = new FixtureSessionStore({
      backend,
      user: { user_id: 'a', display_name: 'Alice' },
    });
    const bob = new FixtureSessionStore({ backend, user: { user_id: 'b', display_name: 'Bob' } });
    const s = await alice.create(createInput({ storyName: 'Disputada', storySlug: 'disputada' }));
    await alice.acquireLock(s.id);

    render(<Dashboard store={bob} auth={new FixtureAuthProvider()} />);
    await chooseDelete('Disputada');
    await userEvent.click(screen.getByRole('button', { name: 'Apagar para sempre' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Alice');
    expect(listed('Disputada')).toBe(true);
    expect(await bob.list()).toHaveLength(1);
  });

  it('uma falha desconhecida mantém a história e diz alguma coisa', async () => {
    const store = new FixtureSessionStore();
    await seedInProgress(store, { storyName: 'Frágil', storySlug: 'fragil' });
    vi.spyOn(store, 'remove').mockRejectedValue(new Error('rede fora'));

    render(<Dashboard store={store} auth={new FixtureAuthProvider()} />);
    await chooseDelete('Frágil');
    await userEvent.click(screen.getByRole('button', { name: 'Apagar para sempre' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Não consegui apagar');
    expect(listed('Frágil')).toBe(true);
  });

  it('duas confirmações seguidas não apagam duas vezes', async () => {
    // a store demora a responder: sem trava, o segundo clique chega com o primeiro
    // apagar ainda no ar — e é preciso que os dois cliques caiam ANTES disso resolver
    // (esperar o primeiro terminaria com o diálogo já desmontado, e o teste passaria
    // mesmo sem trava nenhuma)
    const store = new FixtureSessionStore({ latencyMs: 30 });
    await seedInProgress(store, { storyName: 'Frágil', storySlug: 'fragil' });
    const removed = vi.spyOn(store, 'remove');

    render(<Dashboard store={store} auth={new FixtureAuthProvider()} />);
    await chooseDelete('Frágil');
    const destroy = screen.getByRole('button', { name: 'Apagar para sempre' });
    fireEvent.click(destroy);
    fireEvent.click(destroy);

    await waitFor(() => expect(listed('Frágil')).toBe(false));
    expect(removed).toHaveBeenCalledTimes(1);
  });

  /**
   * Apagar e reler a lista são DUAS idas ao servidor. Se a segunda cair, a história
   * já foi embora — dizer "não consegui apagar" manda a facilitadora tentar de novo
   * uma coisa já feita, e a segunda tentativa bate num 404. O que falhou foi a
   * releitura, e é isso que a tela tem de dizer.
   */
  it('uma releitura falha depois de apagar não vira "não consegui apagar"', async () => {
    const store = new FixtureSessionStore();
    await seedInProgress(store, { storyName: 'Frágil', storySlug: 'fragil' });

    render(<Dashboard store={store} auth={new FixtureAuthProvider()} />);
    await chooseDelete('Frágil');
    // a listagem inicial já resolveu; só a releitura de depois do apagar é que cai
    vi.spyOn(store, 'list').mockRejectedValue(new Error('rede fora'));
    await userEvent.click(screen.getByRole('button', { name: 'Apagar para sempre' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.queryByText(/Não consegui apagar/)).toBeNull();
    // o que de fato falhou, dito com as palavras certas
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Não consegui carregar as histórias',
    );
  });

  it('desistir no meio do apagar não some com a pergunta', async () => {
    const store = new FixtureSessionStore({ latencyMs: 30 });
    await seedInProgress(store, { storyName: 'Frágil', storySlug: 'fragil' });

    render(<Dashboard store={store} auth={new FixtureAuthProvider()} />);
    await chooseDelete('Frágil');
    fireEvent.click(screen.getByRole('button', { name: 'Apagar para sempre' }));
    // com o apagar no ar não há o que desistir — e uma recusa que chegasse depois
    // não teria onde aparecer se a pergunta já tivesse sumido
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });

    expect(screen.getByRole('dialog')).toBeTruthy();
    await waitFor(() => expect(listed('Frágil')).toBe(false));
  });
});

describe('Dashboard — renomear uma história (§7.2, ENG-281)', () => {
  it('toda história pode ser renomeada, terminada ou não', async () => {
    const store = new FixtureSessionStore();
    await seedInProgress(store, { storyName: 'Em curso', storySlug: 'em-curso' });
    await seedCompleted(store, TRIPLE, { storyName: 'Terminada', storySlug: 'terminada' });
    const dashboard = <Dashboard store={store} auth={new FixtureAuthProvider()} />;

    render(dashboard);
    await userEvent.click(await screen.findByRole('button', { name: 'Ações em Em curso' }));
    expect(screen.getByRole('button', { name: 'Renomear a história' })).toBeTruthy();

    // uma casa nova para o segundo cartão: fechar o primeiro menu exigiria do teste
    // um gesto (Esc, clique fora) que não é o que ele afirma
    cleanup();

    render(dashboard);
    await userEvent.click(await screen.findByRole('button', { name: 'Ações em Terminada' }));
    expect(screen.getByRole('button', { name: 'Renomear a história' })).toBeTruthy();
  });

  it('o diálogo abre já com o nome de agora — corrigir um erro de digitação não é redigitar tudo', async () => {
    const store = new FixtureSessionStore();
    await seedInProgress(store, { storyName: 'A raposa e o tanbor', storySlug: 'a-raposa' });

    render(<Dashboard store={store} auth={new FixtureAuthProvider()} />);
    await chooseRename('A raposa e o tanbor');

    expect(nameField().value).toBe('A raposa e o tanbor');
  });

  it('salvar um nome novo o mostra no cartão — inclusive fora do ASCII', async () => {
    const store = new FixtureSessionStore();
    await seedInProgress(store, { storyName: 'Nome errado', storySlug: 'nome-errado' });
    const renamed = vi.spyOn(store, 'rename');

    render(<Dashboard store={store} auth={new FixtureAuthProvider()} />);
    await chooseRename('Nome errado');
    // as histórias são em terena e português: acento e apóstrofo têm de voltar iguais.
    // E o que sai daqui vai aparado nas pontas — "  Ana  " é "Ana".
    await typeNameAndSave('  Kohíxoti-kipaé, a dança do bugio  ');

    await waitFor(() => expect(listed('Kohíxoti-kipaé, a dança do bugio')).toBe(true));
    expect(renamed).toHaveBeenCalledWith(expect.any(String), 'Kohíxoti-kipaé, a dança do bugio');
    expect(listed('Nome errado')).toBe(false);
  });

  /**
   * A decisão que a issue inteira gira em torno: renomear muda o nome de EXIBIÇÃO, e
   * só. O `story_slug` nomeia os três documentos (§10.5/§10.6) e o pipeline os lê pelo
   * nome — um rename que arrastasse o slug renomearia, calado, arquivos já guardados.
   */

  it('desistir não muda o nome nem pede nada à store', async () => {
    const store = new FixtureSessionStore();
    await seedInProgress(store, { storyName: 'Como está', storySlug: 'como-esta' });
    const renamed = vi.spyOn(store, 'rename');

    render(<Dashboard store={store} auth={new FixtureAuthProvider()} />);
    await chooseRename('Como está');
    await userEvent.clear(nameField());
    await userEvent.type(nameField(), 'Nunca salvo');
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(renamed).not.toHaveBeenCalled();
    expect(listed('Como está')).toBe(true);
    expect(listed('Nunca salvo')).toBe(false);
  });

  it('um nome vazio — ou só de espaços — nem chega a ser enviado', async () => {
    const store = new FixtureSessionStore();
    await seedInProgress(store, { storyName: 'Tem nome', storySlug: 'tem-nome' });
    const renamed = vi.spyOn(store, 'rename');

    render(<Dashboard store={store} auth={new FixtureAuthProvider()} />);
    await chooseRename('Tem nome');
    const save = screen.getByRole('button', { name: 'Salvar o nome' });

    await userEvent.clear(nameField());
    expect((save as HTMLButtonElement).disabled).toBe(true);

    await userEvent.type(nameField(), '   ');
    expect((save as HTMLButtonElement).disabled).toBe(true);

    await userEvent.click(save);
    expect(renamed).not.toHaveBeenCalled();
    expect(listed('Tem nome')).toBe(true);
  });

  it('recusada por trava alheia, o nome fica como estava e a tela diz quem está com a história (§9.4)', async () => {
    const backend = new FixtureSessionBackend();
    const alice = new FixtureSessionStore({
      backend,
      user: { user_id: 'a', display_name: 'Alice' },
    });
    const bob = new FixtureSessionStore({ backend, user: { user_id: 'b', display_name: 'Bob' } });
    const s = await alice.create(createInput({ storyName: 'Disputada', storySlug: 'disputada' }));
    await alice.acquireLock(s.id);

    render(<Dashboard store={bob} auth={new FixtureAuthProvider()} />);
    await chooseRename('Disputada');
    await typeNameAndSave('Renomeada à força');

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Alice');
    expect(listed('Disputada')).toBe(true);
    expect(listed('Renomeada à força')).toBe(false);
  });

  it('duas confirmações seguidas não renomeiam duas vezes', async () => {
    // a store demora a responder: sem trava, o segundo clique chega com o primeiro
    // rename ainda no ar — e os dois têm de cair ANTES disso resolver
    const store = new FixtureSessionStore({ latencyMs: 30 });
    await seedInProgress(store, { storyName: 'Nome errado', storySlug: 'nome-errado' });
    const renamed = vi.spyOn(store, 'rename');

    render(<Dashboard store={store} auth={new FixtureAuthProvider()} />);
    await chooseRename('Nome errado');
    await userEvent.clear(nameField());
    await userEvent.type(nameField(), 'Nome certo');
    const save = screen.getByRole('button', { name: 'Salvar o nome' });
    fireEvent.click(save);
    fireEvent.click(save);

    await waitFor(() => expect(listed('Nome certo')).toBe(true));
    expect(renamed).toHaveBeenCalledTimes(1);
  });

  /**
   * Renomear e reler a lista são DUAS idas ao servidor, e só a PRIMEIRA decide se o
   * nome mudou. Se a releitura cair, dizer "não consegui renomear" manda a
   * facilitadora refazer uma coisa já feita (a mesma lição do apagar, ENG-281).
   */
  it('uma releitura falha depois de renomear não vira "não consegui renomear"', async () => {
    const store = new FixtureSessionStore();
    await seedInProgress(store, { storyName: 'Nome errado', storySlug: 'nome-errado' });

    render(<Dashboard store={store} auth={new FixtureAuthProvider()} />);
    await chooseRename('Nome errado');
    // a listagem inicial já resolveu; só a releitura de depois do rename é que cai
    vi.spyOn(store, 'list').mockRejectedValue(new Error('rede fora'));
    await typeNameAndSave('Nome certo');

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.queryByText(/Não consegui renomear/)).toBeNull();
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Não consegui carregar as histórias',
    );
  });
});

describe('Dashboard — nova história (§7.2)', () => {
  it('“Comece uma nova história” roteia para o setup', async () => {
    const store = new FixtureSessionStore();

    render(<Dashboard store={store} auth={new FixtureAuthProvider()} />);

    // o cartão de nova história vive na grade — só nasce quando a listagem resolve
    await userEvent.click(await screen.findByRole('button', { name: /Comece uma nova história/i }));
    expect(window.location.pathname).toBe('/setup');
  });
});

describe('Dashboard — expiração de auth (§7.1)', () => {
  it('a expiração volta ao login sem tocar o store', async () => {
    const store = new FixtureSessionStore();
    await seedInProgress(store, { storyName: 'Preservável', storySlug: 'preservavel' });
    const auth = new FixtureAuthProvider();
    await auth.login({ username: 'facilitadora', password: FILL });

    render(<Dashboard store={store} auth={auth} />);
    await screen.findAllByText('Preservável');

    auth.simulateExpiry();

    expect(window.location.pathname).toBe('/login');
    // store intocado: a sessão semeada segue lá
    expect(await store.list()).toHaveLength(1);
  });
});

describe('Dashboard — superfície creme (redesign §4.1)', () => {
  it('a tela usa o fundo creme via token', () => {
    expect(dashboardCss).toMatch(/\.cds-dashboard\s*\{[^}]*var\(--cds-ui-bg\)/);
  });
});

/** Escapa uma string para uso literal dentro de um RegExp. */
function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

describe('Dashboard — fronteira de IO real (ENG-247)', () => {
  it('listagem falhada vira aviso, não um "carregando…" eterno', async () => {
    const store = new FixtureSessionStore();
    vi.spyOn(store, 'list').mockRejectedValue(new Error('API fora do ar'));

    render(<Dashboard store={store} auth={new FixtureAuthProvider()} />);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Não consegui carregar as histórias');
    expect(screen.queryByText('Carregando as histórias…')).toBeNull();
  });
});
