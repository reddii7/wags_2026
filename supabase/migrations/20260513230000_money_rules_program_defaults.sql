-- Money rules per round_type: BUILD guide summer, winter 2.50+2.50 no fines,
-- RS Cup / finals / away-day: no club bank slice; RS Cup no tracked stake in app.

alter table public.money_rules
  add column if not exists default_entry_fee_pence integer;

comment on column public.money_rules.default_entry_fee_pence is
  'Expected stake per entered player (pence) for this program; use round_players.entry_fee_pence per row (0 for RS Cup). pot+bank (+ fines if any) should match the fee model.';

-- Canonical rows (upsert so re-run is safe).
insert into public.money_rules (
  round_type,
  pot_slice_pence,
  bank_slice_pence,
  tie_treatment,
  collect_fines,
  default_entry_fee_pence
)
values
  -- Summer weekly £5: £1.50 winner pot + £3.50 bank per entrant; £1/snake+camel when collect_fines
  ('summer_weekly', 150, 350, 'rollover', true, 500),
  -- Winter £5: £2.50 day winner pool + £2.50 series accrual slice; no snake/camel money
  ('winter_weekly', 250, 250, 'rollover', false, 500),
  -- RS Cup: no entry fee in app → no pot / no bank in weekly_prize_state
  ('rs_cup', 0, 0, 'rollover', false, 0),
  -- Finals (Champs): whole stake to day winner pool; nothing to club bank
  ('finals_champs', 500, 0, 'rollover', false, 500),
  -- Finals (Chumps): same model; champs→chumps cash is handled outside this row
  ('finals_chumps', 500, 0, 'rollover', false, 500),
  -- Away day: settled on the day — nothing accrued to club bank via finalize (tie text is legacy check)
  ('away_day', 0, 0, 'rollover', false, null)
on conflict (round_type) do update set
  pot_slice_pence          = excluded.pot_slice_pence,
  bank_slice_pence         = excluded.bank_slice_pence,
  tie_treatment            = excluded.tie_treatment,
  collect_fines            = excluded.collect_fines,
  default_entry_fee_pence  = excluded.default_entry_fee_pence;
