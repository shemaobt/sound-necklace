/**
 * Baixa o OpenAPI emitido pelo tripod-api (produção) e grava em contracts/openapi.json
 * SÓ a superfície que o SPA consome: /api/auth/* + /api/sound-necklace/* e o fechamento
 * de $ref dos seus componentes. O backend é um monólito de seis apps — sem o filtro,
 * cada refresh arrastaria o churn dos outros times para um diff contract-critical.
 *
 * Uso: pnpm api:snapshot   (depois: pnpm generate:api-types)
 */
import { writeFileSync } from 'node:fs';

const URL =
  process.env.TRIPOD_OPENAPI_URL ?? 'https://tripod-backend-f7ssqjozfq-uc.a.run.app/openapi.json';
const OUT = new globalThis.URL('../contracts/openapi.json', import.meta.url);
const KEEP = [/^\/api\/auth\//, /^\/api\/sound-necklace\//];

const res = await globalThis.fetch(URL);
if (!res.ok) throw new Error(`GET ${URL} → ${res.status}`);
const spec = await res.json();

const paths = Object.fromEntries(
  Object.entries(spec.paths)
    .filter(([p]) => KEEP.some((re) => re.test(p)))
    .sort(([a], [b]) => a.localeCompare(b)),
);

// fechamento transitivo dos schemas referenciados pelas rotas mantidas
const wanted = new Set();
const walk = (node) => {
  if (Array.isArray(node)) return node.forEach(walk);
  if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      if (key === '$ref' && typeof value === 'string') {
        const name = value.split('/').at(-1);
        if (!wanted.has(name)) {
          wanted.add(name);
          walk(spec.components.schemas[name]);
        }
      } else {
        walk(value);
      }
    }
  }
};
walk(paths);

const schemas = Object.fromEntries(
  [...wanted].sort().map((name) => [name, spec.components.schemas[name]]),
);

const out = {
  openapi: spec.openapi,
  info: spec.info,
  paths,
  components: { schemas },
};
writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`);
console.log(
  `contracts/openapi.json: ${Object.keys(paths).length} rotas, ${wanted.size} schemas (de ${Object.keys(spec.paths).length}/${Object.keys(spec.components.schemas).length} do monólito)`,
);
