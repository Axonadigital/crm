#!/usr/bin/env bash
#
# start-loops.sh – Startar 4 autonoma utvecklingsloopar för Atomic CRM
#
# Användning:
#   ./start-loops.sh              Starta alla 4 loopar
#   ./start-loops.sh stop         Stoppa alla
#   ./start-loops.sh status       Visa status
#   ./start-loops.sh frontend     Starta bara frontend
#   ./start-loops.sh backend      Starta bara backend
#   ./start-loops.sh review       Starta bara review
#   ./start-loops.sh research     Starta bara research
#

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
SESSIONS=("crm-frontend" "crm-backend" "crm-review" "crm-research")

# ─── Prompts ──────────────────────────────────────────────────────────

FRONTEND_PROMPT='Du är en frontend-specialist för Atomic CRM. Läs CLAUDE.md och TASKS.md.

DITT TERRITORIUM: Du får BARA ändra filer i src/ mappen. Rör ALDRIG supabase/, migrationer eller andra filer utanför src/.

GODKÄNNANDESYSTEM: Jobba BARA på uppgifter som INTE har [FÖRSLAG]-tagg. Rader med [ ] [FÖRSLAG] är INTE godkända och ska INTE röras. Om du inte hittar en godkänd frontend-uppgift: förbättra testtäckning (alltid godkänt).

Varje iteration:
1. Läs TASKS.md och välj en GODKÄND frontend-uppgift (utan [FÖRSLAG]-tagg)
2. Om ingen godkänd frontend-uppgift finns: hitta den React-modul i src/components/atomic-crm/ som har lägst testtäckning och skriv tester
3. Skapa en feature branch: git checkout -b frontend/<kort-beskrivning>
4. Implementera med TDD - skriv test först, sedan kod
5. Kör make test och make typecheck - allt MÅSTE passera
6. Committa med conventional commit-format (feat:, fix:, test:, refactor:)
7. Markera uppgiften som [x] i TASKS.md om den slutfördes
8. Lägg till entry i CHANGELOG.md under [Unreleased]
9. Gå tillbaka till main: git checkout main

REGLER:
- RÖR BARA filer i src/
- Jobba ALDRIG på [FÖRSLAG]-uppgifter
- Jobba ALDRIG direkt på main
- Pusha INTE till remote
- Rör INTE produktion eller databas
- Kör ALDRIG git stash
- Radera ALDRIG filer i projektroten (TASKS.md, CHANGELOG.md, etc)
- En uppgift per iteration
- Vid osäkerhet: gör mindre, inte mer

SISTA STEGET (OBLIGATORISKT): När du är helt klar med iterationen MÅSTE du köra detta bash-kommando:
bash scripts/discord-notify.sh "crm-frontend" "TITEL" "SAMMANFATTNING"
Ersätt TITEL med kort beskrivning av vad du gjort.
Ersätt SAMMANFATTNING med: vilka filer du ändrade, antal tester, om make test passerade.
Hoppa ALDRIG över detta steg.'

BACKEND_PROMPT='Du är en backend-specialist för Atomic CRM. Läs CLAUDE.md och TASKS.md.

DITT TERRITORIUM: Du får BARA ändra filer i supabase/functions/ mappen. Rör ALDRIG src/, migrationer (supabase/migrations/) eller andra filer.

GODKÄNNANDESYSTEM: Jobba BARA på uppgifter som INTE har [FÖRSLAG]-tagg. Rader med [ ] [FÖRSLAG] är INTE godkända och ska INTE röras. Om du inte hittar en godkänd backend-uppgift: förbättra input-validering på edge functions (alltid godkänt).

Varje iteration:
1. Läs TASKS.md och välj en GODKÄND backend-uppgift (utan [FÖRSLAG]-tagg)
2. Om ingen godkänd backend-uppgift finns: välj en edge function i supabase/functions/ som saknar input-validering och förbättra den
3. Skapa en feature branch: git checkout -b backend/<kort-beskrivning>
4. Implementera förbättringen
5. Kör make test - allt MÅSTE passera
6. Committa med conventional commit-format
7. Markera uppgiften som [x] i TASKS.md om den slutfördes
8. Lägg till entry i CHANGELOG.md under [Unreleased]
9. Gå tillbaka till main: git checkout main

REGLER:
- RÖR BARA filer i supabase/functions/
- Jobba ALDRIG på [FÖRSLAG]-uppgifter
- Skapa ALDRIG databasmigrationer
- Jobba ALDRIG direkt på main
- Pusha INTE till remote
- Rör INTE produktion
- Kör ALDRIG git stash
- Radera ALDRIG filer i projektroten (TASKS.md, CHANGELOG.md, etc)
- En förbättring per iteration

SISTA STEGET (OBLIGATORISKT): När du är helt klar med iterationen MÅSTE du köra detta bash-kommando:
bash scripts/discord-notify.sh "crm-backend" "TITEL" "SAMMANFATTNING"
Ersätt TITEL med kort beskrivning.
Ersätt SAMMANFATTNING med: vilka filer du ändrade, vad du förbättrade, om make test passerade.
Hoppa ALDRIG över detta steg.'

REVIEW_PROMPT='Du är en senior kodgranskare för Atomic CRM. Läs CLAUDE.md.

DITT TERRITORIUM: Du LÄSER kod men skriver BARA till REVIEW.md och TASKS.md (bara [FÖRSLAG]-rader). Det enda undantaget är om du hittar ett CRITICAL säkerhetsproblem - då får du skapa en fix-branch.

Varje iteration:
1. Kör git branch för att se alla branches
2. Kör git log --all --oneline -20 för att se senaste aktivitet
3. För varje feature branch som inte är mergad med main:
   - Kör git diff main..<branch-namn>
   - Granska koden
4. Skriv rapport i REVIEW.md
5. Om CRITICAL-problem hittas: skapa branch fix/security-<beskrivning> och åtgärda
6. Lägg till förslag i TASKS.md med [FÖRSLAG]-tagg

REGLER:
- Skriv BARA till REVIEW.md och TASKS.md (undantag: CRITICAL fix-branches)
- I TASKS.md: lägg BARA till rader med [FÖRSLAG]-tagg under sektionen Claude-förslag
- Ta ALDRIG bort eller ändra befintliga rader i TASKS.md
- Kör ALDRIG git stash
- Radera ALDRIG filer i projektroten
- Jobba ALDRIG direkt på main

SISTA STEGET (OBLIGATORISKT): När du är helt klar MÅSTE du köra:
bash scripts/discord-notify.sh "crm-review" "TITEL" "SAMMANFATTNING"
Hoppa ALDRIG över detta steg.'

RESEARCH_PROMPT='Du är en CRM-analytiker för Atomic CRM (Axona Digital AB). Läs CLAUDE.md.

DITT TERRITORIUM: Du skriver BARA till RESEARCH.md och TASKS.md (bara [FÖRSLAG]-rader). Du ändrar ALDRIG kod.

Varje iteration, välj ETT fokusområde (rotera):
A) FUNKTIONSANALYS - jämför med HubSpot/Pipedrive
B) ANVÄNDARUPPLEVELSE - UX-problem
C) DATAMODELL - index, relationer, vyer
D) INTEGRATIONER - förbättringar och nya

Skriv i RESEARCH.md med: Vad, Varför, Komplexitet.
Lägg till förslag i TASKS.md med [FÖRSLAG]-tagg.

REGLER:
- Skriv BARA till RESEARCH.md och TASKS.md
- I TASKS.md: lägg BARA till [FÖRSLAG]-rader
- Ändra ALDRIG kod eller andra filer
- Kör ALDRIG git stash
- Radera ALDRIG filer i projektroten
- Var konkret

SISTA STEGET (OBLIGATORISKT): När du är helt klar MÅSTE du köra:
bash scripts/discord-notify.sh "crm-research" "TITEL" "SAMMANFATTNING"
Hoppa ALDRIG över detta steg.'

# ─── Funktioner ───────────────────────────────────────────────────────

stop_all() {
    echo "Stoppar CRM-loopar..."
    for session in "${SESSIONS[@]}"; do
        if tmux has-session -t "$session" 2>/dev/null; then
            tmux kill-session -t "$session"
            echo "  Stoppad: $session"
        else
            echo "  Redan inaktiv: $session"
        fi
    done
    echo "Klart."
}

show_status() {
    echo ""
    echo "CRM Loop-status"
    echo "──────────────────────────────────────────"
    for session in "${SESSIONS[@]}"; do
        if tmux has-session -t "$session" 2>/dev/null; then
            echo "  AKTIV:   $session"
        else
            echo "  INAKTIV: $session"
        fi
    done
    echo ""
    echo "  Titta in:   tmux attach -t <namn>"
    echo "  Stoppa:     ./start-loops.sh stop"
    echo ""
}

start_session() {
    local name="$1"
    local prompt="$2"

    if tmux has-session -t "$name" 2>/dev/null; then
        echo "  ! $name redan aktiv, hoppar over"
        return
    fi

    tmux new-session -d -s "$name" -c "$PROJECT_DIR" \
        "while true; do claude -p '$prompt' --allowedTools 'Read,Write,Edit,Bash,Glob,Grep'; echo '[$name] Iteration klar. Vantar 10 min...'; sleep 600; done"
    echo "  Startad: $name (loopar var 10:e minut)"
}

check_deps() {
    if ! command -v tmux &>/dev/null; then
        echo "FEL: tmux saknas. Installera: sudo apt install tmux"
        exit 1
    fi
    if ! command -v claude &>/dev/null; then
        echo "FEL: claude CLI hittades inte."
        exit 1
    fi
}

print_instructions() {
    echo ""
    echo "════════════════════════════════════════════════════════"
    echo "  Atomic CRM – Autonoma loopar igång!"
    echo "════════════════════════════════════════════════════════"
    echo ""
    echo "  crm-frontend  = React, UI, komponenttester (src/)"
    echo "  crm-backend   = Edge functions, validering (supabase/functions/)"
    echo "  crm-review    = Kodgranskning -> REVIEW.md"
    echo "  crm-research  = CRM-analys -> RESEARCH.md"
    echo ""
    echo "  Titta in:    tmux attach -t crm-frontend"
    echo "  Ga ut:       Ctrl+B, sedan D"
    echo "  Status:      ./start-loops.sh status"
    echo "  Stoppa alla: ./start-loops.sh stop"
    echo ""
}

start_all() {
    check_deps
    echo ""
    echo "Startar 4 autonoma CRM-loopar..."
    echo ""
    start_session "crm-frontend" "$FRONTEND_PROMPT"
    start_session "crm-backend" "$BACKEND_PROMPT"
    start_session "crm-review" "$REVIEW_PROMPT"
    start_session "crm-research" "$RESEARCH_PROMPT"
    print_instructions
}

# ─── Huvudlogik ───────────────────────────────────────────────────────

case "${1:-start}" in
    stop)       stop_all ;;
    status)     show_status ;;
    frontend)   check_deps; start_session "crm-frontend" "$FRONTEND_PROMPT"; print_instructions ;;
    backend)    check_deps; start_session "crm-backend" "$BACKEND_PROMPT"; print_instructions ;;
    review)     check_deps; start_session "crm-review" "$REVIEW_PROMPT"; print_instructions ;;
    research)   check_deps; start_session "crm-research" "$RESEARCH_PROMPT"; print_instructions ;;
    start|"")   start_all ;;
    *)          echo "Anvandning: $0 [start|stop|status|frontend|backend|review|research]"; exit 1 ;;
esac
