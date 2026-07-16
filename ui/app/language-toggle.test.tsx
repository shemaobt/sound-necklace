import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import i18n, { LANG_STORAGE_KEY } from '../i18n';
import { Header } from './header';
import Login from '../pages/login/index';

/**
 * Toggle de idioma no cabeçalho (ENG-279): trocar o idioma re-renderiza TODA a cópia
 * traduzida (o Header e a estação irmã) e persiste a escolha para o próximo reload.
 * O artefato exportado não é afetado — isto é chrome da UI. Superfícies reais, sem mocks:
 * a prova é a cópia visível mudando de PT para EN.
 */

function noop() {}

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
        <Header muted={false} onToggleMuted={noop} onBack={noop} />
        <Login />
      </>,
    );

    // PT por padrão (o h1 da abertura Shemá v2 — ENG-278)
    expect(screen.getByRole('heading', { name: 'Bem-vinda de volta.' })).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: 'Mudar para inglês' }));

    // Agora EN — a mesma tela de login em inglês
    expect(screen.getByRole('heading', { name: 'Welcome back.' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Bem-vinda de volta.' })).toBeNull();
  });

  it('persiste a escolha de idioma para o próximo reload', async () => {
    render(<Header muted={false} onToggleMuted={noop} onBack={noop} />);

    await userEvent.click(screen.getByRole('button', { name: 'Mudar para inglês' }));

    expect(localStorage.getItem(LANG_STORAGE_KEY)).toBe('en');
  });
});
