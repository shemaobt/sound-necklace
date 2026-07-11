#!/usr/bin/env bash
# Ralph Wiggum loop — outer body for the Nori "loop" skillset (see PROMPT.md).
#
# Pré-requisitos (uma vez):
#   nori-skillsets switch public/loop  # ativa o profile do loop (global!)
#   fnm use 22                         # Node >= 22.12
#   pnpm install && pnpm exec playwright install chromium
# Para voltar ao profile normal depois: nori-skillsets switch public/high-autonomy
#
# Uso: ./loop.sh [flags extras do claude]
#   - Roda em modo HEADLESS (claude -p): cada iteração termina sozinha ao fim
#     do turno — sem Ctrl-C.
#   - Permissões: --dangerously-skip-permissions é o DEFAULT (é um loop
#     autônomo; os guardrails reais são a branch protection + required checks
#     + a regra contract-critical-não-mergeia). Para rodar COM prompts de
#     autorização (primeira rodada supervisionada): LOOP_SAFE=1 ./loop.sh
# Pare com Ctrl-C entre iterações. Cada iteração roda num worktree NOVO a
# partir de origin/main (o skillset exige começar fora de branch protegida) e
# o agente renomeia o branch para o nome sugerido pelo Linear.

set -euo pipefail
cd "$(dirname "$0")"

# Aceita o profile com ou sem namespace: o nori-skillsets passou a prefixar
# (`public/loop`), então comparamos só o basename após a última "/".
current_profile="$(nori-skillsets current 2>/dev/null)"
if [ "${current_profile##*/}" != "loop" ]; then
  echo "profile ativo ('${current_profile:-nenhum}') não é o loop — rode: nori-skillsets switch public/loop" >&2
  exit 1
fi

perm_flags=(--dangerously-skip-permissions)
if [ "${LOOP_SAFE:-0}" = "1" ]; then
  perm_flags=()
  echo "--- LOOP_SAFE=1: rodando COM prompts de permissão ---"
fi

while :; do
  git fetch origin main
  ts="$(date +%Y%m%d-%H%M%S)"
  wt=".worktrees/loop-$ts"
  git worktree add "$wt" -b "loop-bootstrap-$ts" origin/main
  iter_log="$(mktemp)"
  (
    cd "$wt"
    # -p (headless): o processo ENCERRA ao fim do turno. Em modo texto o -p é
    # MUDO até o final; por isso emitimos stream-json e filtramos para linhas
    # legíveis (💬 texto do agente, 🔧 ferramenta, ✅ resultado) em tempo real.
    claude -p --verbose --output-format stream-json "${perm_flags[@]}" "$@" <PROMPT.md \
      | python3 -u loop-progress-filter.py | tee "$iter_log" || true
  )
  # Remove o worktree APENAS se não houver commits não enviados nem sujeira —
  # nunca perder trabalho de uma iteração interrompida antes do push.
  # `HEAD --not --remotes` = commits deste worktree ausentes de QUALQUER branch
  # remota: trabalho já enviado num PR não segura o worktree; trabalho local
  # não enviado segura. (`--branches` olharia o repo inteiro; `origin/main..HEAD`
  # seguraria worktrees de PRs já abertos.)
  unpushed="$(git -C "$wt" log HEAD --not --remotes --oneline 2>/dev/null | wc -l | tr -d ' ')"
  dirty="$(git -C "$wt" status --porcelain 2>/dev/null | wc -l | tr -d ' ')"
  if [ "$unpushed" = "0" ] && [ "$dirty" = "0" ]; then
    branch="$(git -C "$wt" branch --show-current)"
    git worktree remove "$wt" --force 2>/dev/null || true
    [ -n "$branch" ] && git branch -D "$branch" 2>/dev/null || true
  else
    echo "--- worktree $wt preservado ($unpushed commits não enviados, $dirty arquivos sujos) ---"
  fi
  # Backoff: iteração sem issue elegível termina com o marcador [LOOP-IDLE]
  # (contrato no PROMPT.md §6) — re-varrer o backlog a cada poucos minutos só
  # queima tokens; o gargalo típico é um PR contract-critical esperando humano.
  if grep -q "LOOP-IDLE" "$iter_log"; then
    rm -f "$iter_log"
    echo "--- backlog sem issue elegível; próxima varredura em 15 min (Ctrl-C para parar) ---"
    sleep 900
  else
    rm -f "$iter_log"
    echo "--- iteração $ts encerrada; próxima em 10s (Ctrl-C para parar) ---"
    sleep 10
  fi
done
