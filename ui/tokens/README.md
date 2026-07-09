# ui/tokens — vocabulário visual Shemá

Fonte única dos tokens (redesign PRD §4; protótipos normativos em
`docs/design/`). Os VALORES são congelados por `tokens.test.tsx`.

| Token (TS / CSS)                                      | Valor                        | Uso                                          |
| ----------------------------------------------------- | ---------------------------- | -------------------------------------------- |
| `colors.cream` / `--cds-cream`                        | `#F6F5EB`                    | fundo das telas de trabalho                  |
| `colors.olive` / `--cds-olive`                        | `#3F3E20`                    | full-bleed cerimonial (Escuta 1, Mapeamento) |
| `colors.telha` / `--cds-telha`                        | `#BE4A01`                    | ação única + trilha de reprodução            |
| `colors.telhaDeep` / `--cds-telha-deep`               | `#8F3701`                    | hover/press (escurece, nunca clareia) + erro |
| `colors.confidenceFilled` / `--cds-confidence-filled` | `#777D45`                    | disco cheio "Certeza"                        |
| `colors.confidenceHalf` / `--cds-confidence-half`     | `#9A7B2E`                    | meio disco "Quase"                           |
| `colors.warningBg`/`warningInk`                       | `#F5E9D2` / `#755C20`        | avisos                                       |
| `colors.pearl`/`pearlHighlight`                       | `#E7E3D3` / `#FBFAF3`        | pérola não tocada                            |
| `--cds-hairline`                                      | `rgba(63,62,32,.16)`         | bordas quase nunca                           |
| `scenePalette` (8)                                    | ver tokens.ts                | identidade das cenas `{base, lit, deep}`     |
| `phrasePalette` (6)                                   | ver tokens.ts                | frases (tons mais claros)                    |
| `darken30(hex)`                                       | canal ×0.7                   | derivação do `deep` (shade() da referência)  |
| `motion` / `--cds-motion-*`                           | 220ms ease-out               | sem bounces                                  |
| `typography` / `--cds-font-*`                         | Montserrat / Merriweather    | load-bearing / voz quieta                    |
| `ShemaIcon`                                           | colorways branco·telha·verde | marca no header/watermark                    |

Fontes: `fonts.ts` importa `@fontsource` (woff2 por peso, self-hosted no
bundle — offline/LGPD). `base.css`: reset mínimo + foco 3px telha +
`prefers-reduced-motion`.
