#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

DISCORD_LOOPS_WEBHOOK="${DISCORD_LOOPS_WEBHOOK:-}"
for envfile in "$PROJECT_DIR/.env.local" "$PROJECT_DIR/supabase/functions/.env.local"; do
    if [ -z "$DISCORD_LOOPS_WEBHOOK" ] && [ -f "$envfile" ]; then
        DISCORD_LOOPS_WEBHOOK="$(grep -s '^DISCORD_LOOPS_WEBHOOK=' "$envfile" | cut -d'=' -f2- || echo '')"
    fi
done

if [ -z "$DISCORD_LOOPS_WEBHOOK" ]; then
    echo "VARNING: DISCORD_LOOPS_WEBHOOK inte satt."
    exit 0
fi

LOOP_NAME="${1:-unknown}"
TITLE="${2:-Uppdatering}"
MESSAGE="${3:-Ingen beskrivning}"

case "$LOOP_NAME" in
    crm-frontend|frontend) COLOR=3066993 ;;
    crm-backend|backend)   COLOR=15844367 ;;
    crm-review|review)     COLOR=16776960 ;;
    crm-research|research) COLOR=3447003 ;;
    daily|summary)         COLOR=10181046 ;;
    *)                     COLOR=9807270 ;;
esac

if [ ${#MESSAGE} -gt 3900 ]; then
    MESSAGE="${MESSAGE:0:3900}... (trunkerat)"
fi

PAYLOAD=$(python3 -c "
import json, sys
print(json.dumps({
    'embeds': [{
        'title': sys.argv[1],
        'description': sys.argv[2],
        'color': int(sys.argv[3]),
        'footer': {'text': sys.argv[4]}
    }]
}))
" "$TITLE" "$MESSAGE" "$COLOR" "$LOOP_NAME | $(date '+%Y-%m-%d %H:%M')")

HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD" \
    "$DISCORD_LOOPS_WEBHOOK")

if [ "$HTTP_CODE" = "204" ] || [ "$HTTP_CODE" = "200" ]; then
    echo "Discord-notis skickad."
else
    echo "Discord-fel: HTTP $HTTP_CODE"
fi
