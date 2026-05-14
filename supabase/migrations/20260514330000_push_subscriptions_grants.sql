-- Grant table-level permissions so anon/authenticated roles can actually
-- reach the RLS policies. Without these grants the upsert silently fails.
grant insert, update on public.push_subscriptions to anon, authenticated;
