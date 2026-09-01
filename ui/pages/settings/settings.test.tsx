import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  FixtureProjectSettings,
  ForbiddenError,
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

  /**
   * ENG-700: a explicação do "não muda mais" apoiava-se em algo que já foi exportado, e
   * exportação nenhuma existe desde ENG-689/ENG-691. A razão verdadeira sobrou inteira —
   * a grade é a referência de tudo o que já foi cortado. Asserção sobre a IDEIA: qualquer
   * redação que volte a prometer exportação ou documento cai aqui, nos dois idiomas.
   */
  it('não promete exportação nem documento nenhum (ENG-700)', async () => {
    const store = new FixtureProjectSettings({ seed: { 'proj-1': { level: 'medium' } } });
    renderPage(store);
    await screen.findByText(pt.settings.granTitleConfirmed);

    // a TELA inteira, não só o parágrafo corrigido: a promessa falsa pode voltar em
    // qualquer texto desta superfície, e escopar ao parágrafo o localizaria pela própria
    // string que se quer afirmar
    const tela = () => document.body.textContent ?? '';

    expect(tela()).not.toMatch(/export|document|artefato|relatório/i);

    await act(() => i18n.changeLanguage('en'));
    expect(tela()).not.toMatch(/export|document|artifact|report\b/i);
  });

  it('quem não administra o projeto não confirma — é mandado falar com quem administra', async () => {
    renderPage(new FixtureProjectSettings(), false);

    expect(await screen.findByText(pt.settings.granAskAdmin)).toBeTruthy();
    expect(screen.queryByRole('button', { name: new RegExp(pt.settings.granConfirm) })).toBeNull();
  });

  /**
   * Corrida real: outra pessoa confirmou entre a leitura desta tela e o clique. A tela
   * explica em vez de dar erro genérico — e mostra o nível que GANHOU, não o que esta
   * pessoa tinha selecionado. Dizer "confirmado permanentemente" ao lado da escolha que
   * acabou de ser recusada é a pior mentira que esta tela pode contar: a decisão é
   * irreversível e vale para o projeto inteiro, então a pessoa iria embora com a grade
   * errada na cabeça, e sem nada na tela que a desminta.
   */
  it('a corrida perdida explica e mostra o nível que venceu, não o que esta pessoa escolheu', async () => {
    const store = new FixtureProjectSettings();
    vi.spyOn(store, 'setLevel').mockImplementation(() => {
      // quem venceu gravou `small` no servidor enquanto esta tela ainda lia null
      store.noteSessionCreated('proj-1', 'small', 0.2);
      return Promise.reject(new GranularityLockedError('proj-1'));
    });
    renderPage(store);

    const group = await screen.findByRole('radiogroup', { name: pt.settings.granEyebrow });
    await userEvent.click(within(group).getByRole('radio', { name: pt.settings.level.large }));
    await userEvent.click(await confirmButton());

    expect((await screen.findByRole('alert')).textContent).toContain(
      pt.settings.granAlreadyConfirmed,
    );
    expect(await screen.findByText(pt.settings.level.small)).toBeTruthy();
    expect(screen.queryByText(pt.settings.level.large)).toBeNull();
    await waitFor(() =>
      expect(screen.queryByRole('radiogroup', { name: pt.settings.granEyebrow })).toBeNull(),
    );
  });

  /**
   * O caso duplo: o PUT recusa e a releitura também falha. Sem saber qual nível venceu,
   * a tela não afirma nenhum — cair de volta na escolha local a apresentaria como a
   * decisão do projeto, que é exatamente o que o teste acima proíbe.
   */
  it('recusa sem releitura possível trava sem afirmar tamanho nenhum', async () => {
    const store = new FixtureProjectSettings({ seed: { 'proj-1': {} } });
    vi.spyOn(store, 'setLevel').mockRejectedValue(new GranularityLockedError('proj-1'));
    vi.spyOn(store, 'get').mockRejectedValueOnce(new Error('HTTP 500'));
    renderPage(store);

    await userEvent.click(await confirmButton());

    expect((await screen.findByRole('alert')).textContent).toContain(
      pt.settings.granAlreadyConfirmed,
    );
    for (const level of ['small', 'medium', 'large'] as const) {
      expect(screen.queryByText(pt.settings.level[level])).toBeNull();
    }
  });

  /**
   * Trocar de idioma não é recarregar a tela. O efeito de leitura depende de `t`, então
   * cada troca refazia `defaultProjectId` + `get` + `defaultCanEdit` — três idas à rede
   * para buscar exatamente o mesmo dado.
   */
  it('trocar o idioma não relê as configurações do servidor', async () => {
    const store = new FixtureProjectSettings();
    const spy = vi.spyOn(store, 'get');
    renderPage(store);

    const langs = await screen.findByRole('radiogroup', { name: pt.settings.langHeading });
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    await userEvent.click(within(langs).getByRole('radio', { name: 'English' }));

    expect(await screen.findByText('Settings')).toBeTruthy();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('403 diz que só quem administra o projeto decide', async () => {
    const store = new FixtureProjectSettings();
    vi.spyOn(store, 'setLevel').mockRejectedValue(new ForbiddenError('proj-1'));
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

/**
 * A amostra (decisão do dono, 2026-08-06). Escolher o tamanho da conta olhando um
 * cordão inventado pedia um ato de fé: ninguém sabe o que "Pequena" quer dizer até
 * ouvir. O que a amostra precisa acertar é UMA coisa — o mesmo trecho do mesmo áudio
 * mudando de densidade conforme o nível. Se a conta encolhe e o número não sobe, a
 * amostra não ensina nada.
 */
describe('Configurações — a amostra da granularidade', () => {
  /** Bucket de um áudio só: a amostra é o PRIMEIRO da listagem. */
  function bucketWith(ids: string[]) {
    return {
      list: vi.fn(async () =>
        ids.map((id) => ({ id, filename: `${id}.wav`, consent_present: true })),
      ),
      fetchBytes: vi.fn(async () => new ArrayBuffer(8)),
    };
  }

  /** Resolvedor de teste: nível → beadSec, sem passar pela regra O8 real. */
  const resolver = {
    resolve: (level: 'small' | 'medium' | 'large') => ({
      beadSec: { small: 0.2, medium: 0.3, large: 0.5 }[level],
    }),
  };

  const beads = (container: HTMLElement) =>
    container.querySelectorAll('.cds-settings-cord .cds-pearl').length;

  it('o mesmo trecho vira mais contas em Pequena e menos em Grande', async () => {
    const { container } = render(
      <Settings
        store={new FixtureProjectSettings()}
        projectId="proj-1"
        canEdit
        bucket={bucketWith(['a1'])}
        resolver={resolver}
      />,
    );

    const group = await screen.findByRole('radiogroup', { name: pt.settings.granEyebrow });
    const pick = async (name: string) =>
      userEvent.click(within(group).getByRole('radio', { name }));

    await pick(pt.settings.level.small);
    await waitFor(() => expect(beads(container)).toBeGreaterThan(0));
    const small = beads(container);

    await pick(pt.settings.level.medium);
    await waitFor(() => expect(beads(container)).toBeLessThan(small));
    const medium = beads(container);

    await pick(pt.settings.level.large);
    await waitFor(() => expect(beads(container)).toBeLessThan(medium));
  });

  it('a densidade também é dita em texto — o cordão é decoração', async () => {
    render(
      <Settings
        store={new FixtureProjectSettings()}
        projectId="proj-1"
        canEdit
        bucket={bucketWith(['a1'])}
        resolver={resolver}
      />,
    );

    expect(await screen.findByText(/viram \d+ contas/)).toBeTruthy();
  });

  it('sem áudio no projeto, a amostra some em vez de mentir', async () => {
    render(
      <Settings
        store={new FixtureProjectSettings()}
        projectId="proj-1"
        canEdit
        bucket={bucketWith([])}
        resolver={resolver}
      />,
    );

    expect(await screen.findByText(pt.settings.granTitle)).toBeTruthy();
    expect(screen.queryByRole('button', { name: pt.settings.samplePlay })).toBeNull();
  });

  it('os bytes só descem quando alguém pede para ouvir', async () => {
    const bucket = bucketWith(['a1']);
    render(
      <Settings
        store={new FixtureProjectSettings()}
        projectId="proj-1"
        canEdit
        bucket={bucket}
        resolver={resolver}
      />,
    );

    await screen.findByRole('button', { name: pt.settings.samplePlay });
    expect(bucket.fetchBytes).not.toHaveBeenCalled();
  });
});
