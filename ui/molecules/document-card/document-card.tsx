import './document-card.css';

/**
 * Cartão de documento da tela final (redesign §6.7): nome do arquivo, título em
 * linguagem humana, uma explicação, e o botão que passa de "Baixar" a "baixado".
 * Presentacional: o download em si (Blob/anchor) é responsabilidade de quem chama.
 */
export function DocumentCard({
  filename,
  title,
  description,
  downloaded = false,
  downloadLabel = 'Baixar',
  downloadedLabel = 'baixado',
  onDownload,
}: {
  filename: string;
  /** título humano ("As decisões de vocês") */
  title: string;
  description: string;
  downloaded?: boolean;
  downloadLabel?: string;
  downloadedLabel?: string;
  onDownload?: () => void;
}) {
  return (
    <div className="cds-document-card">
      <span className="cds-document-card-filename">{filename}</span>
      <span className="cds-document-card-title">{title}</span>
      <p className="cds-document-card-desc">{description}</p>
      <button
        type="button"
        className="cds-document-card-download"
        data-downloaded={downloaded || undefined}
        onClick={onDownload}
      >
        <svg
          className="cds-document-card-glyph"
          aria-hidden="true"
          focusable="false"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.4}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 4v11" />
          <path d="M7 10l5 5 5-5" />
          <path d="M4 19h16" />
        </svg>
        {downloaded ? downloadedLabel : downloadLabel}
      </button>
    </div>
  );
}
