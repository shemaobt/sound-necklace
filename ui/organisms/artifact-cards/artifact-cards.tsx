import './artifact-cards.css';

import { useTranslation } from 'react-i18next';

import { DocumentCard } from '../../molecules';

export type ArtifactKind = 'retorno' | 'manifesto' | 'relatorio';

export type ArtifactDownloads = Record<ArtifactKind, boolean>;

export interface ArtifactCardsProps {
  downloaded: ArtifactDownloads;
  onDownload?: (kind: ArtifactKind) => void;
}

/**
 * Os três documentos do §8.8, explicados em linguagem humana (cópia contratual
 * do redesign §6.7 / protótipos Claude Design — verbatim, não parafrasear; a cópia
 * vive no dicionário i18n desde a ENG-279). O `filename` EXIBIDO é o do contrato e
 * nunca traduz.
 */
const DOCUMENTOS: readonly { kind: ArtifactKind; filename: string }[] = [
  { kind: 'retorno', filename: 'retorno-ancoragem.json' },
  { kind: 'manifesto', filename: 'manifesto-contas.json' },
  { kind: 'relatorio', filename: 'relatorio-mapeamento.md' },
];

/**
 * Os três document cards da conclusão (PRD §8.8) — compartilhados pelo Dashboard
 * e pela estação Export. Presentacional: o download real (bytes/anchor) e os
 * flags `downloaded` vivem em quem chama.
 *
 * A live region do chip existe SEMPRE no DOM e só o texto entra quando os três
 * documentos foram baixados (WCAG 4.1.3 / técnica ARIA22: um `role="status"`
 * montado junto com a mensagem não é anunciado).
 */
export function ArtifactCards({ downloaded, onDownload }: ArtifactCardsProps) {
  const { t } = useTranslation();
  const todosBaixados = DOCUMENTOS.every((d) => downloaded[d.kind]);

  return (
    <div className="cds-artifact-cards">
      <div className="cds-artifact-cards-row">
        {DOCUMENTOS.map((d) => (
          <DocumentCard
            key={d.kind}
            filename={d.filename}
            title={t(`artifactCards.${d.kind}.title`)}
            description={t(`artifactCards.${d.kind}.description`)}
            downloadLabel={t('documentCard.download')}
            downloadedLabel={t('documentCard.downloaded')}
            downloaded={downloaded[d.kind]}
            onDownload={onDownload ? () => onDownload(d.kind) : undefined}
          />
        ))}
      </div>
      <div className="cds-artifact-cards-status" role="status">
        {todosBaixados && (
          <span className="cds-artifact-cards-chip">
            <svg
              className="cds-artifact-cards-chip-glyph"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              focusable="false"
            >
              <path d="M20 6L9 17l-5-5" />
            </svg>
            {t('artifactCards.saved')}
          </span>
        )}
      </div>
    </div>
  );
}
