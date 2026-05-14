-- Auto-assign slot_index when inserting a cup_match so the admin
-- never has to enter it manually. The trigger picks max(slot_index)+1
-- within the same (competition_id, stage_code) group.

create or replace function public.tg_cup_match_auto_slot()
returns trigger language plpgsql as $$
begin
  if new.slot_index is null then
    select coalesce(max(slot_index), 0) + 1
    into new.slot_index
    from public.cup_matches
    where competition_id = new.competition_id
      and stage_code     = new.stage_code;
  end if;
  return new;
end;
$$;

drop trigger if exists tr_cup_match_auto_slot on public.cup_matches;
create trigger tr_cup_match_auto_slot
before insert on public.cup_matches
for each row execute function public.tg_cup_match_auto_slot();

-- Allow slot_index to be null on insert (trigger fills it in).
alter table public.cup_matches
  alter column slot_index drop not null;
