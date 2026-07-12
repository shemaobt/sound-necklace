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

## adapters/sessions — SessionStore (verificado 2026-07-10, ENG-240)

- **adapters → adapters é permitido** (depcruise só barra `adapters → ui`): sessions
  reusa a porta `connectivity` (tipo `ConnectivityMonitor` + `FixtureConnectivityMonitor`)
  sem ciclo (connectivity não importa sessions). Importar outro adapter ≠ editá-lo
  (escopo é sobre arquivos EDITADOS).
- **Testes de adapter rodam no projeto `unit` (node), sem jsdom/localStorage**: para a
  persistência da fixture, injetar um `KeyValueStorage` (shape da Web Storage:
  getItem/setItem/removeItem) — default in-memory (`Map`) nos testes; o browser passa
  `window.localStorage`. Chave de persistência segue o precedente da ENG-231:
  `colar-de-sons:sessions:v1`. Bytes binários (recursos de voz) NÃO cabem em localStorage
  sem base64 → ficam só em memória (limitação documentada; nenhum DoD exige recurso
  sobrevivendo a reload).
- **Autosaver = setTimeout + fake timers**: debounce + backoff usam `setTimeout`; os
  testes usam `vi.useFakeTimers()` + `await vi.advanceTimersByTimeAsync(ms)` — confiável
  no projeto `unit` (o caveat de deadlock fake-timer×userEvent da ENG-220 é só do browser
  mode). Retry testado com uma função `persist` REAL que lança N vezes e grava tentativas
  num array (padrão bom do skill TDD), não um mock do próprio autosaver.
- **`noUncheckedIndexedAccess` está LIGADO** no tsconfig: `calls[0]` é `T | undefined` —
  guardar (`const c = calls[0]; if (!c) throw`) ou castar nos testes; typecheck falha
  senão (o `pnpm test`/vitest via Vite NÃO typa, então o erro só aparece no `pnpm
typecheck`).
- **Custódia opaca na store (§10.5)** = `structuredClone` na entrada e na saída (estado
  e artefatos); a store NUNCA valida/reserializa o DTO — `contracts/api.ts` já trata o
  autosave como `looseObject`, e a validação estrita é da camada de estado (ui/state via
  `fromSessionDto`), não do adapter. Byte-identidade de artefato = strings imutáveis
  (`{...triple}` copia refs; `got.manifesto === triple.manifesto`).
- **Padrão "servidor partilhável"**: um `FixtureSessionBackend` injetado em N
  `FixtureSessionStore` = N usuários num servidor — ÚNICA forma de exercitar o lock
  consultivo (2º `acquireLock` de outro user devolve `LockStatus` com o holder atual,
  SEM lançar → o não-holder abre em revisão §7.3). Lock por-usuário com TTL; identidade
  do editor injetada por `opts.user` (default `DEFAULT_FIXTURE_USER`).
- `globalThis.crypto.randomUUID()` é global em node ≥ 19 e no browser (sem import).
  O passo do dashboard (`SessionSummary.progress.current_step`) é DERIVADO do `mode` do
  estado salvo (`stepFor`: escuta→ouvir/cortar por `whole.confirmed`, triagem→triagem,
  segmentacao→frases, mapeamento→conversa, concluida→guardar).
- **`createAutosaver` é reusado pela fixture E pelo HTTP real** (o `persist` injetado é a
  única diferença): mantém debounce/coalescing/retry/pausa num só lugar. O esqueleto
  HTTP (`http.ts`) injeta `fetch` (sem rede no CI) e um getter de token Bearer; endpoints
  PROVISÓRIOS até o OpenAPI (ENG-211/ENG-247), então só `create` tem teste de shape.

## Golden harness STRICT + pacote de bordas (ENG-238, 2026-07-10)

- **`STRICT = true` está LIGADO** (`tests/golden/registry.ts`): qualquer caso em
  `cases/` sem replayer registrado agora REPROVA `pnpm golden`. Nunca afrouxar
  (CLAUDE.md gate 1). Ao adicionar um caso novo, registre o replayer no mesmo PR.
- **`fnm exec --using=22 -- pnpm <script>` FALHA** ("Can't spawn program pnpm"): o
  pnpm vem do corepack, não está no PATH desse node. Use
  `fnm exec --using=22 -- corepack pnpm <script>` para TODOS os scripts.
- **Goldens = verdade por construção.** O fluxo p/ um caso novo: escreva o script →
  `corepack pnpm golden:generate` (Playwright dirige a referência e grava
  `expected/<caso>/`) → `corepack pnpm golden` (replay por domain+contracts, byte-diff).
  Verde = domínio ≡ referência; vermelho por assimetria de script = ajuste o script;
  vermelho por divergência real de domínio/contracts = PARE e escale (fora do escopo
  do harness). Os 14 casos da ENG-238 passaram sem NENHUMA divergência — o port está fiel.
- **Passo `importReturn` no `generate.mjs`** (novo na ENG-238) espelha o handler de
  retomada da referência (L1362–1383) inline na página; o lado do domínio usa o
  `applyReturn` real via `registry.ts`. Sem tocar áudio nem UI, como os demais passos.
- **Truques de borda que os casos fixam** (todos byte-verificados): `slideSeam` mexe só
  a vizinha IMEDIATA; `nextPid`/`nextPartId` = menor P#/PT# livre (reuso após remoção);
  frase que cruza a borda para dentro de vizinha produtiva-com-frases → escalada (sem
  "mover"); frase que engole a vizinha → `consumed` (sem "mover"); `ensureMapping` NUNCA
  apaga resposta (extensão preguiçosa `== null`); flag sobrevive à reabertura da frase
  (flags no export são independentes de `locked`); `buildBeads` só soma conta parcial se
  `dur - total*beadSec > 1e-9` (múltiplo exato ⇒ sem conta extra); `hashPCM` decima por
  `stride = max(1, floor(N/100000))` e mistura `numberOfChannels` + bytes de sampleRate.

## UI pages / estação Segmentação — frases numa cena (verificado 2026-07-10, ENG-237)

- **Confirmar frase = botão único, não 2º clique.** A referência (L904/L908) tem um
  só `confirmHere` cujo rótulo alterna "✓ Confirmar esta cena"/"✓ Confirmar esta
  frase" conforme `activeAnchor().layer`, chamando `confirmPart`/`confirmFrase(current.index)`.
  A estação espelha isso: o `clickBead` só monta a seleção; um botão dominante confirma.
- **`confirmFrase` é união discriminada**, não `Result`: `locked` | `border` | `noop`
  | `error`. Em `border` a estação abre o seam-modal com `result.offer`; a decisão
  do modal aplica `moveBorder(s, offer)` / `reanchorFrase(s)` / `setMode('triagem')`.
  `moveBorder` DEVE rodar sobre o mesmo estado que gerou a oferta (mesma cena ativa) —
  o store não muda com o modal aberto, então `apply(s => moveBorder(s, offer))` basta.
- **Janela do colar** = passar `window={activeScene.span}` ao `Necklace`; o organismo
  faz o resto (`resolveWindow` soma a margem `max(3, round(2/beadSec))`, escurece/omite
  fora, desenha a banda tracejada da cena). Contas fora da janela NEM renderizam
  (`data-idx` ausente) — bom para testar windowing sem inspecionar estados de pérola.
- **`confirmFrasesDone(state, warnedEmptyScene)`** carrega o marcador de cena-vazia
  como PARÂMETRO/RETORNO (estado efêmero de UI, `useState` local) — não entra na
  sessão. Kinds: `noop`|`warn-empty`|`next-scene`|`mapeamento`. 1º clique numa cena
  sem frases → `warn-empty` (mostra a cópia, guarda o marcador); 2º → segue.
- **Reuso entre estações irmãs (ui/pages → ui/pages)** é permitido pelo depcruise (sem
  ciclo): a Segmentação importa `playActionOn`/`sceneColor`/`sceneLabel` de
  `../escuta2/cutting` em vez de duplicar o cardinal por extenso. `phraseLabel` reusa
  `sceneLabel` trocando "Cena"→"Frase" (tela digit-free §9.2). Cor da frase = `phrasePalette`.
- **React Compiler `preserve-manual-memoization` é ERRO (não warning).** Um `useMemo`
  com deps derivadas de chamada de função (`sc?.part_id` onde `sc = activeScene(session)`)
  dispara "This dependency may be modified later". Solução: UM `useMemo` keyed em
  `[session]` (ref estável entre frames de playback) derivando tudo — cena ativa,
  frases da cena, `segments`/`lockedEndBeads`. Mais limpo e some o warning de complexidade.
- **CI roda `pnpm test` E `pnpm test:browser`** no mesmo job `test` (ci.yml L87–90) —
  o browser É check obrigatório. Toda estação nova precisa do trio jsdom + um
  `*.browser.test.tsx` em Chromium real (a geometria do colar só existe com layout).
  Para o browser test da cena em janela, use uma cena começando na conta 0 (winS=0)
  p/ o `beadPosition(index, 0, ...)` casar com o `firePointer` como na Escuta 2.

## adapters/voice — VoiceRecorder (verificado 2026-07-10, ENG-244)

- **Reuso de path builder (ladder rung 2)**: o caminho canônico `respostas/level{1,2,3}/…/<k>.webm`
  já existe em DUAS camadas — `voiceAnswerPath(slot)` (@/domain/mapping.ts, §10.4/O5)
  monta e `ResourcePathSchema` (@/contracts/api.ts) valida (regex `[a-z0-9_]+`, PT#/P#).
  `adapters/voice/path.ts` só compõe os dois (`ResourcePathSchema.parse(voiceAnswerPath(slot))`) —
  NÃO reinventa. Adapters podem importar domain+contracts (depcruise permite).
- **Persistência desacoplada por `VoiceResourceStore` (put/get/has/delete)**: o recorder
  nunca conhece o SessionStore diretamente. Fixture/registry usam `MemoryVoiceStore`
  (Map, cópias defensivas §10.5). Em produção a estação Conversa (ENG-249) liga um store
  apoiado nos recursos da SESSÃO ATIVA do SessionStore. **GOTCHA/follow-up**: SessionStore
  só expõe `putResource`/`getResource`/`listResources` — NÃO tem `deleteResource`. O port
  do voice PRECISA de `delete` (DoD). Logo a ligação real + `deleteResource` no SessionStore
  ficam para ENG-249; por ora o registry usa MemoryVoiceStore como placeholder (mesmo espírito
  do esqueleto HttpSessionStore). `has` sobre SessionStore = `listResources(id, path).includes(path)`
  (o prefixo `startsWith` casa o caminho inteiro).
- **Retorno covariante p/ o hook de teste**: `FixtureVoiceRecorder.start` devolve
  `Promise<FixtureRecording>` (não o `Recording` do port) — TS aceita subtipo no retorno,
  e assim o teste alcança o `tick()` (hook determinístico que avança um quadro de nível,
  família LCG do harness; níveis emitem SÓ enquanto `#active`). Sem isso, `recording.tick`
  não existe em `Recording` e o tsc reprova.
- **Testes de adapter rodam no projeto `unit` (node, sem DOM)**: nada de MediaRecorder/
  getUserMedia reais. `WebVoiceRecorder` injeta TODAS as deps de plataforma pelo construtor
  (`getUserMedia`, `MediaRecorderCtor`, `isTypeSupported`, `AudioContextCtor`, `createAudio`);
  defaults leem os globais só se existirem (`typeof MediaRecorder !== 'undefined'`). Caminhos
  de erro testados: sem MediaRecorder → `VoiceUnsupportedError`; `isTypeSupported`=false →
  idem (e NÃO pede microfone); getUserMedia rejeita → `MicPermissionError`. Happy-path
  gravar→parar testado com um `FakeMediaRecorder` (o `.stop()` dispara `ondataavailable`+
  `onstop`) e SEM `AudioContextCtor` (o metering vira no-op → evita `requestAnimationFrame`,
  ausente em node). `Blob([bytes as BlobPart])` — `Uint8Array<ArrayBufferLike>` não casa
  `BlobPart` no strict (SharedArrayBuffer), cast direto resolve.
- **`corepack pnpm exec vitest run --project unit <dir>`** roda um subconjunto (o script
  `test` do package.json não aceita filtro de path e `pnpm vitest` dá `ERR_PNPM_RECURSIVE_EXEC`).
  O worktree do loop.sh NÃO vem com `node_modules` — `corepack pnpm install --frozen-lockfile`
  primeiro (node 22.18 já satisfaz o engine, `fnm exec` desnecessário aqui).

## UI pages / estação Triagem — classificar cenas (verificado 2026-07-10, ENG-236)

- **Redesign §6.4 reformata a lista vertical da referência em UMA cena em foco +
  pontos de progresso.** Precedência CLAUDE.md: dado/comportamento = PRD/referência,
  look/layout = protótipo de design. A referência (`renderTriagem` L1213) lista TODAS
  as cenas com "classificar ▾"; o protótipo (`Colar de Sons - Protótipo` L208–305)
  mostra uma cena por vez, com `ProgressDots` (molécula já pronta) como atalho de salto.
- **`ProgressDots` (ui/molecules) é digit-free por design** (`aria-label="ir para a
cena"`, `aria-current="step"`), mas NÃO tem prop de "concluído" — o check dentro do
  ponto classificado do protótipo fica de fora (molécula fora de escopo). O estado da
  tag sempre visível (`tagShow`) dá o mesmo feedback por cena.
- **Auto-avanço do foco:** após classificar/none-fit, salta para a próxima cena
  pendente dando a volta (`_nextPending` do protótipo L711/L723). Reduz cliques e é
  testável (o ponto seguinte ganha `aria-current`).
- **O gate compõe `gates.setMode(s,'segmentacao')` + `phrases.enterSegmentacao(s)`.**
  `setMode` puro só troca `mode`/`review`/`partsConfirmed`; a ENTRADA de camada
  (activeSceneId + enterScene) é `enterSegmentacao`, e SÓ deve rodar quando o modo
  efetivo é segmentacao (há produtiva) — sob o gate habilitado (≥1 produtiva) o ramo
  é garantido. Espelha o bloco L1006–1008 da referência. Sem isso, a estação
  Segmentação abre nula (activeScene null).
- **Organismos fora do barrel:** `TriagemPicker`/`CoverageDrawer` (ENG-225) NÃO estão
  em ui/organisms/index.ts (barrel congelado). A página os importa por caminho direto
  — depcruise permite page→organism em qualquer caminho (só regula direção de camada,
  não uso do barrel).
- **`CoverageDrawer` é auto-contido:** Radix Dialog com trigger próprio, fechado por
  padrão → nada da gaveta (nem dígitos de contagem) entra no DOM até a facilitadora
  abrir. Satisfaz "só abre por ação explícita" + minimalismo §9.2 sem trabalho extra
  na página.
- **none-fit finding vs all-none-fit lockout:** `computeCoverage` dá `noneFit` e
  `allNoneFit`. Finding (noneFit>0) mostra a frase-contrato "evidência para nomear um
  tipo nativo quando o padrão se repetir"; lockout (allNoneFit) explica o travamento
  a jusante. Ambos digit-free (a referência L1300–1302 carregava contagens).
- **Sem browser test:** Triagem não renderiza `Necklace` → sem geometria dependente
  de layout; a suíte jsdom cobre tudo. A exceção "toda estação nova precisa de
  *.browser.test.tsx" vale só p/ estações com o colar (geometria de clique).

## ENG-222 — session-list + artifact-cards (organismos do dashboard)

- **Adoção de órfão (2º caso, após ENG-225):** trabalho anterior de qualidade morreu
  sem push em branches locais baseadas em main antiga. O diff dessas branches contra a
  main atual parece apagar meio repo — é ilusão do base velho, não deleção real. Padrão
  seguro: extrair SÓ os diretórios novos com `git checkout <branch> -- <dir>` (não
  rebasear a branch stale inteira), conferir que os imports batem com as assinaturas
  atuais de atoms/molecules, então descartar as branches. Barato e sem conflito.
- **Nome acessível composto sem `aria-labelledby`:** a ação do card usa verbo visível
  ("Retomar"/"Abrir") + um `<span>` visually-hidden com o título dentro do MESMO botão.
  O texto clip-hidden contribui para o nome acessível (não `display:none`), então o
  leitor de tela ouve "Retomar A história de Rute". Uma única interativa por card,
  nunca aninhada — teste afirma exatamente 1 button e 0 links por card.
- **Live region tem de PRÉ-existir (WCAG 4.1.3 / ARIA22):** o `role="status"` do chip
  de conclusão é montado desde o 1º render e vazio; só o texto entra quando os 3
  documentos são baixados. Uma região viva montada JUNTO com sua mensagem não é
  anunciada — por isso o container fica sempre no DOM e só o filho aparece.
- **Organismo espelha o shell, não importa:** `SessionStationGlance` reproduz a forma
  do `StepperStationView` (@/ui/app) em vez de importá-lo — organismos não podem depender
  da camada de wiring (depcruise). Quem chama traduz o estado do shell nas props do
  relance; `lastModified` chega já formatado (organismo não faz data).
- **Barrel congelado, de novo:** session-list/artifact-cards NÃO entram em
  ui/organisms/index.ts (precedente ConnectionGate/ENG-224). As páginas Dashboard
  (ENG-245) e Export (ENG-246) os compõem por caminho direto — depcruise só regula
  direção de camada, não uso do barrel.

## UI pages / estação Conversa (Mapeamento) (verificado 2026-07-10, ENG-249)

- **A ordem das telas é do domínio, não da UI.** `questionSequence(state)` (@/domain/mapping.ts)
  já entrega a sequência plana (11 L1 → 5 L2 por `lockedParts`, none_fit incluída → 5 L3 por
  `productiveFrases`). A página só anda um índice sobre essa lista — não recria a ordem. Um
  índice plano reproduz EXATAMENTE a navegação da referência (`mapNav` L1099–1133) sem casos
  especiais por nível: última L1 → primeira L2, primeira L2 "anterior" → última L1, etc. são
  só índice±1. Fronteiras: índice 0 "anterior" → `setMode('segmentacao')`; último "próxima" → relatório.
- **Navegação é andaime de tela — o domínio NÃO guarda `mapStep`.** @/domain/state.ts omite
  `mapStep`/`mapN*i` de propósito (comentário no topo: "andaime de tela"). Logo o índice da
  pergunta e o flag `atReport` são estado local React, como o `head`/`offer` da Segmentação.
- **Resetar estado ao trocar de pergunta = `key`, não efeito.** O gravador (idle/recording/recorded
  - levels) vive num filho `QuestionScreen` montado com `key={path}`. Trocar de pergunta remonta →
    estado limpo pela regra de key do React. Isso EVITA o eslint `react-hooks/set-state-in-effect`
    (setState síncrono no corpo do efeito é ERRO de lint, não warning). A checagem inicial
    `recorder.has(path)` fica no `.then` assíncrono (padrão permitido: setState em callback).
- **`react-hooks/static-components` é ERRO:** resolver um componente durante o render (`const X =
glob()[...]; <X/>`) reprova o lint. Como o `import.meta.glob` é eager+estático, resolvi a station
  `relatorio` UMA vez em escopo de módulo (`const RelatorioStation = ...`) e renderizo condicional.
- **Handoff mapeamento→relatório é add-a-file, desacoplado.** O relatório (ENG-250) é um dir
  `ui/pages/relatorio/` mas NÃO está no stepper (@/ui/app/stepper-model.ts só tem
  escuta1/2·triagem·segmentacao·mapeamento·export) nem no `KEY_TO_MODE` — o shell mostra UMA station
  para o modo `mapeamento`. Então a página de mapeamento é dona do sub-passo "relatório" e o
  resolve por `import.meta.glob('/ui/pages/relatorio/index.tsx')` local (evita importar @/ui/app de
  uma página e evita hard-import de um módulo que ainda não existe → typecheck verde antes de ENG-250).
- **Voz: a porta persiste; a página não guarda bytes no domínio.** `voiceAnswerPath(slot)` (do
  domínio) dá o caminho canônico; `recorder.start(path)`/`stop()` persiste no `VoiceResourceStore`
  do adapter (fixture: `MemoryVoiceStore`). "Existe gravação?" = `recorder.has(path)`. Ligar o
  recorder aos recursos da sessão ativa do SessionStore é follow-up (adapters, fora do escopo desta issue).
- **`player`/`recorder` chegam por prop, default null** (mesma convenção de escuta/segmentacao): no app
  atual o shell injeta um player no-op → áudio/voz dormentes até a issue de setup/integração. Testes
  injetam `spyPlayer()` e o `FixtureVoiceRecorder` real (import direto de @/adapters/voice/fixture nos testes).
- **`ConversationStage` já está no barrel** (ENG-221), mas importei direto do arquivo (barrel
  congelado, precedente ENG-225/236). O organismo NÃO traz o ▶ do span ("ouvir a X") nem o TTS —
  o ▶ é controle da página (como "▶ ouvir a cena" da Segmentação); o TTS ("Ouvir a pergunta") só
  aparece se `onSpeakQuestion` for passado (ausente até a issue de TTS).

## UI pages / estação Export — conclusão & custódia de artefatos (verificado 2026-07-10, ENG-246)

- **Artefatos construídos UMA vez, reusados (§10.5):** o `useMemo` de `triple`
  (`serializeArtifact(buildManifesto)`, `serializeArtifact(buildRetorno)`,
  `buildMapReport(session, voice)`) é a ÚNICA origem dos bytes. `store.complete`
  guarda esse mesmo objeto opaco e `getArtifacts` o devolve idêntico ao dashboard;
  os downloads emitem `triple[kind]`. Byte-identidade sai de graça: complete e
  download partilham o objeto — nenhum rebuild por download.
- **A meta fora do domínio some no caminho até o Export.** O `ui/state` guarda só o
  `SessionState` do domínio; `toSessionDto(state, meta)` EXIGE `SessionMeta`
  (granularidade/bucket/voice/consent). A página recupera a meta relendo o DTO
  persistido (`store.load(id)`) no mount — try/catch (fronteira de IO) cai em default
  se nunca salvo. Consequência: o `complete` só é fiel à meta se a sessão já foi
  autosalva; os testes da DoD só afirmam artefatos+status, então default basta ali.
- **Máquina de fases `loading→edit|saved` a partir do STATUS do adapter.** `store.get(id).status==='concluida'`→`saved` (revisão): revisitar uma sessão
  concluída abre em revisão com "Destravar para editar"→`store.reopen` (NÃO o
  `unlock` da UI store, que é o lock consultivo da segmentação). `edit` mostra
  "Concluir e guardar os documentos", desabilitado sem `whole.confirmed`.
- **Gates 1:1 da referência (index.html L1331–1337).** retorno: `retornoExportStatus(state).canExport` (=`whole.confirmed`); bloqueio→cópia exata
  "Confirme o colar antes de exportar."; aviso `semFim` literal "N frase(s) ainda
  sem fim travado." (o "(s)" é literal na referência, não pluraliza). manifesto:
  no-op silencioso sem `canExportManifesto` (`totalBeads>0`).
- **`saveBytes(filename, bytes)` é a fronteira de download injetável.** Default =
  Blob+objectURL+anchor (só roda no browser real; jsdom não tem `createObjectURL`);
  os testes injetam um spy p/ afirmar identidade de bytes. Nome de arquivo via
  `retorno/manifesto/relatorioFilename(slug)` (prefixado por slug) — distinto dos
  filenames de EXIBIÇÃO sem prefixo dentro do organism `ArtifactCards`.
- **A estação NÃO fica alcançável no shell ainda.** O slot `export` do stepper existe
  mas `reachable=false` e `App.tsx KEY_TO_MODE` não tem `export` (não há `Mode` de
  export no domínio). Ligar a estação (roteá-la + passar store/id) é edição de SHELL,
  fora do Scope do ENG-246 → follow-up. A página é coberta 100% pelos testes jsdom
  que injetam `FixtureSessionStore` + `sessionId`.
- **Discrepância de cópia herdada (fora de escopo):** o chip de `ArtifactCards`
  (ENG-222, mergeado) ainda diz "documentos salvos — nada saiu deste computador"
  (custódia local v1), mas o PRD v2 §5 é custódia em nuvem e o ENG-246 pede NÃO usar
  essa linha. O organismo é out-of-scope aqui → follow-up para corrigir o chip.

## UI pages / estação Relatório — cartões editáveis + nota + export (verificado 2026-07-10, ENG-250)

- **Onde a nota da facilitadora vive sem tocar camada congelada.** O domínio
  `Mapping` só tem buckets `level1/2/3` de resposta e é FROZEN; não dá para
  adicionar um campo `note`. Solução em escopo: a nota mora no MESMO bucket da
  resposta sob uma chave reservada `nota__<k>` (via `setAnswer` com um slot cuja
  `k` é prefixada). Funciona porque (a) `MappingSchema` (contracts/session-state)
  é `strictObject` só no topo — cada bucket é `z.record(string,string)`, chaves
  livres → a nota sobrevive ao round-trip do DTO/autosave; (b) `buildMapReport`
  itera APENAS as chaves de `L1_Q/L2_Q/L3_Q` → a nota NUNCA sai no `.md`. Byte-
  identidade do relatório antes/depois de anotar sai de graça. Zero edição em
  domain/contracts.
- **Duração de voz é um GAP do port (follow-up).** O redesign §6.6 pede a linha de
  voz "play + waveform + duration", mas a porta `VoiceRecorder` (ENG-244) só expõe
  duração no `stop()` fresco (`RecordedAnswer.durationSec`), NÃO para uma gravação
  já salva — não há `duration(path)`. O wiring da issue assumia "VoiceRecorder para
  playback + duração", mas o adapter mergeado não entrega isso e adapters/voice está
  fora do Scope desta issue. A linha renderiza o slot de duração (`aria-label=
"duração da resposta"`) com placeholder `—`; follow-up = adicionar `duration(path)`
  ao port OU persistir a duração no momento da gravação (Mapeamento).
- **`voiceSet` alimenta duas coisas.** Um efeito sonda `recorder.has(path)` para toda
  pergunta e guarda o conjunto de caminhos COM gravação: decide a linha só-voz E é o
  2º arg de `buildMapReport(mapped, voiceSet)` (o .md referencia a gravação, §10.4).
  Sem recorder o conjunto fica vazio → `buildMapReport(session)` byte-idêntico à
  referência. Sem setState síncrono no efeito (react-hooks/set-state-in-effect):
  early-return quando não há recorder (estado inicial já é vazio).
- **Superfície FACILITADORA (§7.2), não do ouvinte.** Diferente das estações do
  ouvinte, o relatório PODE ter dígitos/IDs — cabeçalhos "Cena N"/"Frase N",
  scene_kind, seções por nível. Nada de guarda §9.2 aqui.
- **Gate do atalho .json 1:1 da referência (renderMapReport L1150).** O botão "Baixar
  a ancoragem (.json)" é `disabled` + guard por `whole.confirmed`; baixa
  `serializeArtifact(buildRetorno(mapped))`. O `.md` reusa `buildMapReport` +
  `relatorioFilename`; download real pela fronteira injetável `saveBytes` (mesmo
  padrão da estação Export/ENG-246).
- **Teste de fundo creme via CSS `?raw` removido.** As estações irmãs afirmam o
  token creme com regex sobre o texto-fonte do CSS (`?raw`); a revisão de TDD desta
  sessão apontou (com razão) que isso testa formato de arquivo, não comportamento —
  jsdom não aplica CSS. Cor real pertence a teste visual/browser (fora de escopo).
  Removido; o creme fica no `.css` (não unit-testado).
- **ENG-232 — variante animada do guia (padrão add-a-file variant-glob).** O upgrade
  do storyteller-guide é PURAMENTE aditivo: só `variants/animated.tsx`+`animated.css`
  novos; o glob `import.meta.glob('./variants/*.tsx')` do `index.tsx` (intocado) já
  prefere `animated` sobre `static` via `pickVariantPath`. GOTCHA (mesmo do ENG-231):
  esse glob `*.tsx` engoliria um `animated.test.tsx` irmão e o importaria como
  variante no bundle → o teste MORA em `variants/__tests__/` (o `*` do glob não
  cruza `/`). Movimento (bob/blink em repouso + lip-sync do lábio) é 100% CSS atrás
  de `@media (prefers-reduced-motion: no-preference)`; sob `reduce` a figura fica na
  MESMA pose parada da estática — provado por texto do css com `splitByGuard` (mesmo
  padrão de `pearl.css`), não por avaliação de media query (jsdom não avalia). O
  lip-sync é dirigido por dado, não por prop no CSS: `AnimatedGuide` emite
  `data-speaking={speaking?'true':'false'}` e a regra `.cds-guide-anim[data-speaking='true'] .cds-guide-mouth`
  é a ÚNICA animação do lábio → "anima só quando falando" verificável no texto do css.
  SVG anima via `transform` com `transform-box: fill-box` (bob no grupo, pálpebras
  `.cds-guide-lid` recolhidas em `scaleY(0)` que fecham no piscar).
- **ENG-251 — adapter OPCIONAL com "ausência graciosa" via `register.ts` = `null`.**
  Um adapter cuja porta só existe em alguns ambientes (aqui: Web Speech API) não
  precisa de nenhum mecanismo novo — `buildAdapterRegistry` (@/ui/app/registries.ts)
  já guarda com `if (mod.default?.port)`, então basta o `register.ts` fazer
  `export default supported ? { port, fixture, real } : null`. Sem a API, a porta
  'tts' simplesmente não entra na registry e o botão "Ouvir a pergunta" (plumbado
  na estação Conversa) fica oculto por AUSÊNCIA DE PORTA, não por prop. O
  feature-detect (`speechSynthesisSupported`) lê `globalThis` por default →
  no projeto `unit` (environment node, sem `speechSynthesis`) o default export de
  register.ts é `null` por padrão; o teste do caminho "suportado" precisa de
  `vi.stubGlobal('speechSynthesis'/'SpeechSynthesisUtterance', …)` + `vi.resetModules()`
  ANTES do `await import('./register')` (o ternário roda em tempo de carga do módulo).
- **Web Speech API é injetável como qualquer fronteira.** `WebSpeechSynthesizer`
  recebe `synth`/`UtteranceCtor` opcionais (default = os globais, guardados por
  `typeof … !== 'undefined'`), então testes de nó exercitam cancelar-antes-de-falar,
  preferência de voz pt-BR→pt-*→padrão, e as transições de "falando" chamando
  `utterance.onstart()/onend()` no fake — sem síntese real. Num ambiente sem a API,
  `speak`/`stop` são no-ops silenciosos (a porta nunca é registrada nesse caso, mas
  o guard protege construção direta em testes).

- **ENG-271 — `VoiceRecorder.duration(path)` p/ gravação salva.** A porta `stop()`
  já devolvia `RecordedAnswer.durationSec` de uma gravação FRESCA, mas o relatório
  precisa da duração de uma gravação JÁ persistida (só tinha `has`/`play`). Escolhi a
  abordagem 1 da issue (novo método na porta), contida em `adapters/voice`: o
  fixture não pode "recuperar" a duração dos bytes (o placeholder WebM é estático de 9
  bytes), então rastreia `caminho→segundos` no `stop()` via callback `onPersist`
  (relógio falso `FRAME_SEC=0.1`); o web decodifica os bytes reais por
  `AudioContext.decodeAudioData` (Web Audio, injetável p/ testar sem microfone com um
  stub `{duration}`). Decidi `decodeAudioData` em vez de `<audio>.duration` porque é
  leak-free (`ctx.close()` no `finally`, sem `URL.createObjectURL` pendurada como no
  `createAudio` de playback) e trivial de stubar deterministicamente. Caminho ausente
  → `store.get` lança ANTES do guard de Web Audio (o teste do ausente não precisa de
  AudioContext). Consumo no relatório: o MESMO efeito que sonda `has` agora lê
  `duration` (mantém 1 efeito, sem `set-state-in-effect`); formatação `m:ss` local.
  Coverage: `adapters/` não tem piso numérico (testado contra fixtures), então o ramo
  `return 0` sem Web Audio fica sem teste dedicado (guard de degradação graciosa,
  padrão dos erros tipados da porta) — proposital, não gaming de gate.

## UI pages / Login + Dashboard (verificado 2026-07-10, ENG-245)

- **O shell JÁ roteia login/dashboard — a issue só ADICIONA arquivos.** @/ui/app/App.tsx
  renderiza `stationKey='login'` para `/login` e `'dashboard'` para `/`+`/dashboard`
  via o glob `import.meta.glob('/ui/pages/*/index.tsx')` (@/ui/app/registries.ts),
  passando `<Station />` SEM props. Então bastou criar `ui/pages/login/index.tsx` e
  `ui/pages/dashboard/index.tsx` com `export default` — nenhuma edição de shell
  (Scope). Navegação pelo router mínimo History-API (@/ui/app/router.ts): `navigate`
  faz push+notify à mão (pushState não dispara popstate); `usePathname` via
  `useSyncExternalStore`. Pages PODEM importar `../../app/router` e outras pages
  (depcruise só barra organisms/atoms/molecules→adapters; pages/templates/app são a
  camada de wiring). Sem ciclo: router não importa pages.
- **Singletons de porta COMPARTILHADOS entre as duas telas (`dashboard/ports.ts`).**
  A `AuthProvider` que o Login usa para entrar tem de ser a MESMA que o Dashboard
  observa em `onAuthExpired` (§7.1 — expiração volta ao login). Por isso um único
  módulo (`ports.ts`) exporta `defaultAuth()`/`defaultSessionStore()` memoizados
  (fixture), e o Login importa `defaultAuth` de `../dashboard/ports`. Resolvi as
  fixtures DIRETO (`new FixtureAuthProvider()`/`new FixtureSessionStore()`), NÃO via
  `buildAdapterRegistry` — evita o ciclo `registries→(glob)→pages→registries` e a
  seleção real por ambiente é wiring do composition root (ENG-247). Defaults são
  produção-only e ficam SEM cobertura de propósito (os testes injetam as portas;
  `ui/` não tem piso de coverage).
- **"Nova sessão" → `navigate('/setup')`, mas o router NÃO conhece `/setup` ainda.**
  `matchRoute` só casa `/login`, `/dashboard`, `/session/:id` (o resto → `unknown` →
  o shell cai em `dashboard`). Setup (§8.1) é pré-sessão e não tem rota. Como o shell
  está fora do Scope, o botão só dispara a navegação; ROTEAR `/setup`→estação Setup é
  follow-up de shell (junto de ENG-243 Setup), mesmo padrão do ENG-246 Export que
  adiou seu wiring. O teste afirma o alvo da navegação (`pathname==='/setup'`).
- **GOTCHA — adicionar a página `dashboard` quebrou um teste do SHELL.** `App.test.tsx`
  tinha "rota sem estação construída cai no fallback" que renderizava `<App />` em `/`
  e esperava "estação em construção" — assumindo que `dashboard` NÃO estava construída.
  Assim que a page existe, o glob resolve a chave e a rota abre o Dashboard. O fallback
  em si já é coberto por `station-host.test.tsx` (registry vazio); reapontei o teste do
  App para afirmar que o shell resolve a estação da rota (heading "Minhas sessões").
  Regra global de CI ("fix any ci issues even if you did not cause them") > o Scope de
  fonte, e o shell foi projetado para pages só ADICIONAREM arquivos — o teste era o
  ponto frágil.
- **Nomes de história aparecem 2–3× no DOM.** O `SessionCard` põe o nome no `<h3>` E
  num `<span vh>` do botão (nome composto APG "Retomar <história>"), e o grupo de
  download repete no `<h2>`. `getByText(nome)`/`findByText` LANÇAM por múltiplos →
  usar `findAllByText`, ou ancorar pelo filename único do card (`retorno-ancoragem.json`),
  ou por `role/heading`. Data formatada via `toLocaleString('pt-BR',{dateStyle,timeStyle})`
  exportada (`formatWhen`) p/ o teste recomputar o esperado sem hardcode de fuso.
- **Botão de submit do Login = `<button type="submit">` nativo, NÃO o atom `Button`.**
  O atom é `type="button"` (não submete) — para Enter-submeter o formulário de
  credenciais (dois inputs) é preciso um submit nativo; estilizei `.cds-login-submit`
  no próprio css (evita acoplar ao contrato `data-variant` interno do atom).
  Erro só de credencial (`AuthError`) vira orientação PT-BR; qualquer outra falha sobe
  (fronteira de sistema, sem mascarar).

## ENG-243 — estação Setup (criação de sessão)

- **Radix `@radix-ui/react-radio-group` em jsdom: seta move o FOCO (roving), mas NÃO
  auto-seleciona.** `ArrowRight`/`ArrowDown` movem o foco entre os itens (e dão
  wrap), porém `aria-checked` só muda quando o item focado recebe `Espaço`/`Enter`.
  (Num browser real a seta seleciona; é uma divergência do jsdom.) Um teste de
  navegação por teclado deve afirmar `document.activeElement` após a seta E `' '`
  (Espaço) para confirmar a seleção. Verificado com dump por `process.stderr.write`
  (o `console.log` do vitest fica suprimido por default).
- **Hashes manifest_id conhecidos das fixtures do bucket** (PCM LCG determinístico,
  fórmula do domínio `hashPCM`): `conto-do-boto` (seed 101, 24000 amostras, 8000 Hz)
  → média 0.25 s = `fnv1a32:e8442b84`, pequena 0.15 = `fnv1a32:8bf70020`, grande 0.5
  = `fnv1a32:9943a4ff`. Servem de valor de referência independente nos testes de UI
  (o hash entra tanto no `createSession` quanto no `CreateSessionInput`).
- **`SessionStore.create` NÃO persiste estado — só o resumo.** `create(input)` grava
  um `SessionSummary` (id + nomes + `current_step:'ouvir'`) e nada de grade/DTO. Para
  a sessão ser retomável/exportável, o Setup persiste o estado inicial com
  `store.autosave(id, toSessionDto(state, meta))` + `await store.flush(id)` logo após
  criar (o Export relê o meta pelo DTO persistido — sem isso, granularidade/consent/
  áudio se perdem). `meta = { granularityLevel, bucketAudioId, voice: [], pipelineConsent }`.
- **Landing em Escuta 1 é derivado do domínio, não roteado.** `createSession` nasce
  `mode='escuta'` + `whole.confirmed=false` → `stepperStations`/`currentIndex` do shell
  resolvem a estação `escuta1`. O Setup só faz `sessionStore.getState().load(state)`
  (instala a sessão viva; `load` ignora o gate `canEdit`, ao contrário de `apply`) e
  `navigate('/session/:id')`. O shell lê a sessão do `ui/state` singleton — se estiver
  null na rota `/session/:id`, mostra "carregando a sessão…".
- **Slug/título = campo único (fiel à referência `segment()` L457).** Sem slugificação:
  `title.trim() || filename.replace(/\.[^.]+$/,'') || 'colar'`, e o mesmo valor vira
  `storyName` E `storySlug` E `slug` do domínio. O `<input type="text">` é o único input
  de texto; NÃO há `<input type="number">` (o campo "Segundos por conta" do v1 foi
  removido — granularidade por nível só).
- **`/setup` continua sem rota (confirmado).** Página auto-contida com `ports.ts`
  (4 fixtures) + `navigate` injetável; rotear no shell é follow-up (padrão ENG-246).
  As portas de importação navegam para `/imports` (fallback do shell até ENG-248).

## Shell: cauda Guardar/Export alcançável + injeção de portas (verificado 2026-07-11, ENG-270)

- **Não há modo `export` no domínio** (`Mode = escuta|triagem|segmentacao|mapeamento`,
  congelado). Entrar na cauda "Guardar" é concern do SHELL: `App` guarda um estado
  local `viewingExport` (clique na conta Guardar → true; navegar p/ qualquer outra
  estação → false + `setMode`). `stepperStations(state, {viewingExport})` marca Guardar
  como `current`. Reachability de Guardar = `modeLocks().mapeamento` (mesmo gate da
  Conversa: história confirmada + ≥1 frase travada em cena produtiva) — antes era
  `false` hardcoded.
- **Injeção de portas nas páginas**: `StationHost` ganhou `stationProps?` opcional
  repassado ao componente resolvido (`registry[key]` castado p/ `ComponentType<Record>`
  — React ignora props desconhecidas em estações sem elas). Só a Export precisa: o shell
  passa `{store, sessionId}` (id da rota). Padrão para futuras páginas com wiring.
- **`ui/app/session-adapter.ts`** = `appSessionStore()`: UM singleton do adapter
  `sessions` (`buildAdapterRegistry().sessions.fixture()`; real por ambiente = ENG-247).
  `ui/app` PODE importar adapters (App.tsx já importa connectivity; depcruise permite).
- **LIMITAÇÃO conhecida (fragmentação de store)**: Setup e Dashboard resolvem SEUS
  PRÓPRIOS `FixtureSessionStore` em `ports.ts` (não compartilham `appSessionStore()`).
  Logo uma sessão criada no Setup NÃO está na store injetada na Export → no app real a
  Export fica em `phase='loading'` (o `store.get` rejeita silenciosamente no efeito
  async). Unificar (apontar setup/dashboard p/ a store app-global, OU carregar a sessão
  por id na rota `/session/:id`) é edição de `ui/pages`/fluxo, FORA do escopo ui/app-only
  do ENG-270 → follow-up p/ ENG-247/ENG-252 (que dirigem setup→export ponta a ponta).
- **Teste de shell ponta-a-ponta em fixture**: `App.test` semeia `appSessionStore().create`,
  carrega estado completável no `sessionStore` (ui/state), navega `/session/:id`, clica
  Guardar (delegação do `<ol>` só dispara em `reachable`), aguarda o efeito async da Export
  (`findByRole` no botão "Concluir…") e conclui → `store.get(id).status==='concluida'`.
  Builders toleram estado forjado: `buildMapReport` usa `state.mapping ?? EMPTY_MAPPING`;
  `retornoExportStatus.canExport = whole.confirmed`.
- **BUG do 1º corte (pego em code-review) + fix**: `viewingExport` como estado do `App`
  VAZAVA entre sessões — `App` nunca remonta na troca de rota (o router é hook, sem `key`),
  então após ver a Export na sessão A, abrir a sessão B (que nem chegou ao gate) ainda caía
  na Export (o `ci=last` do `viewingExport` ignora `reachable`, contornando o guard do
  Stepper que só dispara `onNavigate` em alcançável). Fix idiomático: extrair o corpo da
  sessão p/ um filho `SessionStations` remontado por `key={sessionId}` → trocar de sessão
  zera o flag. NÃO usar `useEffect(()=>setX(false),[route.id])` nem reset em render: ambos
  disparam os lints-ERRO `set-state-in-effect`/`set-state-in-render` (React Compiler) — a
  remontagem por `key` é o padrão sancionado (React docs "resetting state with a key"). Teste
  de regressão: ver Export em A → navegar p/ sessão nova → headline "A história está inteira
  no colar." AUSENTE.

## ENG-272 — shell setup→sessão→export ponta a ponta (composition-root wiring)

- **Diagnóstico confirmado (4 quebras de wiring, todas fora de domain/contracts):** (1) `/setup`
  não era rota → o botão "Nova sessão" trocava a URL mas re-renderizava o Dashboard (rota
  desconhecida cai no dashboard em `App.tsx`); (2) Setup, Dashboard e Export usavam TRÊS
  `FixtureSessionStore` distintas (setup/ports.ts, dashboard/ports.ts, session-adapter.ts) →
  a sessão criada no Setup não aparecia no `list()` do Dashboard nem no `get()` da Export
  (`SessionNotFoundError` fora do try→travava em `phase=loading`); (3) sem persistência →
  nenhum store recebia `storage`, então reload/retomada em `/session/:id` ficava eterno em
  "carregando a sessão…"; (4) `store.get` da Export estava FORA do try/catch.
- **Store única com persistência:** `appSessionStore()` (ui/app/session-adapter.ts) passou a
  construir DIRETO `new FixtureSessionStore({ backend: new FixtureSessionBackend(localStorage) })`
  em vez de `buildAdapterRegistry().sessions.fixture()` — o adapter fixture do register.ts não
  aceita storage e mudá-lo é fora de escopo (adapters/). O backend hidrata do localStorage na
  construção e espelha a cada escrita (`fixture.ts` já suportava — era só WIRING). setup/ports.ts
  e dashboard/ports.ts `defaultSessionStore()` agora retornam `appSessionStore()`.
- **Reidratação no shell:** `useSessionHydration(routeId)` em App.tsx — quando `/session/:id`
  monta e o `ui/state` está vazio (reload/resume), carrega o DTO do store app-global e injeta o
  estado via `fromSessionDto(dto).state` (contracts já expõe o inverso de `toSessionDto`). Um
  `useRef loadedId` evita recarregar por cima da sessão viva que o Setup já carregou E refaz a
  carga ao TROCAR de sessão (SessionState do domínio NÃO tem o id — o guard é por routeId, não
  por comparar `session!==null`, que grudaria a sessão A ao abrir a B). `.catch(()=>null)` no
  load: se o estado nunca foi salvo (sessão só-summary), não clobbera o ui/state.
- **Rota /imports:** a estação imports JÁ existe (ENG-248 Done) mas não era roteada. Em vez de
  hardcodar, o branch não-session do App resolve rota desconhecida pelo 1º segmento do path →
  `/imports`→estação imports; chave sem página cai no fallback "em construção" do StationHost.
  `/setup` é rota nomeada explícita no router (matchRoute).
- **Gotcha de teste (act):** um teste que renderiza a estação Setup via App precisa aguardar o
  efeito async do bucket (`await findByRole("radio", {name:/conto-do-boto/})`) antes de asserir,
  senão a promessa da listagem resolve fora do act. A estação imports sem sessão viva mostra só
  "Abra uma sessão para carregar arquivos do pipeline." (o `<h2>` só aparece com sessão).
- **Desbloqueia ENG-252** (E2E acceptance-1) e transitivamente E6 (253–258).

## ENG-273 — shell: autosave contínuo + gravador de voz no Mapeamento (últimos 2 wirings do root)

- **Bloqueador A (autosave nunca ligado):** o singleton `sessionStore` (ui/state) nasce no
  import com `deps.autosave` = no-op; `apply()` chama `deps.autosave?.(next)` mas nada
  persistia fora do Setup (DTO inicial) e do Export (complete). Fix mínimo respeitando a
  fronteira depcruise (ui/state NUNCA importa adapters): novo método de runtime
  **`setAutosave(fn|undefined)`** que só faz `deps.autosave = fn` (deps é o objeto do closure,
  mutável). O composition root liga a porta DENTRO de `useSessionHydration`, no mesmo ponto em
  que já tem o DTO carregado → captura o `meta` de `fromSessionDto(dto)` e injeta
  `setAutosave(live => appSessionStore().autosave(routeId, toSessionDto(live, meta)))`. Assim
  cada mutação do domínio autossalva o estado INTEIRO. Um construtor-arg não serve: o singleton
  é criado antes de os adapters existirem — daí o setter.
- **Flush do debounce:** o adapter de autosave debounce 800ms (`adapters/sessions/autosave.ts`),
  então uma decisão feita instantes antes do reload ficaria só na fila. `useAutosaveFlush(routeId)`
  faz `appSessionStore().flush(routeId)` no evento `pagehide` (reload/fechar aba) e no cleanup ao
  TROCAR de sessão. Dep do efeito = `routeId` (string), NÃO o objeto `route` (identidade nova a
  cada render → re-registraria/flush a cada render). O flush é no-op se a fila está vazia/offline.
- **Bloqueador B (recorder morto no Mapeamento):** `stationProps` no `SessionStations` só cobria
  `export` → mapeamento recebia `recorder=null` e o microfone era controle morto. Fix: resolver
  `buildAdapterRegistry().voice.fixture()` UMA vez (useMemo) e estender o `stationProps` com um
  ramo `currentKey === 'mapeamento' ? { recorder } : ...`. O `FixtureVoiceRecorder` é 100%
  headless (start/stop resolvem na hora, blob WebM estático) — só faltava ligar. Persistir os
  recursos de voz por sessão (`respostas/...webm`) no SessionStore fica follow-up: `meta.voice`
  autossalvado continua `[]` (a DoD não exige voz sobreviver ao reload, só o mic gravar in-session).
- **Gotcha de teste (reload path):** o teste do autosave dispara `window.dispatchEvent(new Event('pagehide'))`
  e usa `waitFor` para aguardar o flush assíncrono (o handler é fire-and-forget `void flush()`),
  comparando o DTO persistido (deep `toEqual`) com o `session` vivo — é exatamente o check da DoD.
- **Desbloqueia ENG-252** (E2E acceptance-1: reload retoma no passo exato + resposta por voz) e
  com ela todo o E6 (253–258).

## ENG-252 — acceptance-1 E2E (ciclo completo em dois assentos, modo fixture)

- **Runner: `@playwright/test` (nova devDep) + `playwright.config.ts` na raiz.** O repo já tinha
  `playwright` (provider do vitest browser mode) mas NÃO o test-runner. Vitest browser mode monta
  COMPONENTES, não serve o app inteiro nem reseta os singletons de módulo (`sessionStore`,
  `appSessionStore`) — então não prova a hidratação-do-localStorage do "segundo assento". Playwright
  Test com um `webServer: vite` + `page.reload()` dá heap novo (singletons zerados) com o
  localStorage sobrevivendo → é o caminho de retomada REAL. Config: `testDir tests/e2e`,
  `testMatch **/*.spec.ts`, chromium bundled (sem `channel`), `webServer` roda `vite --host 127.0.0.1
--port 5173 --strictPort` (Vite `appType:'spa'` faz fallback de index.html em qualquer rota → a
  History API do router funciona sob reload/rota profunda). `reuseExistingServer: !CI`.
- **`vitest` NÃO pega as specs E2E:** os projects unit/dom/browser incluem só `tests/golden/**`,
  `ui/**`. `tests/e2e/*.spec.ts` fica fora → `pnpm test`/`test:browser` intocados.
- **Fronteiras/tsc/lint dos novos arquivos:** depcruise cruza `tests` mas nenhuma regra restringe
  `tests` como `from` (só domain/contracts/adapters/ui) → importar `@playwright/test` e tipos de
  contracts é livre. eslint usa `tseslint.configs.recommended` (NÃO type-checked) → `playwright.config.ts`
  e `tests/e2e/**` não precisam entrar no tsconfig. `.eslintignore`/config JÁ ignoram
  `playwright-report/` e `test-results/`, e o `.gitignore` também (alguém antecipou o E6).
- **Comando do webServer = `vite ...` (sem `pnpm exec`):** o `e2e` roda SEMPRE via pnpm, que põe
  `node_modules/.bin` no PATH dos filhos → o Playwright acha `vite` ao spawnar o webServer, local e no CI.
- **Modelo de clique do colar no Playwright:** clicar `.cds-necklace-bead[data-idx="N"]` (com
  `{force:true}` p/ ignorar bandas sobrepostas) dispara pointerdown no CENTRO da conta; o handler
  DELEGADO no container lê `clientX/clientY` e `beadAtXY` mapeia de volta ao índice N — robusto,
  independe de bpr/largura/janela (contas fora da janela ativa ainda rendem `data-idx`, só ficam dim).
  Escuta 2 = UM clique = FIM da cena (começo pré-costurado); Segmentação = DOIS cliques (começo, fim).
- **Cenário determinístico (áudio `conto-do-boto`, 12 contas):** cenas fim 3/7/11; triagem Apelo/Certeza,
  Chegada/Quase, Nenhum-se-encaixa; frase 0→5 cruza a borda 3 (delta 2 ≤ max(3,25%)=3 → oferta SIMPLES
  "Mover a borda até aqui", cena cresce p/ 0–5, vizinha encolhe p/ 6–7), depois frase 6→7 contida.
  Espelha o golden `seam-small-move` (phraseSelect s:0 e:13 + borderDecision "move").
- **Detecção de nível na Conversa por DADO, não contagem:** o ▶ do trecho é "▶ ouvir a história"
  (N1) / "▶ ouvir a cena" (N2) / "▶ ouvir a frase" (N3). O helper grava voz na 1ª pergunta de cada
  nível e digita uma vez, sem depender das contagens exatas (11 N1 + 5×cena travada + 5×frase). Gotcha
  strict-mode: `getByRole('button',{name:'ouvir'})` casa "▶ ouvir a história" E o "ouvir" de playback
  → usar `{name:'ouvir', exact:true}` p/ o botão de reprodução da gravação.
- **Alcançar o Export:** o Relatório NÃO tem botão "avançar"; a cauda "Guardar" entra pelo fio de
  contas (`<ol aria-label="Progresso da sessão">`, clique delegado por índice do `<li>`), alcançável
  quando `modeLocks().mapeamento` (história confirmada + ≥1 frase travada). Helper clica o `<li>`
  com texto "Guardar". Concluir = "Concluir e guardar os documentos" → swap p/ "Destravar para editar"
  - `summary.status='concluida'` no localStorage.
- **Zero-perda:** `expect.poll` no `state.mode` do DTO persistido (fecha a janela do debounce 800ms do
  autosave) ANTES do reload; captura o `state`; reload; `expect(after).toEqual(before)` + `mode==='segmentacao'`.
  Shape do localStorage `colar-de-sons:sessions:v1` = `{ sessions: [ [id, {summary,state,...}], ... ] }`
  (array de pares de `Map.entries()`, NÃO objeto-mapa) — o DTO fica em `record.state`, `mode` na raiz do DTO.
- **Support layer (`tests/e2e/support/`):** `ColarApp` (page object do fluxo inteiro), `SCENARIO`
  (roteiro de decisões), `readPersistedState/Status` — importados em leitura pelas specs 253–258.
- **Download do dashboard byte-idêntico (ENG-254, acceptance 3):** a conclusão grava os 3 artefatos
  opacos em `record.artifacts` do localStorage (`FixtureSessionBackend.persist()` serializa
  `Map.entries()` → shape `{sessions:[[id,{summary,state,artifacts,lock?}]]}`); `artifacts` = trio
  `{retorno,manifesto,relatorio}` de strings (bytes servidos = bytes guardados, §10.5). Baixar do card
  do Dashboard = clicar o `<button>` "Baixar" dentro do `.cds-document-card` (escopado por
  `.cds-dashboard-download-group`, um por sessão concluída; o card é achado pelo nome de arquivo EXIBIDO
  `retorno-ancoragem.json`/`manifesto-contas.json`/`relatorio-mapeamento.md`, que é fixo, ≠ do filename
  de download). Captura em Playwright: `Promise.all([page.waitForEvent('download'), click])` →
  `download.suggestedFilename()` (afirma `<helper>(slug)` de contracts: `<slug>-retorno-ancoragem.json`
  etc.) + `readFileSync(await download.path())` como Buffer → `buf.equals(Buffer.from(stored, 'utf8'))`
  (bytes crus, sem trim/normalização; o `domSaveBytes` do dashboard codifica a string em UTF-8 no Blob).
  "Sem abrir a sessão": `page.goto('/dashboard')` a partir do Export e afirmar `pathname==='/dashboard'`
  após cada download (o download é Blob/anchor, não navega). Fresh browser context = 1 sessão concluída
  → `group` tem `count(1)`.
- **Identidade byte a byte pela UI real (ENG-253, acceptance 2):** o golden harness prova
  domain+contracts = referência; ESTE spec (`tests/e2e/contract-identity.spec.ts`) fecha a
  última fresta — o fio da UI (Setup→…→Export) não introduz divergência de serialização/estado.
  Reproduz DOIS casos golden dirigindo o app real e compara os downloads da estação Export
  contra `tests/golden/expected/<caso>/*` com **bytes crus** (`Buffer.equals`, sem trim). Resultado:
  ambos byte-idênticos DE PRIMEIRA — nenhuma divergência, nenhum P0. Como reproduzir um caso golden
  pela UI (não é trivial — o `SCENARIO` da ENG-252 é de outro áudio):
  - **PCM/manifest_id:** adicionar ao `fixtures/bucket/audios.ts` uma entrada com o MESMO `PcmSpec`
    do caso (`seed/samples/channels/sampleRate`). `FixtureBucketSource.fetchBytes`→`FixtureAudioEngine.decode`
    (`makePcm` LCG) →`hashPCM` é o MESMO caminho de `tests/golden/generate.mjs` → hash idêntico
    (minimal-flow `fnv1a32:d31a8419`, seam-small-move `fnv1a32:39876dcd`).
  - **beadSec 0.5:** o Setup resolve granularidade via `StubGranularityResolver.resolve(level,acousteme)`
    = `acousteme.data.bead_sec[level]` (fallback `{pequena:0.12,media:0.25,grande:0.5}` só se acousteme null).
    O rádio **Média** → chave `media`. Autorei `bead_sec.media = 0.5` nas entradas novas → Média resolve 0.5
    (grade de 24 contas em 96000/8000=12 s). `createSession` do support seleciona Média.
  - **slug/audio_filename:** `story_slug` = `title.trim() || filename-sem-ext || 'colar'`. Deixar o TÍTULO
    VAZIO → slug = nome do arquivo sem `.wav` (`fluxo-minimo`/`costura-pequena`). `audio_filename` = filename verbatim.
  - **scene_kind `GLEANING_SCENE`:** label PT-BR = **"Respiga"** (`domain/scene-kinds.ts` `SK_PT`), tier **ALTA**
    → NÃO está na grade "mais comuns" da Triagem. Alcançar via o `searchbox` **"filtrar tipos"** (`fill('Respiga')`)
    e então o rádio "Respiga". Confiança: `alta`→**"Certeza"**, `média`→"Quase", `baixa`→"Na dúvida". `none_fit`→
    rádio "Nenhum se encaixa" (dispara na hora, sem "Confirmar"). `ColarApp.triage()` NÃO serve p/ kind ALTA
    (não filtra) → triagem inline no spec.
  - **flag NEEDS_REVIEW:** na Segmentação, o chip da frase travada tem botão **"⚑ revisar"** (→"⚑ marcada");
    clicar produz `{kind:'NEEDS_REVIEW', prop_id, note_pt:''}`. Sem método de suporte → clique inline.
  - **respostas do Mapeamento:** o relatório `.md` embute o texto DIGITADO por pergunta. `domain/mapping.ts`
    `questionSequence` = 11 L1 → 5 L2 por parte travada (PT1,PT2; none_fit incluído) → 5 L3 por frase produtiva.
    Índices no minimal-flow: recontar=0, tempo=4 (VAZIO→inerte, "(sem resposta)" idêntico a não visitar),
    PT1 `quem`=12, PT2 `descrever`=16, P1 `oque`=21. A conversa começa no índice 0; "Próxima pergunta" avança de 1;
    o `<textarea aria-label="observação da facilitadora">` grava no slot da pergunta ATUAL (`setAnswer`). Perguntas
    não respondidas renderizam `_(sem resposta)_` (`contracts/relatorio.ts` `answerCell`). **ARMADILHA byte:** voz
    escreve paths `respostas/…webm` em `dto.voice` que o `answerCell` renderiza NO LUGAR de "(sem resposta)" →
    NUNCA usar `ColarApp.answerConversation()` (grava voz) num caso de byte-identity; só digitar, zero voz.
  - **downloads:** a estação Export mantém os 3 cards (`.cds-export .cds-document-card`, botão "Baixar") também no
    `phase='saved'` (pós-conclusão); `onDownload` devolve os bytes GUARDADOS (`store.getArtifacts`), byte-idênticos
    ao que a conclusão salvou (§10.5). `suggestedFilename()` = `retorno/manifesto/relatorioFilename(slug)` de contracts.
  - **seam-small-move:** só manifesto+retorno (não há golden `.md`); sem respostas/flag; frase 0→13 cruza a borda 11
    (delta 2 ≤ max(3,25%)) → `moveSeam()` "Mover a borda até aqui" desliza a costura (PT1→0–13, PT2→14–23); o gate de
    export só pede ≥1 frase em cena produtiva (P1 em PT1 GLEANING) → `completeSession()` sem tocar na conversa.
  - **Gotcha de tipo (afeta TODO o E6 255–258):** `ColarApp.createSession(audioFilename=SCENARIO.audioFilename)` infere
    o parâmetro como o LITERAL `'conto-do-boto.wav'` (do default) → não aceita outros áudios. Support é read-only →
    helper local `openSession(app,name)=app.createSession(name as never)`. Follow-up: dar a `createSession` assinatura `string`.

## ENG-275 — shell: fiar o Player de áudio no fluxo de estações (contas/bordas tocam)

Escopo: `ui/app/` só (`App.tsx` + novo `audio-player.ts`). Análogo de áudio da ENG-270 (que tornou a Export
alcançável). **Antes:** o seam de áudio estava DORMENTE — `App.tsx` só tinha um stub no-op `useMemo<Player>(()=>({stop(){}}))`
(tipo do player-slot, não o `Player` de áudio) e `stationProps` nunca passava `player` → toda estação do colar
rodava com `player=null`, muda. Desbloqueia ENG-255 (acceptance-4 oral-mode).

- **De onde vem o player.** O `SessionMeta.bucketAudioId` (persistido no DTO) + `state.beadSec` (travado na sessão)
  bastam. `buildSessionPlayer(sessionId)` = `appSessionStore().load` → `fromSessionDto` → `new FixtureBucketSource().fetchBytes(meta.bucketAudioId)`
  → `FixtureAudioEngine.decode` → `engine.createPlayer(decoded, state.beadSec)`. Decisão da issue: **re-decodificar do
  bucket na hidratação** (não guardar PCM na sessão). Faz um 2º `load` do DTO (o 1º é da `useSessionHydration`) — barato
  no fixture. O `pcm` do fixture é ignorado pelo `createPlayer` (o core só lê `decoded.duration`), mas re-decodificar
  mantém o fluxo fiel ao real.
- **CRUX — engine fixture, NÃO o real.** O bucket fixture serve o áudio como JSON de `PcmSpec` (não WAV), que só o
  `FixtureAudioEngine` decodifica; o `WebAudioEngine.decode` lançaria `AudioDecodeError` nesses bytes. Então a nota da
  issue "usar o WebAudioEngine real no browser" NÃO se aplica em modo fixture (o toggle real por ambiente é ENG-247).
  Escolhida a **outra** opção oferecida: **ponte rAF→`advance`** no `FixtureTransport`. `startClockBridge(transport)`:
  `requestAnimationFrame` com delta real entre frames → `transport.advance(dt)`. O relógio do fixture só anda em
  `advance()`; sem a ponte, `onHead`/`data-play` ficariam congelados mesmo com player fiado. Sob Playwright/Chromium o
  rAF tica de verdade → playback e cabeça progridem. `stop()` cancela a ponte + `player.stop()`.
- **Fiação em `App.tsx`.** Hook `useSessionPlayer(routeId)` (constrói async; reconstrói ao trocar de sessão; cleanup
  para+cancela; sessão sem áudio resolvível → `null` dormente, catch silencioso — estações lidam com `player=null`).
  `SessionStations` passa `stationProps` = `{player}` p/ escuta1/escuta2/triagem/segmentacao, `{recorder,player}` p/
  mapeamento (export segue `{store,sessionId}`), e `player ?? NO_PLAYBACK` ao `PlayerSlotProvider` (trocar de estação
  chama `player.stop()` → para o áudio, espelho de `setMode`→`stopPlayback`).
- **Teste determinístico do `data-play` em jsdom** (sem geometria): o ▶ do `ScenePhraseChip` (aria-label **"Tocar"**) é
  gatilho sem layout; `data-play` é escrito imperativo por `querySelectorAll('.cds-necklace-bead')` (roda em jsdom, os
  elementos de conta existem sem posição). Espião de `requestAnimationFrame` captura os frames da ponte e os flusha à mão
  com timestamps controlados dentro de `act()`: baseline `frames[0](0)` + `frames[1](100)` → `advance(0.1)` → o frame de
  progresso do fixture emite `beadAtTime` → `setHead` → colar acende `data-play`. React 19 usa MessageChannel (não rAF)
  → o espião só captura a ponte. Grade do teste casa `aud_conto_do_boto` (3 s / media 0,25 → 12 contas).
- **Compat com testes existentes:** os App.tests usam `bucketAudioId:'a1'` (não existe no bucket fixture) → `fetchBytes`
  lança → `buildSessionPlayer` rejeita → player fica `null` (mesmo comportamento de antes, gates verdes). A ponte só
  arranca APÓS decode OK, então sessão inválida não vaza rAF.
- Gates: typecheck, lint (0 err, 3 warns de complexity pré-existentes), depcruise (344 mód, fronteiras intactas),
  test (921 pass/2 skip), test:browser (19), golden (18/18), e2e (4/4 — a fiação não quebra as specs 252/253/254).

## ENG-255 — acceptance-4 oral-mode FLUXO (E2E, spy de som/texto/chrome)

Escopo: 1 spec novo `tests/e2e/oral-mode.spec.ts` (uso read-only do `support/`; ZERO mudança no app). Prova a
metade-fluxo do critério 4: o ouvinte opera por som + forma + posição, sem ler nem tocar em chrome.

- **Sonda por `page.addInitScript`** (`window.__oral`): um `MutationObserver` no `body` registra, em ordem, `sound`
  (uma `.cds-necklace-bead` ganha `data-play`) e `text` (nó de texto novo com conteúdo, FORA de `.cds-necklace`);
  listeners de captura em `click`/`focusin` logam qualquer alvo que caia em `.cds-header`/`.cds-stepper` enquanto
  `chromeOn`. `reset()` limpa só os `events`. O init script roda no 1º documento (`goto('/login')`) e sobrevive à
  navegação client-side do SPA (body persiste) — não há outro `page.goto` no caminho.
- **`data-play` é o ÚNICO sinal de áudio DOM-observável.** Não há hook global no `FixtureAudioEngine`/player (criados
  dentro de `buildSessionPlayer`, não expostos em window). O playhead acende via a ponte rAF da ENG-275 → sob
  Playwright/Chromium o rAF tica e `data-play` aparece; em jsdom não (por isso é E2E, não browser-test).
- **CRUX — "som antes de texto" NÃO é literalmente observável em todo ponto de decisão** (a issue super-especifica):
  1. **Toque que COMPLETA seleção** (fim de cena na Escuta 2; fim de frase na Segmentação): o confirm renderiza
     SÍNCRONO no `apply` do domínio, ANTES de o playhead visual acender (o `player.play()` roda depois do `apply`, e
     `data-play` só acende no rAF seguinte). Logo `data-play` fica DEPOIS do texto do confirm → asserção de ordering
     falharia ali. (Em CÓDIGO o áudio arranca antes do paint — a chamada `play()` precede o flush do React 18/19 do
     handler nativo de pointer — mas isso não é DOM-observável.)
  2. **Mapeamento não tem colar** (usa `ConversationStage`) → sem conta, sem `data-play`; o ▶ "ouvir a história/cena/frase"
     toca mas não muda o DOM (o rótulo é estático, não vira ⏸). Logo o som da pergunta tocada não é observável.
     → Asserto ordering onde É observável e não há texto competindo: transporte + toque de conta (Escuta 1), toque-INÍCIO
     de frase (Segmentação, antes do 2º toque que traz o confirm), e o nudge de borda (Escuta 2). Onde não é observável,
     provo por sinal não-textual do controle + avanço in-station. Documentado no cabeçalho do spec.
- **Pontos de decisão úteis:** só o TOQUE-INÍCIO (1º clique) dá som sem texto (o `anchor`/confirm só aparece quando a
  seleção fecha — `activeAnchor`). O nudge de borda (`onEdgeHover`→`playEdge`) precisa de seleção VIVA + `pointermove`
  mouse com dwell > 280ms: `mouse.move` p/ fora da borda e de volta ao centro da conta-borda agenda o timer; `playEdge`
  não toca `session.selection` → bandas `.cds-necklace-selection-band` idênticas antes/depois (DoD #2).
- **Zero chrome:** as transições Escuta1→2→Triagem→Segmentação→Mapeamento→relatório são por MODO de domínio e por
  "Próxima pergunta" (in-station) — o stepper (`.cds-stepper`) NUNCA é clicado no caminho do ouvinte; o `<li>` do stepper
  é não-focável e o botão de som do header não é auto-focado, então o log de chrome fica `[]`. Habilito `chromeOn` só
  quando a Escuta 1 assume (login+setup são da facilitadora, fora do caminho).
- **Gotcha que me custou 1 timeout:** ao inlinar o corte de frase para injetar a asserção de som no toque-início, é
  preciso clicar "✓ Confirmar esta frase" ANTES de `moveSeam()` — é o confirm (`confirmFrase`→`'border'`) que abre o
  seam modal ("Mover a borda até aqui"), não o 2º toque.
- **Sinal não-textual:** `Pearl` é `aria-hidden` sem texto (a conta é posição/cor pura); instrução e ação dominante
  carregam `data-role="instruction"`/`"primary-action"` — asserções leves inline.
- Gates: e2e 5/5 (as 4 specs prévias intactas), typecheck limpo, lint 0 err (3 warns complexity pré-existentes),
  depcruise 345 mód sem violação, golden 18/18. Roda em ~5s. `loop-ready` (só tests/) → merge on green.

## ENG-277 — shell: fiar os seams de resiliência na sessão viva (offline/expiração/trava)

Contexto: análogo de resiliência do ENG-275 (player) e ENG-276 (voz→relatório) — o shell só fiava um
subconjunto dos seams de adapter. Os três comportamentos de §7.3/§13 existiam nos adapters mas não estavam
ligados ao runtime da sessão nem eram dirigíveis de um teste. Desbloqueia a acceptance-6 (ENG-257). Scope:
`ui/app/**`, `ui/pages/dashboard/ports.ts` (sem contracts/domain).

Os três gaps e como cada um ficou dirigível de um teste (sem mudar o app no ENG-257):

- **A — Offline.** `useOnline` (App.tsx) agora, ALÉM da assinatura da porta `connectivity`, ouve os eventos
  `online`/`offline` da window (com cleanup no teardown do efeito). É o que o Playwright dirige por
  `context.setOffline` — cair offline mostra o gate e pausa mutações (`sessionStore.setOnline`); voltar retoma
  sem perda. **DECISÃO:** NÃO mexi na fixture (`FixtureConnectivityMonitor`) nem em `register.ts` — a ponte
  window→estado no composition root É o "small dev/test connectivity hook" que a issue permitia, e evita o
  vazamento de listeners que o binding-no-construtor da fixture teria (a fixture é construída direto pelo
  autosaver `new FixtureConnectivityMonitor(true)`, sem cleanup). Menos arquivos, sem efeito colateral.
- **B — Expiração de auth.** Novo singleton app-global `appAuth()` em `ui/app/auth-adapter.ts` (um
  `FixtureAuthProvider` memoizado). `App` assina `appAuth().onAuthExpired(() => navigate('/login'))` num hook
  `useAuthExpiry`, então expirar em QUALQUER rota (inclusive `/session/:id`) volta ao login sem tocar o estado
  em memória. `dashboard/ports.ts` `defaultAuth()` agora DELEGA a `appAuth()` (antes construía o seu próprio
  provider) → Login, Dashboard e a raiz de sessão partilham UMA instância, então um único gatilho de expiração
  alcança toda superfície. O dashboard mantém sua própria assinatura também (inócuo — ambos só navegam a /login).
  **GOTCHA:** `FixtureAuthProvider.simulateExpiry()` é no-op se não há token (`if (!this.#token) return`) — o
  teste (e o ENG-257) precisa `login()` antes de expirar. `appAuth()` retorna o tipo concreto
  `FixtureAuthProvider` (não a interface) porque `simulateExpiry` não está na interface `AuthProvider`.
- **C — Trava consultiva.** `useSessionHydration` (App.tsx), após `load()`, lê `appSessionStore().lockStatus(id)`
  e, se detida por holder com `user_id` ≠ `DEFAULT_FIXTURE_USER.user_id`, chama `sessionStore.setLock({holder:
display_name})` → abre em revisão com "sessão em uso por <nome>". **CEILING (comentário ponytail):** este fluxo
  NÃO adquire trava própria, então qualquer trava presente por user distinto do default é tratada como alheia.

Seam de teste dev-only (`ui/app/test-seam.ts`, `window.__cds`): dois gatilhos SEM caminho natural de UI nem
localStorage — `expireAuth()` (→ `simulateExpiry`) e `seedForeignLock(sessionId, holder?)` (constrói um 2º
`FixtureSessionStore` sobre o MESMO backend como outro usuário "Ana" e `acquireLock`). Instalado só em DEV por
`main.tsx` (`if (import.meta.env.DEV) void import('./test-seam').then(m => m.installTestSeam())`) → fora do bundle
de produção. O e2e roda em Vite DEV (playwright.config webServer = `vite`), então DEV é true lá. Offline NÃO
precisa de seam (context.setOffline). Para expor o backend ao seam, `session-adapter.ts` ganhou
`appSessionBackend()` (singleton `FixtureSessionBackend` sobre o qual `appSessionStore()` é construído) — dois
contextos de Playwright têm localStorage separado, então a trava alheia precisa de seeding no MESMO backend.

Testes (jsdom, App.test.tsx + test-seam.test.ts): offline dispara `window.dispatchEvent(new Event('offline'/'online'))`
e assere banner + `apply` no-op + retomada; expiração faz `appAuth().login()` então `simulateExpiry()` e assere
`location.pathname==='/login'` + sessão preservada; trava semeia via 2ª store sobre `appSessionBackend()` e assere
"em uso por Ana" + ausência de "Destravar". Gates: typecheck, lint 0 err (3 warns pré-existentes), depcruise 348
sem violação, test 925/2skip, golden 18/18, browser 19/19, e2e 5/5. `loop-ready` → merge on green.
