import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, type Mock } from 'vitest';

import {
  FixtureProjectSettings,
  GranularityLockedError,
  type ProjectSettingsStore,
} from '../../../adapters/project-settings';
import { pt } from '../../i18n/pt';
import ProjectSettingsPage from './index';

/**
 * A tela onde o tamanho da conta é decidido, uma vez (ENG-352). O que ela precisa
 * acertar não é o formulário: é oferecer a decisão enquanto ela existe, e explicar em
 * vez de oferecer quando o projeto já cortou algo nessa grade.
 */

function renderPage(store: ProjectSettingsStore, navigate: Mock<(to: string) => void> = vi.fn()) {
  render(<ProjectSettingsPage store={store} projectId="proj-1" navigate={navigate} />);
  return navigate;
}

describe('ProjectSettings — decidir', () => {
  it('projeto sem nível abre os três, sem nenhum marcado', async () => {
    renderPage(new FixtureProjectSettings());

    const radios = await screen.findAllByRole('radio');
    expect(radios).toHaveLength(3);
    expect(radios.every((r) => r.getAttribute('aria-checked') !== 'true')).toBe(true);
    expect(screen.getByText(pt.projectSettings.lead)).toBeTruthy();
  });

  it('projeto já configurado abre com o nível atual marcado', async () => {
    renderPage(new FixtureProjectSettings({ seed: { 'proj-1': { level: 'large' } } }));

    const grande = await screen.findByRole('radio', { name: pt.setup.levelGrandeTitle });
    await waitFor(() => expect(grande.getAttribute('aria-checked')).toBe('true'));
  });

  it('escolher e salvar grava o nível', async () => {
    const store = new FixtureProjectSettings();
    const spy = vi.spyOn(store, 'setLevel');
    renderPage(store);

    await userEvent.click(await screen.findByRole('radio', { name: pt.setup.levelPequenaTitle }));
    await userEvent.click(screen.getByRole('button', { name: pt.projectSettings.save }));

    await waitFor(() => expect(spy).toHaveBeenCalledWith('proj-1', 'small'));
    expect(await screen.findByText(pt.projectSettings.saved)).toBeTruthy();
    await expect(store.get('proj-1')).resolves.toMatchObject({ granularity_level: 'small' });
  });

  it('sem escolher nada, não há o que salvar', async () => {
    renderPage(new FixtureProjectSettings());

    await screen.findAllByRole('radio');
    expect(
      screen.getByRole('button', { name: pt.projectSettings.save }).hasAttribute('disabled'),
    ).toBe(true);
  });
});

describe('ProjectSettings — congelado', () => {
  it('projeto que já cortou explica em vez de oferecer os níveis', async () => {
    const store = new FixtureProjectSettings({ seed: { 'proj-1': { level: 'medium' } } });
    store.noteSessionCreated('proj-1', 'medium', 0.5);
    renderPage(store);

    expect(await screen.findByText(pt.projectSettings.lockedBody)).toBeTruthy();
    expect(screen.getByText(pt.setup.levelMediaTitle)).toBeTruthy();
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: pt.projectSettings.save })).toBeNull();
  });

  /** Corrida real: outra pessoa criou a primeira sessão entre o load e o save. */
  it('congelado no meio do caminho vira explicação, não erro genérico', async () => {
    const store = new FixtureProjectSettings({ seed: { 'proj-1': { level: 'medium' } } });
    vi.spyOn(store, 'setLevel').mockRejectedValue(new GranularityLockedError('proj-1'));
    renderPage(store);

    await userEvent.click(await screen.findByRole('radio', { name: pt.setup.levelGrandeTitle }));
    await userEvent.click(screen.getByRole('button', { name: pt.projectSettings.save }));

    expect((await screen.findByRole('alert')).textContent).toContain(pt.projectSettings.lockedBody);
    // e a tela passa a mostrar o estado real: não oferece mais a escolha
    await waitFor(() => expect(screen.queryAllByRole('radio')).toHaveLength(0));
  });
});

describe('ProjectSettings — falhas', () => {
  it('403 diz que só quem administra o projeto decide', async () => {
    const store = new FixtureProjectSettings();
    vi.spyOn(store, 'setLevel').mockRejectedValue(new Error('HTTP 403 ao gravar'));
    renderPage(store);

    await userEvent.click(await screen.findByRole('radio', { name: pt.setup.levelMediaTitle }));
    await userEvent.click(screen.getByRole('button', { name: pt.projectSettings.save }));

    expect((await screen.findByRole('alert')).textContent).toContain(pt.projectSettings.forbidden);
  });

  it('leitura que falha avisa em vez de deixar a tela presa em carregando', async () => {
    const broken: ProjectSettingsStore = {
      get: () => Promise.reject(new Error('HTTP 500')),
      setLevel: () => Promise.reject(new Error('não deveria')),
      noteSessionCreated: () => {},
    };
    renderPage(broken);

    expect((await screen.findByRole('alert')).textContent).toContain(pt.projectSettings.readError);
    expect(screen.queryByText(pt.projectSettings.loading)).toBeNull();
  });

  it('outra falha ao salvar vira a orientação genérica', async () => {
    const store = new FixtureProjectSettings();
    vi.spyOn(store, 'setLevel').mockRejectedValue(new Error('boom'));
    renderPage(store);

    await userEvent.click(await screen.findByRole('radio', { name: pt.setup.levelMediaTitle }));
    await userEvent.click(screen.getByRole('button', { name: pt.projectSettings.save }));

    expect((await screen.findByRole('alert')).textContent).toContain(pt.projectSettings.saveError);
  });
});

describe('ProjectSettings — navegação', () => {
  it('voltar leva ao dashboard', async () => {
    const navigate = renderPage(new FixtureProjectSettings());

    await userEvent.click(await screen.findByRole('button', { name: pt.projectSettings.back }));

    expect(navigate).toHaveBeenCalledWith('/dashboard');
  });
});
