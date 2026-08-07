import { createContext, useContext, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import './nav-footer.css';

/**
 * Rodapé de navegação (protótipo v3 §1), na versão enxuta que o dono pediu: só
 * **voltar** e **avançar**, sem o rótulo de contexto do centro. A regra que ele
 * fixou é de divisão de trabalho, não de estilo:
 *
 * - o **corpo** da página guarda os comandos daquela página ("✓ Confirmar esta
 *   cena", "Nenhum se encaixa", ouvir a seleção);
 * - o **rodapé** guarda só o que troca de página.
 *
 * O acoplamento é um slot, não um registro central: a estação continua dona da sua
 * ação e a rende por `StationNav`; o shell só empresta o lugar (`NavFooterOutlet`).
 * Estação que não publica nada — login, painel, telas de espera, trava de
 * granularidade — simplesmente não tem rodapé, sem lista de exceções no shell.
 *
 * É um PORTAL, e não um estado no provedor, de propósito: o portal rende no MESMO
 * commit da estação. Publicar por efeito deixava o rodapé um render atrás — por um
 * frame ele mostrava o rótulo velho ("Pronto com esta cena" quando a cena já estava
 * pronta), e quem clicasse ali agiria sobre a tela anterior.
 */

export interface NavBack {
  label: string;
  onClick: () => void;
}

export interface NavNext {
  label: string;
  onClick: () => void;
  /**
   * A condição da página foi cumprida. Falso apaga o botão mas NÃO o desabilita:
   * "nunca punir" (CLAUDE.md) — é o clique que faz a estação dizer o que falta.
   */
  enabled: boolean;
}

export interface StationNavProps {
  back?: NavBack;
  next?: NavNext;
}

const SlotContext = createContext<{
  node: HTMLElement | null;
  attach: (node: HTMLElement | null) => void;
}>({ node: null, attach: () => {} });

export function NavFooterProvider({ children }: { children: ReactNode }) {
  // o ref de callback re-rende uma vez na montagem, quando o lugar passa a existir;
  // daí em diante toda troca de estação já encontra o slot pronto.
  const [node, setNode] = useState<HTMLElement | null>(null);
  return <SlotContext.Provider value={{ node, attach: setNode }}>{children}</SlotContext.Provider>;
}

/** O lugar do rodapé no shell. Fica vazio enquanto nenhuma estação o usa. */
export function NavFooterOutlet() {
  const { attach } = useContext(SlotContext);
  return <div className="cds-nav-footer-slot" ref={attach} />;
}

/** Rende a navegação da estação ativa dentro do slot do shell. */
export function StationNav({ back, next }: StationNavProps) {
  const { node } = useContext(SlotContext);
  if (!node || (!back && !next)) return null;

  return createPortal(
    <footer className="cds-nav-footer">
      {back ? (
        <button type="button" className="cds-nav-footer-back" onClick={back.onClick}>
          {back.label}
        </button>
      ) : (
        <span className="cds-nav-footer-spacer" />
      )}
      {next ? (
        <button
          type="button"
          className="cds-nav-footer-next"
          data-enabled={next.enabled}
          onClick={next.onClick}
        >
          {next.label}
        </button>
      ) : (
        <span className="cds-nav-footer-spacer" />
      )}
    </footer>,
    node,
  );
}
