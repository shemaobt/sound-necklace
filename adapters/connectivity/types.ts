/**
 * Porta ConnectivityMonitor — o gate "online-only" do PRD v2 §7.3/§13. A sessão
 * exige conexão; ao cair, a edição pausa (o session store bloqueia mutações) sem
 * perder o estado em memória, e o playback client-side segue. Implementações: a
 * fixture com toggle manual (default, para o app e os testes rodarem sem rede) e
 * a real do browser (navigator online/offline + sonda de alcance plugável).
 */

export type Unsubscribe = () => void;

export interface ConnectivityMonitor {
  /** Estado atual — true = há conexão. */
  isOnline(): boolean;
  /** Observa transições; devolve o cancelamento. Não emite o valor inicial. */
  subscribe(cb: (online: boolean) => void): Unsubscribe;
}

/**
 * Sonda de alcance plugável: além dos flags do navegador, confirma que o backend
 * responde (a real pode combinar as duas). A fixture não precisa de sonda.
 */
export interface ReachabilityProbe {
  reachable(): Promise<boolean>;
}
