import './session-list.css';

import { useTranslation } from 'react-i18next';

import { Button, Pearl } from '../../atoms';
import { scenePalette } from '../../tokens';

export type SessionStatus = 'in-progress' | 'completed';

export interface SessionCardData {
  id: string;
  /** Nó extra na área de ação (ex.: o menu de downloads da concluída, ENG-305). */
  menu?: React.ReactNode;
  storyName: string;
  slug: string;
  project: string;
  status: SessionStatus;
  /** já formatado para exibição — o organismo não faz aritmética de datas */
  lastModified: string;
  /** 0..1 — quanto do fio já foi enfiado; a página deriva do passo salvo */
  progress: number;
  /** nome acessível do relance de progresso, ex.: "Triage — passo 3 de 6" */
  progressLabel: string;
}

export interface SessionListProps {
  sessions: SessionCardData[];
  onResume?: (id: string) => void;
  onOpen?: (id: string) => void;
  /** presente, a grade abre com o cartão "comece uma nova história" (§7.2) */
  onNew?: () => void;
}

/** Status → chave i18n (a cópia vive no dicionário — ENG-279). */
const STATUS_KEY: Record<SessionStatus, string> = {
  'in-progress': 'sessionList.statusInProgress',
  completed: 'sessionList.statusCompleted',
};

/** A capa do cartão: o fio da história em miniatura, aceso na proporção do progresso. */
const THUMB_ROWS = 2;
const THUMB_ROW = 11;
/** total DERIVADO — senão o quanto se acende e o quanto se desenha divergem */
const THUMB_BEADS = THUMB_ROWS * THUMB_ROW;
/** contas por cena na miniatura — só ritmo visual, não é a grade real */
const THUMB_GROUP = 4;

function Thumbnail({ progress, label }: { progress: number; label: string }) {
  const lit = Math.round(Math.min(1, Math.max(0, progress)) * THUMB_BEADS);
  const rows = Array.from({ length: THUMB_ROWS }, (_, r) => r);
  return (
    <div className="cds-session-card-thumb" role="img" aria-label={label}>
      {rows.map((row) => (
        <div key={row} className="cds-session-card-thumb-row">
          {Array.from({ length: THUMB_ROW }, (_, col) => {
            const i = row * THUMB_ROW + col;
            const on = i < lit;
            return (
              <Pearl
                key={i}
                state={on ? 'lit' : 'unplayed'}
                tint={
                  on ? scenePalette[Math.floor(i / THUMB_GROUP) % scenePalette.length] : undefined
                }
                size={11}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

function SessionCard({
  session,
  onResume,
  onOpen,
}: {
  session: SessionCardData;
  onResume?: (id: string) => void;
  onOpen?: (id: string) => void;
}) {
  const { t } = useTranslation();
  const emProgresso = session.status === 'in-progress';
  const onAction = emProgresso ? onResume : onOpen;

  return (
    <li className="cds-session-card" data-status={session.status}>
      <Thumbnail progress={session.progress} label={session.progressLabel} />

      <div className="cds-session-card-body">
        <h3 className="cds-session-card-title">{session.storyName}</h3>
        {/* §7.2 pede slug E projeto no cartão — o protótipo mostra só o slug. O
            projeto só entra quando há um NOME exibível (o wiring esconde ids
            crus — nenhum UUID em cartão, ENG-307). */}
        <p className="cds-session-card-slug">
          {session.project ? `${session.slug} · ${session.project}` : session.slug}
        </p>

        <div className="cds-session-card-meta">
          <span className="cds-session-card-status">
            <span className="cds-session-card-dot" aria-hidden="true" />
            {t(STATUS_KEY[session.status])}
          </span>
          <span className="cds-session-card-when">
            {t('sessionList.editedAt', { when: session.lastModified })}
          </span>
        </div>
      </div>

      <div className="cds-session-card-action">
        <Button
          variant="primary"
          size="sm"
          onClick={onAction ? () => onAction(session.id) : undefined}
        >
          {emProgresso ? t('sessionList.resume') : t('sessionList.open')}
          <span className="cds-session-card-vh">{session.storyName}</span>
        </Button>
        {session.menu ?? null}
      </div>
    </li>
  );
}

function NewStoryCard({ onNew }: { onNew: () => void }) {
  const { t } = useTranslation();
  return (
    <li className="cds-session-new">
      <button type="button" className="cds-session-new-btn" onClick={onNew}>
        <span className="cds-session-new-beads" aria-hidden="true">
          {Array.from({ length: 8 }, (_, i) => (
            <Pearl key={i} state="unplayed" size={11} />
          ))}
        </span>
        <span className="cds-session-new-title">{t('sessionList.newStoryTitle')}</span>
        <span className="cds-session-new-sub">{t('sessionList.newStorySub')}</span>
      </button>
    </li>
  );
}

/**
 * A grade de sessões do dashboard (PRD §7.2, protótipo Shemá v2 / ENG-278): um cartão
 * por sessão com a capa do fio (contas acesas na proporção do progresso — o "relance"
 * do §7.2), nome da história, slug, projeto, status, última modificação e a ação
 * retomar/abrir. Superfície da facilitadora — densidade normal, dígitos permitidos.
 *
 * Presentacional: sessões e handlers chegam por props. Os downloads diretos de uma
 * sessão concluída são os ArtifactCards, compostos pela página (§7.2/§10.5) — o
 * protótipo os punha num menu kebab junto de renomear/duplicar/excluir, mas essas
 * ações não existem no `SessionStore` nem no PRD, então o menu não foi portado.
 *
 * O nome acessível do botão compõe verbo + título via texto visually-hidden (padrão
 * APG de nome composto); o cartão inteiro nunca é clicável.
 */
export function SessionList({ sessions, onResume, onOpen, onNew }: SessionListProps) {
  const { t } = useTranslation();
  return (
    <ul className="cds-session-list" aria-label={t('sessionList.listAria')}>
      {onNew && <NewStoryCard onNew={onNew} />}
      {sessions.map((s) => (
        <SessionCard key={s.id} session={s} onResume={onResume} onOpen={onOpen} />
      ))}
    </ul>
  );
}
