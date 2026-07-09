/**
 * React.CSSProperties rejeita chaves `--*` por design (DefinitelyTyped #68113).
 * Augmentation restrita ao namespace --cds- para os átomos passarem tint/altura
 * por custom property sem cast.
 */
import 'react';

declare module 'react' {
  interface CSSProperties {
    // só string: React NÃO acrescenta px a custom properties — um number
    // renderizaria `26` sem unidade e o var() ficaria inválido.
    [key: `--cds-${string}`]: string | undefined;
  }
}
