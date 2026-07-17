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
 * Escolhe a variante visual do guia, do mais rico ao mais simples: `lottie` (ENG-280,
 * personagem ilustrado) → `animated` (ENG-232/ENG-295, o personagem Avataaars).
 * Mecanismo aditivo do doc de arquitetura §4 — igual às três registries do shell.
 *
 * Preferir `lottie` é seguro MESMO sem o asset: a variante devolve o guia `animated`
 * enquanto não houver um `.json` em `variants/assets/` (ver `lottie.tsx`). Ou seja, a
 * ordem aqui declara a INTENÇÃO; quem decide de fato é a presença da arte.
 */
export function pickVariantPath(paths: string[]): string {
  const chosen =
    paths.find((p) => /\/lottie\.tsx$/.test(p)) ?? paths.find((p) => /\/animated\.tsx$/.test(p));
  if (!chosen) throw new Error('storyteller-guide: nenhuma variante encontrada em variants/');
  return chosen;
}
