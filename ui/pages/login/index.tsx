import { useState } from 'react';

import { AuthError, type AuthProvider } from '../../../adapters/api';
import { defaultAuth } from '../dashboard/ports';
import { navigate } from '../../app/router';
import './login.css';

/**
 * Login (PRD v2 §7.1): a facilitadora entra contra o JWT da API; sucesso leva ao
 * dashboard (§7.2). Superfície da facilitadora — densidade normal, cópia PT-BR. O
 * listener nunca autentica. Credencial recusada mostra orientação PT-BR; o estado
 * em memória do app NUNCA é tocado aqui (a `AuthProvider` cuida da sessão).
 *
 * Camada de wiring: a porta `auth` chega por prop nos testes; em produção resolve o
 * singleton fixture partilhado com o dashboard (ports.ts).
 */
export interface LoginProps {
  auth?: AuthProvider;
}

const RECUSADO = 'Não foi possível entrar. Confira o usuário e a senha.';

export function Login({ auth = defaultAuth() }: LoginProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await auth.login({ username, password });
    } catch (err) {
      setBusy(false);
      // Fronteira de sistema: só a recusa de credencial vira orientação; qualquer
      // outra falha sobe (não é para ser mascarada aqui).
      if (err instanceof AuthError) {
        setError(RECUSADO);
        return;
      }
      throw err;
    }
    navigate('/dashboard');
  };

  return (
    <section className="cds-login">
      <form className="cds-login-card" onSubmit={onSubmit}>
        <h1 className="cds-login-title">Entrar</h1>

        <label className="cds-login-field">
          <span className="cds-login-label">Usuário</span>
          <input
            className="cds-login-input"
            type="text"
            name="username"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </label>

        <label className="cds-login-field">
          <span className="cds-login-label">Senha</span>
          <input
            className="cds-login-input"
            type="password"
            name="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>

        {error ? (
          <p className="cds-login-error" role="alert">
            {error}
          </p>
        ) : null}

        <button type="submit" className="cds-login-submit" disabled={busy}>
          Entrar
        </button>
      </form>
    </section>
  );
}

export default Login;
