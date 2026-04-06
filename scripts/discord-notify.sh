#!/usr/bin/env bash
#
# discord-notify.sh – Postar loop-uppdateringar till Discord med tydligt punktformat
#
# Användning (gammalt, fungerar fortfarande):
#   bash scripts/discord-notify.sh <loop> <titel> <meddelande>
#
# Användning (nytt, bättre format):
#   bash scripts/discord-notify.sh <loop> <titel> <fält1-namn> <fält1-värde> [<fält2-namn> <fält2-värde> ...]
#
# Exempel:
#   bash scripts/discord-notify.sh "crm-frontend" "Tester för quotes" \
#     "Vad jag gjort" "- Skrev 5 tester för QuoteInputs\n- Skrev 3 tester för QuoteShow" \
#     "Filer ändrade" "- src/components/atomic-crm/quotes/QuoteInputs.test.tsx\n- src/components/atomic-crm/quotes/QuoteShow.test.tsx" \
#     "Status" "make test: PASSERAR (112 tester)"
#

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
shift 2

case "$LOOP_NAME" in
    crm-frontend|frontend) COLOR=3066993;  EMOJI=":green_circle:" ;;
    crm-backend|backend)   COLOR=15844367; EMOJI=":red_circle:" ;;
    crm-review|review)     COLOR=16776960; EMOJI=":yellow_circle:" ;;
    crm-research|research) COLOR=3447003;  EMOJI=":blue_circle:" ;;
    daily|summary)         COLOR=10181046; EMOJI=":robot:" ;;
    *)                     COLOR=9807270;  EMOJI=":white_circle:" ;;
esac

# Om bara ett argument kvar = gammalt format (enkel description)
# Om flera argument = nytt format (fält-par)
if [ $# -le 1 ]; then
    MESSAGE="${1:-Ingen beskrivning}"
    PAYLOAD=$(python3 -c "
import json, sys
print(json.dumps({
    'embeds': [{
        'title': sys.argv[1] + ' ' + sys.argv[2],
        'description': sys.argv[3],
        'color': int(sys.argv[4]),
        'footer': {'text': sys.argv[5]}
    }]
}))
" "$EMOJI" "$TITLE" "$MESSAGE" "$COLOR" "$LOOP_NAME | $(date '+%Y-%m-%d %H:%M')")
else
    # Bygg fields-array från argument-par
    PAYLOAD=$(python3 -c "
import json, sys

args = sys.argv[1:]
emoji = args[0]
title = args[1]
color = int(args[2])
footer = args[3]
field_args = args[4:]

fields = []
i = 0
while i < len(field_args) - 1:
    name = field_args[i]
    value = field_args[i+1].replace('\\\\n', '\n')
    if len(value) > 1024:
        value = value[:1020] + '...'
    fields.append({'name': name, 'value': value, 'inline': False})
    i += 2

print(json.dumps({
    'embeds': [{
        'title': emoji + ' ' + title,
        'color': color,
        'fields': fields,
        'footer': {'text': footer}
    }]
}))
" "$EMOJI" "$TITLE" "$COLOR" "$LOOP_NAME | $(date '+%Y-%m-%d %H:%M')" "$@")
fi

HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD" \
    "$DISCORD_LOOPS_WEBHOOK")

if [ "$HTTP_CODE" = "204" ] || [ "$HTTP_CODE" = "200" ]; then
    echo "Discord-notis skickad."
else
    echo "Discord-fel: HTTP $HTTP_CODE"
fi
