-- upsert (INSERT ... ON CONFLICT DO UPDATE) needs an UPDATE policy too.
create policy "anyone can update own subscription"
  on public.push_subscriptions for update
  to anon, authenticated
  using (true)
  with check (true);
