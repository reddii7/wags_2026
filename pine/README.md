# Structure Companion V6 (Pine Script)

Educational Pine Script **v6** indicator that mechanically replicates the Norfolk FX Step‑1 workflow shown in [Stop Tracking Multiple Timeframes Manually](https://www.youtube.com/watch?v=ehpR5jhpQys):

- Swing trading range (**High / Low / BOS / CHoCH**)
- Bias from the **last close-through** break
- Internal structure (**iHigh / iLow / I-BOS / I-CHoCH**)
- Mid + HTF bias overlay + alignment dashboard
- Refined FVG imbalances
- Weak high / weak low hit-rate stats
- 50% equilibrium + optional premium/discount shade

Not affiliated with Norfolk FX Trader. Not financial advice.

## Install

1. Open TradingView → Pine Editor
2. New blank indicator → paste `StructureCompanion_v6.pine`
3. Save → Add to chart
4. Set **Middle TF** (e.g. `240`) and **Higher TF** (e.g. `D`) to match your workflow

Works on free TradingView plans.

## Suggested defaults (from the video workflow)

| Role | Example |
|------|---------|
| Entry / chart | 30m |
| Middle | 4H (`240`) |
| Higher | Daily (`D`) |

Tune **Swing pivot length** (default `5`) and **Internal pivot length** (default `2`) until swings match how you manually mark structure.

## How bias is computed

1. Confirm swing highs/lows with pivots
2. **Bullish BOS/CHoCH** when a candle **closes** above the last swing high
3. New **range low** = last swing low (impulse origin); wait for a new validated high
4. **Bearish** is the mirror
5. Wick-only runs are treated as liquidity sweeps (no bias flip)
6. Dashboard **Align** lights when Chart + Mid + HTF share the same bias

## Toggles

Use the input groups to declutter: swing, internal, MTF overlay, FVGs, stats, premium/discount.

## Limits vs the paid Pro V3 tool

This is a transparent approximation of the public Step‑1 rules, not a byte-for-byte clone of the closed-source Companion Tool. Expect small differences in:

- Exact swing validation edge cases
- Internal “noise erase” heuristics
- Proprietary probability model behind weak high/low stats
