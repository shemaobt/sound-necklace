import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FixtureAuthProvider } from '../../../adapters/api';
import { type CreateSessionInput, FixtureSessionStore } from '../../../adapters/sessions';
import type { ArtifactTriple, SessionStateDto } from '../../../contracts';
import dashboardCss from './dashboard.css?raw';
import sessionListCss from '../../organisms/session-list/session-list.css?raw';
import Dashboard, { formatWhen } from './index';

/**
 * Sessions dashboard (PRD v2 §7.2/§7.3/§10.5): lista as sessões com status +
 * última modificação + progresso, retoma direto na sessão, baixa os três artefatos
 * de uma sessão concluída byte-idênticos aos guardados, e abre uma nova sessão. A
 * expiração de auth (§7.1) volta ao login. Portas fixture por prop.
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

function goto(path: string): void {
  window.history.replaceState({}, '', path);
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

    render(<Dashboard store={store} auth={new FixtureAuthProvider()} saveBytes={vi.fn()} />);

    await screen.findAllByText('História em curso');
    expect(screen.getByText('Em andamento')).toBeTruthy();
    expect(screen.getByText('Concluída')).toBeTruthy();
    // última modificação: o texto formatado da própria sessão aparece no card
    expect(
      screen.getAllByText(new RegExp(escapeRe(formatWhen(doneSummary.last_modified)))).length,
    ).toBeGreaterThan(0);
    // relance de progresso (§7.2): a capa nomeia ONDE a sessão parou — a recém-criada
    // fica no 1º passo e a concluída no último (a fixture põe 'listen' e 'save').
    expect(screen.getByRole('img', { name: 'progresso: Ouvir — passo 1 de 6' })).toBeTruthy();
    expect(screen.getByRole('img', { name: 'progresso: Guardar — passo 6 de 6' })).toBeTruthy();
    // a contagem da casa concorda com a grade
    expect(screen.getByText('2 histórias')).toBeTruthy();
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

    render(<Dashboard store={store} auth={new FixtureAuthProvider()} saveBytes={vi.fn()} />);

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

    render(<Dashboard store={store} auth={new FixtureAuthProvider()} saveBytes={vi.fn()} />);

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

    render(<Dashboard store={store} auth={auth} saveBytes={vi.fn()} />);

    expect(screen.getByRole('heading', { name: 'Colar de Sons' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Suas histórias' })).toBeTruthy();
    expect(screen.getByText('facilitadora')).toBeTruthy();

    // a listagem resolve depois do corpo do teste — aguardar evita o aviso de act()
    await screen.findByRole('list', { name: 'histórias' });
  });

  it('a casa troca o idioma sem abrir sessão (ENG-340)', async () => {
    const store = new FixtureSessionStore();
    render(<Dashboard store={store} auth={new FixtureAuthProvider()} saveBytes={vi.fn()} />);
    await screen.findByRole('list', { name: 'histórias' });

    await userEvent.click(screen.getByRole('button', { name: 'Mudar para inglês' }));
    expect(screen.getByRole('heading', { name: 'Your stories' })).toBeTruthy();

    // devolve o idioma para não vazar aos demais testes
    await userEvent.click(screen.getByRole('button', { name: 'Switch to Portuguese' }));
    expect(screen.getByRole('heading', { name: 'Suas histórias' })).toBeTruthy();
  });

  it('“Sair” encerra a sessão e volta ao login', async () => {
    const store = new FixtureSessionStore();
    const auth = new FixtureAuthProvider();
    await auth.login({ username: 'facilitadora', password: FILL });

    render(<Dashboard store={store} auth={auth} saveBytes={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Sair' }));

    await waitFor(() => expect(window.location.pathname).toBe('/login'));
    expect(auth.currentUser()).toBeNull();
  });
});

describe('Dashboard — retomar (§7.3)', () => {
  it('“Retomar” navega para /session/:id', async () => {
    const store = new FixtureSessionStore();
    const id = await seedInProgress(store, { storyName: 'Retomável', storySlug: 'retomavel' });

    render(<Dashboard store={store} auth={new FixtureAuthProvider()} saveBytes={vi.fn()} />);

    await userEvent.click(await screen.findByRole('button', { name: /Retomar/ }));
    expect(window.location.pathname).toBe(`/session/${id}`);
  });
});

describe('Dashboard — downloads no cartão da concluída (§7.2/§10.5, ENG-305)', () => {
  it('o menu "Baixar" do cartão entrega os três artefatos byte-idênticos e marca os baixados', async () => {
    const triple: ArtifactTriple = {
      anchoring: '{"anchoring":true}',
      manifest: '{"manifest":true}',
      report: '# relatório',
    };
    const store = new FixtureSessionStore();
    await seedCompleted(store, triple, { storyName: 'Concluída', storySlug: 'concluida-x' });
    const save = vi.fn();

    render(<Dashboard store={store} auth={new FixtureAuthProvider()} saveBytes={save} />);

    await userEvent.click(await screen.findByRole('button', { name: 'Baixar' }));
    await userEvent.click(await screen.findByRole('button', { name: /As decisões de vocês/ }));
    // o popover fecha ao interagir? Radix mantém aberto em cliques internos — segue
    await userEvent.click(screen.getByRole('button', { name: /O mapa das contas/ }));
    await userEvent.click(screen.getByRole('button', { name: /A conversa sobre o sentido/ }));

    const sent = Object.fromEntries(save.mock.calls.map(([name, bytes]) => [name, bytes]));
    expect(sent['concluida-x-retorno-ancoragem.json']).toBe(triple.anchoring);
    expect(sent['concluida-x-manifesto-contas.json']).toBe(triple.manifest);
    expect(sent['concluida-x-relatorio-mapeamento.md']).toBe(triple.report);

    // baixado marca o item (as chaves agora batem com o kind — bug antigo corrigido)
    await waitFor(() =>
      expect(
        screen
          .getByRole('button', { name: /As decisões de vocês/ })
          .getAttribute('data-downloaded'),
      ).toBe('true'),
    );
    // e os cards soltos sumiram da home
    expect(document.querySelector('.cds-dashboard-download-group')).toBeNull();
  });

  it('o gatilho é um ícone discreto — nome acessível "Baixar", sem palavra visível (ENG-333)', async () => {
    const store = new FixtureSessionStore();
    await seedCompleted(
      store,
      { anchoring: '{}', manifest: '{}', report: '#' },
      { storyName: 'Concluída', storySlug: 'concluida-x' },
    );

    render(<Dashboard store={store} auth={new FixtureAuthProvider()} saveBytes={vi.fn()} />);

    const trigger = await screen.findByRole('button', { name: 'Baixar' });
    // ícone, não palavra: o glifo é decorativo e o nome vem do aria-label
    expect(trigger.getAttribute('aria-label')).toBe('Baixar');
    expect(trigger.querySelector('[aria-hidden="true"]')).toBeTruthy();
    expect(trigger.textContent).not.toContain('Baixar');
  });

  it('a área de ação do cartão separa o botão principal do menu (ENG-333)', () => {
    const action = /\.cds-session-card-action\s*{[^}]*}/.exec(sessionListCss)?.[0] ?? '';
    expect(action).toMatch(/gap:/);
  });

  it('uma sessão em progresso não tem o menu Baixar', async () => {
    const store = new FixtureSessionStore();
    await seedInProgress(store, { storyName: 'Só andamento', storySlug: 'so-andamento' });

    render(<Dashboard store={store} auth={new FixtureAuthProvider()} saveBytes={vi.fn()} />);

    await screen.findAllByText('Só andamento');
    expect(screen.queryByRole('button', { name: 'Baixar' })).toBeNull();
  });
});

describe('Dashboard — nova história (§7.2)', () => {
  it('“Comece uma nova história” roteia para o setup', async () => {
    const store = new FixtureSessionStore();

    render(<Dashboard store={store} auth={new FixtureAuthProvider()} saveBytes={vi.fn()} />);

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

    render(<Dashboard store={store} auth={auth} saveBytes={vi.fn()} />);
    await screen.findAllByText('Preservável');

    auth.simulateExpiry();

    expect(window.location.pathname).toBe('/login');
    // store intocado: a sessão semeada segue lá
    expect(await store.list()).toHaveLength(1);
  });
});

describe('Dashboard — superfície creme (redesign §4.1)', () => {
  it('a tela usa o fundo creme via token', () => {
    expect(dashboardCss).toMatch(/\.cds-dashboard\s*\{[^}]*var\(--cds-cream\)/);
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

    render(<Dashboard store={store} auth={new FixtureAuthProvider()} saveBytes={vi.fn()} />);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Não consegui carregar as histórias');
    expect(screen.queryByText('Carregando as histórias…')).toBeNull();
  });
});
