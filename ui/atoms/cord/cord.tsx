import './cord.css';

/**
 * O fio horizontal atrás das contas (referência .rowline; protótipo _rowStyle).
 * Puramente decorativo — a fileira (molécula) posiciona e dimensiona.
 */
export function CordLine() {
  return <span className="cds-cord" aria-hidden="true" />;
}
