/**
 * React.CSSProperties rejeita chaves `--*` por design (DefinitelyTyped #68113).
 * Augmentation restrita ao namespace --cds- para os átomos passarem tint/altura
 * por custom property sem cast.
 */
import 'react';

declare module 'react' {
  interface CSSProperties {
    [key: `--cds-${string}`]: string | number | undefined;
  }
}
