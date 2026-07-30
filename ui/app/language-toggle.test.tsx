import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import { FixtureProjectSettings } from '../../adapters/project-settings';
import i18n, { LANG_STORAGE_KEY } from '../i18n';
import { pt } from '../i18n/pt';
import Login from '../pages/login/index';
import Settings from '../pages/settings/index';

/**
 * Idioma da UI (ENG-279): trocar o idioma re-renderiza TODA a cópia traduzida — não só a
 * tela que carrega o controle — e persiste a escolha para o próximo reload. O artefato
 * exportado não é afetado: isto é chrome. Superfícies reais, sem mocks.
 *
 * O controle mudou de casa na ENG-371 (era um botão PT/EN no cabeçalho; agora é o cartão
 * de idioma em Configurações), mas as duas garantias acima são de `setLang`, não do botão,
 * e continuam valendo. Por isso o teste mudou de sujeito em vez de sumir.
 */

function pickEnglish() {
  const group = screen.getByRole('radiogroup', { name: pt.settings.langHeading });
  return within(group).getByRole('radio', { name: 'English' });
}

afterEach(async () => {
  await i18n.changeLanguage('pt');
  try {
    localStorage.removeItem(LANG_STORAGE_KEY);
  } catch {
    /* noop */
  }
});

describe('Idioma da UI (ENG-279)', () => {
  it('alterna a cópia PT↔EN pela interface inteira', async () => {
    render(
      <>
        <Settings store={new FixtureProjectSettings()} projectId="proj-1" canEdit />
        <Login />
      </>,
    );

    // PT por padrão (o h1 da abertura Shemá v2 — ENG-278)
    expect(screen.getByRole('heading', { name: 'Bem-vinda de volta.' })).toBeTruthy();

    await userEvent.click(pickEnglish());

    // Agora EN — a tela IRMÃ, que não carrega o controle, também virou
    expect(screen.getByRole('heading', { name: 'Welcome back.' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Bem-vinda de volta.' })).toBeNull();
  });

  it('persiste a escolha de idioma para o próximo reload', async () => {
    render(<Settings store={new FixtureProjectSettings()} projectId="proj-1" canEdit />);

    await userEvent.click(pickEnglish());

    expect(localStorage.getItem(LANG_STORAGE_KEY)).toBe('en');
  });
});
