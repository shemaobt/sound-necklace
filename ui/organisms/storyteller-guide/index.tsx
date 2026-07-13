import type { GuideVariant, GuideVariantProps } from './variant';
import { pickVariantPath } from './variant';
import './storyteller-guide.css';

/**
 * O guia da conversa (redesign §6.6, §9.7) — uma pessoa calorosa à esquerda do
 * palco do Mapeamento. O visual vem de `variants/*` via `import.meta.glob`: a
 * ENG-232 acrescentou `animated.tsx` (hoje a variante ativa, preferida sobre
 * `static`) sem editar nenhum arquivo aqui — mecanismo aditivo do doc de
 * arquitetura §4.
 */
const modules = import.meta.glob('./variants/*.tsx', { eager: true }) as Record<
  string,
  { default: GuideVariant }
>;

const ActiveVariant = modules[pickVariantPath(Object.keys(modules))]!.default;

export function StorytellerGuide(props: GuideVariantProps) {
  return (
    <div className="cds-storyteller-guide">
      <ActiveVariant {...props} />
    </div>
  );
}

export type { GuideVariantProps } from './variant';
