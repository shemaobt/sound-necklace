/**
 * Aquece o cache de TTS da plataforma (ENG-283) com as 21 perguntas da entrevista, nas
 * duas línguas. Roda UMA vez, à mão, depois de deployar a API ou de trocar uma voz.
 *
 *   CDS_API=https://api… CDS_TOKEN=<bearer> pnpm voz:aquecer
 *
 * Por que existe: o cache do bucket é endereçado por conteúdo, então a PRIMEIRA sessão de
 * todas pagaria a latência de síntese (~1–3 s) ao vivo, na frente do ouvinte, em cada uma
 * das 21 perguntas. Depois disto, toda sessão bate no bucket.
 *
 * Por que mora AQUI e não no tripod-api: as perguntas são contrato byte-exato (aspas
 * curvas U+201C/U+201D, travessões U+2014) e vivem em `domain/mapeamento-scripts.ts`.
 * Copiá-las para outro repo é como elas divergem em silêncio — e uma string errada aquece
 * a chave errada *parecendo* ter funcionado. Aqui elas vêm da fonte, pelo MESMO resolvedor
 * que o app usa para falar (`questionTextFor`), então o que se aquece é o que se fala.
 */

const API = (process.env.CDS_API ?? 'http://localhost:8000').replace(/\/$/, '');
const TOKEN = process.env.CDS_TOKEN;

if (!TOKEN) {
  console.error('Defina CDS_TOKEN (bearer da API). Ex.: CDS_TOKEN=$(…) pnpm voz:aquecer');
  process.exit(1);
}

const { L1_Q, L2_Q, L3_Q } = await import('../domain/mapeamento-scripts.ts');
const { questionTextFor } = await import('../ui/i18n/mapeamento-questions.ts');

const jobs = [];
for (const [level, questions] of [
  [1, L1_Q],
  [2, L2_Q],
  [3, L3_Q],
]) {
  for (const question of questions) {
    const slot = { level, k: question.k, question };
    const pt = questionTextFor(slot, 'pt');
    const en = questionTextFor(slot, 'en');
    // Sem entrada EN, `questionTextFor` cai no PT-BR — aquecer isso gravaria a frase
    // portuguesa sob a voz inglesa, e ninguém notaria.
    if (en === pt) console.warn(`⚠ sem tradução EN para nível ${level} "${question.k}"`);
    jobs.push({ text: pt, language: 'pt-BR' }, { text: en, language: 'en-US' });
  }
}

let synthesized = 0;
let cached = 0;

for (const job of jobs) {
  const res = await globalThis.fetch(`${API}/api/platform/tts/speak`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify(job),
  });

  if (!res.ok) {
    console.error(`\n✗ ${res.status} [${job.language}] ${job.text.slice(0, 48)}…`);
    process.exitCode = 1;
    continue;
  }

  await res.arrayBuffer(); // drena o corpo; os bytes já estão no bucket
  const hit = res.headers.get('x-tts-cached') === '1';
  if (hit) cached += 1;
  else synthesized += 1;
  process.stdout.write(hit ? '·' : '+');
}

console.log(
  `\n${jobs.length} clipes: ${synthesized} sintetizados agora, ${cached} já estavam no bucket.`,
);
