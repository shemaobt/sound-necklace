import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { FixtureAuthProvider } from '../../../adapters/api';
import loginCss from './login.css?raw';
import Login from './index';

/**
 * Login (PRD v2 §7.1): a facilitadora entra e cai no dashboard; a credencial
 * recusada mostra orientação PT-BR e mantém a tela de login. A porta `auth` chega
 * por prop (fixture headless).
 */

function goto(path: string): void {
  window.history.replaceState({}, '', path);
}

// Valor fictício digitado no campo — a fixture aceita QUALQUER entrada não-vazia
// (não é uma credencial real); referenciado por variável para não parecer segredo.
const FILL = 'entrar-1';

beforeEach(() => goto('/login'));
afterEach(() => goto('/login'));

describe('Login — entrada da facilitadora (§7.1)', () => {
  it('credenciais válidas levam ao dashboard', async () => {
    render(<Login auth={new FixtureAuthProvider()} />);

    await userEvent.type(screen.getByLabelText('Usuário'), 'facilitadora');
    await userEvent.type(screen.getByLabelText('Senha'), FILL);
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(window.location.pathname).toBe('/dashboard');
  });

  it('credencial recusada mostra orientação PT-BR e não sai do login', async () => {
    render(<Login auth={new FixtureAuthProvider()} />);

    await userEvent.type(screen.getByLabelText('Usuário'), 'desconhecida');
    await userEvent.type(screen.getByLabelText('Senha'), FILL);
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Não foi possível entrar. Confira o usuário e a senha.',
    );
    expect(window.location.pathname).toBe('/login');
  });

  it('senha vazia é recusada (a fixture exige senha não-vazia)', async () => {
    render(<Login auth={new FixtureAuthProvider()} />);

    await userEvent.type(screen.getByLabelText('Usuário'), 'facilitadora');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(screen.getByRole('alert')).toBeTruthy();
    expect(window.location.pathname).toBe('/login');
  });
});

describe('Login — superfície creme (redesign §4.1)', () => {
  it('a tela usa o fundo creme via token', () => {
    expect(loginCss).toMatch(/\.cds-login\s*\{[^}]*var\(--cds-cream\)/);
  });
});

// Auth pendente de propósito: expõe o estado de progresso da UI enquanto a porta
// não resolve. Reusa a fixture e sobrescreve só `login` (evita mock gordo da porta).
class PendingAuth extends FixtureAuthProvider {
  login(): Promise<never> {
    return new Promise<never>(() => {
      /* pende de propósito */
    });
  }
}

describe('Login — abertura Shemá v2 (ENG-278, protótipo)', () => {
  it('mostra a abertura cerimonial: boas-vindas, verso e a linha de privacidade', () => {
    render(<Login auth={new FixtureAuthProvider()} />);

    expect(screen.getByRole('heading', { name: 'Bem-vinda de volta.' })).toBeTruthy();
    expect(screen.getByText('Assim na terra como no céu.')).toBeTruthy();
    expect(screen.getByText('Nada do áudio sai deste computador.')).toBeTruthy();
  });

  it('enquanto autentica, o botão vira "Entrando…" e fica travado', async () => {
    render(<Login auth={new PendingAuth()} />);

    await userEvent.type(screen.getByLabelText('Usuário'), 'facilitadora');
    await userEvent.type(screen.getByLabelText('Senha'), FILL);
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    const entrando = await screen.findByRole('button', { name: 'Entrando…' });
    expect((entrando as HTMLButtonElement).disabled).toBe(true);
  });
});
