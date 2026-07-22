import { useTranslation } from 'react-i18next';

import { ShemaIcon } from '../../tokens';
import './preparing-session.css';

/** Contas do cordão da espera (protótipo waitBeads): o cometa corre por elas. */
const BEADS = 12;

/**
 * A tela de espera (Protótipo.dc.html, tela de espera): fundo oliva, um cometa de
 * contas acesas correndo por um cordão contínuo, e eyebrow + uma linha em
 * Merriweather itálico. Cobre os três momentos de espera — montar a sessão
 * ("Um momento"), abrir a revisão ("Abrindo"), reunir os documentos ("Guardando")
 * — que só trocam a cópia. O pulso vive no CSS, dentro da guarda de movimento
 * (§4.5); o anúncio acessível é o texto (role=status). Apresentacional: eyebrow +
 * linha por prop; o default é a espera de sessão do shell.
 */
export interface PreparingSessionProps {
  /** rótulo versalete acima da linha (protótipo waitEye); default = "Um momento" */
  eyebrow?: string;
  /** a linha em itálico (protótipo waitLine); default = a espera de sessão do shell */
  line?: string;
}

export function PreparingSession({ eyebrow, line }: PreparingSessionProps) {
  const { t } = useTranslation();
  return (
    <div className="cds-preparing" role="status">
      <span className="cds-preparing-watermark" aria-hidden="true">
        <ShemaIcon colorway="branco" size={360} />
      </span>
      <span className="cds-preparing-beads" aria-hidden="true">
        {Array.from({ length: BEADS }, (_, i) => (
          <span key={i} className="cds-preparing-bead" style={{ animationDelay: `${i * 0.16}s` }} />
        ))}
      </span>
      <div className="cds-preparing-text">
        <p className="cds-preparing-eyebrow">{eyebrow ?? t('shell.preparingEyebrow')}</p>
        <p className="cds-preparing-line">{line ?? t('shell.preparingSession')}</p>
      </div>
    </div>
  );
}
