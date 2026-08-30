#!/usr/bin/env bash
# Notification hook: reproduce un sonido SOLO cuando Claude necesita algo de ti
# (permiso o respuesta). Se salta el aviso de inactividad ("waiting for your input").
set -u

msg="$(jq -r '.message // empty')"

case "$msg" in
  *[Ww]"aiting for your input"* | *"esperando tu"* | *"is idle"*)
    exit 0
    ;;
esac

afplay /Users/diegocarrascoparra/Downloads/CursoClaudeCode/claudecode-finished.mp3 2>/dev/null || true
exit 0
