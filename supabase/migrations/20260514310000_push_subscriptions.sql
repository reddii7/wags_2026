-- Push notification subscriptions (anonymous devices — no member identity needed for broadcasts).

create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  created_at  timestamptz not null default timezone('utc', now())
);

alter table public.push_subscriptions enable row level security;

-- Anyone (anon or auth) can register their device subscription.
create policy "anyone can subscribe"
  on public.push_subscriptions for insert
  to anon, authenticated
  with check (true);

-- Devices can remove their own subscription by endpoint.
create policy "anyone can unsubscribe"
  on public.push_subscriptions for delete
  to anon, authenticated
  using (true);

-- Nobody can read other subscriptions via the client (service_role bypasses RLS).
-- No SELECT policy → anon/authenticated cannot list subscriptions.

create index if not exists idx_push_subscriptions_endpoint
  on public.push_subscriptions (endpoint);

comment on table public.push_subscriptions is
  'Web Push device subscriptions. No member_id — broadcasts only.';
