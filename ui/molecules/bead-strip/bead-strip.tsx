import type { ReactNode } from 'react';

import { Pearl } from '../../atoms';
import type { PaletteEntry } from '../../tokens';
import './bead-strip.css';

export interface BeadStripItem {
  /** identidade estável do item — é ela que volta no `onSelect`. */
  key: string;
  /** nome acessível e visível da conta; quem chama numera (por extenso, §9.2). */
  label: string;
  /** cor do segmento {base, lit, deep} (§4.2) — a conta identifica pela cor. */
  swatch: PaletteEntry;
  /** botões de ação como slot; só os do item selecionado são montados. */
  actions?: ReactNode;
}

/**
 * O fio de contas do rodapé (entrega de design §3): a lista de cenas/frases
 * salvas vira uma conta por item sobre o fio, e as ações de UM item aparecem
 * numa cápsula só — a que o item tocado abre. Antes era uma fileira de pílulas:
 * com muitos itens virava poluição, todas gritavam as suas ações ao mesmo tempo
 * e o botão de navegação da etapa era espremido para fora da tela.
 *
 * Controlada e puramente apresentacional: a seleção chega por prop e sai por
 * callback — a molécula não guarda estado. É o chamador que zera a seleção
 * quando o que está debaixo dela muda, e a cápsula não desenha um `selected`
 * que já não está na lista (senão ofereceria ações sobre um item removido).
 *
 * O CONJUNTO de ações é do chamador e não mudou: a entrega de design mostra
 * tocar/marcar/reabrir na cápsula, mas isso é conteúdo de demonstração —
 * a ENG-291 tirou o ▶ (som só pelas contas do colar) e a ENG-342 tirou
 * reabrir/⚑ (ajustar é arrastar a alça de fim no colar). Daqui veio só a
 * linguagem visual.
 */
export function BeadStrip({
  items,
  selected,
  onSelect,
  groupLabel,
  empty,
}: {
  items: readonly BeadStripItem[];
  /** chave do item selecionado; `null` = nenhuma cápsula aberta */
  selected: string | null;
  onSelect?: (key: string) => void;
  /** nome acessível do fio; sem ele o grupo fica sem nome (só as contas nomeiam) */
  groupLabel?: string;
  /** o que mostrar quando ainda não há item algum */
  empty?: ReactNode;
}) {
  const current = items.find((item) => item.key === selected) ?? null;

  return (
    <div className="cds-bead-strip">
      {items.length === 0 ? (
        empty ? (
          <span className="cds-bead-strip-empty">{empty}</span>
        ) : null
      ) : (
        <span className="cds-bead-strip-cord" role="group" aria-label={groupLabel}>
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              className="cds-bead-strip-bead"
              title={item.label}
              aria-label={item.label}
              aria-pressed={item.key === selected}
              onClick={() => onSelect?.(item.key)}
            >
              <Pearl tint={item.swatch} size={22} state="lit" />
            </button>
          ))}
        </span>
      )}

      {current ? (
        <span className="cds-bead-strip-capsule">
          <span className="cds-bead-strip-name">{current.label}</span>
          {current.actions ? (
            <span className="cds-bead-strip-actions">{current.actions}</span>
          ) : null}
        </span>
      ) : null}
    </div>
  );
}
