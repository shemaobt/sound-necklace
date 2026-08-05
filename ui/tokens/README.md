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

## Papéis de superfície (`--cds-ui-*`, ENG-391)

A tabela acima é **marca e escala** — vale igual nos dois temas. A camada que
troca com o tema é outra, e só ela: os papéis `--cds-ui-*`, declarados duas
vezes em `tokens.css` (`:root` = claro, `[data-cds-theme='dark']` = escuro).

**A regra que rege tudo isto:** uma folha de componente nunca cita `--cds-cream`,
`--cds-olive` ou `--cds-ink` para pintar uma superfície ou uma tinta de texto —
cita o papel. Cita o token de marca só quando a cor É identidade: telha de ação,
olive cerimonial, a paleta de uma cena.

| Papel                           | Claro                                   | Escuro                                       | Uso                                                     |
| ------------------------------- | --------------------------------------- | -------------------------------------------- | ------------------------------------------------------- |
| `--cds-ui-bg`                   | `--cds-cream`                           | `#1C1B0E`                                    | fundo da estação e do `body`                            |
| `--cds-ui-card`                 | `#FFFFFF`                               | `#2B2A17`                                    | cartão (tipo, sessão, relatório, documento)             |
| `--cds-ui-elevated`             | `--cds-cream`                           | `#33321C`                                    | o que flutua sobre a página (popover, modal, balão)     |
| `--cds-ui-chip`                 | `--cds-surface-muted`                   | `rgba(246,245,235,.09)`                      | superfície rebaixada: pílula, janela de lista, none-fit |
| `--cds-ui-chip-hover`           | `#E5E2D2`                               | `rgba(246,245,235,.14)`                      | a mesma sob o ponteiro                                  |
| `--cds-ui-inset`                | `#EEECE0`                               | `rgba(246,245,235,.05)`                      | faixa rebaixada DENTRO de um cartão (capa da sessão)    |
| `--cds-ui-paper`                | `#F6F1E6`                               | `rgba(232,129,62,.10)`                       | o "papel" quente do relatório (voz, rascunho)           |
| `--cds-ui-wash`                 | `rgba(255,255,255,.5)`                  | `rgba(246,245,235,.04)`                      | véu translúcido de painel sobre o fundo                 |
| `--cds-ui-body-ink`             | `--cds-olive`                           | `#F1EBDB`                                    | tinta do documento (o `color` da estação)               |
| `--cds-ui-ink`                  | `--cds-ink`                             | `#F1EBDB`                                    | títulos                                                 |
| `--cds-ui-ink-soft`             | `--cds-olive-soft`                      | `rgba(241,235,219,.78)`                      | subtítulo serifado                                      |
| `--cds-ui-ink-faint`            | `--cds-ink-subtle`                      | `rgba(241,235,219,.55)`                      | eyebrow, rótulo secundário — ver nota AA abaixo         |
| `--cds-ui-hairline`             | `--cds-hairline`                        | `rgba(246,245,235,.14)`                      | a hairline padrão                                       |
| `--cds-ui-hairline-strong`      | `rgba(63,62,32,.32)`                    | `rgba(246,245,235,.34)`                      | a hairline que precisa aparecer                         |
| `--cds-ui-line-rgb`             | `63, 62, 32`                            | `246, 245, 235`                              | **canal**, não cor: `rgba(var(...), .12)` etc.          |
| `--cds-ui-strong-bg` / `-fg`    | `--cds-olive` / `--cds-cream`           | `#F1EBDB` / `#2A2914`                        | botão de peso — no escuro o peso INVERTE                |
| `--cds-ui-accent`               | `--cds-telha`                           | `#E8813E`                                    | borda/realce de escolha, ênfase em texto                |
| `--cds-ui-accent-deep`          | `--cds-telha-deep`                      | `#F0B489`                                    | telha-profundo como TINTA (duração, status)             |
| `--cds-ui-selected-bg`          | telha 6% sobre branco                   | acento 16% sobre o cartão                    | lavagem do cartão escolhido                             |
| `--cds-ui-positive`             | `#585D31`                               | `#CFD6A6`                                    | "áudio pronto", "concluída"                             |
| `--cds-ui-done-bg` / `-fg`      | verde 16%/80%                           | `rgba(119,125,69,.28)` / `--cds-ui-positive` | pílula do que já foi baixado                            |
| `--cds-ui-error-bg` / `-fg`     | `rgba(143,55,1,.1)` / `--cds-error`     | `rgba(232,129,62,.15)` / `#F0B489`           | o pill de erro nunca-punitivo                           |
| `--cds-ui-cta-disabled`         | `#D8B79E`                               | `rgba(190,74,1,.32)`                         | a ação ainda inelegível                                 |
| `--cds-ui-pearl` / `-pearl-lit` | `--cds-pearl` / `--cds-pearl-highlight` | `rgba(246,245,235,.09)` / `.22`              | pérola NÃO TOCADA ("unDark", entrega §8)                |
| `--cds-ui-bead-ring`            | `transparent`                           | `rgba(246,245,235,.30)`                      | aro do marcador de fim de cena no escuro                |

**`--cds-ui-line-rgb` é um canal, não uma cor.** As hairlines da casa nascem
todas do mesmo tom em uma dúzia de opacidades diferentes (0.06 a 0.4). Um papel
por opacidade seria um papel por regra; trocando só o canal, cada uso guarda o
alfa que já tinha — e é isso que garantiu que o tema claro não se mexesse.

**A pérola tingida não passa por aqui.** A cor de uma cena é o **dado**: a
molécula injeta `--cds-pearl-base/lit/deep` da `scenePalette` e o papel só
aparece no _fallback_, isto é, na conta que ninguém tocou. Mesma cena, mesma
cor, nos dois temas.

**O que NÃO troca com o tema**, por decisão de produto (entrega
`docs/design/pacote-melhorias-ui.md` §8): as telas cerimoniais (Ouça a história,
Mapeamento — olive nos dois temas, pintadas pelo vocabulário `--cds-chrome-*` de
`ui/app/app.css`), os botões telha com creme por cima, e
`scenePalette`/`phrasePalette`.

Duas guardas mecânicas: `tokens.test.tsx` falha se um papel existir num tema e
não no outro, e prova que no claro cada papel resolve o token de marca que
substituiu; `dark-surfaces.browser.test.tsx` (Chromium de verdade — jsdom não
computa a cascata) mede a cor RESOLVIDA de cada superfície nos dois temas, exige
que ela mude, e congela o valor claro dos papéis que carregam literal próprio.

Fontes: `fonts.ts` importa `@fontsource` (woff2 por peso, self-hosted no
bundle — offline/LGPD). `base.css`: reset mínimo + foco 3px telha +
`prefers-reduced-motion`.
