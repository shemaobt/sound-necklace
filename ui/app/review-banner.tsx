import { Button } from '../atoms';
import type { EditorLock } from '../state';
import './review-banner.css';

/**
 * Chrome de revisão + trava de editor (PRD §8.10, §7.3). Em revisão, a segmentação
 * fica travada e só o playback funciona; "Destravar para editar" sai. Quando outra
 * pessoa detém a trava consultiva, a sessão abre em revisão e NÃO se pode destravar
 * (a trava força a revisão) — só se mostra por quem ela está em uso.
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
  if (!review && !lock) return null;

  return (
    <div className="cds-review-banner" role="status">
      {lock ? (
        <span className="cds-review-banner-text">
          🔒 Modo de revisão — sessão em uso por {lock.holder}.
        </span>
      ) : (
        <>
          <span className="cds-review-banner-text">
            🔒 Modo de revisão — a segmentação está travada.
          </span>
          <Button variant="ghost" size="sm" onClick={onUnlock}>
            Destravar para editar
          </Button>
        </>
      )}
    </div>
  );
}
