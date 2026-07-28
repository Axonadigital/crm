#!/usr/bin/env bash
# Applicerar scanner_scans-migrationen mot CRM-produktionen via Supabase
# Management-API och registrerar den i migrationshistoriken.
#
# Körs manuellt av Rasmus (Claude blockerades från att köra detta själv):
#   bash apply-scanner-migration.sh
#
# Varför inte "supabase db push"? Migrationshistoriken är driftad — 13 äldre
# lokala migrationer saknas i remote-historiken och skulle försöka köras om.
# Det här skriptet kör ENBART 20260728090000_scanner_scans.sql (helt additiv).

set -euo pipefail
cd "$(dirname "$0")"

TOKEN="$(cat ~/.supabase/access-token)"
API="https://api.supabase.com/v1/projects/hgyusrlrzdahucljvqsz/database/query"

run_sql() {
  python3 -c "import json,sys; print(json.dumps({'query': sys.stdin.read()}))" \
    | curl -sS -X POST "$API" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d @- \
        -w "\nHTTP %{http_code}\n"
}

echo "1/3 Applicerar migrationen..."
run_sql < supabase/migrations/20260728090000_scanner_scans.sql

echo "2/3 Registrerar i migrationshistoriken..."
echo "insert into supabase_migrations.schema_migrations (version, name) values ('20260728090000', 'scanner_scans') on conflict do nothing;" | run_sql

echo "3/3 Verifierar att tabellen finns..."
echo "select count(*) as scanner_scans_rader from public.scanner_scans;" | run_sql

echo
echo "Klart! Säg till Claude att köra slutverifieringen."
