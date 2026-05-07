-- Admin RPC: reset all data in wags schema (schema preserved).
-- Service role only.

create or replace function public.admin_reset_all_data()
returns void
language plpgsql
security definer
set search_path = wags, public
as $$
declare
  table_list text;
begin
  select string_agg(format('%I.%I', schemaname, tablename), ', ' order by tablename)
    into table_list
  from pg_tables
  where schemaname = 'wags';

  if table_list is not null then
    execute 'truncate table ' || table_list || ' restart identity cascade';
  end if;
end;
$$;

revoke execute on function public.admin_reset_all_data() from public;
grant execute on function public.admin_reset_all_data() to service_role;
