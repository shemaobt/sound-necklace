import * as Dialog from '@radix-ui/react-dialog';
import { useTranslation } from 'react-i18next';

import { Button, Pearl } from '../../atoms';
import { ShemaIcon, scenePalette } from '../../tokens';
import './granularity-lock.css';

/**
 * A trava de granularidade (ENG-363, PRD v2 §6.1/§8.1): enquanto o projeto não tem
 * tamanho de conta confirmado, o Setup inteiro fica atrás deste modal. A linha
 * discreta de antes (ENG-352) era fácil demais de ignorar — e escolher áudio, nomear
 * a história e marcar consentimento por trás dela era trabalho jogado fora, porque a
 * criação recusa no fim de qualquer jeito.
 *
 * Não se descarta: Esc e o clique fora não fecham, porque não há decisão a tomar aqui
 * além de ir decidir o nível (ou sair). A saída existe sempre — §9.5 manda guiar, não
 * punir, e um modal sem saída seria beco.
 *
 * Visual: protótipo do dono `docs/design/trava-granularidade.html`. Quem embaça o
 * fundo é o véu (backdrop-filter); quem o tira do teclado e do leitor de tela é o
 * Radix dialog — daí não existir a classe `.cds-lock-blocked` do protótipo.
 */

/** Só decoração — as sete contas do protótipo, sem afirmar tamanho nenhum. */
const PEARLS = [8, 11, 14, 16, 14, 11, 8];
const CORD_TINT = scenePalette[0]!;

export interface GranularityLockProps {
  /** Quem administra o projeto decide o nível; quem não administra, pede. */
  canConfirm: boolean;
  onSetSize: () => void;
  onBackToDashboard: () => void;
}

export function GranularityLock({
  canConfirm,
  onSetSize,
  onBackToDashboard,
}: GranularityLockProps) {
  const { t } = useTranslation();

  return (
    <Dialog.Root open>
      <Dialog.Portal>
        <Dialog.Overlay className="cds-gran-lock-overlay" />
        <Dialog.Content
          className="cds-gran-lock"
          onEscapeKeyDown={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <span className="cds-gran-lock-watermark" aria-hidden="true">
            <ShemaIcon colorway="telha" size={150} />
          </span>
          <span className="cds-gran-lock-pearls" aria-hidden="true">
            {PEARLS.map((size, i) => (
              <Pearl key={i} state="lit" tint={CORD_TINT} size={size} />
            ))}
          </span>
          <div className="cds-gran-lock-head">
            <p className="cds-gran-lock-eyebrow">{t('setup.lock.eyebrow')}</p>
            <Dialog.Title className="cds-gran-lock-title">
              {t(canConfirm ? 'setup.lock.title' : 'setup.lock.titleMember')}
            </Dialog.Title>
            <Dialog.Description className="cds-gran-lock-body">
              {t(canConfirm ? 'setup.lock.body' : 'setup.lock.bodyMember')}
            </Dialog.Description>
          </div>
          <div className="cds-gran-lock-actions">
            {canConfirm ? (
              <>
                <Button onClick={onSetSize}>{t('setup.lock.primary')}</Button>
                <Button variant="ghost" size="sm" onClick={onBackToDashboard}>
                  {t('setup.lock.secondary')}
                </Button>
              </>
            ) : (
              // nada de controle desabilitado para quem não pode confirmar: um botão
              // morto oferece uma decisão que a pessoa não tem como tomar
              <Button onClick={onBackToDashboard}>{t('setup.lock.primaryMember')}</Button>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export default GranularityLock;
