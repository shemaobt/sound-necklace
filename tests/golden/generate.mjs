/**
 * Gerador/verificador de goldens — dirige a referência INTOCADA
 * (docs/reference/index.html) em Chromium headless via page.evaluate,
 * sem clicar em UI e sem decodificar áudio (PCM sintético, LCG em BigInt).
 *
 *   node tests/golden/generate.mjs            → (re)escreve expected/<caso>/
 *   node tests/golden/generate.mjs --verify   → regenera e byte-compara; exit 1 em divergência
 *
 * O vocabulário de passos está documentado em tests/golden/README.md.
 * NUNCA edite a referência; NUNCA edite goldens à mão (o verify pega).
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const here = dirname(fileURLToPath(import.meta.url));
const referencePath = resolve(here, '../../docs/reference/index.html');
const casesDir = join(here, 'cases');
const expectedDir = join(here, 'expected');
const verifyMode = process.argv.includes('--verify');

/**
 * Executa TODOS os passos de um caso dentro da página da referência e devolve
 * os artefatos como strings serializadas EXATAMENTE como a referência serializa
 * (JSON.stringify(x, null, 2) sem newline final; .md com um newline final).
 */
function runStepsInPage(steps) {
  /* eslint-disable no-undef */
  // Roda no contexto da página: usa os globais da referência (state, buildBeads,
  // hashPCM, confirmWhole, confirmPart, …). Ver README para o contrato de cada passo.
  const A = 1103515245n;
  const C = 12345n;
  const M = 2147483648n; // 2^31
  function makePcm(seed, samples) {
    const pcm = new Float32Array(samples);
    let x = BigInt(seed) % M;
    for (let i = 0; i < samples; i++) {
      x = (A * x + C) % M;
      pcm[i] = Number(x) / 2 ** 30 - 1;
    }
    return pcm;
  }
  const out = {};
  for (const step of steps) {
    switch (step.type) {
      case 'segment': {
        const { pcm, beadSec, slug, audioFilename } = step;
        const data = makePcm(pcm.seed, pcm.samples);
        const buf = {
          numberOfChannels: pcm.channels,
          sampleRate: pcm.sampleRate,
          getChannelData: () => data,
        };
        const dur = pcm.samples / pcm.sampleRate;
        // Espelha o bloco de inicialização de segment() (referência L454–472),
        // sem decode nem mensagens de setup.
        state.audioBuffer = null; // o harness nunca toca áudio
        state.durationSec = dur;
        state.beadSec = beadSec;
        state.beads = buildBeads(dur, beadSec);
        state.totalBeads = state.beads.length;
        state.manifestId = hashPCM(buf, beadSec);
        state.audioFilename = audioFilename;
        state.slug = slug;
        state.whole.span = { s: 0, e: state.totalBeads - 1 };
        state.whole.confirmed = false;
        state.parts = [];
        state.partsConfirmed = false;
        state.frases = [];
        state.activeSceneId = null;
        state.mapping = null;
        state.mapStep = 'n1';
        state.mapN1i = 0;
        state.mapN2i = 0;
        state.mapN3i = 0;
        state.selection = null;
        state.pendingStart = null;
        state.current = { layer: 'whole', index: -1 };
        state.dlRet = false;
        state.dlMan = false;
        state.paused = false;
        state.review = false;
        state.mode = 'escuta';
        document.body.classList.remove('review');
        document.getElementById('reviewBanner').classList.add('hidden');
        document.getElementById('confirmParts').classList.remove('hidden');
        document.getElementById('confirmFrases').classList.remove('hidden');
        ['cordCard', 'partsCard', 'frasesCard', 'exportCard'].forEach(expandCard);
        revealAll();
        document.getElementById('partsCard').classList.add('locked');
        document.getElementById('frasesCard').classList.add('locked');
        renderCord();
        renderWhole();
        renderParts();
        renderFrases();
        setMode('escuta');
        break;
      }
      case 'confirmWhole':
        confirmWhole(); // avança sozinho para o corte de cenas (addPart primado)
        break;
      case 'cutScene': {
        const i = state.current.index;
        const f = frontier('parts');
        state.selection = { s: f, e: step.endBead };
        state.pendingStart = null;
        confirmPart(i);
        break;
      }
      case 'confirmParts':
        confirmParts(); // setMode('triagem')
        break;
      case 'triage': {
        const pt = lockedParts()[step.partIndex];
        if (step.none_fit) {
          pt.tag_state = 'none_fit';
          pt.scene_kind = null;
          pt.scene_kind_confidence = null;
        } else {
          pt.tag_state = 'tagged';
          pt.scene_kind = step.kind;
          pt.scene_kind_confidence = step.confidence;
        }
        renderTriagem();
        break;
      }
      case 'triagemDone':
        setMode('segmentacao'); // o gate do botão é UI; o redirect do setMode é o contrato
        break;
      case 'enterScene':
        enterScene(step.partId);
        break;
      case 'phraseSelect':
        state.selection = { s: step.s, e: step.e };
        state.pendingStart = null;
        break;
      case 'confirmPhrase': {
        const i = state.current.index;
        const sel = state.selection ? { s: state.selection.s, e: state.selection.e } : null;
        confirmFrase(i);
        // Se cruzou a borda, a referência apenas RENDERIZA a oferta e retorna;
        // o passo decide como o usuário decidiria (espelha doMove/reanchor L812–826).
        if (step.borderDecision && sel) {
          const sc = activeScene();
          const crossStart = sel.s < sc.span.s;
          const crossEnd = sel.e > sc.span.e;
          if (step.borderDecision === 'move') {
            slideSeam(sc, crossStart ? sel.s : null, crossEnd ? sel.e : null);
            lockFrase(state.frases[i], sel, sc.part_id);
          } else if (step.borderDecision === 'reanchor') {
            state.selection = null;
            state.pendingStart = null;
          } else if (step.borderDecision === 'triagem') {
            setMode('triagem');
          }
        }
        break;
      }
      case 'removePhrase':
        removeFrase(step.index);
        break;
      case 'sceneDone':
        confirmFrasesDone();
        if (step.forceEmpty) confirmFrasesDone(); // aviso de cena vazia: 2º clique segue
        break;
      case 'answer': {
        ensureMapping();
        const m = state.mapping;
        if (step.level === 1) m.level1[step.key] = step.text;
        else if (step.level === 2) m.level2[step.partId][step.key] = step.text;
        else m.level3[step.propId][step.key] = step.text;
        break;
      }
      case 'importReturn': {
        // Espelha o handler de retomada da referência (resumeFile.onchange,
        // L1362–1383): tudo TRAVADO, spans de confirmed_span, flags reaplicadas
        // por prop_id, cursor em frases. A cor não entra no export (buildReturn
        // não a serializa), mas segue o PALETTE para fidelidade.
        const data = step.dto;
        const sc = (data.scenes && data.scenes[0]) || null;
        if (sc && sc.confirmed_span) {
          state.whole.id = sc.scene_id || 'S1';
          state.whole.span = { s: sc.confirmed_span.start_bead, e: sc.confirmed_span.end_bead };
          state.whole.confirmed = true;
          document.getElementById('partsCard').classList.remove('locked');
          state.parts = (sc.parts || []).map((pt, idx) => ({
            part_id: pt.part_id || 'PT' + (idx + 1),
            span: { s: pt.confirmed_span.start_bead, e: pt.confirmed_span.end_bead },
            color: PALETTE[idx % PALETTE.length],
            locked: true,
            scene_kind: pt.scene_kind || null,
            scene_kind_confidence: pt.scene_kind_confidence || null,
            tag_state: pt.tag_state || 'pending',
          }));
          if (state.parts.length) {
            state.partsConfirmed = true;
            document.getElementById('frasesCard').classList.remove('locked');
          }
          state.frases = (sc.propositions || []).map((p, idx) => ({
            prop_id: p.prop_id,
            statement_pt: '', // campo da REFERÊNCIA (intocada) — não renomear junto com o domain
            qa: [],
            span: { s: p.confirmed_span.start_bead, e: p.confirmed_span.end_bead },
            part_link: p.part_link || null,
            color: PALETTE_PT[idx % PALETTE_PT.length],
            locked: true,
          }));
        }
        // o ⚑ saiu na ENG-342: `data.flags` de um retorno antigo é ignorado
        state.current = { layer: 'frases', index: -1 };
        state.selection = null;
        renderWhole();
        renderParts();
        renderFrases();
        renderCord();
        break;
      }
      case 'export': {
        if (step.artifacts.includes('manifesto'))
          out['bead-manifest.json'] = JSON.stringify(buildManifest(), null, 2);
        if (step.artifacts.includes('retorno'))
          out['anchoring-return.json'] = JSON.stringify(buildReturn(), null, 2);
        if (step.artifacts.includes('relatorio')) out['mapping-report.md'] = buildMapReportMd();
        break;
      }
      default:
        throw new Error('passo desconhecido: ' + step.type);
    }
  }
  return out;
  /* eslint-enable no-undef */
}

/**
 * ENG-356 — o artefato normalizou para inglês (política ENG-326), mas a
 * referência (INTOCÁVEL) só sabe emitir PT-BR. Em vez de passar a escrever o
 * golden do `.md` à mão — o que mataria a prova do `--verify` —, o golden segue
 * DERIVADO da referência e recebe esta tabela explícita e revisada.
 *
 * Consequência desejada: estrutura, ordem, spans e respostas continuam provados
 * byte-a-byte contra a referência; só as strings congeladas abaixo divergem, e
 * divergem de um jeito auditável. A tabela é escrita à mão de propósito — ela
 * NÃO importa de domain/contracts, senão os dois lados concordariam por
 * construção e o diff do `pnpm golden` não provaria mais nada.
 */
const REPORT_PT_TO_EN = [
  ['# Relatório de Mapeamento — ', '# Meaning Mapping Report — '],
  [
    '> Matéria-prima para o Claude Code. **Não** é o mapa. Respostas em texto livre (perguntas gerais do método); o agente faz as perguntas contextuais, classifica o vocabulário controlado, sinaliza NEW_VALUE e escreve a prosa do meaning map.',
    '> Raw material for Claude Code. This is **not** the map. Free-text answers (the general questions of the method); the agent asks the contextual questions, classifies the controlled vocabulary, flags NEW_VALUE and writes the prose of the meaning map.',
  ],
  ['## Nível 1 — a história inteira', '## Level 1 — the whole story'],
  ['## Nível 2 — as cenas', '## Level 2 — the scenes'],
  ['## Nível 3 — proposições (cenas produtivas)', '## Level 3 — propositions (productive scenes)'],
  ['### Cena ', '### Scene '],
  ['scene_kind: (nenhum)', 'scene_kind: (none)'],
  ['**Frase ', '**Phrase '],
  [') — contas ', ') — beads '],
  ['_(sem resposta)_', '_(no answer)_'],
  // as 21 perguntas (domain/mapeamento-scripts.ts: q → q_en)
  [
    'Conte essa história com as suas palavras, como se fosse para alguém que nunca ouviu.',
    'Tell this story in your own words, as if to someone who has never heard it.',
  ],
  ['Como a história começa? E como ela termina?', 'How does the story begin? And how does it end?'],
  [
    'O que muda do começo para o fim? A história deixa as coisas diferentes de como começou?',
    'What changes from the beginning to the end? Does the story leave things different from how they started?',
  ],
  ['Onde essa história acontece?', 'Where does this story take place?'],
  [
    'Tem um tempo, uma época em que ela acontece? Ou a história não marca isso?',
    'Is there a time, a period when it takes place? Or does the story not mark that?',
  ],
  [
    'Tem alguma coisa que quem escuta já precisa saber de antemão para a história fazer sentido?',
    'Is there anything a listener already needs to know beforehand for the story to make sense?',
  ],
  [
    'Que sentimento essa história passa enquanto você escuta? Muda em algum momento?',
    'What feeling does this story carry while you listen? Does it change at any point?',
  ],
  [
    'A história corre rápida ou devagar? Tem parte que demora mais que as outras?',
    'Does the story run fast or slow? Is there a part that takes longer than the others?',
  ],
  [
    'Para que serve essa história? O que ela quer fazer com quem escuta — ensinar, abrir um assunto, avisar, plantar uma ideia?',
    'What is this story for? What does it want to do to whoever listens — teach, open a subject, warn, plant an idea?',
  ],
  [
    'Se essa história faz parte de algo maior, o que ela prepara para o que vem depois?',
    'If this story is part of something larger, what does it prepare for what comes after?',
  ],
  [
    'Tem alguma coisa que você esperaria nessa história e que não aparece? Um nome, alguém no comando, um problema, um acontecimento? O narrador parece ter deixado algo de fora de propósito?',
    'Is there anything you would expect in this story that does not appear? A name, someone in charge, a problem, an event? Does the narrator seem to have left something out on purpose?',
  ],
  [
    'Me conte o que acontece nesse trecho, com as suas palavras.',
    'Tell me what happens in this stretch, in your own words.',
  ],
  [
    'Quem aparece nesse trecho? Pessoas, animais, um grupo, alguém de quem se fala?',
    'Who appears in this stretch? People, animals, a group, someone who is spoken about?',
  ],
  [
    'Onde isso acontece? É o mesmo lugar de antes ou mudou?',
    'Where does this happen? Is it the same place as before, or has it changed?',
  ],
  [
    'Tem alguma coisa, algum objeto, algum elemento importante nesse trecho?',
    'Is there anything, any object, any important element in this stretch?',
  ],
  [
    'Tem algo que você esperaria nesse trecho e que não aparece?',
    'Is there anything you would expect in this stretch that does not appear?',
  ],
  ['O que aconteceu nesta frase?', 'What happened in this phrase?'],
  ['Quem?', 'Who?'],
  ['Onde?', 'Where?'],
  ['Como? Por quê?', 'How? Why?'],
  ['O que mais tem nessa frase?', 'What else is in this phrase?'],
];

/** Sobras de PT-BR = tabela incompleta. Falha aqui em vez de no byte-diff. */
const PT_LEFTOVERS = ['Nível', 'Relatório', 'sem resposta', '### Cena ', '**Frase ', ' — contas '];

function translateReport(md) {
  let out = md;
  for (const [pt, en] of REPORT_PT_TO_EN) out = out.replaceAll(pt, en);
  for (const marker of PT_LEFTOVERS) {
    if (out.includes(marker))
      throw new Error(`REPORT_PT_TO_EN incompleta: "${marker}" sobrou no .md traduzido (ENG-356).`);
  }
  return out;
}

async function main() {
  const caseFiles = readdirSync(casesDir)
    .filter((f) => f.endsWith('.json'))
    .sort();
  if (caseFiles.length === 0) throw new Error('nenhum caso em tests/golden/cases');

  const browser = await chromium.launch();
  let failures = 0;
  try {
    for (const file of caseFiles) {
      const spec = JSON.parse(readFileSync(join(casesDir, file), 'utf8'));
      const page = await browser.newPage();
      await page.goto(pathToFileURL(referencePath).href);
      const artifacts = await page.evaluate(runStepsInPage, spec.steps);
      await page.close();

      const dir = join(expectedDir, spec.name);
      for (const [name, raw] of Object.entries(artifacts)) {
        // só o .md diverge da referência, e só pela tabela revisada (ENG-356)
        const content = name.endsWith('.md') ? translateReport(raw) : raw;
        const target = join(dir, name);
        if (verifyMode) {
          if (!existsSync(target)) {
            console.error(`✗ ${spec.name}/${name}: golden ausente`);
            failures++;
            continue;
          }
          const committed = readFileSync(target);
          const fresh = Buffer.from(content, 'utf8');
          if (!committed.equals(fresh)) {
            console.error(
              `✗ ${spec.name}/${name}: DIVERGE da referência (${committed.length} vs ${fresh.length} bytes)`,
            );
            failures++;
          } else {
            console.log(`✓ ${spec.name}/${name} (${fresh.length} bytes)`);
          }
        } else {
          mkdirSync(dir, { recursive: true });
          writeFileSync(target, content);
          console.log(`gravado ${spec.name}/${name} (${Buffer.byteLength(content, 'utf8')} bytes)`);
        }
      }
    }
  } finally {
    await browser.close();
  }

  if (verifyMode && failures > 0) {
    console.error(`\ngolden:verify FALHOU — ${failures} arquivo(s) divergente(s).`);
    process.exit(1);
  }
  console.log(verifyMode ? '\ngolden:verify OK — goldens ≡ referência.' : '\ngeração concluída.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
