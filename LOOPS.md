# LOOPS.md – Autonoma Förbättringsloopar

> 4 loopar med strikta territorier. De rör aldrig varandras filer.

| Loop | Territorium | Skriver till |
|------|------------|-------------|
| Frontend | `src/` | Kod + tester |
| Backend | `supabase/functions/` | Kod |
| Review | Läser allt | Bara `REVIEW.md` |
| Research | Läser allt | Bara `RESEARCH.md` |

## Snabbstart

```bash
./start-loops.sh            # Starta alla 4
./start-loops.sh stop       # Stoppa alla
./start-loops.sh status     # Se status
./start-loops.sh frontend   # Bara en specifik
```

## Titta in

```bash
tmux attach -t crm-frontend
tmux attach -t crm-backend
tmux attach -t crm-review
tmux attach -t crm-research
```

Gå ut utan att stoppa: **Ctrl+B**, sedan **D**
