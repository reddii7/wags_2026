# ES Daily Roadmap

Paste a Trade Companion letter. The app extracts the session map (supports, resistances, failed-breakdowns, targets, bull/bear case), writes a long/short playbook, and emits **Pine Script v6** you can paste onto an ES or MES chart in TradingView.

This folder is standalone. It is not part of the WAGS member app build.

## Run

```bash
npm --prefix es-roadmap install
npm --prefix es-roadmap test
npm --prefix es-roadmap run dev
```

Open [http://localhost:5176](http://localhost:5176).

## Daily use

1. Paste the full letter (the **Trade Plan** block with `Supports are` / `Resistances are` is the important part).
2. Optionally enter last / high / low so the roadmap can say where price is sitting.
3. Copy the roadmap markdown, or switch to **Pine v6** → Copy script.
4. In TradingView: Pine Editor → paste → Save → Add to chart.
5. Keep **Show minor levels** off unless you want every letter print.

The script plots majors plus FBD / target / short / invalidation levels. It does not place orders.

## Tests

```bash
npm --prefix es-roadmap test
```
