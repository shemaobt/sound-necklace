import { useTranslation } from 'react-i18next';

import { Pearl } from '../../atoms';
import './preparing-session.css';

/** Quantas contas o fio da espera mostra — só ritmo visual, não é a grade real. */
const BEADS = 8;

/**
 * A espera de `/session/:id` (ENG-312): entre criar/retomar e a primeira estação,
 * o app monta a sessão (hidratação + download/decode do áudio). Em vez de um
 * parágrafo parado, um fio de contas acendendo em onda + UMA linha — a casa nunca
 * parece travada. O pulso vive no CSS, dentro da guarda de movimento (§4.5); o
 * anúncio acessível é o texto (role=status).
 */
export function PreparingSession() {
  const { t } = useTranslation();
  return (
    <div className="cds-preparing" role="status">
      <span className="cds-preparing-beads" aria-hidden="true">
        {Array.from({ length: BEADS }, (_, i) => (
          <span key={i} className="cds-preparing-bead" style={{ animationDelay: `${i * 0.14}s` }}>
            <Pearl state="unplayed" size={15} />
          </span>
        ))}
      </span>
      <p className="cds-preparing-line">{t('shell.preparingSession')}</p>
    </div>
  );
}
