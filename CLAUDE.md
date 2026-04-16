# NFL Draft Value Chart — Project Guide

Collaborative NFL 2026 draft simulator. Two users enter picks and trades from separate machines; state syncs live via Firebase Realtime Database so both boards stay in lockstep. Frontend is vanilla JS + Chart.js served as static files. A small Python dev server handles a single `/api/refresh` endpoint that re-pulls player scores from Google Sheets. Deployed to GitHub Pages.

## Run locally

```
start.bat                    # launches server.py on :8080 and opens browser
python server.py [PORT]      # same, without the browser
```

## File map

### Frontend (`js/`, loaded in this order by `index.html`)

| File | Responsibility |
| --- | --- |
| `data.js` | Static data: `DRAFT_ORDER` (hardcoded 2026 order), `BIG_BOARD` (player rankings, rewritten by `update_board.py`), `FITZ_LOOKUP` (pick-slot values from the FitzSpielberger trade chart), `SCORE_PARAMS` (min/max score + curve constant `k`), team colors/abbreviations. |
| `calc.js` | Translates a player's Big Board score to a Fitz-scale value via exponential scaling: `(exp(k·(score−minScore)) − 1) / (exp(k·range) − 1) · valueRange + minValue`. Pick score = player value − slot value. |
| `firebase-sync.js` | Initializes Firebase, subscribes to `picks/`, `trades/`, `tradeDetails/`, `futureTrades`, and writes on submit. Mirrors everything to `localStorage`, which is also the offline fallback. Firebase config is committed (Realtime DB rules are the security boundary). |
| `trade-inventory.js` | Models each team's current + 2027/2028 pick inventory. Applies real pre-existing NFL trades on load. Future picks are valued at round-midpoint Fitz values, discounted by `FUTURE_DISCOUNT = 0.85` per year (per OTC / Rich Hill market data). |
| `ui.js` | Renders the draft board, available-players list, trade log; handles pick submission, undo, and the two-step trade modal (includes future-pick / tier selection). |
| `charts.js` | Chart.js views: Pick Score vs Board, Team Summary, Draft Grades, Draft Capital, Trade Value. |
| `app.js` | Bootstraps Firebase, binds form and nav handlers, theme toggle, view switching. |

### Python

| File | Purpose |
| --- | --- |
| `server.py` | Static file server on :8080 with `POST /api/refresh` → calls `update_board.fetch_board` + `update_data_js`. Dev only — GitHub Pages serves the static files in prod. |
| `update_board.py` | Pulls Big Board from Google Sheets via `gspread` and rewrites `BIG_BOARD` + `SCORE_PARAMS` in `js/data.js` in place. Triggered by the "Refresh Board" button. |
| `fit_value_curve.py` | Offline analysis only. Fits the score→value curve (currently exponential, `k ≈ 0.1536`), writes `output/best_fit.json` and `output/curve_comparison.png`. Not invoked by the running app. |

## Data flow

1. **On page load** — Firebase listeners populate `picks`, `trades`, `tradeDetails`, `futureTrades` from the DB (or `localStorage` if offline). `trade-inventory.js` applies pre-existing real NFL trades on top of `DRAFT_ORDER`.
2. **On pick submit** — `ui.js` → `firebase-sync.submitPick()` writes to `picks/{pickNumber}`. Both clients' listeners fire; `ui.js` re-renders board + charts.
3. **On trade** — `ui.js` updates `tradeOverrides`, `tradeDetails`, and the future-picks array in `localStorage`, then `syncTrades()` pushes all three to Firebase in one shot.
4. **On "Refresh Board"** — `POST /api/refresh` → `update_board.py` rewrites `js/data.js` → page reload picks up new scores. This only works against the local dev server.

## Gotchas

- **`js/data.js` is generated.** `update_board.py` rewrites the `BIG_BOARD` array and `SCORE_PARAMS` object. Hand-edits to those sections will be clobbered on refresh; put stable helpers elsewhere.
- **Script load order matters.** `data.js` → `calc.js` → `firebase-sync.js` → `trade-inventory.js` → `ui.js` → `charts.js` → `app.js`. Each relies on globals from earlier files; there are no modules or a bundler.
- **Firebase and localStorage must stay consistent.** Every write path that touches Firebase also mirrors to `localStorage`, and the initial-load code reads from `localStorage` as the offline fallback. Skipping one side silently desyncs the two users.
- **Two discount factors exist.** `TODO.md` mentions `0.75` for future-pick discounting; the live code uses `FUTURE_DISCOUNT = 0.85` (OTC/Rich Hill). The code value is the source of truth — the TODO is stale.
- **`fit_value_curve.py` is analysis, not runtime.** It does not feed `data.js` automatically; its fitted `k` is transcribed into `SCORE_PARAMS` by hand.

## Active work

`TODO.md` — Trade Compensation Overhaul: replace the trade modal's text-input pick entry with a dropdown of the selected team's remaining picks, add 2027/2028 future-pick options with per-year discount, and surface live per-team pick inventory. The data layer in `trade-inventory.js` is partly there; the UI in `ui.js` is what's missing.
