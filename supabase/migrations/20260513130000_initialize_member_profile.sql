-- Members: sync current handicap from initial on insert only.
-- League assignment is handled from the admin UI when creating a member (after insert).

create or replace function public.initialize_member_profile()
returns trigger
language plpgsql
as $$
begin
  new.handicap_index := new.initial_handicap_index;
  return new;
end;
$$;
