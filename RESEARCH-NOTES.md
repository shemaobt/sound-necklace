# RESEARCH-NOTES — Colar de Sons

Cross-iteration technical notes for the loop. Read at iteration start; append concise,
durable findings (not narration) at iteration end. Delete entries that stop being true.

## Environment

- Node **≥ 22.12** mandatory (`.npmrc` engine-strict). Local machine default may be
  older — run everything as `fnm exec --using=22 -- pnpm <script>`.
- Browser tests need Chromium once: `pnpm exec playwright install chromium`.

## Stack gotchas (verified 2026-07-08, sources in docs/architecture.md §1)

- **Vite 8** bundles with Rolldown/Oxc: `build.rolldownOptions` (not `rollupOptions`),
  `oxc` (not `esbuild`). `@vitejs/plugin-react` 6.x already uses Oxc.
- **Vitest 4**: `test.projects` (workspace file removed); browser providers are separate
  packages (`@vitest/browser-playwright`, provider `playwright()` + `instances`);
  coverage config is root-only; V8 coverage counts files matched by threshold globs
  even when never imported by a test.
- **Zod 4**: import from root `"zod"` only (subpaths lint-banned); `z.strictObject`,
  `.extend()` not `.merge()`, two-arg `z.record()`, top-level `z.email()`.
- **TypeScript pinned `~5.9`**: TS 7 (native) is `latest` but typed lint doesn't
  support it yet. Do not bump.
- **Zustand 5**: selectors returning fresh references need `useShallow`.
- **Testing Library**: `@testing-library/dom` is an explicit peer dep; dom project has
  `globals: true` so auto-cleanup works.
- **Prettier is pinned exact** and `docs/` + `CLAUDE.md` + lockfile are in
  `.prettierignore` — a format pass once reformatted the frozen reference; never again.

## Reference / golden facts (byte-identity, verified against the reference source)

- Serialization: `JSON.stringify(x, null, 2)`, NO trailing newline; report `.md` =
  `lines.join("\n")` with exactly ONE trailing newline.
- Bead times are Numbers via `+(x).toFixed(6)` (JSON emits shortest form: `0.25`, `0.9`).
- `hashPCM` reads only `numberOfChannels`, `sampleRate`, `getChannelData(0)` — a plain
  object with a Float32Array works; sampleRate mixes only 2 low bytes; stride
  `max(1, floor(N/100000))`; `Math.round` (half-toward-+∞) for quantization.
- Load-bearing non-ASCII in the report: em dash U+2014, en dash U+2013 in
  `contas s–e`, middle dot U+00B7, curly quotes in the `tempo` note, `média` U+00E9.
- Reference quirks that MUST be mirrored (details in the E1 issue bodies): flags export
  independently of `locked`; dangling unlocked slots occupy P#s; `confirmFrase` does
  not check `pendingStart`; guided flow reaches Mapeamento with zero phrases;
  return-import does not warn on manifest mismatch (only delivery does).

## Determinismo numérico JS (verificado 2026-07-09, ENG-214)

- `pnpm` pode não estar no PATH do Node do fnm — usar
  `fnm exec --using=22 -- corepack pnpm <script>` (corepack resolve o pnpm
  pinado em `packageManager`).
- FNV-1a em JS exige `Math.imul` (o `*` ingênuo excede 2^53 e erra SILENCIOSAMENTE
  — passa em vetores curtos tipo `""`/`"a"` e falha em `"b"`/`"foobar"`).
  `^`/`Math.imul` são int32 por spec; `>>> 0` a cada passo (como a referência) ou
  só no final são equivalentes.
- `Math.round`: empate para +∞ (`-0.5 → -0`, `-1.5 → -1`) — spec-mandado; NÃO é
  `Math.floor(x+0.5)` em geral (duplo arredondamento). Vetores hand-computed em
  Python com `floor(x+0.5)` só valem quando o produto é um double EXATO
  (ex.: amostras float32 × 32767 — mantissa ≤ 39 bits).
- Float64→Float32Array = roundTiesToEven por spec (= `Math.fround` = `struct` do
  Python). `toFixed` e o formato de número do `JSON.stringify` (shortest
  round-trip) são determinísticos; Node e Chromium compartilham V8 ⇒ bytes iguais.
- Vetores de hash comitados em `domain/hash.test.ts` foram computados por
  emulação Python independente (script no comentário do teste) + goldens da
  referência (`manifest-only` → `fnv1a32:5a1b22f1`, `partial-bead` →
  `fnv1a32:1a884f38`).

## Estado de sessão / cenas (verificado 2026-07-09, ENG-216)

- Quirks da referência que o domain espelha: `enterLayer` (L930–935) escolhe o
  **último** índice destravado (`lu=k` sem break); reabrir a história (L677–680)
  limpa `confirmed`+`partsConfirmed`+`current` mas **NÃO** limpa
  `selection`/`pendingStart`; `confirmWhole` → `setMode("escuta")` →
  `enterLayer("parts")` → auto-`addPart` primado (afeta alocação de PT#);
  `confirmParts` seta `mode="triagem"` direto (gates de modo são ENG-219).
- `primePart` deixa `pendingStart=f` E `selection={s:f,e:f}` — o próximo clique
  cai no ramo de 2º clique (normaliza o range e zera `pendingStart`).
- Erros de validação no domain: códigos tipados + cópia PT-BR contratual
  (`{ code, message }`, mensagens em tabela `as const`) — o PRD v2 NÃO define
  códigos (grep confirmado), só as strings; a issue ENG-216 manda códigos
  tipados com a cópia como constante. Não usar throw para validação de fluxo.
- Efeito-como-valor: reducer de seleção retorna `{ state, play }` com
  discriminated union (`single-bead` | `range` | `edge` | `transport`) — padrão
  Elm/effects-as-data; o intérprete (Web Audio) fica nos adapters.
- Vitest 4 + V8: branches implícitos (`?.`, `??`, default params, `if` sem else,
  cada `case`) contam; cobrir os dois lados com testes; preferir eliminar
  código defensivo que o tipo já prova impossível a deixar branch morto.
- PRD §8.2 acrescenta à referência: sem ancoragem ativa o toque é transporte
  (tocar a partir da conta) — na referência o pointerdown só retorna; o reducer
  comunica isso com a ação `transport` e não muda o estado.

## UI atoms / camada visual (verificado 2026-07-09, ENG-215)

- **Protótipos normativos**: todo o estilo vive em objetos inline no
  `<script data-dc-script>` (classe `Component`) dos `.dc.html`. Para pearls/cord/
  head-glow/trail, "Ouvir no colar" é o arquivo autoritativo (o "Protótipo" é mais
  antigo: sem keyframes de glow, sem flag `reduced`, sem cord-fill).
- Fórmula da pérola: `radial-gradient(circle at 34% 30%, lit 0%, base 70%)`;
  head = `scale(1.18)` + anel `box-shadow` + `csHeadGlow 1.6s ease-in-out infinite`;
  dim = `opacity:.18`; scene-end = fill chato `deep`, `border-radius: 28%·size`,
  `scale(1.05)`. Easing da casa: `cubic-bezier(.2,.8,.25,1)` (micro-motion .12–.16s).
- **Divergência tokens×protótipos**: os protótipos usam `lit`/`deep` próprios por
  matiz (ex.: telha lit `#E8813E`, deep `#8F3701`), mas ui/tokens (ENG-213, congelado)
  fixou `lit = base`, `deep = darken30(base)` (≠ nos dois casos). Átomos só consomem
  o `PaletteEntry` recebido — resolver na camada tokens se o visual "flat" incomodar.
- Convenções de teste adotadas p/ atoms (projeto `dom`, jsdom): variantes/estados
  como `data-variant`/`data-state` (convenção Radix; asserção estável sem classe
  hasheada); sem `@testing-library/jest-dom` no repo — usar `getAttribute`/
  `textContent`; guarda anti-dígitos = `expect(container.textContent).not.toMatch(/\d/)`.
- **prefers-reduced-motion em jsdom**: jsdom não tem `matchMedia` nem avalia media
  queries — a guarda vai no CSS (opt-in: animações decorativas SÓ dentro de
  `@media (prefers-reduced-motion: no-preference)`) e o teste importa o css com
  `?raw` (projeto `dom` já tem `css: true`) e afirma que `animation`/`@keyframes`
  só ocorrem dentro do bloco guardado.
- Custom properties por instância (`style={{'--cds-…': v}}`): `React.CSSProperties`
  rejeita `--*` por design — augmentation restrita ao namespace `--cds-` num
  `.d.ts` de módulo (ui/atoms/cds-css-props.d.ts) resolve sem cast.
- Glifos: play/pause dos protótipos são SVG inline viewBox 24 (`M8 5v14l11-7z`;
  pause = 2 rects rx 1.4), nunca unicode. Glifo decorativo: `aria-hidden`; forma
  com significado (disco de confiança): `role="img"` + `aria-label`.

## Web Audio / engine de áudio (verificado 2026-07-09, ENG-217)

- `decodeAudioData` DESTACA o ArrayBuffer de entrada (passo do spec) — passar cópia
  (`bytes.slice(0)`) quando os bytes forem reutilizados; é por isso que a referência
  faz `arr.slice(0)`. Bytes corrompidos ⇒ DOMException `EncodingError`; buffer já
  destacado ⇒ `DataCloneError`.
- `AudioBufferSourceNode` é one-shot: segundo `start()` lança `InvalidStateError` —
  um nó novo por playback. `stop()` também dispara `onended`; a referência guarda
  `state.playing===src` dentro do onended para ignorar o evento do nó descartado.
- `ctx.currentTime` congela durante `suspend()` ⇒ progresso `t0 + (now() − ctxStart)`
  permanece correto através de pause/resume sem contabilidade extra; avança em
  quanta de 128 frames (~2,9 ms @ 44,1 kHz).
- `resume()` pode resolver a promise antes do relógio voltar a andar (Chromium bug 41302928) — smoke test deve observar `currentTime` avançando, não só o await.
- Chromium lançado pelo Playwright nasce com AudioContext `"running"` (autoplay
  policy não aplicada; Playwright #33590) — smoke headless funciona sem gesto.
- jsdom/node: sem `AudioContext` (jsdom #2900). jsdom TEM rAF (Vitest liga
  `pretendToBeVisual`); o projeto `unit` (node) NÃO tem rAF global — o engine
  injeta um transport `{now, requestFrame, cancelFrame, suspend, resume, start}` e a
  fixture avança tempo/frames manualmente. Mocks npm de Web Audio: mortos
  (web-audio-test-api arquivado) ou acoplados a standardized-audio-context — hand-roll.
- Vitest 4: `it.skipIf(cond)` aparece como skipped (↓) no reporter mas sem razão —
  razão visível vai no NOME do teste. Fake timers mockam rAF por default
  (`vi.advanceTimersToNextFrame()`), desnecessário com transport injetado.
- Semântica da referência portada na ENG-217 (call sites verificados): `playRange`
  NÃO seta `playingKey` — cliques de conta (`playRange(b,b)`) e `playEdge` tocam sem
  affordance de pausa; `setMode` (L1001) e `setReview` (L973) chamam `stopPlayback`
  ("mudar de modo para a reprodução"); `stopPlayback` durante pausa deixa o ctx
  suspenso — o `resume()` incondicional de `playRange` conserta no play seguinte;
  piso de duração `Math.max(0.02, t1−t0)`; após fim natural (onended), o mesmo key
  recomeça do início (o guard `playingKey===key && state.playing` falha).
- Depcruise: nenhuma regra proíbe `adapters/` → `tests/golden/pcm.ts` (só domain/
  contracts são banidos de tests/) — o brief da ENG-217 cita esse import de
  propósito para a fixture sintetizar o PCM dourado.

## UI molecules / camada de composição (verificado 2026-07-09, ENG-218)

- **Nenhum glifo lock/caderno/mic/download existe** no repo — só `PlayGlyph`
  (play/pause, filled) e `ShemaIcon` (marca). Molecules autoram os seus inline
  (Feather stroke, viewBox 24, `aria-hidden`+`focusable=false`, `currentColor`).
  Paths lift-áveis verbatim dos protótipos: cadeado
  `rect 4,10 16x10 rx2 + M8 10V7a4 4 0 0 1 8 0v3`; caderno
  `M4 19V5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z`; download
  `M12 4v11 / M7 10l5 5 5-5 / M4 19h16`; check `M20 6L9 17l-5-5`.
- **Decisões de a11y (pesquisa web, APG/WCAG)**: escolha única = `role=radiogroup`
  - `role=radio` + `aria-checked` com roving tabindex (NÃO toggles com aria-pressed,
    NÃO `<ul>` de botões) — usado no `confidence-trio` (grupo completo, dono do
    roving+setas) e no `kind-card` (radio isolado; o organismo ENG-225 orquestra o
    grupo). Chip com ações = container `role=group`+`aria-label` com botões-IRMÃOS
    (nunca aninhar interativos — WCAG 4.1.2). Stepper = `<ol>/<li>` +
    `aria-current="step"`, não-focável, sem `<nav>`; texto sr-only p/ done/atual/futuro.
    Dots-como-atalho = `<button>` nomeado, atual com `aria-current="step"`.
- **Teste sem jest-dom**: consultar por papel+nome (`getByRole('radio',{name,checked:true})`);
  o filtro de papel `{checked}`/`{current:'step'}`/`{pressed}` já afirma estado sem
  matcher; payloads via `vi.fn()`+`toHaveBeenCalledWith`. Helpers CSS reusados de
  `ui/atoms/testing/css.ts` (import `../../atoms/testing/css` do teste da molécula).
- Molecules importam só `ui/atoms` (barrel), `ui/tokens` e React; irmãos por caminho
  direto (regra depcruise `atomos-e-moleculas-puros`). Não precisam de novo
  `cds-css-props.d.ts` (a augmentation `--cds-*` é global/ambient). Pergunta em
  Merriweather usa `var(--cds-font-quiet-voice)`. Trio emite tokens presentacionais
  `certeza|quase|duvida` (não `alta/média/baixa`) p/ ficar domain-free; a página mapeia.

## UI organisms — o colar / browser mode (verificado 2026-07-09, ENG-220)

- **Sem `vitest-browser-react` no repo.** O único browser test (`ui/browser-smoke.browser.test.tsx`)
  monta com `createRoot`/`flushSync` cru + APIs DOM. Reusar esse padrão nos
  `*.browser.test.tsx` do organismo (evita dep nova / mudança em package.json fora do escopo).
- **Eventos por coordenada**: `userEvent` (Playwright) NÃO aceita clientX/clientY e roda
  actionability checks que quebram com milhares de beads sobrepostos. Usar
  `el.dispatchEvent(new PointerEvent(type,{clientX,clientY,pointerType:'mouse',bubbles:true,...}))` —
  síncrono, determinístico; `getBoundingClientRect()` devolve geometria real no Chromium.
- **Dwell de 280ms**: fake timers funcionam em browser mode (`@sinonjs`), mas dão deadlock
  se misturados com `userEvent` (CDP). Como uso dispatch nativo (síncrono), posso
  `vi.useFakeTimers()` + `await vi.advanceTimersByTimeAsync(280)`. Fallback: `vi.waitFor` com timers reais.
- **Ilha imperativa (react.dev)**: seguro tocar SÓ atributos que o React não gerencia.
  Alternar um `data-*` que NÃO vem de JSX é seguro entre re-renders (a reconciliação só
  escreve/remove atributos vistos no JSX; nunca mexe no que não conhece). NÃO usar `class`
  gerenciada por `className` no JSX (React sobrescreve a string inteira no re-render).
  Chaves estáveis por bead → identidade de nó DOM preservada.
- **Sem re-render por frame**: memoizar o campo de beads (`React.memo`) com apenas props
  ESTRUTURAIS; `playbackHead` fica FORA delas e a iluminação roda num `useEffect` que escreve
  `data-play` via ref do container → mudar head não reconcilia os beads (identidade estável).
- **Listener único**: `useEffect` com `addEventListener('pointerdown'|'pointermove'|'pointerleave')`
  no container (não `onPointerDown` JSX, que o React delega na raiz). Mapear pointer→bead por
  geometria (`beadAtXY`: rect + `Z.slot`/`Z.row`) espelhando a referência L554–560 (clamp à janela).
  Contar via `vi.spyOn(HTMLElement.prototype,'addEventListener')` antes do render.
- **Janela = span da cena ativa** (prop `window {s,e}|null`): o organismo deriva o range de
  render `cena ± max(3, round(2/beadSec))` (referência L509), dim nos beads da margem, band
  tracejada sobre a cena; `beadAtXY`/posições usam `winS = cena.s − M` (o "window offset" da DoD).
- Geometria M (referência L484): `SIZES.M={slot:25,bead:18,row:31}`; `bpr=max(1,floor(W/slot))`;
  bead `left=col*slot+slot/2`, `top=6+row*row+row/2` (centro; wrapper com translate(-50%,-50%)).
  `drawBand` (L485–498) desenha retângulos por linha para banda de seleção (pad 3) e cena (pad 4).
- Convenções de camada: organismo pode importar `domain` (tipos) + `ui/tokens` + `ui/atoms`/`molecules`
  (barrels), nunca adapters (depcruise `organismos-sem-adapters`). Precisa do próprio
  `ui/organisms/index.ts`, `docs.md` e `minimalism.test.tsx` (§9.2: sem dígitos em texto/aria/title;
  `data-idx` interno é permitido). Augmentation `--cds-*` é global (não recriar).

## UI organisms — palco da conversa / guia (verificado 2026-07-09, ENG-221)

- **Reuso é a regra**: `conversation-stage` compõe moléculas/átomos existentes em vez de
  re-implementar — `QuestionCard` (pergunta em Merriweather + marcador de papel `role="img"`
  sem palavras + botão "Ouvir a pergunta" condicional ao `onListen`/`onSpeakQuestion` + slot
  `children`), `BeadRow` (fio de progresso: 1 `Pearl` por pergunta, `head`/`lit`/`unplayed`),
  `WaveformBar` (níveis via prop `height`), `Button` (`dark`/`ghost`, size `sm`). Só o glifo de
  microfone é SVG inline local (não há átomo de mic — extrair para `ui/atoms` só se um 2º uso surgir).
- **Máquina de estados do gravador dirigida por props** (`recorderState: 'idle'|'recording'|'recorded'`
  - `levels[]`), callbacks para fora (`onRecord/onStop/onPlay/onRerecord`, `onPrev/onNext`,
    `onSpeakQuestion`). O `MediaRecorder` NÃO vive no organismo — fica no adapter (ENG-244), ligado
    pela estação (ENG-249). Precedência de estado da conta: `current` vence `answered` (revisitada = `head`).
- **Padrão de variante por glob dentro de um componente** (doc de arquitetura §4, espelha as 3
  registries do shell mas escopado): `index.tsx` lê `import.meta.glob('./variants/*.tsx', {eager:true})`
  e um helper puro `pickVariantPath()` prefere `animated` sobre `static`, ANCORADO no basename
  (`/\/animated\.tsx$/`) — substring solto pega `*.test.tsx` por engano. Esta issue traz só
  `variants/static.tsx`; a ENG-232 acrescenta `animated.tsx` sem tocar nada. `import.meta.glob`
  é transformado pelo Vite em TODOS os projects do Vitest (unit/dom/browser) e o typing vem de
  `vite/client` (já em `tsconfig.types`).
- **Gravador é interaction-critical** (uma das 3 do CLAUDE.md) → teste de fluxo obrigatório em
  `*.browser.test.tsx` (Chromium real). Sem `vitest-browser-react`: `createRoot`/`flushSync` para
  render/re-render + `button.click()` nativo (o React 19 ouve na raiz, o click nativo borbulha e
  dispara o `onClick`). Botões do átomo `Button` não repassam props → alvo por texto no teste.
- **Guarda de digit-free escopada** (§9.2): o check "sem dígitos" cobre SÓ `.cds-conversation-stage-progress`,
  não o palco inteiro — a cópia da pergunta pode legitimamente conter dígitos. Movimento decorativo
  (pulso do mic idle) só sob `@media (prefers-reduced-motion: no-preference)`; guia estático sem movimento.

## Triagem / scene kinds / gates (verificado 2026-07-09, ENG-219)

- **Port é do reference in-repo** (`docs/reference/index.html`) + PRD §8.0/§8.5 — não há
  dependência externa a pesquisar; a "pesquisa" é ler a referência e o PRD (ambos no repo).
- `SCENE_KINDS` (L355–366): 27 kinds — **19 ALTA + 8 comum** (ordem exata verbatim;
  NÃO editar à mão, gerado de `_spec/scene-kind-palette.json` pin 5314907). `SK_PT`
  (L1194–1206) cobre os 27 (rótulos PT-BR SÓ exibição; o valor inglês é contrato).
  `skEnShort` = `v.replace(/_SCENE$/,"").replace(/_/g," ").toLowerCase().replace(/^./,upper)`;
  `skShort(v)=SK_PT[v]||skEnShort(v)` (bytes do relatório dependem disso — ENG-233).
- Triagem mutations (picker L1258–1266): tagged → `{tag_state:"tagged", scene_kind,
scene_kind_confidence}` (conf ∈ alta|média|baixa, **U+00E9** em `média`); none_fit →
  `{tag_state:"none_fit", scene_kind:null, scene_kind_confidence:null}`. Reabrir mantém tags.
- **Selectors** `lockedParts()` (L1190 = `locked&&span`) e `productiveScenes()` (L394 =
  `locked&&span&&tag_state==="tagged"&&scene_kind`) vivem em `domain/triagem.ts` (usados
  por coverage e gates; sem ciclo — a UI compõe, o domínio não chama render).
- Coverage (renderCoverage L1272–1308): firme = tagged com conf **alta|média**; hesitante =
  **baixa**; `T_TARGET={ALTA:1,comum:3}` (ALTA exibe "1–2"); status por kind:
  fv≥alvo→coberto, senão fv>0||hv>0→parcial, senão aberto; **candidato a ausência** =
  `tier==="ALTA" && firm===0`; all-none-fit = `parts>0 && triaged===parts && productive===0`.
- Gates (1:1): `updateTriagemDone` L1176–1184 (enabled ⇔ parts>0 && todos não-pending &&
  productive>0; copy §8.5 com aspas curvas `“ ”` U+201C/U+201D e travessão `—` U+2014).
  `updateModeLocks` L1018–1026 (escuta sempre; triagem ⇔ partsConfirmed; segmentação ⇔
  productive>0; mapeamento ⇔ productive>0 **E** ≥1 frase locked com span).
  `setMode` redirect L983–984: (segmentacao|mapeamento) && productive===0 → triagem —
  **só checa productive, NÃO frases** ⇒ o fluxo guiado ALCANÇA mapeamento com zero frases
  (a trava de aba é mais estrita que o redirect; espelhar exato). Efeito L1005: entrar em
  segmentacao com lockedParts seta `partsConfirmed=true`. `setMode` sempre derruba review.
- Fluxo guiado (§8.0): confirmParts→triagem (já em scenes.ts/ENG-216), triagemDone→
  segmentacao (gate+setMode), última cena→mapeamento (setMode em ENG-223). Não precisa de
  nova abstração — as transições são `setMode(alvo)` nos gatilhos.
- Golden case 2 (`minimal-flow.json`): passos `triage` usam **`partIndex`** (índice em
  lockedParts, = state.parts pós-confirmParts) com `kind`+`confidence` ou `none_fit:true`;
  passo `triagemDone` = assert gate habilitado + `setMode("segmentacao")`. O replay passa a
  parar pendente em `phraseSelect` (index 8) — atualizar `registry.test.ts` (era `triage`/5).

## App shell / rotas / player itinerante / gates de UI (verificado 2026-07-09, ENG-224)

- **Referência confirma (grep + linhas):** o "traveling player" é UM nó `#player`
  movido por `mountPlayer(hostId)` (L981: `host.appendChild(p)` só se `p.parentNode!==host`)
  entre `hostOuvir`/`hostCenas`/`hostFrases`; `setMode` (L998–1001) escolhe o host e
  **sempre** chama `stopPlayback()` (L639) logo após — Triagem/Mapeamento NÃO recebem
  mountPlayer (usam play inline). Abas = indicador de progresso: `updateModeLocks`
  (L1018–1026) só habilita passo já alcançado; clicáveis mas `disabled` fora do gate.
  Banner de review (L246) copy completa: "🔒 Modo de revisão — a segmentação está
  travada. Toque ▶ em cada segmento…" + `unlockBtn` "Destravar para editar"; `setReview`
  (L964) troca hint/esconde confirmar; **review é maquinário DORMENTE na referência**
  (`setReview(true)` nunca é chamado) ⇒ o gatilho ON é v2 (§7.3: abrir sessão concluída),
  SEM restrição golden. **Sound toggle e connection/online gate NÃO existem na
  referência** (grep 0) ⇒ v2-only, livres de golden. Header (L203–212): ícone Shemá +
  eyebrow "Arquivo Oral · Tripod" + h1 "Colar de Sons" + subtítulo. A issue ENG-224 usa
  a copy curta §8.10 do brief para o banner.
- **Router sem react-router** (`package.json` fora do escopo): History API + `useSyncExternalStore`.
  `pushState`/`replaceState` NÃO disparam `popstate` (spec/browsers/jsdom) ⇒ `navigate()`
  precisa `notify()` os subscribers à mão; `subscribe` também ouve `popstate` (voltar/avançar).
  `getSnapshot` deve devolver PRIMITIVO (`location.pathname`), não objeto fresco (compara
  por `Object.is`, senão "getSnapshot should be cached"/loop). jsdom tem `pushState` e o
  construtor `PopStateEvent`; testes disparam `new PopStateEvent('popstate')` e resetam
  `history.replaceState({},'', '/')` no `beforeEach` (uma window por arquivo).
- **Portal itinerante (react#12247, ainda vale no 19):** trocar o `container` de
  `createPortal` REMONTA a subárvore (perde estado/efeitos). Padrão correto: portal para
  UM nó destacado persistente (`holderRef = document.createElement('div')` criado uma vez)
  e mover ESSE nó entre hosts com `appendChild` num `useLayoutEffect` (append move, não
  clona; container do portal nunca muda ⇒ sem remount). `useLayoutEffect` (não `useEffect`)
  p/ não piscar na origem; limpar `holder.remove()` no unmount; bubbling segue a árvore React.
- **Zustand headless:** `createStore` de `zustand/vanilla` (getState/setState/subscribe/
  getInitialState) — testar sem componente; reset = recriar no `beforeEach` ou
  `setState(getInitialState(), true)`. `useShallow` é só p/ hook React com seletor que
  devolve objeto fresco (um nível). Fábrica `createSessionStore(deps)` injeta a porta
  autosave (no-op default até ENG-240).
- **`import.meta.glob({eager:true})`**: zero matches ⇒ `{}` (nunca lança); padrão/opções
  DEVEM ser literais estáticos no top-level (senão Vite gera `{}` silencioso). Registry
  injetável = fábrica `build(mods = globbed)` com o mapa de módulos como parâmetro default;
  testes passam um mapa falso. Vale nos 3 projects do Vitest (transform do Vite).

## UI pages / estação Escuta 1 (verificado 2026-07-09, ENG-229)

- **Primeira estação em `ui/pages/`** (estava vazio). O `index.tsx` DEVE ter
  `export default` do componente — é o valor que a station-registry (glob
  `/ui/pages/*/index.tsx`) guarda. Nome do diretório = chave; `KEY_TO_MODE` em
  `ui/app/App.tsx` mapeia `escuta1`→`'escuta'`. `StationHost` renderiza
  `<Station/>` SEM props ⇒ o default export resolve tudo por dentro (sessão via
  `useSessionStore` singleton).
- **Áudio é INJETADO por prop `player` (default `null`)** — não construído na
  estação. Em runtime o áudio só liga pelo Setup (ENG-243) + Dashboard cria/carrega
  a sessão; hoje a estação roda essencialmente sob teste (App mostra "carregando a
  sessão…" sem sessão). A grade do player (`beadSec`/`decoded.duration`) tem de
  casar com a da sessão (`totalBeads`/`beadSec`). Sem player, o colar renderiza sem
  playback (degradação esperada).
- **Colar-como-transporte (§8.2) SOBREPÕE a referência** (que dá `return` em toque
  sem ancoragem, L563): botão grande = `toggle('historia',0,N-1)` (2º toque pausa);
  toque de conta = `toggle` com **chave nova por toque** (reinicia sempre — resolve
  o bug de "re-tocar conta atrás da cabeça pausaria" se a chave fosse fixa);
  `onHead` re-alterna o último `{key,s,e}` ⇒ pausa/retoma (o colar dispara
  `onHeadTap` só quando `bead===playbackHead`). Lógica pura em `transport.ts`.
- **`playbackHead`**: o `Player` só empurra por `onHead` (sem getter síncrono) ⇒
  `useEffect`+`useState` (não `useSyncExternalStore`); efeito de cleanup SEPARADO
  chama `player.stop()` no unmount. `react-hooks/set-state-in-effect` (lint erro,
  não warning) proíbe `setState` síncrono no corpo do efeito — não resetar o head
  ali; o estado inicial `null` basta (player estável em runtime).
- **`confirmWhole` retorna `SceneResult` (`ok|error`)**, mas `sessionStore.apply` só
  aceita `reducer→SessionState`: computar o result do `session` atual; se ok
  `apply(() => result.state)`, se erro `setError(result.error.message)`. O erro
  `WHOLE_SPAN_INCOMPLETE` só é alcançável por sessão forjada (`createSession` nasce
  sempre com span completo 0…N−1) — o teste constrói o span parcial.
- **Testes**: `ui/pages/**/*.test.tsx` → projeto `dom` (jsdom) automático;
  `*.browser.test.tsx` → chromium. Geometria degenerada no jsdom
  (`getBoundingClientRect`=0) ⇒ toque-por-coordenada vai p/ browser test (espelha
  `necklace.browser.test.tsx`: `createRoot`+`flushSync`, `PointerEvent` nativo,
  `beadPosition`; player de fixture dirigido por `engine.transport.advance`;
  `vi.waitFor` p/ o `setState`→`data-play` propagar antes do head-tap). Minimalismo
  de página (§9.2): dígitos em `textContent`/aria/title; ≤1 `[data-role="instruction"]`,
  1 `[data-role="primary-action"]` (o átomo `Button` não repassa props arbitrárias ⇒
  marcar via wrapper). Cerimonial por css `?raw` ancorado NA regra da classe +
  render confirmando as classes aplicadas (tokens.css/`computed-style` não existem
  isolados — só `main.tsx` os carrega; um teste de página não).

## UI pages / estação Escuta 2 — corte de cenas (verificado 2026-07-09, ENG-230)

- **Estado da estação**: renderizada quando `mode==='escuta' && whole.confirmed`
  (`stepper-model.ts` `currentIndex` → 1; `KEY_TO_MODE.escuta2='escuta'`). Após
  `confirmWhole`, `enterPartsLayer` já deixa um part destravado primado
  (`pendingStart=frontier`, `selection={f,f}`) ⇒ há SEMPRE `activeAnchor` na Escuta 2.
- **Colar com ancoragem ativa** (≠ `transportOnly` da Escuta 1): passa `segments`
  (locked parts → `{span, tint: sceneColor(i)}`), `lockedEndBeads` (conta quadrada),
  `selection`/`pendingStart`. Memoizar `segments`/`lockedEndBeads` por `session.parts`
  para o update por-frame do `playbackHead` NÃO recomputar props estruturais (senão
  perde a iluminação imperativa sem-rerender do organismo).
- **Modelo de clique**: `onBeadPointerDown` lê `sessionStore.getState().session`
  (fresco, não o snapshot do React — cliques encadeados), roda `clickBead` (domain),
  `apply(() => state)` e toca a `PlayAction` por `playActionOn` puro (single-bead/range
  → `player.play(s,e)`; edge → `player.playEdge(edge)`). `onEdgeHover` → `player.playEdge`.
  O browser test parte de `selection=null` (não primado) p/ exercitar os 3 ramos
  single-bead→range→edge que a DoD enumera; a Escuta 2 real chega primada (1º clique
  já cai no ramo range) — os dois são válidos, o teste prova a fiação §8.2.
- **Ações**: dominante "✓ Confirmar esta cena" = `confirmPart(s, current.index)`
  (trava, quadra o fim, auto-abre a próxima na emenda via primePart/addPart), marcada
  `data-role="primary-action"` (exatamente 1, guard §9.2). "Confirmar as cenas →"
  (dark) só com ≥1 travada → `confirmParts` → Triagem (descarta a cena aberta do fim).
  "← Voltar" = port do `cenasBack` da referência (L903): `setMode({...s,whole:{...,
confirmed:false}},'escuta')` — DISTINTO do `reopenWhole` da Escuta 1 (que também zera
  `partsConfirmed`/`current`); ambos preservam `parts`. Chips `ScenePhraseChip` (grupo
  `role=group` + botões-irmãos): Reabrir → `reopenPart(s,i)` destrava i..fim (cascata).
- **Digit-free (§9.2)**: a tela do ouvinte não mostra dígitos; o redesign pede "Cena N"
  ⇒ `sceneLabel(i)` numera por EXTENSO (cardinais PT-BR um..noventa e nove; >99 → "Cena"
  só). O `data-idx` do colar é atributo (não textContent/aria/title) ⇒ não viola o guard.
  Precedência: §9.2 (regra PRD v2, DoD) vence "Cena N" numeral (look do redesign).
- **Erros**: as DUAS cópias do confirmar-cena vêm verbatim do domínio
  (`SELECTION_INCOMPLETE`, `SCENE_BEFORE_FRONTIER`) — `SCENE_BEFORE_FRONTIER` só
  alcançável por estado forjado (primePart normalmente impede s<frontier); testar
  forjando `selection.s < frontier`. `NO_LOCKED_SCENE` não surge: o botão é escondido
  sem ≥1 travada (gate por presença, não por mensagem).

## Frases / fronteira / costura (verificado 2026-07-09, ENG-223)

- **Quirks de varredura da referência (break vs sem break)**: `lockFrase` L796 e
  `enterScene` L839 pegam o PRIMEIRO slot destravado (`break`); `removeFrase` L852 e
  `enterLayer` L931 pegam o ÚLTIMO (sem `break`). Espelhar exatamente — afeta
  `current.index` e portanto alocação de P# nos auto-adds.
- **Entrada em segmentação vive no setMode da referência (L1003–1008)**, não numa
  função própria: `ps=productiveScenes()`; se há produtivas, conserta `activeSceneId`
  inválido para `ps[0]` e chama `enterScene`; senão `enterLayer("frases")` (que
  auto-`addFrase` — cria slot dangling mesmo sem cena produtiva). Como gates.ts
  (ENG-219) já portou só a decisão de porta, a orquestração de camada é uma função
  composta em phrases.ts (`enterSegmentacao`), chamada APÓS `setMode` — o replayer
  do golden compõe as duas no passo `triagemDone`.
- `confirmFrase` NÃO checa `pendingStart` (≠ confirmPart) — meia-seleção `{b,b}`
  passa. Ordem das guardas (L779–792): locked/ausente → no-op silencioso;
  partsConfirmed; selection; activeScene; `sel.s >= phraseFrontier`; `sel.e <=
whole.span.e`; só então crossing → oferta. A fronteira de frases com cena ativa
  NÃO clampa em totalBeads−1 (≠ ramo genérico) — se a última frase cobre o fim,
  frontier = e+1 fora do colar e todo confirm é rejeitado (fiel).
- **Oferta de borda é pura (effects-as-data)**: `classifyBorderMove` devolve união
  discriminada `two-productive | escalation | simple` com `delta`, `thr =
max(3, Math.round(0.25*span))`, `consumed` (engoliu a vizinha), `canMove`
  (`simple`, ou `escalation && !consumed`). `Math.round(0.25*n)` é EXATO em IEEE-754
  (0.25 = 2^-2); tie quando `n%4===2`, arredonda para +∞ (spec) — determinístico
  entre engines. `nb===null` ⇒ `consumed=false`, `twoProd=false`, e o move só
  estica a cena (slideSeam sem vizinha).
- `slideSeam` (L832–835) mexe SÓ na vizinha imediata travada e só se ela colide
  (`nb.span.s<=newEnd` / `pb.span.e>=newStart`); cresce a cena nas duas direções
  independentemente. `reopenFrase` cascata o array GLOBAL (frases de outras cenas
  destravam juntas); `flagged` sobrevive — flag exporta sem proposition (quirk).
- `warnedEmptyScene` é variável de módulo na referência (L916) — no domain vira
  parâmetro explícito de `confirmFrasesDone(state, warned)` que devolve o próximo
  marcador no resultado (não entra em SessionState — state.ts é congelado e o
  marcador é efêmero de UI). O replayer do golden mantém o marcador local entre
  passos; `sceneDone` com `forceEmpty` chama duas vezes (generate.mjs L172–175).
- Golden case 2 pós-ENG-223: replay consome até `toggleFlag`/`sceneDone` e para
  pendente em `{index: 12, type: 'answer'}` (ENG-226) com `mode==='mapeamento'`.
  `toggleFlag.index` indexa as frases TRAVADAS (generate.mjs L166), não o array
  todo. Passo `confirmPhrase` com `borderDecision` espelha doMove/reanchor/triagem;
  sem decisão e com crossing, o estado fica intacto (a referência só renderiza).
- `structuredClone` quebra identidade e não é para reducers — spread por caminho
  (padrão do repo). `toSpliced`/`with` exigem `lib: es2023` no tsconfig; evitados
  (filter/map/slice bastam). Python `round()` é ties-to-even ≠ JS — não validar
  thresholds com Python sem cuidado.

## Seam modal / Radix Dialog (verificado 2026-07-10, ENG-228)

- **`BorderOffer` já carrega copy** (`question`, `warning`) — mas `WHY_DELTA`
  produz dígitos ("são N contas, acima do limiar de M"). O modal (ouvinte,
  digit-free por DoD) NÃO renderiza `offer.warning`/`offer.question`: renderiza
  headline do redesign ("A frase passou da borda da cena."), botões exatos por
  variante (PRD v2 §8.6 vence "Ficar dentro da cena" do protótipo →
  "Reancorar dentro da cena") e a linha de consequência SÓ no small
  ("A cena de hoje cresce, a vizinha encolhe"). delta/thr ficam internos.
  Rótulos são constantes locais do modal (organismo não importa VALORES do
  domain — só tipos; `BORDER_COPY` fica para superfícies do facilitador).
- **Radix Dialog 1.1.19** (React 19 ok): ESC e pointer-down fora do Content
  convergem em `onOpenChange(false)` — mapear para onReanchor (default seguro);
  `onEscapeKeyDown`/`onPointerDownOutside` distinguem se precisar. `Title` é
  obrigatório (aria-labelledby automático); sem `Description`, passar
  `aria-describedby={undefined}` no Content ou Radix loga warning. Portal →
  `document.body` (queries `screen.*` acham; `render().container` NÃO).
- **jsdom vs Chromium p/ Radix**: open/close/ESC/foco-inicial/data-state
  testáveis em jsdom (`fireEvent.keyDown(document, {key:'Escape'})`,
  `fireEvent.pointerDown(overlay)`); Tab-cycling do focus trap NÃO é confiável
  em jsdom (sem navegação de tab nativa) → asserção de trap em
  `*.browser.test.tsx`. Modal seta `pointer-events:none` no body →
  `userEvent` lança; usar `fireEvent`/dispatch nativo (padrão do repo).
  Sem animação CSS no jsdom, unmount no close é síncrono (Presence não espera).
- **A11y de diálogo de decisão** (APG): foco inicial na ação menos destrutiva;
  ESC fecha SEM executar nada além de declinar (= Reancorar, que só descarta a
  seleção). `data-state="open"` do Radix serve de gancho de animação.
- **Prototype 1g (Exploração)** é a fonte visual: painel olive `#3F3E20`
  (texto `#F6F5EB`), headline Merriweather itálico 300, marcador "borda de
  hoje" = dashed `rgba(246,245,235,.45)`, "borda nova" = solid `#E8813E` com
  glow, primário telha pill, secundário outline creme
  (`border rgba(246,245,235,.4)`) — o ghost do átomo Button é olive-sobre-creme
  e precisa de override escopado no CSS do modal (sem precedente no repo;
  look-layer, documentado). Só o small tem protótipo; 3-botões/escalada
  extrapolam os mesmos estilos.

## Tutorial popup / Radix Popover / localStorage (verificado 2026-07-10, ENG-231)

- **Radix Popover 1.1.19** (mesma leva do react-dialog já instalado; React 19 ok):
  `Popover.Portal` é OPCIONAL — o `Content` renderiza inline (junto do trigger) e o
  Popper posiciona via `position: fixed` relativo ao trigger mesmo assim; é o que
  mantém o popup DENTRO da `.cds-addons-layer` (DoD) em vez de `document.body`.
  Default `modal={false}`: sem focus trap, sem scroll lock; trigger ganha
  `aria-haspopup`/`aria-expanded`/`data-state` de graça; ESC e pointer-down fora
  convergem em `onOpenChange(false)`. Auto-open NÃO deve roubar foco:
  `onOpenAutoFocus={(e) => e.preventDefault()}` (Carbon/NN-g: status não captura foco).
- **jsdom + Popper**: exige `ResizeObserver` global (mock de 3 métodos vazios no
  próprio arquivo de teste — o projeto `dom` não tem setupFiles); posições calculadas
  são todas 0 — assertar presença/estado/callbacks, nunca side/posição.
- **localStorage**: jsdom tem localStorage REAL (in-memory) — sem mock; resetar com
  `localStorage.clear()` no `beforeEach`; spy só via `Storage.prototype` (webidl).
  Safari ≥ 11 private mode NÃO lança mais em `setItem` (vira in-memory efêmero), mas
  "Block all cookies" lança `SecurityError` no ACESSO a `window.localStorage` →
  get/set sempre em try/catch com degradação silenciosa (dica volta a aparecer; nunca
  quebrar o app). **Primeiro uso de localStorage no repo** — precedente de chave:
  `colar-de-sons:<feature>:<nome>:v1` (versão na chave permite "resetar" sem migração).
- **Dois níveis de dismiss** (VA.gov banner + NN/g): X/ESC/fora = esconde pela SESSÃO
  (estado no componente; o addon fica montado entre estações, então useState = sessão
  do app); "não mostrar de novo" = permanente (localStorage), mantendo o trigger "?"
  como rota de reencontro (NN/g: dispensar não pode custar a informação para sempre).
- **react-hooks v7 (compiler lint)**: `set-state-in-effect`/`set-state-in-render` são
  ERROS → não "reabrir ao trocar de estação" via setState em effect; a dica troca por
  DERIVAÇÃO da prop `station` com o popover aberto, e o auto-open é só estado inicial.
- Addon (1º do glob `/ui/app/addons/*.tsx`): lê `useSessionStore` + `stepperStations`
  (estação atual = `state === 'current'`) e passa `station` como prop; sem sessão
  renderiza null (dashboard/login sem dica). `ui/app` pode importar organisms/state
  (depcruise só proíbe organisms→adapters e não-wiring→adapters). Organismo consumido
  só pelo shell segue o precedente do connection-gate: FORA do barrel, import por
  caminho direto (evita editar ui/organisms/index.ts fora do Scope).

## Triagem picker / coverage drawer / Radix (verificado 2026-07-09, ENG-225)

- **Radix**: o trabalho original desta issue usou o pacote unificado `radix-ui`,
  mas ao rebasear sobre a main o repo já tinha padronizado o pacote com escopo
  `@radix-ui/react-dialog` (ENG-228, seam modal) — o drawer foi reconciliado para
  `import * as Dialog from '@radix-ui/react-dialog'` (uma dep só, precedente vence).
  `Dialog.Title` é OBRIGATÓRIO (console.error sem ele); sem `Description`, passar
  `aria-describedby={undefined}` no `Content`. Portal → `document.body`: testes usam
  `screen.*`, nunca `container`. Modal aberto ⇒ `pointer-events:none` no body +
  `aria-hidden` nos irmãos (trigger some das queries por role enquanto aberto);
  clique-fora = `fireEvent.pointerDown(document.body)` (DismissableLayer ouve
  pointerdown, não click); ESC = keydown no documento. jsdom não computa animação
  de stylesheet ⇒ Presence desmonta imediato ao fechar (sem forceMount/waits) —
  e as animações ficam dentro da guarda reduced-motion de qualquer forma.
- **Só o protótipo "Protótipo.dc.html" é normativo p/ Triagem** (o card 1c de
  "Classificação (opções)" é rascunho): disclosure = "Ver todos os tipos por tema"
  (a variante "Ver todos os 27 tipos" tem dígito — viola §9.2); escolher o kind
  SUBSTITUI o grid pelo estágio de confiança (chip do kind + "trocar tipo" +
  pergunta "O quanto isso parece certo pra você?"); drawer olive 340px com linhas
  mono kind-EN + heading "Candidatos a ausência (raras em aberto)" (#C2A55A).
  Cores dos 6 temas do protótipo = `scenePalette[0..5]` dos tokens (hex idênticos).
- **"Mais comuns" = os 8 kinds do tier `comum`** (decisão da issue; o protótipo
  mostrava 6 — a issue vence). Filtro de texto: exigido pelo PRD §8.5/DoD embora o
  protótipo híbrido o tenha descartado (comportamento: PRD vence). Sem contagem de
  resultados visível (dígito violaria §9.2; WCAG 4.1.3 só exige role=status SE uma
  mensagem de status for exibida).
- **A11y do picker (APG)**: radiogroup ÚNICO com headings de tema apenas visuais —
  `role=group` aninhado em radiogroup NÃO é sancionado (required owned = só radio;
  suporte de AT inconsistente). Roving tabindex com setas movendo foco SEM marcar
  (variante toolbar): marcar no arrow dispararia a troca grid→confiança a cada
  tecla. `KindCard` não encaminha ref ⇒ o roving usa
  `querySelectorAll('[role="radio"]')` no container (ordem DOM = ordem do array
  de render) + índice `focusedIdx` dirigindo `tabbable` (reset a 0 quando a
  lista muda: filtro/disclosure).
- **Passo de confiança NÃO emite na seleção** (self-review 2026-07-10): o
  ConfidenceTrio é APG padrão (setas movem E marcam via onSelect) — mapear
  onSelect→onConfirm faria uma seta de exploração cometer a triagem. O picker
  guarda a escolha em estado local (`value` controlado, aria-checked real) e a
  emissão contratual fica num botão "Confirmar" dominante revelado após a
  primeira escolha. Trocas de estágio (grade↔confiança, disclosure↔recolher)
  gerem foco explicitamente (senão cai no body, WCAG 2.4.3) — padrão useEffect
  com ref de estágio anterior, foco no `[role="radio"][tabindex="0"]`.
- Barrel `ui/organisms/index.ts` fica FORA do escopo da ENG-225 (precedente
  ConnectionGate/ENG-224): a estação (ENG-236) importa por caminho direto ou
  adiciona ao barrel no escopo dela.

## Contracts / manifesto + retorno + serializer (verificado 2026-07-10, ENG-227)

- **Depcruise `contracts-so-domain` NÃO isenta testes**: contracts/*.test.ts não pode
  importar `tests/` (nem `tests/golden/pcm`) — testes de contracts são autocontidos
  (estados via `createSession`/forja direta; fixtures lidas com `node:fs`, que é
  permitido em testes pela isenção `pathNot .test.ts` da regra de npm/builtin).
  `tests/` → `contracts/` é permitido (nenhuma regra proíbe; o harness liga assim).
- **`story_slug` é o slug CRU** (`state.slug`, sem fallback) — o fallback `"colar"`
  existe SÓ nos nomes de arquivo (L1331/L1336). A referência tem um SEGUNDO fallback
  divergente `"historia"` no nav do mapeamento (L1152) — fora do contrato ENG-227;
  o export-card (`"colar"`) é o normativo.
- Gates de export (L1330–1339): manifesto = `!state.totalBeads` → no-op SILENCIOSO
  (sem mensagem); retorno = `!state.whole.confirmed` → erro "Confirme o colar antes
  de exportar."; `semFim` (aviso, não bloqueia) = frases `!locked && (span ||
statement_pt.trim())`.
- **Coerções do buildReturn**: `scene_kind||null` e `confidence||null` são reais
  (string vazia → null); `tag_state||"pending"` é INALCANÇÁVEL no domain (TagState
  nunca é falsy) — omitido com comentário, seguindo o precedente ENG-216 de não
  deixar branch morto que o tipo prova impossível. Bytes idênticos de qualquer forma.
- **Zod 4 (4.4.3)**: `z.strictObject` rejeita chave extra (z.object faz STRIP
  silencioso — nunca usar p/ DTO de contrato); `.regex()` continua existindo;
  `z.int()` é o idioma novo (safe-integer bounded); enum de valores não-ASCII
  (`média`) sem gotcha, mas o match é NFC-exato; `z.enum` de array runtime exige
  cast `as [string, ...string[]]` (não há union type dos 27 kinds no domain —
  derivar de `SCENE_KINDS.map(k => k.value)`).
- **Zod `.parse()` de strictObject RECONSTRÓI o objeto** (ordem de chaves = ordem do
  shape do schema) — nunca serializar o resultado do parse; o mapper devolve o
  literal na ordem da referência e o schema só VALIDA (testes usam safeParse).
- Byte-identidade JSON entre engines: ordem de propriedades é spec-mandada
  (inserção; chaves numéricas iriam primeiro — não temos), shortest-round-trip de
  números é de-facto universal (RFC 8785 depende disso; 0.25/0.9/10.371 têm forma
  única), non-ASCII sai VERBATIM (Python `json.dumps` com `ensure_ascii=True`
  produziria bytes diferentes — não validar goldens com Python default).

## Fronteira de frases no clamp do clique (verificado 2026-07-10, ENG-269)

- **Grafo de imports do domain (relevante)**: `triagem → state`; `seam → scene-kinds,
state`; `frontier → state`; `gates → triagem, state`; `phrases → frontier, gates,
ids, seam, triagem`; `selection/scenes → frontier`. Mover `activeScene` de
  phrases.ts para seam.ts (que ganha `productiveScenes` de triagem) deixa
  `frontier → seam` SEM ciclo. Depcruise `sem-ciclos` é `severity: error` (não o
  default `warn` do template) — ciclo quebra CI. Re-exports (`export {x} from`)
  contam como aresta no grafo do depcruise (dependencyType `export`).
- **Semântica ESM de ciclos (MDN)**: ciclo entre módulos que só exportam `function`
  hoisted e não avaliam bindings no top-level é runtime-safe; quebra com TDZ quando
  o top-level LÊ um binding do outro módulo. `import type` é apagado — nunca cicla
  em runtime. Vitest roda via module runner do Vite (semântica emulada) — histórico
  de bugs só com `vi.mock` + ciclo. Eliminar o ciclo torna tudo isso irrelevante.
- **Golden não muda de bytes com o clamp**: o replay (tests/golden/registry.ts)
  nunca chama `clickBead`/`activeAnchor`; `phraseSelect` escreve `selection` direto
  e `confirmFrase` valida com `phraseFrontier` (semântica inalterada). Único
  `frontier` do replay é camada `'parts'` (registry.ts:222).
- **Quirk a preservar ao fundir o ramo**: o ramo de cena ativa da fronteira de
  frases retorna SEM o clamp `Math.min(f, totalBeads−1)` (referência L400–409
  retorna antes do ramo genérico); no `frontier` novo o early-return fica ANTES do
  clamp. Consequência herdada no clickBead: com a última frase cobrindo o fim da
  cena no fim do colar, o piso pode exceder `whole.span.e` e o clamp
  `max(floor, min(ceil, b))` devolve o piso (> ceil) — fiel à referência (L565–566).
- O ramo de cena ativa dispara sempre que `productiveScenes()` não é vazio
  (`activeScene` cai em `ps[0]` sem `activeSceneId`) — NÃO depende de mode; branch
  por `activeScene(state)`, não por `state.mode`.

## Mapeamento — roteiros + answer store (verificado 2026-07-10, ENG-226)

- **Byte-igualdade sem risco de cópia manual**: o teste extrai `var L1_Q = [...]`
  da própria referência em runtime (regex não-greedy até `];` + `new Function`)
  e compara com `toStrictEqual` (distingue chave ausente de `undefined` — pega
  o quirk "L3 sem field" vs "L2 descrever field vazio"). `new Function` é
  lint-clean aqui: o eslint usa só `recommended` (sem type-checked), então
  `no-implied-eval` não está ativo. depcruise: `domain/*.test.ts` PODE importar
  `node:fs` (o `pathNot: '\\.test\\.ts$'` da regra de pureza exclui testes).
- **Toolchain não altera literais unicode** (fontes na pesquisa ENG-226): tsc/
  Vite/Oxc/V8 preservam o valor; `JSON.stringify` NÃO escapa U+201C/U+201D/
  U+2014/U+00E9 (só `"` `\` controles e surrogates órfãos); Prettier só troca
  delimitadores; `'—' === '—'`. Único vetor real: colar NFD/homóglifo —
  guarda `s.normalize('NFC') === s` no teste.
- Quirks do ensureMapping espelhados: semeadura com `== null` (resposta `""`
  explícita sobrevive); L2 por `lockedParts()` (none_fit INCLUÍDA); L3 por
  frase `locked && span && part_link` de QUALQUER cena (≠ productiveFrases,
  que filtra produtivas) — a sequência da conversa (questionSequence) usa
  productiveFrases, então L3 de cena none_fit é semeada mas nunca perguntada;
  ensureMapping nunca apaga (frase reaberta mantém respostas). `setAnswer` em
  bucket L2/L3 inexistente lança (referência lançaria TypeError na atribuição).
- Golden minimal-flow pós-ENG-226: replay consome os 5 passos `answer` e para
  pendente em `{index: 17, type: 'export'}` (ENG-227/233). `buildReturn()` da
  referência NÃO lê `state.mapping` — só `buildMapReportMd()` (L1155–1170).

## Relatório .md — buildMapReport + fecho do golden (verificado 2026-07-10, ENG-233)

- **`buildMapReport(state, voice?)` consome só domain**: seletores `lockedParts`/
  `productiveScenes` + scripts `L1_Q/L2_Q/L3_Q` + `voiceAnswerPath`. `sceneNum(p) =
lockedParts(state).indexOf(p)+1` funciona TAMBÉM para as cenas de
  `productiveScenes` porque ambos os seletores são `state.parts.filter(...)` e
  devolvem as MESMAS refs de objeto — logo o S# tem lacuna quando uma none_fit
  precede uma produtiva (fiel à referência). `mapping` nulo → default vazio (saída
  idêntica à semeada: chave ausente → `""` → `_(sem resposta)_`).
- **Três fallbacks de slug DISTINTOS**: título do relatório = `slug||"história"`
  (COM acento, U+00ED); nome do arquivo do relatório = `slug||"historia"` (SEM
  acento, `relatorioFilename`, L1151); nomes dos JSONs = `slug||"colar"`
  (serialize.ts). Não confundir — são três strings de contrato diferentes.
- **Extensão de voz (PRD §10.4, não na referência)**: 2º param `voice:
ReadonlySet<string>` = caminhos de recurso COM gravação. Célula resolve
  digitado(trim) > caminho de voz(`voiceAnswerPath(slot)`) > `_(sem resposta)_`;
  digitado vence. `voice` vazio ⇒ bytes idênticos à referência. Fixture PRD-derived
  em `contracts/fixtures/relatorio/` (README marca a origem — o teste de contracts
  não pode importar `tests/`, então a fixture mora junto do módulo).
- **Fecho do golden minimal-flow**: novo `sessionExportReplayer` (registry.ts)
  COMPÕE sobre `replaySessionSteps` (inalterado — ainda para no `export`,
  devolvido em `pendingAt`) e serializa os artefatos que o passo `export` lista
  pelos mappers REAIS (`buildManifesto`/`buildRetorno`/`buildMapReport`).
  `golden.test` compara TODOS os arquivos de `expected/<caso>/` — logo o replayer
  de um caso DEVE produzir todos os artefatos comitados, não só o novo. minimal-flow
  sai de PENDENTE; os 3 artefatos byte-diffam a cada CI.
- Complexity de `buildMapReport` = 20 (lint WARN, não erro — CLAUDE.md gate 5):
  port fiel 1:1 de uma função única da referência; dividir pioraria a auditoria
  byte-a-byte. Não refatorar por causa do número.

## Process

- The golden harness is the merge gate: placeholder until ENG-212, strict from ENG-238.
  `pnpm golden:generate` (once it exists) drives the UNMODIFIED reference via Playwright
  `page.evaluate` — never edit `docs/reference/index.html`.
- Integration points are add-a-file registries (stations / adapters `register.ts` /
  app addons / guide variants) — never edit another issue's files to wire yours.

## ENG-235 — contracts API/bucket DTOs (provisional, fixture-first)

- **Custódia opaca no schema (§10.5)**: artefato = `z.string()` (`OpaqueArtifactSchema`),
  nunca objeto tipado. `schema.parse(bytes) === bytes` prova o round-trip byte-a-byte;
  um teste faz grep no `api.ts` por `JSON\.parse\(` / `JSON\.stringify\(` (forma de
  CHAMADA, não menção em comentário — o 1º regex ingênuo `/JSON\.parse/` pegava o
  próprio doc-comment). Nenhuma via de (de)serialização mora neste módulo.
- **Envelope de acousteme opaco e versionado (§15.2 O8)**: `strictObject({version, data})`
  com `data: z.unknown()` — chaves internas desconhecidas sobrevivem intactas
  (`toEqual` do input). O `strict` é só no envelope; a semântica de `data` (a regra
  O8) fica com o GranularityResolver (ENG-241/242). A fixture `bucket-list.json` põe
  `bead_sec` por nível em `data` (fixture-authored, provisório) só para o stub ler.
- **Autosave sem duplicar o session-state (ENG-234)**: corpo do PUT = `looseObject({
schema_version: z.int() })` — valida SÓ o envelope e passa o resto opaco. O schema
  real do estado é do ENG-234; adapters importam só os tipos daqui, contendo a troca.
- **Fronteira de escopo API vs bucket**: `GranularityLevelSchema` (pequena/media/grande)
  vive em `bucket.ts` (par com o acousteme) e é importada por `api.ts` no create —
  intra-contracts é permitido pelo depcruise (a regra `contracts-so-domain` só barra
  adapters/ui/tests). `ResourcePathSchema` valida as 3 formas §10.4 por regex
  (level1/<k> · level2/PT#/<k> · level3/P#/<k>, ext `.webm`).
- **Byte-identidade não toca este módulo**: são DTOs de fio (wire), não artefatos —
  a única serialização do app segue sendo `serialize.ts`. Status/estado usam ascii no
  fio (`em_progresso`/`concluida`, `pequena`); o rótulo acentuado é display na UI.

## ENG-234 — contracts session-state DTO (autosave) + import mappers

- **Round-trip = domínio + meta**: `toSessionDto(state, meta)` / `fromSessionDto(dto)`
  serializam TODO campo do `SessionState` do domínio (grade `beads[]` inclusa) e trazem
  os campos v2-novos que não vivem no domínio num `SessionMeta` à parte
  (`granularityLevel`, `bucketAudioId`, `pipelineConsent`, `voice[]`). Campos
  TRANSIENTES da referência NÃO são persistidos: `warnedEmptyScene` (var de módulo
  L916) e o andaime de tela `mapStep`/`mapN*i` — reconstruídos ao reabrir a estação.
- **`whole.id` tipado `'S1'` no domínio, `string` no DTO**: a entrega sobrescreve
  `whole.id` com o `scene_id` externo (arbitrário), então o DTO guarda `string` e o
  `fromSessionDto` faz o cast de volta (`as Whole['id']`). No round-trip puro (sem
  import) o id é sempre `'S1'`, então o cast é seguro.
- **Schema estrito no NOSSO formato, leniente no import**: `session-state.ts` usa
  `z.strictObject` (chave extra = inválida, é dado que a SPA valida na leitura §10.5);
  `imports.ts` usa `z.object` (leniente, ignora chaves desconhecidas) — FIEL à
  referência, que lê campos específicos e ignora o resto. A invalidez das fixtures de
  import é semântica (enum de confiança fora, bead não-inteiro, `confirmed_span`
  faltando no retorno), não "chave extra".
- **Mappers 1:1 (referência L1341–1383)**: ENTREGA → propostas DESTRAVADAS, spans de
  `proposed_span` senão null, prefills preservados, fallbacks `PT#`/`P#` por índice,
  `whole.id` sobrescrito só quando `scene_id` existe; aviso de mismatch É um predicado
  não-bloqueante (`manifestMismatch`), SÓ quando `manifest_id` existe e diverge.
  RETORNO → tudo TRAVADO, spans de `confirmed_span` (schema os EXIGE), `partsConfirmed`
  quando há cenas (nunca desliga), flags NEEDS_REVIEW reaplicadas por `prop_id`, cursor
  → frases, SEM checagem de manifest. Ambos recusam com grade ausente (`totalBeads` 0)
  via `{ok:false, reason:'no-grid'}`; as cópias PT-BR ficam expostas p/ a UI (ENG-248).
- **Fidelidade import→export byte-a-byte**: `retorno → applyReturn → buildRetorno`
  reproduz o retorno idêntico SE o seed tem `scene_id`s sequenciais (S1,S2…), flags com
  `note_pt:""` referenciando proposições PRESENTES (flags dangling são DESCARTADAS no
  import, igual à referência), e `manifest_id`/`story_slug` = os da sessão (o
  `buildRetorno` usa `state.manifestId`/`state.slug`, NÃO os do seed). O `registry.ts`
  ganhou o passo `importReturn` (valida por `ReturnSchema` + `applyReturn`) que habilita
  o caso `import-return-roundtrip` da ENG-238; a prova de byte-identidade roda no
  `registry.test`/`imports.test` (caso golden completo com `generate.mjs` = ENG-238).
