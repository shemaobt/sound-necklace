import type { ReactNode } from 'react';

/** Props comuns às variantes do guia. A estática ignora `speaking`; a animada (E4) o usa para o lip-sync. */
export interface GuideVariantProps {
  /** o guia "fala" enquanto a pergunta é apresentada */
  speaking?: boolean;
  /** altura da figura em px */
  size?: number;
}

export type GuideVariant = (props: GuideVariantProps) => ReactNode;

/**
 * Escolhe a variante visual do guia: prefere `animated` quando o arquivo existir
 * — desde a ENG-232 ele existe, então `static` é o fallback. Mecanismo aditivo do
 * doc de arquitetura §4 — igual às três registries do shell.
 */
export function pickVariantPath(paths: string[]): string {
  const chosen =
    paths.find((p) => /\/animated\.tsx$/.test(p)) ?? paths.find((p) => /\/static\.tsx$/.test(p));
  if (!chosen) throw new Error('storyteller-guide: nenhuma variante encontrada em variants/');
  return chosen;
}
