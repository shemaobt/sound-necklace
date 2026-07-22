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
            statement_pt: '',
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
          out['manifesto-contas.json'] = JSON.stringify(buildManifest(), null, 2);
        if (step.artifacts.includes('retorno'))
          out['retorno-ancoragem.json'] = JSON.stringify(buildReturn(), null, 2);
        if (step.artifacts.includes('relatorio'))
          out['relatorio-mapeamento.md'] = buildMapReportMd();
        break;
      }
      default:
        throw new Error('passo desconhecido: ' + step.type);
    }
  }
  return out;
  /* eslint-enable no-undef */
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
      for (const [name, content] of Object.entries(artifacts)) {
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
