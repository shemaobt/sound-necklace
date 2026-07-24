import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  FixtureProjectSettings,
  GranularityLockedError,
  type ProjectSettingsStore,
} from '../../../adapters/project-settings';
import i18n from '../../i18n';
import { pt } from '../../i18n/pt';
import Settings from './index';

/**
 * Configurações (ENG-352). O que a tela precisa acertar não é o formulário: é oferecer a
 * decisão da granularidade enquanto ela existe, dizer com todas as letras que confirmar é
 * definitivo, e trocar de FORMA — não desabilitar um controle — depois de confirmada.
 */

function renderPage(store: ProjectSettingsStore, canEdit = true) {
  render(<Settings store={store} projectId="proj-1" canEdit={canEdit} />);
}

const confirmButton = () =>
  screen.findByRole('button', { name: new RegExp(pt.settings.granConfirm) });

afterEach(async () => {
  await i18n.changeLanguage('pt');
});

describe('Configurações — granularidade', () => {
  it('projeto sem granularidade oferece os três tamanhos e o botão que trava', async () => {
    renderPage(new FixtureProjectSettings());

    expect(await screen.findByText(pt.settings.granTitle)).toBeTruthy();
    const group = screen.getByRole('radiogroup', { name: pt.settings.granEyebrow });
    expect(within(group).getAllByRole('radio')).toHaveLength(3);
    expect(await confirmButton()).toBeTruthy();
  });

  it('confirmar grava o nível e a tela passa a dizer que não muda mais', async () => {
    const store = new FixtureProjectSettings();
    const spy = vi.spyOn(store, 'setLevel');
    renderPage(store);

    const group = await screen.findByRole('radiogroup', { name: pt.settings.granEyebrow });
    await userEvent.click(within(group).getByRole('radio', { name: pt.settings.level.large }));
    await userEvent.click(await confirmButton());

    await waitFor(() => expect(spy).toHaveBeenCalledWith('proj-1', 'large'));
    expect(await screen.findByText(pt.settings.granTitleConfirmed)).toBeTruthy();
    expect(screen.getByText(pt.settings.granLeadConfirmed)).toBeTruthy();
  });

  /**
   * A regra que o botão promete. Confirmado, a tela não oferece um controle cinza — ela
   * troca de forma: mostra o tamanho e explica. Um radio desabilitado enquadraria como
   * problema de permissão o que é consequência.
   */
  it('confirmado, não há mais o que escolher nem o que confirmar', async () => {
    const store = new FixtureProjectSettings({ seed: { 'proj-1': { level: 'medium' } } });
    renderPage(store);

    expect(await screen.findByText(pt.settings.granTitleConfirmed)).toBeTruthy();
    expect(screen.getByText(pt.settings.level.medium)).toBeTruthy();
    expect(screen.queryByRole('radiogroup', { name: pt.settings.granEyebrow })).toBeNull();
    expect(screen.queryByRole('button', { name: new RegExp(pt.settings.granConfirm) })).toBeNull();
  });

  it('quem não administra o projeto não confirma — é mandado falar com quem administra', async () => {
    renderPage(new FixtureProjectSettings(), false);

    expect(await screen.findByText(pt.settings.granAskAdmin)).toBeTruthy();
    expect(screen.queryByRole('button', { name: new RegExp(pt.settings.granConfirm) })).toBeNull();
  });

  /** Corrida real: outra pessoa confirmou entre a leitura desta tela e o clique. */
  it('confirmado por outra pessoa no meio do caminho vira explicação, não erro genérico', async () => {
    const store = new FixtureProjectSettings();
    vi.spyOn(store, 'setLevel').mockRejectedValue(new GranularityLockedError('proj-1'));
    renderPage(store);

    await userEvent.click(await confirmButton());

    expect((await screen.findByRole('alert')).textContent).toContain(
      pt.settings.granAlreadyConfirmed,
    );
    await waitFor(() =>
      expect(screen.queryByRole('radiogroup', { name: pt.settings.granEyebrow })).toBeNull(),
    );
  });

  it('403 diz que só quem administra o projeto decide', async () => {
    const store = new FixtureProjectSettings();
    vi.spyOn(store, 'setLevel').mockRejectedValue(new Error('HTTP 403 ao gravar'));
    renderPage(store);

    await userEvent.click(await confirmButton());

    expect((await screen.findByRole('alert')).textContent).toContain(pt.settings.granForbidden);
  });

  it('leitura que falha avisa em vez de deixar a tela presa em carregando', async () => {
    const broken: ProjectSettingsStore = {
      get: () => Promise.reject(new Error('HTTP 500')),
      setLevel: () => Promise.reject(new Error('não deveria')),
      noteSessionCreated: () => {},
    };
    renderPage(broken);

    expect((await screen.findByRole('alert')).textContent).toContain(pt.settings.readError);
    expect(screen.queryByText(pt.settings.loading)).toBeNull();
  });
});

describe('Configurações — idioma', () => {
  it('marca o idioma corrente e troca a cópia da própria tela ao escolher outro', async () => {
    renderPage(new FixtureProjectSettings());

    const group = await screen.findByRole('radiogroup', { name: pt.settings.langHeading });
    expect(
      within(group).getByRole('radio', { name: 'Português' }).getAttribute('aria-checked'),
    ).toBe('true');

    await userEvent.click(within(group).getByRole('radio', { name: 'English' }));

    // a prova é a cópia visível mudando, não o valor guardado
    expect(await screen.findByText('Settings')).toBeTruthy();
    expect(screen.queryByText(pt.settings.title)).toBeNull();
  });
});
