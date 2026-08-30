#!/usr/bin/env bash
# PostToolUse (Write|Edit): formatea con Prettier y avisa de problemas con ESLint.
# Solo actúa sobre archivos dentro de este proyecto. Nunca bloquea (siempre exit 0).
set -u

f="$(jq -r '(.tool_input.file_path // .tool_response.filePath) // empty')"
[ -z "$f" ] && exit 0

d="${CLAUDE_PROJECT_DIR:-$PWD}"
case "$f" in
  "$d"/*) ;;
  *) exit 0 ;;
esac
[ -f "$f" ] || exit 0

# Prettier: formatea in situ, se salta extensiones que no soporta.
if [ -x "$d/node_modules/.bin/prettier" ]; then
  "$d/node_modules/.bin/prettier" --write --ignore-unknown "$f" >/dev/null 2>&1 || true
fi

# ESLint: solo archivos analizables; solo avisa (no modifica, no bloquea).
case "$f" in
  *.js | *.jsx | *.ts | *.tsx | *.mjs | *.cjs)
    if [ -x "$d/node_modules/.bin/eslint" ]; then
      out="$("$d/node_modules/.bin/eslint" --no-warn-ignored "$f" 2>&1)" || true
      if [ -n "$out" ]; then
        jq -n --arg c "ESLint — $f:"$'\n'"$out" \
          '{hookSpecificOutput:{hookEventName:"PostToolUse",additionalContext:$c}}'
      fi
    fi
    ;;
esac

exit 0
