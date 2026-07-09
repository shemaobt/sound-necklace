/**
 * PLACEHOLDER do golden harness — required check `golden-harness` existe desde o dia um.
 *
 * Decisão de planejamento registrada: um placeholder VERMELHO como required check
 * travaria todos os PRs (inclusive o do próprio harness). Por isso este placeholder
 * sai VERDE com aviso ruidoso, e o check ganha dentes em duas etapas:
 *   - ENG-212: driver da referência + goldens comitados + runner + golden:verify
 *   - ENG-238: modo ESTRITO (zero casos pendentes) — vigor total, para sempre.
 *
 * NUNCA enfraquecer este check depois da ENG-212 (CLAUDE.md, gate 1).
 */
console.log('⚠️  GOLDEN HARNESS — PLACEHOLDER ATIVO (nenhum caso dourado definido ainda).');
console.log('    Torna-se real na ENG-212 e estrito na ENG-238.');
process.exit(0);
