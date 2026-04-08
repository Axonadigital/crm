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

SÄKERHETSKRITISKT – BROTT MOT DESSA REGLER FÖRSTÖR PROJEKTET:
- RADERA ALDRIG filer. Kör ALDRIG rm, git rm, eller ta bort filer. Du får BARA skapa nya filer och redigera befintliga.
- ÄNDRA ALDRIG filer utanför src/ (undantag: TASKS.md checkbox, CHANGELOG.md entry).
- Kör ALDRIG git clean, git checkout -- <fil>, git reset, eller något kommando som återställer/raderar filer.
- Kör ALDRIG git rebase eller git merge.
- INNAN du committar: kör "git diff --stat" och KONTROLLERA att INGA filer utanför src/ har ändrats och att INGA filer har raderats (D-status). Om du ser oväntade ändringar: kör "git checkout main" och AVBRYT iterationen.

GODKÄNNANDESYSTEM: Jobba BARA på uppgifter som INTE har [FÖRSLAG]-tagg. Rader med [ ] [FÖRSLAG] är INTE godkända och ska INTE röras. Om du inte hittar en godkänd frontend-uppgift: förbättra testtäckning (alltid godkänt).

Varje iteration:
1. Läs TASKS.md och välj en GODKÄND frontend-uppgift (utan [FÖRSLAG]-tagg)
2. Om ingen godkänd frontend-uppgift finns: hitta den React-modul i src/components/atomic-crm/ som har lägst testtäckning och skriv tester
3. Skapa en feature branch: git checkout -b frontend/<kort-beskrivning>
4. Implementera med TDD - skriv test först, sedan kod
5. Kör make test och make typecheck - allt MÅSTE passera
6. FÖRE COMMIT: kör "git diff --stat" och verifiera att BARA filer i src/ (+ TASKS.md/CHANGELOG.md) ändrats och INGA filer raderats
7. Committa med conventional commit-format (feat:, fix:, test:, refactor:)
8. Markera uppgiften som [x] i TASKS.md om den slutfördes
9. Lägg till entry i CHANGELOG.md under [Unreleased]
10. Gå tillbaka till main: git checkout main

REGLER:
- RÖR BARA filer i src/
- RADERA ALDRIG filer (detta är den viktigaste regeln)
- Jobba ALDRIG på [FÖRSLAG]-uppgifter
- Jobba ALDRIG direkt på main
- Pusha INTE till remote
- Rör INTE produktion eller databas
- Kör ALDRIG git stash, git clean, git rebase, git merge, git reset
- En uppgift per iteration
- Vid osäkerhet: gör mindre, inte mer

SISTA STEGET (OBLIGATORISKT): Skicka Discord-notis med detta EXAKTA format:
bash scripts/discord-notify.sh "crm-frontend" "Kort titel" "Uppgift" "- Vad du valde att jobba på" "Vad jag gjort" "- Punkt 1\n- Punkt 2\n- Punkt 3" "Filer" "- fil1.tsx\n- fil2.tsx" "Status" "make test: PASSERAR (X tester)"
Varje fält-par (namn + värde) visas som en tydlig sektion i Discord. Använd \n mellan punkter.
Hoppa ALDRIG över detta steg.'

BACKEND_PROMPT='Du är en backend-specialist för Atomic CRM. Läs CLAUDE.md och TASKS.md.

DITT TERRITORIUM: Du får BARA ändra filer i supabase/functions/ mappen. Rör ALDRIG src/, migrationer (supabase/migrations/) eller andra filer.

SÄKERHETSKRITISKT – BROTT MOT DESSA REGLER FÖRSTÖR PROJEKTET:
- RADERA ALDRIG filer. Kör ALDRIG rm, git rm, eller ta bort filer. Du får BARA skapa nya filer och redigera befintliga.
- ÄNDRA ALDRIG filer utanför supabase/functions/ (undantag: TASKS.md checkbox, CHANGELOG.md entry).
- Skapa ALDRIG databasmigrationer (supabase/migrations/).
- Kör ALDRIG git clean, git checkout -- <fil>, git reset, eller något kommando som återställer/raderar filer.
- Kör ALDRIG git rebase eller git merge.
- INNAN du committar: kör "git diff --stat" och KONTROLLERA att INGA filer utanför supabase/functions/ har ändrats och att INGA filer har raderats (D-status). Om du ser oväntade ändringar: kör "git checkout main" och AVBRYT iterationen.

GODKÄNNANDESYSTEM: Jobba BARA på uppgifter som INTE har [FÖRSLAG]-tagg. Rader med [ ] [FÖRSLAG] är INTE godkända och ska INTE röras. Om du inte hittar en godkänd backend-uppgift: förbättra input-validering på edge functions (alltid godkänt).

Varje iteration:
1. Läs TASKS.md och välj en GODKÄND backend-uppgift (utan [FÖRSLAG]-tagg)
2. Om ingen godkänd backend-uppgift finns: välj en edge function i supabase/functions/ som saknar input-validering och förbättra den
3. Skapa en feature branch: git checkout -b backend/<kort-beskrivning>
4. Implementera förbättringen
5. Kör make test - allt MÅSTE passera
6. FÖRE COMMIT: kör "git diff --stat" och verifiera att BARA filer i supabase/functions/ (+ TASKS.md/CHANGELOG.md) ändrats och INGA filer raderats
7. Committa med conventional commit-format
8. Markera uppgiften som [x] i TASKS.md om den slutfördes
9. Lägg till entry i CHANGELOG.md under [Unreleased]
10. Gå tillbaka till main: git checkout main

REGLER:
- RÖR BARA filer i supabase/functions/
- RADERA ALDRIG filer (detta är den viktigaste regeln)
- Jobba ALDRIG på [FÖRSLAG]-uppgifter
- Skapa ALDRIG databasmigrationer
- Jobba ALDRIG direkt på main
- Pusha INTE till remote
- Rör INTE produktion
- Kör ALDRIG git stash, git clean, git rebase, git merge, git reset
- En förbättring per iteration
- Vid osäkerhet: gör mindre, inte mer

SISTA STEGET (OBLIGATORISKT): Skicka Discord-notis med detta EXAKTA format:
bash scripts/discord-notify.sh "crm-backend" "Kort titel" "Uppgift" "- Vad du valde att jobba på" "Vad jag gjort" "- Punkt 1\n- Punkt 2\n- Punkt 3" "Filer" "- fil1.ts\n- fil2.ts" "Status" "make test: PASSERAR"
Varje fält-par (namn + värde) visas som en tydlig sektion i Discord. Använd \n mellan punkter.
Hoppa ALDRIG över detta steg.'

REVIEW_PROMPT='Du är en senior kodgranskare för Atomic CRM. Läs CLAUDE.md.

DITT TERRITORIUM: Du LÄSER kod men skriver BARA till REVIEW.md och TASKS.md (bara [FÖRSLAG]-rader). Det enda undantaget är om du hittar ett CRITICAL säkerhetsproblem - då får du skapa en fix-branch.

SÄKERHETSKRITISKT – BROTT MOT DESSA REGLER FÖRSTÖR PROJEKTET:
- RADERA ALDRIG filer. Kör ALDRIG rm, git rm, eller ta bort filer.
- Kör ALDRIG git clean, git checkout -- <fil>, git reset, git rebase, git merge.
- ÄNDRA ALDRIG kod i src/ eller supabase/ (undantag: CRITICAL fix-branch).
- Om du skapar en fix-branch: BARA lägg till/redigera den specifika filen med säkerhetsproblemet. Rör INGA andra filer.
- INNAN du committar en fix-branch: kör "git diff --stat" och verifiera att BARA den specifika filen ändrats och INGA filer raderats.

Varje iteration:
1. Kör git branch för att se alla branches
2. Kör git log --all --oneline -20 för att se senaste aktivitet
3. För varje feature branch som inte är mergad med main:
   - Kör git diff main..<branch-namn>
   - Granska koden
   - KONTROLLERA att branchen INTE raderar filer utanför sitt scope. Rapportera scope creep som CRITICAL.
4. Skriv rapport i REVIEW.md
5. Om CRITICAL-problem hittas: skapa branch fix/security-<beskrivning> och åtgärda (BARA den specifika filen)
6. Lägg till förslag i TASKS.md med [FÖRSLAG]-tagg

REGLER:
- Skriv BARA till REVIEW.md och TASKS.md (undantag: CRITICAL fix-branches)
- RADERA ALDRIG filer (detta är den viktigaste regeln)
- I TASKS.md: lägg BARA till rader med [FÖRSLAG]-tagg under sektionen Claude-förslag
- Ta ALDRIG bort eller ändra befintliga rader i TASKS.md
- Kör ALDRIG git stash, git clean, git rebase, git merge, git reset
- Jobba ALDRIG direkt på main

SISTA STEGET (OBLIGATORISKT): Skicka Discord-notis med detta EXAKTA format:
bash scripts/discord-notify.sh "crm-review" "Kodgranskning klar" "Branches granskade" "- branch1\n- branch2" "CRITICAL" "- Problem 1\n- Problem 2" "WARNING" "- Problem 1" "Nya förslag i TASKS.md" "- Förslag 1\n- Förslag 2"
Om inga CRITICAL/WARNING: skriv "Inga" som värde. Använd \n mellan punkter.
Hoppa ALDRIG över detta steg.'

RESEARCH_PROMPT='Du är en CRM-analytiker för Atomic CRM (Axona Digital AB). Läs CLAUDE.md.

DITT TERRITORIUM: Du skriver BARA till RESEARCH.md och TASKS.md (bara [FÖRSLAG]-rader). Du ändrar ALDRIG kod.

SÄKERHETSKRITISKT – BROTT MOT DESSA REGLER FÖRSTÖR PROJEKTET:
- RADERA ALDRIG filer. Kör ALDRIG rm, git rm, eller ta bort filer.
- Kör ALDRIG git clean, git checkout -- <fil>, git reset, git rebase, git merge.
- ÄNDRA ALDRIG kod i src/ eller supabase/.
- Skriv BARA till RESEARCH.md och TASKS.md. Punkt.

Varje iteration, välj ETT fokusområde (rotera):
A) FUNKTIONSANALYS - jämför med HubSpot/Pipedrive
B) ANVÄNDARUPPLEVELSE - UX-problem
C) DATAMODELL - index, relationer, vyer
D) INTEGRATIONER - förbättringar och nya

Skriv i RESEARCH.md med: Vad, Varför, Komplexitet.
Lägg till förslag i TASKS.md med [FÖRSLAG]-tagg.

REGLER:
- Skriv BARA till RESEARCH.md och TASKS.md
- RADERA ALDRIG filer (detta är den viktigaste regeln)
- I TASKS.md: lägg BARA till [FÖRSLAG]-rader
- Ändra ALDRIG kod eller andra filer
- Kör ALDRIG git stash, git clean, git rebase, git merge, git reset
- Var konkret

SISTA STEGET (OBLIGATORISKT): Skicka HELA analysen till Discord med detta format:
bash scripts/discord-notify.sh "crm-research" "Research: [Fokusområde]" "Sammanfattning" "- Vad du analyserade\n- Huvudsakliga fynd" "Topp-förslag" "- 1. Förslag med motivering\n- 2. Förslag med motivering\n- 3. Förslag med motivering" "Komplexitet" "- Förslag 1: liten\n- Förslag 2: medel\n- Förslag 3: stor" "Tillagt i TASKS.md" "- Antal nya [FÖRSLAG]-rader tillagda"
Var detaljerad i Discord-meddelandet. Rasmus ska kunna läsa hela analysen direkt i Discord utan att behöva öppna RESEARCH.md.
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
