-- Read-only inventory: routines + views in public (run: supabase db query --linked -f supabase/scripts/audit_public_surface.sql)

select 'ROUTINES' as section, p.proname as name,
       pg_get_function_identity_arguments(p.oid) as args,
       case p.prokind when 'f' then 'function' when 'p' then 'procedure' when 'a' then 'aggregate' else p.prokind::text end as kind
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prokind in ('f','p','a')
order by p.proname, 2;

select 'VIEWS' as section, c.relname as name, null as args, null as kind
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'v'
order by 2;

select 'TABLES' as section, c.relname as name, null as args, null as kind
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname not like 'pg_%'
order by 2;
