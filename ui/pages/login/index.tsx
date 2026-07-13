import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AuthError, type AuthProvider } from '../../../adapters/api';
import { ShemaIcon } from '../../tokens';
import { defaultAuth } from '../dashboard/ports';
import { navigate } from '../../app/router';
import './login.css';

/**
 * Login (PRD v2 §7.1, protótipo Shemá v2 / ENG-278): a facilitadora entra contra o
 * JWT da API; sucesso leva ao dashboard (§7.2). Abertura em dois painéis — a marca
 * cerimonial sobre o oliva à esquerda, o formulário calmo sobre o creme à direita.
 * Superfície da facilitadora — densidade normal, cópia PT-BR. O listener nunca
 * autentica. Credencial recusada mostra orientação PT-BR; o estado em memória do app
 * NUNCA é tocado aqui (a `AuthProvider` cuida da sessão).
 *
 * Reconciliação protótipo↔contrato (precedência do CLAUDE.md — dado vence): o
 * protótipo rotula o campo como "E-mail", mas o contrato de auth chaveia em
 * `username` (fixture/e2e: `facilitadora`/`admin`) — mantemos "Usuário"/`username`. Os
 * links "Criar conta"/"Esqueceu a senha?" do protótipo são `noop` (sem fluxo no MVP) e
 * ficam de fora. A marca é o `ShemaIcon` branco (não há pipeline para o wordmark
 * `logo-branco.svg` nem para o `pattern-tile.svg` decorativo).
 *
 * Camada de wiring: a porta `auth` chega por prop nos testes; em produção resolve o
 * singleton fixture partilhado com o dashboard (ports.ts).
 */
export interface LoginProps {
  auth?: AuthProvider;
}

export function Login({ auth = defaultAuth() }: LoginProps) {
  const { t } = useTranslation();
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
        setError(t('login.refused'));
        return;
      }
      throw err;
    }
    navigate('/dashboard');
  };

  return (
    // o shell não embrulha esta rota: a página é o próprio landmark `main`
    <main className="cds-login">
      <aside className="cds-login-hero">
        <ShemaIcon colorway="branco" size={60} />
        <p className="cds-login-verse">{t('login.verse')}</p>
        <p className="cds-login-tagline">{t('login.tagline')}</p>
        <p className="cds-login-privacy">
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="4" y="10" width="16" height="10" rx="2" />
            <path d="M8 10V7a4 4 0 0 1 8 0v3" />
          </svg>
          {t('login.privacy')}
        </p>
      </aside>

      <form className="cds-login-card" onSubmit={onSubmit}>
        <div className="cds-login-head">
          <p className="cds-login-eyebrow">{t('login.eyebrow')}</p>
          <h1 className="cds-login-title">{t('login.title')}</h1>
          <p className="cds-login-subtitle">{t('login.subtitle')}</p>
        </div>

        <label className="cds-login-field">
          <span className="cds-login-label">{t('login.username')}</span>
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
          <span className="cds-login-label">{t('login.password')}</span>
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
          {busy ? t('login.busy') : t('login.submit')}
        </button>
      </form>
    </main>
  );
}

export default Login;
