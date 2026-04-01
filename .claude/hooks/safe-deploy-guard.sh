#!/bin/bash
# PreToolUse hook: blocks dangerous Supabase commands until /safe-deploy has been run.

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{console.log(JSON.parse(d).tool_input.command||'')}catch{console.log('')}})")

if [ -z "$COMMAND" ]; then
  exit 0
fi

if echo "$COMMAND" | grep -qE 'supabase\s+db\s+(push|reset)'; then
  echo "BLOCK: Kör /safe-deploy innan du pushar till produktion." >&2
  echo "Denna hook blockerar 'supabase db push' och 'supabase db reset' tills säkerhetschecklistan är genomförd." >&2
  exit 2
fi

exit 0
