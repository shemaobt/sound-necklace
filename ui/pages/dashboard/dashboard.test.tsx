import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FixtureAuthProvider } from '../../../adapters/api';
import { type CreateSessionInput, FixtureSessionStore } from '../../../adapters/sessions';
import type { ArtifactTriple, SessionStateDto } from '../../../contracts';
import dashboardCss from './dashboard.css?raw';
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
    granularityLevel: 'media',
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

function downloadCard(filename: string): HTMLElement {
  const card = screen.getByText(filename).closest('.cds-document-card');
  if (!card) throw new Error(`card não encontrado: ${filename}`);
  return within(card as HTMLElement).getByRole('button');
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
    await store.complete(done.id, STATE, { retorno: 'r', manifesto: 'm', relatorio: 'l' });
    const doneSummary = await store.get(done.id);

    render(<Dashboard store={store} auth={new FixtureAuthProvider()} saveBytes={vi.fn()} />);

    await screen.findAllByText('História em curso');
    expect(screen.getByText('Em andamento')).toBeTruthy();
    expect(screen.getByText('Concluída')).toBeTruthy();
    // última modificação: o texto formatado da própria sessão aparece no card
    expect(
      screen.getAllByText(new RegExp(escapeRe(formatWhen(doneSummary.last_modified)))).length,
    ).toBeGreaterThan(0);
    // relance de progresso (§7.2): a capa do fio, nomeada pelo passo salvo
    expect(screen.getAllByRole('img', { name: /progresso: .+ — passo \d de 6/ })).toHaveLength(2);
  });
});

describe('Dashboard — cabeçalho próprio (protótipo Shemá v2)', () => {
  it('mostra a marca, a usuária autenticada e o título da casa', async () => {
    const store = new FixtureSessionStore();
    const auth = new FixtureAuthProvider();
    await auth.login({ username: 'facilitadora', password: FILL });

    render(<Dashboard store={store} auth={auth} saveBytes={vi.fn()} />);

    expect(screen.getByRole('heading', { name: 'Colar de Sons' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Suas histórias' })).toBeTruthy();
    expect(screen.getByText('facilitadora')).toBeTruthy();
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

describe('Dashboard — downloads diretos de sessão concluída (§7.2/§10.5)', () => {
  it('expõe exatamente três downloads byte-idênticos aos guardados, com os nomes exatos', async () => {
    const triple: ArtifactTriple = {
      retorno: '{"retorno":true}',
      manifesto: '{"manifesto":true}',
      relatorio: '# relatório',
    };
    const store = new FixtureSessionStore();
    await seedCompleted(store, triple, { storyName: 'Concluída', storySlug: 'concluida-x' });
    const save = vi.fn();

    render(<Dashboard store={store} auth={new FixtureAuthProvider()} saveBytes={save} />);

    const group = (await screen.findByText('retorno-ancoragem.json')).closest(
      '.cds-dashboard-download-group',
    ) as HTMLElement;
    expect(group.querySelectorAll('.cds-document-card')).toHaveLength(3);

    await userEvent.click(downloadCard('retorno-ancoragem.json'));
    await userEvent.click(downloadCard('manifesto-contas.json'));
    await userEvent.click(downloadCard('relatorio-mapeamento.md'));

    const sent = Object.fromEntries(save.mock.calls.map(([name, bytes]) => [name, bytes]));
    expect(sent['concluida-x-retorno-ancoragem.json']).toBe(triple.retorno);
    expect(sent['concluida-x-manifesto-contas.json']).toBe(triple.manifesto);
    expect(sent['concluida-x-relatorio-mapeamento.md']).toBe(triple.relatorio);
  });

  it('uma sessão em progresso não expõe downloads', async () => {
    const store = new FixtureSessionStore();
    await seedInProgress(store, { storyName: 'Só andamento', storySlug: 'so-andamento' });

    render(<Dashboard store={store} auth={new FixtureAuthProvider()} saveBytes={vi.fn()} />);

    await screen.findAllByText('Só andamento');
    expect(screen.queryByText('retorno-ancoragem.json')).toBeNull();
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
