# ui/tokens — vocabulário visual Shemá

Fonte única dos tokens (redesign PRD §4; protótipo normativo
`docs/design/Colar de Sons - Protótipo.dc.html`, precedência CLAUDE.md regra
2). Os VALORES são congelados por `tokens.test.tsx`.

| Token (TS / CSS)                                      | Valor                                             | Uso                                                             |
| ----------------------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------- |
| `colors.cream` / `--cds-cream`                        | `#F6F5EB`                                         | fundo das telas de trabalho                                     |
| `colors.olive` / `--cds-olive`                        | `#3F3E20`                                         | full-bleed cerimonial (Escuta 1, Conversation)                  |
| `colors.telha` / `--cds-telha`                        | `#BE4A01`                                         | ação única + trilha de reprodução                               |
| `colors.telhaDeep` / `--cds-telha-deep`               | `#8F3701`                                         | hover/press (escurece, nunca clareia) + erro                    |
| `colors.ink` / `--cds-ink`                            | `#0A0703`                                         | títulos em fundo claro                                          |
| `colors.oliveSoft` / `--cds-olive-soft`               | `#5A5A3E`                                         | subtítulos serifados em creme                                   |
| `colors.inkSubtle` / `--cds-ink-subtle`               | `#6D6C56`                                         | labels/eyebrows secundários — ver nota AA abaixo                |
| `colors.surfaceMuted` / `--cds-surface-muted`         | `#ECEADF`                                         | superfície rebaixada: pills do header, tile "nenhum se encaixa" |
| `colors.frame` / `--cds-frame`                        | `#EDEBE0`                                         | moldura ao redor das telas (Segmentação)                        |
| `colors.accentSoft` / `--cds-accent-soft`             | `#F2D8C2`                                         | halo da etapa atual no fio de contas                            |
| `colors.sand`/`sandMuted`                             | `#C5C29F` / `#B8B79E`                             | discos "na dúvida" e estados desabilitados                      |
| `colors.confidenceFilled` / `--cds-confidence-filled` | `#777D45`                                         | disco cheio "Certeza"                                           |
| `colors.confidenceHalf` / `--cds-confidence-half`     | `#9A7B2E`                                         | meio disco "Quase"                                              |
| `colors.warningBg`/`warningInk`                       | `#F5E9D2` / `#755C20`                             | avisos                                                          |
| `colors.pearl`/`pearlHighlight`                       | `#E7E3D3` / `#FBFAF3`                             | pérola não tocada                                               |
| `--cds-hairline`                                      | `rgba(63,62,32,.16)`                              | bordas quase nunca                                              |
| `scenePalette` (8) / `phrasePalette` (6)              | `PaletteEntry` `{base,lit,deep}`, ver `tokens.ts` | identidade das cenas/frases no fio                              |
| `--cds-radius-input/tile/card-sm/card/frame`          | `12/14/18/22/26px`                                | escala de raio por densidade de componente                      |
| `--cds-shadow-card/menu/modal/cta/play`               | ver `tokens.css`                                  | sombras baixas nos cards, mais fundas em menu/modal/CTA         |
| `motion` / `--cds-motion-*`                           | 220ms ease-out                                    | sem bounces                                                     |
| `typography` / `--cds-font-*`                         | Montserrat / Merriweather                         | load-bearing / voz quieta                                       |
| `ShemaIcon`                                           | colorways branco·telha·verde                      | marca no header/watermark                                       |

`scenePalette`/`phrasePalette` são **triplas literais** copiadas à mão do
protótipo (`PAL`/`PALF` em Protótipo.dc.html) — `lit` é o brilho do gradiente
radial da pérola, `deep` a sombra, escolhidos por cor e não derivados por
fórmula. Não existe mais uma função `darken30`/derivação automática de `deep`:
qualquer nova cor de paleta precisa das três tintas escolhidas à mão no
protótipo, não calculadas.

**Decisão de acessibilidade (ENG-278, `inkSubtle`):** o protótipo usa `#8A8970`
para labels secundários, que dá 3.28:1 sobre o creme — reprova o AA 4.5:1 do
PRD §13. Onde a regra 1 do CLAUDE.md (comportamento/regras — aqui, a régua de
acessibilidade do PRD) e a regra 2 (look do protótipo) colidem em contraste,
o PRD vence: `inkSubtle` (`#6D6C56`, 4.95:1) substitui o `#8A8970` do
protótipo em todo lugar que a UI usa esse tom.

Fontes: `fonts.ts` importa `@fontsource` (woff2 por peso, self-hosted no
bundle — offline/LGPD). `base.css`: reset mínimo + foco 3px telha +
`prefers-reduced-motion`.
