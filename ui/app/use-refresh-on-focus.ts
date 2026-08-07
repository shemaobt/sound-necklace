import { useEffect, useRef } from 'react';

/**
 * Re-executa `refresh` quando a aba volta a ser olhada — ao ganhar foco ou ao voltar
 * de segundo plano.
 *
 * Existe por causa de uma decisão que é do PROJETO e não da sessão: a granularidade.
 * Quem já estava com o Setup (ou as Configurações) aberto lia o nível uma única vez,
 * na montagem, e continuava vendo o valor velho depois que outra pessoa o confirmava —
 * até recarregar a página. Não é cache: o adapter vai à rede toda vez; é que ninguém
 * pedia de novo.
 *
 * O gatilho é olhar, não o relógio: um polling gastaria rede o tempo todo para cobrir
 * um evento raro, enquanto o momento em que a diferença passa a importar é exatamente
 * aquele em que a pessoa volta à aba.
 *
 * `refresh` é lido por ref, então não precisa ser estável — trocar a identidade da
 * função não re-registra os listeners nem dispara uma leitura.
 */
export function useRefreshOnFocus(refresh: () => void, enabled = true): void {
  const latest = useRef(refresh);
  useEffect(() => {
    latest.current = refresh;
  });

  useEffect(() => {
    if (!enabled) return;
    const onFocus = (): void => latest.current();
    const onVisible = (): void => {
      if (document.visibilityState === 'visible') latest.current();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled]);
}
