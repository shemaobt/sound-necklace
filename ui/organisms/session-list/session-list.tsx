import './session-list.css';

import { Button } from '../../atoms';
import { StepperStation, type StationState } from '../../molecules';

export type SessionStatus = 'em-progresso' | 'concluida';

/**
 * Espelho presentacional do StepperStationView de ui/app (organismos não
 * importam a camada de wiring) — quem chama traduz.
 */
export interface SessionStationGlance {
  key: string;
  label: string;
  state: StationState;
}

export interface SessionCardData {
  id: string;
  storyName: string;
  slug: string;
  project: string;
  status: SessionStatus;
  /** já formatado para exibição — o organismo não faz aritmética de datas */
  lastModified: string;
  stations: SessionStationGlance[];
}

export interface SessionListProps {
  sessions: SessionCardData[];
  onResume?: (id: string) => void;
  onOpen?: (id: string) => void;
}

const STATUS_PT: Record<SessionStatus, string> = {
  'em-progresso': 'em progresso',
  concluida: 'concluída',
};

function SessionCard({
  session,
  onResume,
  onOpen,
}: {
  session: SessionCardData;
  onResume?: (id: string) => void;
  onOpen?: (id: string) => void;
}) {
  const emProgresso = session.status === 'em-progresso';
  const onAction = emProgresso ? onResume : onOpen;

  return (
    <li className="cds-session-card" data-status={session.status}>
      <div className="cds-session-card-main">
        <span className="cds-session-card-status">{STATUS_PT[session.status]}</span>
        <h3 className="cds-session-card-title">{session.storyName}</h3>
        <p className="cds-session-card-meta">
          {session.slug} · {session.project} · {session.lastModified}
        </p>
        {session.stations.length > 0 && (
          <ol className="cds-session-card-fio" aria-label={`progresso de ${session.storyName}`}>
            {session.stations.map((st) => (
              <StepperStation key={st.key} label={st.label} state={st.state} />
            ))}
          </ol>
        )}
      </div>
      <div className="cds-session-card-action">
        <Button
          variant={emProgresso ? 'primary' : 'ghost'}
          size="sm"
          onClick={onAction ? () => onAction(session.id) : undefined}
        >
          {emProgresso ? 'Retomar' : 'Abrir'}
          <span className="cds-session-card-vh">{session.storyName}</span>
        </Button>
      </div>
    </li>
  );
}

/**
 * A lista de sessões do dashboard (PRD §7.2): um card por sessão com nome da
 * história, slug, projeto, status, última modificação e o relance de progresso
 * pelas estações do fio de contas. Superfície da facilitadora — densidade
 * normal, dígitos permitidos.
 *
 * Presentacional: sessões e handlers chegam por props; retomar/abrir são as
 * únicas ações (downloads diretos de sessão concluída = ArtifactCards, composto
 * pela página). O nome acessível do botão compõe verbo + título da sessão via
 * texto visually-hidden (padrão APG de nome composto); o card inteiro nunca é
 * clicável.
 */
export function SessionList({ sessions, onResume, onOpen }: SessionListProps) {
  return (
    <ul className="cds-session-list" aria-label="sessões">
      {sessions.map((s) => (
        <SessionCard key={s.id} session={s} onResume={onResume} onOpen={onOpen} />
      ))}
    </ul>
  );
}
