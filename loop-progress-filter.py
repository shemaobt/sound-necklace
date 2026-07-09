#!/usr/bin/env python3
"""Filtro de progresso do loop: lê o stream-json do `claude -p` no stdin e
imprime uma linha legível por evento (texto do agente, ferramenta chamada,
resultado final). Usado por loop.sh — sem dependências além do python3 do
sistema."""

import json
import sys

for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    try:
        event = json.loads(line)
    except ValueError:
        continue
    kind = event.get("type")
    if kind == "assistant":
        for block in (event.get("message") or {}).get("content") or []:
            if block.get("type") == "text" and block.get("text", "").strip():
                print("💬 " + block["text"].strip()[:300], flush=True)
            elif block.get("type") == "tool_use":
                arg = block.get("input") or {}
                hint = arg.get("command") or arg.get("file_path") or arg.get("description") or ""
                print("🔧 " + block.get("name", "?") + "  " + str(hint)[:120], flush=True)
    elif kind == "result":
        print("✅ fim da iteração — " + str(event.get("result", ""))[:300], flush=True)
