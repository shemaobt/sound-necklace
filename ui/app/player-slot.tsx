import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

import './player-slot.css';

/**
 * O player itinerante único (PRD §8.0, redesign §5.2): existe UMA instância que
 * se muda para o encaixe da estação ativa, e trocar de estação para o playback
 * (espelho de `setMode`→`stopPlayback` da referência).
 *
 * Implementação (react#12247): trocar o `container` de `createPortal` remontaria a
 * subárvore. Então a instância vive num nó destacado PERSISTENTE (`holder`), o
 * portal aponta sempre para ele, e o nó é MOVIDO entre hosts com `appendChild` —
 * append move (não clona), o container do portal nunca muda, nada remonta. A
 * recolocação roda por refs (sem re-render), então um host que monta tarde
 * (estação lazy) também recebe o player, sem `setState` durante commit.
 */

export interface Player {
  stop(): void;
}

interface SlotApi {
  register(key: string, el: HTMLElement | null): void;
}

const SlotContext = createContext<SlotApi | null>(null);

export function PlayerSlotProvider({
  activeKey,
  player,
  playerNode,
  children,
}: {
  activeKey: string;
  player: Player;
  playerNode: ReactNode;
  children: ReactNode;
}) {
  const [holder] = useState(() => document.createElement('div'));

  const hostsRef = useRef(new Map<string, HTMLElement>());
  const activeKeyRef = useRef(activeKey);
  const prevKeyRef = useRef<string | null>(null);

  const place = useCallback(() => {
    const host = hostsRef.current.get(activeKeyRef.current);
    if (host && holder.parentNode !== host) host.appendChild(holder);
  }, [holder]);

  const register = useCallback(
    (key: string, el: HTMLElement | null) => {
      if (el) hostsRef.current.set(key, el);
      else hostsRef.current.delete(key);
      place();
    },
    [place],
  );

  useLayoutEffect(() => {
    activeKeyRef.current = activeKey;
    place();
    if (prevKeyRef.current !== null && prevKeyRef.current !== activeKey) player.stop();
    prevKeyRef.current = activeKey;
  });

  useLayoutEffect(() => () => holder.remove(), [holder]);

  const api = useMemo(() => ({ register }), [register]);

  return (
    <SlotContext.Provider value={api}>
      {children}
      {createPortal(playerNode, holder)}
    </SlotContext.Provider>
  );
}

/** Encaixe onde o player itinerante ancora nesta estação. */
export function PlayerHost({ slotKey }: { slotKey: string }) {
  const api = useContext(SlotContext);
  const ref = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    api?.register(slotKey, ref.current);
    return () => api?.register(slotKey, null);
  }, [slotKey, api]);

  return <div className="cds-player-host" data-player-host={slotKey} ref={ref} />;
}
