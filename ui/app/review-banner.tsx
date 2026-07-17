import { useTranslation } from 'react-i18next';

import { Button } from '../atoms';
import type { EditorLock } from '../state';
import './review-banner.css';

/**
 * Chrome de revisão + trava de editor (PRD §8.10, §7.3). Em revisão, a segmentação
 * fica travada e só o playback funciona; "Destravar para editar" sai. Quando outra
 * pessoa detém a trava consultiva, a sessão abre em revisão e NÃO se pode destravar
 * (a trava força a revisão) — só se mostra por quem ela está em uso. Uma trava sem
 * nome é a que perdeu contato com o servidor: mesmo tratamento, aviso de reconexão.
 */
export function ReviewBanner({
  review,
  lock,
  onUnlock,
}: {
  review: boolean;
  lock: EditorLock | null;
  onUnlock: () => void;
}) {
  const { t } = useTranslation();
  if (!review && !lock) return null;

  return (
    <div className="cds-review-banner" role="status">
      {lock ? (
        <span className="cds-review-banner-text">
          {lock.holder === null
            ? t('shell.reviewStale')
            : t('shell.reviewLocked', { holder: lock.holder })}
        </span>
      ) : (
        <>
          <span className="cds-review-banner-text">{t('shell.reviewOwn')}</span>
          <Button variant="ghost" size="sm" onClick={onUnlock}>
            {t('shell.unlock')}
          </Button>
        </>
      )}
    </div>
  );
}
