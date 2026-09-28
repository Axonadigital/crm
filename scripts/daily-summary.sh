#!/usr/bin/env bash
#
# daily-summary.sh – Samlar statistik från alla loopar och postar till Discord
#
# Användning:
#   ./scripts/daily-summary.sh              Posta daglig sammanfattning
#   ./scripts/daily-summary.sh --dry-run    Visa utan att posta
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
DRY_RUN="${1:-}"

cd "$PROJECT_DIR"

# Ladda webhook
DISCORD_LOOPS_WEBHOOK="${DISCORD_LOOPS_WEBHOOK:-}"
for envfile in "$PROJECT_DIR/.env.local" "$PROJECT_DIR/supabase/functions/.env.local"; do
    if [ -z "$DISCORD_LOOPS_WEBHOOK" ] && [ -f "$envfile" ]; then
        export DISCORD_LOOPS_WEBHOOK="$(grep -s '^DISCORD_LOOPS_WEBHOOK=' "$envfile" | cut -d'=' -f2- || echo '')"
    fi
done

TODAY=$(date '+%Y-%m-%d')
NL=$'\n'

# ─── Git ───

BRANCHES=$(git branch --list 'frontend/*' 'backend/*' 'fix/*' 'test/*' 2>/dev/null | wc -l | tr -d ' ')
TODAYS_COMMITS=$(git log --all --oneline --since="$TODAY 00:00" 2>/dev/null | wc -l | tr -d ' ')
TODAYS_FILES=$(git log --all --since="$TODAY 00:00" --diff-filter=AM --name-only --pretty=format: 2>/dev/null | sort -u | grep -c '.' || echo "0")
COMMIT_LIST=$(git log --all --oneline --since="$TODAY 00:00" 2>/dev/null | head -15)
[ -z "$COMMIT_LIST" ] && COMMIT_LIST="Inga commits idag."

# ─── Loopar ───

LOOP_STATUS=""
for session in crm-frontend crm-backend crm-review crm-research; do
    if tmux has-session -t "$session" 2>/dev/null; then
        LOOP_STATUS="${LOOP_STATUS}:green_circle: ${session}${NL}"
    else
        LOOP_STATUS="${LOOP_STATUS}:red_circle: ${session}${NL}"
    fi
done
[ -z "$LOOP_STATUS" ] && LOOP_STATUS="Inga loopar konfigurerade"

# ─── TASKS.md ───

DONE_LIST=""
TODO_LIST=""
FORSLAG_DISPLAY=""
TASKS_DONE=0
TASKS_TODO=0
TASKS_FORSLAG=0

if [ -f TASKS.md ]; then
    while IFS= read -r line; do
        clean=$(echo "$line" | sed 's/^- \[x\] //' | sed 's/\*\*//g' | sed 's/ – .*//')
        DONE_LIST="${DONE_LIST}:white_check_mark: ${clean}${NL}"
        TASKS_DONE=$((TASKS_DONE + 1))
    done < <(grep '^\- \[x\]' TASKS.md 2>/dev/null || true)

    while IFS= read -r line; do
        clean=$(echo "$line" | sed 's/^- \[ \] //' | sed 's/\*\*//g' | sed 's/ – .*//')
        TODO_LIST="${TODO_LIST}:arrow_right: ${clean}${NL}"
        TASKS_TODO=$((TASKS_TODO + 1))
    done < <(grep '^\- \[ \]' TASKS.md 2>/dev/null | grep -v 'FÖRSLAG' || true)

    TASKS_FORSLAG=$(grep -c 'FÖRSLAG' TASKS.md 2>/dev/null || echo "0")

    while IFS= read -r line; do
        clean=$(echo "$line" | sed 's/^- \[ \] \[FÖRSLAG\] //' | sed 's/\*\*//g')
        FORSLAG_DISPLAY="${FORSLAG_DISPLAY}:bulb: ${clean}${NL}"
    done < <(grep 'FÖRSLAG' TASKS.md 2>/dev/null | tail -8 || true)
fi

[ -z "$DONE_LIST" ] && DONE_LIST="Inga klara uppgifter."
[ -z "$TODO_LIST" ] && TODO_LIST="Inga godkända uppgifter kvar."
[ -z "$FORSLAG_DISPLAY" ] && FORSLAG_DISPLAY="Inga förslag."

# ─── Review ───

CRITICAL=0
WARNING=0
if [ -f REVIEW.md ]; then
    CRITICAL=$(grep -c '## CRITICAL' REVIEW.md 2>/dev/null || echo "0")
    [ "$CRITICAL" = "0" ] && CRITICAL=$(grep -ci 'CRITICAL' REVIEW.md 2>/dev/null || echo "0")
    WARNING=$(grep -c '## WARNING' REVIEW.md 2>/dev/null || echo "0")
    [ "$WARNING" = "0" ] && WARNING=$(grep -ci 'WARNING' REVIEW.md 2>/dev/null || echo "0")
fi

# ─── Bygg JSON med python ───

PAYLOAD=$(python3 -c "
import json, sys, os

data = json.load(sys.stdin)

embeds = [
    {
        'title': ':robot: Daglig Rapport - ' + data['today'],
        'color': 10181046,
        'fields': [
            {'name': ':satellite: Loopar', 'value': data['loop_status'].strip(), 'inline': False},
            {'name': ':hammer_pick: Git-aktivitet', 'value': '**' + data['commits'] + '** commits | **' + data['files'] + '** filer | **' + data['branches'] + '** branches', 'inline': False},
            {'name': ':white_check_mark: Klara (' + data['tasks_done'] + ' st)', 'value': data['done_list'].strip(), 'inline': False},
            {'name': ':construction: Kvar att gora (' + data['tasks_todo'] + ' godkanda)', 'value': data['todo_list'].strip(), 'inline': False},
            {'name': ':bulb: Claude-forslag (' + data['tasks_forslag'] + ' vantar)', 'value': data['forslag_display'].strip(), 'inline': False},
            {'name': ':shield: Kodgranskning', 'value': 'Critical: **' + data['critical'] + '** | Warnings: **' + data['warning'] + '**', 'inline': False}
        ],
        'footer': {'text': 'Godkann forslag i TASKS.md -> looparna borjar jobba pa dem'}
    }
]

if data['commit_list'].strip() and data['commit_list'].strip() != 'Inga commits idag.':
    embeds.append({
        'title': ':scroll: Dagens commits',
        'description': '\`\`\`\\n' + data['commit_list'].strip() + '\\n\`\`\`',
        'color': 3426654
    })

print(json.dumps({'embeds': embeds}))
" << JSONEOF
$(python3 -c "
import json
print(json.dumps({
    'today': '''$TODAY''',
    'loop_status': $(python3 -c "import json; print(json.dumps(open('/dev/stdin').read()))" <<< "$LOOP_STATUS"),
    'commits': '''$TODAYS_COMMITS''',
    'files': '''$TODAYS_FILES''',
    'branches': '''$BRANCHES''',
    'commit_list': $(python3 -c "import json; print(json.dumps(open('/dev/stdin').read()))" <<< "$COMMIT_LIST"),
    'done_list': $(python3 -c "import json; print(json.dumps(open('/dev/stdin').read()))" <<< "$DONE_LIST"),
    'tasks_done': '''$TASKS_DONE''',
    'todo_list': $(python3 -c "import json; print(json.dumps(open('/dev/stdin').read()))" <<< "$TODO_LIST"),
    'tasks_todo': '''$TASKS_TODO''',
    'forslag_display': $(python3 -c "import json; print(json.dumps(open('/dev/stdin').read()))" <<< "$FORSLAG_DISPLAY"),
    'tasks_forslag': '''$TASKS_FORSLAG''',
    'critical': '''$CRITICAL''',
    'warning': '''$WARNING'''
}))
")
JSONEOF
)

if [ "$DRY_RUN" = "--dry-run" ]; then
    echo "$PAYLOAD" | python3 -m json.tool
else
    if [ -z "${DISCORD_LOOPS_WEBHOOK:-}" ]; then
        echo "VARNING: DISCORD_LOOPS_WEBHOOK inte satt."
        exit 0
    fi

    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
        -H "Content-Type: application/json" \
        -d "$PAYLOAD" \
        "$DISCORD_LOOPS_WEBHOOK")

    if [ "$HTTP_CODE" = "204" ] || [ "$HTTP_CODE" = "200" ]; then
        echo "Daglig sammanfattning postad till Discord."
    else
        echo "FEL: Discord svarade med HTTP $HTTP_CODE"
        exit 1
    fi
fi
